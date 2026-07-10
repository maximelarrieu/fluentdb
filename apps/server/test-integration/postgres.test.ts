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
    expect(s.indexes.some((i) => i.name === 'it_tracks_title_idx')).toBe(true);
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
    const titleIdx = page.columns.findIndex((c) => c.name === 'title');
    expect(page.rows[0]?.[titleIdx]).toBe('One More Time');
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
