import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConnectionConfig } from '@fluentdb/shared';
import { PostgresDriver } from '../src/drivers/postgres/driver.js';

/**
 * Real-server integration tests, gated by TEST_PG_URL
 * (e.g. postgres://postgres:pw@127.0.0.1:5432/postgres).
 * Skipped automatically when the env var is unset.
 */
const PG_URL = process.env.TEST_PG_URL;

function configFromUrl(url: string): ConnectionConfig {
  const u = new URL(url);
  const now = new Date().toISOString();
  return {
    id: 'it-pg',
    name: 'integration pg',
    engine: 'postgres',
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username) || 'postgres',
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || 'postgres',
    createdAt: now,
    updatedAt: now,
  };
}

describe.skipIf(!PG_URL)('PostgresDriver against a live server', () => {
  let driver: PostgresDriver;

  beforeAll(async () => {
    driver = new PostgresDriver(configFromUrl(PG_URL!));
    await driver.connect();
    await driver.runQuery(
      `DROP TABLE IF EXISTS it_tracks; DROP TABLE IF EXISTS it_bands;
       CREATE TABLE it_bands (
         id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
         name text NOT NULL,
         country text
       );
       CREATE TABLE it_tracks (
         id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
         band_id integer NOT NULL REFERENCES it_bands(id),
         title text NOT NULL,
         duration numeric(6,2)
       );
       CREATE INDEX it_tracks_title_idx ON it_tracks(title);
       INSERT INTO it_bands (name, country) VALUES ('Daft Punk', 'FR'), ('Radiohead', 'UK');
       INSERT INTO it_tracks (band_id, title, duration) VALUES
         (1, 'One More Time', 320.5), (1, 'Aerodynamic', 212.2), (2, 'Karma Police', 261.0);`,
      { queryId: 'setup', maxRows: 10 },
    );
  });

  afterAll(async () => {
    await driver
      .runQuery('DROP TABLE IF EXISTS it_tracks; DROP TABLE IF EXISTS it_bands', {
        queryId: 'teardown',
        maxRows: 10,
      })
      .catch(() => {});
    await driver.disconnect();
  });

  it('reports a server version', async () => {
    expect(await driver.serverVersion()).toContain('PostgreSQL');
  });

  it('lists databases and schemas', async () => {
    const dbs = await driver.listDatabases();
    expect(dbs.length).toBeGreaterThan(0);
    const schemas = await driver.listSchemas();
    expect(schemas.map((s) => s.name)).toContain('public');
  });

  it('introspects structure with PK, FK, index and identity', async () => {
    const s = await driver.getTableStructure({ name: 'it_tracks' });
    expect(s.primaryKey).toEqual(['id']);
    expect(s.columns.find((c) => c.name === 'id')?.isAutoIncrement).toBe(true);
    expect(s.foreignKeys[0]?.referencedTable).toBe('it_bands');
    // FK columns must be real arrays, not a raw '{band_id}' string — the ERD
    // reads columns[0] to attach edges, so a string breaks every FK link.
    expect(Array.isArray(s.foreignKeys[0]?.columns)).toBe(true);
    expect(s.foreignKeys[0]?.columns).toEqual(['band_id']);
    expect(s.foreignKeys[0]?.referencedColumns).toEqual(['id']);
    const idx = s.indexes.find((i) => i.name === 'it_tracks_title_idx');
    expect(idx).toBeTruthy();
    // index columns must be a real array too — StructureView calls
    // columns.join(), which throws on a raw '{title}' string.
    expect(Array.isArray(idx!.columns)).toBe(true);
    expect(idx!.columns).toEqual(['title']);
  });

  it('selects rows with filters/sort/pagination', async () => {
    const page = await driver.selectRows(
      { name: 'it_tracks' },
      {
        page: 0,
        pageSize: 2,
        sorts: [{ column: 'duration', dir: 'desc' }],
        filters: [{ column: 'band_id', op: 'eq', value: '1' }],
      },
    );
    expect(page.total).toBe(2);
    // A filter forces an exact count, never an estimate.
    expect(page.approximate).toBe(false);
    const titleIdx = page.columns.findIndex((c) => c.name === 'title');
    expect(page.rows[0]?.[titleIdx]).toBe('One More Time');
  });

  it('uses an estimated count on an unfiltered page, exact on request', async () => {
    await driver.runQuery('ANALYZE it_bands', { queryId: 'an', maxRows: 1 });
    const est = await driver.selectRows(
      { name: 'it_bands' },
      { page: 0, pageSize: 5, sorts: [], filters: [] },
    );
    expect(est.approximate).toBe(true);
    const exact = await driver.selectRows(
      { name: 'it_bands' },
      { page: 0, pageSize: 5, sorts: [], filters: [], exactCount: true },
    );
    expect(exact.approximate).toBe(false);
    expect(typeof exact.total).toBe('number');
  });

  it('mutates rows transactionally', async () => {
    const res = await driver.mutateRows(
      { name: 'it_bands' },
      {
        inserts: [{ name: 'Justice', country: 'FR' }],
        updates: [{ key: { id: 2 }, changes: { country: 'GB' } }],
        deletes: [],
      },
    );
    expect(res).toEqual({ inserted: 1, updated: 1, deleted: 0 });
    const check = await driver.runQuery(
      'SELECT country FROM it_bands WHERE id = 2',
      { queryId: 'check', maxRows: 10 },
    );
    expect(check[0]?.rows[0]?.[0]).toBe('GB');
  });

  it('applies previewed DDL', async () => {
    const preview = driver.buildDdl({
      kind: 'addColumn',
      table: 'it_bands',
      column: {
        name: 'website',
        dataType: 'text',
        nullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        isAutoIncrement: false,
      },
    });
    await driver.applyDdl(preview.statements);
    const s = await driver.getTableStructure({ name: 'it_bands' });
    expect(s.columns.some((c) => c.name === 'website')).toBe(true);
  });

  it('runs multi-statement queries', async () => {
    const results = await driver.runQuery(
      'SELECT COUNT(*) FROM it_bands; SELECT 1 AS one',
      { queryId: 'multi', maxRows: 10 },
    );
    expect(results).toHaveLength(2);
  });

  it('builds the autocomplete catalog', async () => {
    const catalog = await driver.getAutocompleteCatalog();
    expect(catalog.it_tracks).toContain('title');
  });

  it('searches objects and columns across the schema', async () => {
    const objHits = await driver.searchObjects('it_track');
    expect(
      objHits.some((h) => h.kind === 'table' && h.name === 'it_tracks'),
    ).toBe(true);

    const colHits = await driver.searchObjects('band_id');
    const col = colHits.find(
      (h) => h.kind === 'column' && h.name === 'band_id',
    );
    expect(col?.table).toBe('it_tracks');
    expect(col?.schema).toBe('public');
    expect(col?.dataType).toBeTruthy();
  });

  it('lists, introspects, refreshes and defines materialized views', async () => {
    await driver.runQuery(
      `DROP MATERIALIZED VIEW IF EXISTS it_band_track_counts;
       CREATE MATERIALIZED VIEW it_band_track_counts AS
         SELECT b.id AS band_id, b.name, count(t.id) AS tracks
         FROM it_bands b LEFT JOIN it_tracks t ON t.band_id = b.id
         GROUP BY b.id, b.name;
       CREATE UNIQUE INDEX it_band_track_counts_pk ON it_band_track_counts(band_id);`,
      { queryId: 'mv-setup', maxRows: 10 },
    );

    // Listed with kind 'matview' and a populated flag.
    const tables = await driver.listTables();
    const mv = tables.find((t) => t.name === 'it_band_track_counts');
    expect(mv?.kind).toBe('matview');
    expect(mv?.isPopulated).toBe(true);

    // Columns resolve via pg_catalog (matviews are absent from info_schema).
    const structure = await driver.getTableStructure({
      name: 'it_band_track_counts',
    });
    expect(structure.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['band_id', 'name', 'tracks']),
    );

    // Data browsing works over a matview.
    const page = await driver.selectRows(
      { name: 'it_band_track_counts' },
      { page: 0, pageSize: 10, sorts: [], filters: [] },
    );
    expect(page.total).toBeGreaterThan(0);

    // Autocomplete includes matview columns.
    const catalog = await driver.getAutocompleteCatalog();
    expect(catalog.it_band_track_counts).toContain('tracks');

    // Definition is the view SQL.
    const def = await driver.getViewDefinition({
      name: 'it_band_track_counts',
    });
    expect(def).toMatch(/select/i);

    // Refresh runs CONCURRENTLY because it is populated and has a unique index.
    const refreshed = await driver.refreshMaterializedView({
      name: 'it_band_track_counts',
    });
    expect(refreshed.concurrent).toBe(true);

    // Lineage: the matview depends on both source tables it reads from.
    const deps = await driver.listViewDependencies();
    const sources = deps
      .filter((d) => d.dependent.name === 'it_band_track_counts')
      .map((d) => d.source.name);
    expect(sources).toEqual(expect.arrayContaining(['it_bands', 'it_tracks']));

    await driver.runQuery(
      'DROP MATERIALIZED VIEW IF EXISTS it_band_track_counts',
      { queryId: 'mv-teardown', maxRows: 1 },
    );
  });

  it('estimates affected rows without executing (dry-run EXPLAIN)', async () => {
    // Collect statistics so the planner has a realistic row estimate.
    await driver.runQuery('ANALYZE it_bands', { queryId: 'analyze', maxRows: 1 });
    const before = await driver.runQuery('SELECT COUNT(*) FROM it_bands', {
      queryId: 'before',
      maxRows: 1,
    });
    const countBefore = Number(before[0]?.rows[0]?.[0]);

    const estimate = await driver.estimateRows('UPDATE it_bands SET country = country');
    expect(estimate).not.toBeNull();
    expect(estimate!).toBeGreaterThan(0);

    // EXPLAIN must not have executed anything — row count is unchanged
    const after = await driver.runQuery('SELECT COUNT(*) FROM it_bands', {
      queryId: 'after',
      maxRows: 1,
    });
    expect(Number(after[0]?.rows[0]?.[0])).toBe(countBefore);
  });

  it('lists active sessions including its own backend', async () => {
    const sessions = await driver.activeSessions();
    expect(sessions.length).toBeGreaterThan(0);
    const me = sessions.find((s) => s.current);
    expect(me).toBeTruthy();
    expect(me!.id).toMatch(/^\d+$/);
    // killing a non-backend pid is a no-op, never throws
    const killed = await driver.killSession('1', { terminate: false });
    expect(typeof killed).toBe('boolean');
  });

  it('lists roles with attributes and memberships', async () => {
    const roles = await driver.roles();
    expect(roles.length).toBeGreaterThan(0);
    // A superuser is flagged and can log in.
    const superuser = roles.find((r) => r.attributes.includes('SUPERUSER'));
    expect(superuser).toBeTruthy();
    expect(superuser!.canLogin).toBe(true);
    // Built-in group roles (pg_monitor) expose their memberships.
    const monitor = roles.find((r) => r.name === 'pg_monitor');
    expect(monitor).toBeTruthy();
    expect(monitor!.canLogin).toBe(false);
    expect(monitor!.memberOf).toEqual(
      expect.arrayContaining(['pg_read_all_stats']),
    );
    // Every role is well-formed.
    for (const r of roles) {
      expect(typeof r.name).toBe('string');
      expect(typeof r.canLogin).toBe('boolean');
      expect(Array.isArray(r.attributes)).toBe(true);
      expect(Array.isArray(r.memberOf)).toBe(true);
    }
  });

  it('lists functions and procedures with definitions', async () => {
    await driver.runQuery(
      `CREATE OR REPLACE FUNCTION it_track_count(bid int) RETURNS bigint
         LANGUAGE sql AS $$ SELECT count(*) FROM it_tracks WHERE band_id = bid $$;
       CREATE OR REPLACE PROCEDURE it_touch(bid int) LANGUAGE sql
         AS $$ UPDATE it_bands SET country = country WHERE id = bid $$;`,
      { queryId: 'rt-setup', maxRows: 1 },
    );
    const routines = await driver.listRoutines();
    const fn = routines.find((r) => r.name === 'it_track_count');
    expect(fn?.kind).toBe('function');
    expect(fn?.returns).toMatch(/bigint/);
    expect(fn?.definition).toMatch(/CREATE OR REPLACE FUNCTION/i);
    const proc = routines.find((r) => r.name === 'it_touch');
    expect(proc?.kind).toBe('procedure');
    expect(proc?.returns).toBeNull();
    await driver.runQuery(
      'DROP FUNCTION IF EXISTS it_track_count(int); DROP PROCEDURE IF EXISTS it_touch(int)',
      { queryId: 'rt-teardown', maxRows: 1 },
    );
  });

  it('lists table triggers with timing and events', async () => {
    await driver.runQuery(
      `CREATE OR REPLACE FUNCTION it_trg_fn() RETURNS trigger LANGUAGE plpgsql
         AS $$ BEGIN RETURN NEW; END $$;
       DROP TRIGGER IF EXISTS it_bands_trg ON it_bands;
       CREATE TRIGGER it_bands_trg BEFORE INSERT ON it_bands
         FOR EACH ROW EXECUTE FUNCTION it_trg_fn();`,
      { queryId: 'trg-setup', maxRows: 1 },
    );
    const triggers = await driver.listTriggers();
    const trg = triggers.find((t) => t.name === 'it_bands_trg');
    expect(trg?.table).toBe('it_bands');
    expect(trg?.timing).toBe('BEFORE');
    expect(trg?.events).toContain('INSERT');
    expect(trg?.definition).toMatch(/CREATE TRIGGER/i);
    await driver.runQuery(
      'DROP TRIGGER IF EXISTS it_bands_trg ON it_bands; DROP FUNCTION IF EXISTS it_trg_fn()',
      { queryId: 'trg-teardown', maxRows: 1 },
    );
  });

  it('produces a health report from the catalogs', async () => {
    const findings = await driver.healthChecks();
    expect(Array.isArray(findings)).toBe(true);
    // Connection pressure is always computable on a live server.
    const conns = findings.find((f) => f.id === 'pg.connections');
    expect(conns).toBeTruthy();
    // Every finding is well-formed.
    for (const f of findings) {
      expect(f.id).toBeTruthy();
      expect(['ok', 'info', 'warn', 'critical']).toContain(f.severity);
    }
  });

  it('returns a normalized plan tree (EXPLAIN, no execution)', async () => {
    const plan = await driver.explain(
      'SELECT t.title, b.name FROM it_tracks t JOIN it_bands b ON b.id = t.band_id',
      { analyze: false },
    );
    expect(plan.engine).toBe('postgres');
    expect(plan.analyzed).toBe(false);
    // a join query normalizes to a tree with a join somewhere and known kinds
    const kinds: string[] = [];
    const walk = (n: { kind: string; estimatedRows: number | null; children: unknown[] }) => {
      kinds.push(n.kind);
      expect(n.estimatedRows === null || typeof n.estimatedRows === 'number').toBe(true);
      (n.children as typeof n[]).forEach(walk);
    };
    walk(plan.root as never);
    expect(kinds).toContain('join');
    expect(plan.rawText).toBeTruthy();
  });

  it('honors analyze for a real-metrics plan on a read', async () => {
    const plan = await driver.explain('SELECT count(*) FROM it_tracks', {
      analyze: true,
    });
    expect(plan.analyzed).toBe(true);
    // actual metrics are populated on the root when analyzed
    expect(plan.root.actualRows === null || typeof plan.root.actualRows === 'number').toBe(true);
  });

  it('cancels a long-running query in flight', async () => {
    const queryId = 'cancel-me';
    // Capture the rejection immediately so no unhandled rejection can slip
    // through the window before we await it.
    const running = driver
      .runQuery('SELECT pg_sleep(30)', { queryId, maxRows: 1 })
      .then(() => null)
      .catch((e: Error) => e);
    // give the backend a moment to register the running query
    await new Promise((r) => setTimeout(r, 400));
    const cancelled = await driver.cancelQuery(queryId);
    expect(cancelled).toBe(true);
    // the query should reject (statement cancelled) rather than sleep 30s
    const err = await running;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/cancel/i);
  });
});
