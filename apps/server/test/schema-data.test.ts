import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeTestApp,
  createAndConnect,
  makeTestApp,
  type TestApp,
} from './helpers.js';

describe('schema, data, query, ddl, export over sqlite', () => {
  let t: TestApp;
  let id: string;

  beforeAll(async () => {
    t = await makeTestApp();
    id = await createAndConnect(t);
  });
  afterAll(async () => {
    await closeTestApp(t);
  });

  it('lists tables and views', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/tables`,
    });
    expect(res.statusCode).toBe(200);
    const tables = res.json() as { name: string; kind: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('artists');
    expect(names).toContain('albums');
    expect(tables.find((t) => t.name === 'recent_albums')?.kind).toBe('view');
  });

  it('returns table structure with PK, FK and indexes', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/tables/albums/structure`,
    });
    const s = res.json();
    expect(s.primaryKey).toEqual(['id']);
    const idCol = s.columns.find((c: { name: string }) => c.name === 'id');
    expect(idCol.isPrimaryKey).toBe(true);
    expect(idCol.isAutoIncrement).toBe(true);
    expect(s.foreignKeys[0].referencedTable).toBe('artists');
    expect(
      s.indexes.some((i: { name: string }) => i.name === 'idx_albums_year'),
    ).toBe(true);
  });

  it('serves the autocomplete catalog', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/autocomplete`,
    });
    const body = res.json();
    expect(body.dialect).toBe('sqlite');
    expect(body.catalog.albums).toContain('title');
  });

  it('pages, sorts and filters rows', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/tables/albums/rows/query`,
      payload: {
        page: 0,
        pageSize: 2,
        sorts: [{ column: 'year', dir: 'desc' }],
        filters: [{ column: 'year', op: 'gte', value: '2000' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const page = res.json();
    expect(page.total).toBe(4);
    expect(page.rows).toHaveLength(2);
    expect(page.pkColumns).toEqual(['id']);
    const titleIdx = page.columns.findIndex(
      (c: { name: string }) => c.name === 'title',
    );
    expect(page.rows[0][titleIdx]).toBe('Random Access Memories');
  });

  it('filters with contains (LIKE escape)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/tables/albums/rows/query`,
      payload: {
        page: 0,
        pageSize: 10,
        sorts: [],
        filters: [{ column: 'title', op: 'contains', value: 'memories' }],
      },
    });
    expect(res.json().rows).toHaveLength(1);
  });

  it('rejects unknown columns in filters', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/tables/albums/rows/query`,
      payload: {
        page: 0,
        pageSize: 10,
        sorts: [],
        filters: [{ column: 'nope; DROP TABLE albums', op: 'eq', value: 'x' }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Unknown column');
  });

  it('inserts, updates and deletes rows in one transaction', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/tables/artists/rows/mutate`,
      payload: {
        changes: {
          inserts: [{ name: 'Air', country: 'FR' }],
          updates: [{ key: { id: 3 }, changes: { country: 'France' } }],
          deletes: [],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ inserted: 1, updated: 1, deleted: 0 });

    const check = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/query`,
      payload: { sql: "SELECT country FROM artists WHERE id = 3" },
    });
    expect(check.json().resultSets[0].rows[0][0]).toBe('France');
  });

  it('rolls back the whole batch when one statement fails', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/tables/artists/rows/mutate`,
      payload: {
        changes: {
          inserts: [{ name: 'Phoenix' }, { name: null }],
          updates: [],
          deletes: [],
        },
      },
    });
    expect(res.statusCode).toBe(400);
    const check = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/query`,
      payload: { sql: "SELECT COUNT(*) FROM artists WHERE name = 'Phoenix'" },
    });
    expect(check.json().resultSets[0].rows[0][0]).toBe(0);
  });

  it('refuses updates on tables without a primary key', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/tables/no_pk/rows/mutate`,
      payload: {
        changes: {
          inserts: [],
          updates: [{ key: { a: 'x' }, changes: { b: 'z' } }],
          deletes: [],
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('primary key');
  });

  it('runs multi-statement SQL and truncates large results', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/query`,
      payload: {
        sql: 'SELECT * FROM albums; SELECT COUNT(*) AS n FROM artists',
        maxRows: 3,
      },
    });
    const body = res.json();
    expect(body.resultSets).toHaveLength(2);
    expect(body.resultSets[0].truncated).toBe(true);
    expect(body.resultSets[0].rows).toHaveLength(3);
    expect(body.resultSets[1].truncated).toBe(false);
  });

  it('analyzes a script via /query/plan', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/query/plan`,
      payload: {
        sql: 'SELECT * FROM albums; DELETE FROM albums; DROP TABLE albums',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(body.statements.map((s: { kind: string }) => s.kind)).toEqual([
      'read',
      'write',
      'ddl',
    ]);
    // DELETE without WHERE carries a warning
    expect(body.statements[1].warnings.length).toBeGreaterThan(0);
    // SQLite cannot estimate rows
    expect(body.statements[1].estimatedRows).toBeNull();
  });

  it('does not require confirmation for pure reads', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/query/plan`,
      payload: { sql: 'SELECT 1' },
    });
    expect(res.json().requiresConfirmation).toBe(false);
  });

  it('returns cancelled:false for an unknown query id', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/queries/does-not-exist/cancel',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cancelled: false });
  });

  it('accepts a client-supplied queryId on execution', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/query`,
      payload: { sql: 'SELECT 1', queryId: 'client-abc' },
    });
    expect(res.statusCode).toBe(200);
    // SQLite is synchronous so it is already done; cancel is a no-op (false)
    const cancel = await t.app.inject({
      method: 'POST',
      url: '/api/queries/client-abc/cancel',
    });
    expect(cancel.json()).toEqual({ cancelled: false });
  });

  it('records query history including failures', async () => {
    await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/query`,
      payload: { sql: 'SELECT * FROM does_not_exist' },
    });
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/history?connectionId=${id}`,
    });
    const entries = res.json() as { sql: string; error: string | null }[];
    expect(entries.length).toBeGreaterThan(0);
    const failed = entries.find((e) => e.sql.includes('does_not_exist'));
    expect(failed?.error).toBeTruthy();
  });

  it('previews then applies DDL', async () => {
    const preview = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/ddl/preview`,
      payload: {
        change: {
          kind: 'addColumn',
          table: 'artists',
          column: {
            name: 'website',
            dataType: 'TEXT',
            nullable: true,
            defaultValue: null,
            isPrimaryKey: false,
            isAutoIncrement: false,
          },
        },
      },
    });
    expect(preview.statusCode).toBe(200);
    const { statements } = preview.json();
    expect(statements[0]).toBe(
      'ALTER TABLE "artists" ADD COLUMN "website" TEXT',
    );

    const apply = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/ddl/apply`,
      payload: { statements },
    });
    expect(apply.statusCode).toBe(200);

    const structure = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/tables/artists/structure`,
    });
    expect(
      structure.json().columns.some((c: { name: string }) => c.name === 'website'),
    ).toBe(true);
  });

  it('exports query results as CSV and JSON', async () => {
    const csv = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/export`,
      payload: {
        format: 'csv',
        sql: 'SELECT title, year FROM albums ORDER BY year LIMIT 2',
        fileName: 'albums',
      },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-disposition']).toContain('albums.csv');
    expect(csv.payload).toContain('title,year');
    expect(csv.payload).toContain('OK Computer,1997');

    const json = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/export`,
      payload: {
        format: 'json',
        sql: 'SELECT title FROM albums ORDER BY year LIMIT 1',
      },
    });
    expect(JSON.parse(json.payload)).toEqual([{ title: 'OK Computer' }]);
  });

  it('blocks mutations on read-only connections', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        name: 'ro',
        engine: 'sqlite',
        file: t.fixtureFile,
        isReadOnly: true,
      },
    });
    const roId = create.json().id;
    await t.app.inject({
      method: 'POST',
      url: `/api/connections/${roId}/connect`,
    });
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${roId}/tables/artists/rows/mutate`,
      payload: {
        changes: { inserts: [{ name: 'X' }], updates: [], deletes: [] },
      },
    });
    expect(res.statusCode).toBe(403);

    // the free SQL editor path is guarded too
    const write = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${roId}/query`,
      payload: { sql: "INSERT INTO artists (name) VALUES ('X')" },
    });
    expect(write.statusCode).toBe(403);

    // reads still work on a read-only connection
    const read = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${roId}/query`,
      payload: { sql: 'SELECT COUNT(*) FROM artists' },
    });
    expect(read.statusCode).toBe(200);
  });
});
