import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeTestApp,
  createAndConnect,
  makeTestApp,
  type TestApp,
} from './helpers.js';

describe('view definition and materialized-view routes (sqlite)', () => {
  let t: TestApp;
  let id: string;

  beforeAll(async () => {
    t = await makeTestApp();
    id = await createAndConnect(t);
  });
  afterAll(async () => {
    await closeTestApp(t);
  });

  it('returns the SQL definition of a view', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/tables/recent_albums/definition`,
    });
    expect(res.statusCode).toBe(200);
    const { definition } = res.json() as { definition: string | null };
    expect(definition).toMatch(/create view/i);
    expect(definition).toMatch(/recent_albums/i);
  });

  it('returns null definition for a plain table', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/tables/albums/definition`,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { definition: string | null }).definition).toBeNull();
  });

  it('rejects matview refresh on an engine without materialized views', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/matview/refresh`,
      payload: { name: 'recent_albums' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('global search finds objects and columns across the schema', async () => {
    // object hit
    const albums = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/search?q=album`,
    });
    expect(albums.statusCode).toBe(200);
    const hits = albums.json() as {
      kind: string;
      name: string;
      table?: string;
    }[];
    expect(hits.some((h) => h.kind === 'table' && h.name === 'albums')).toBe(
      true,
    );
    // the view is found too
    expect(hits.some((h) => h.kind === 'view' && h.name === 'recent_albums')).toBe(
      true,
    );

    // column hit: artist_id belongs to albums
    const cols = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/search?q=artist_id`,
    });
    const colHits = cols.json() as {
      kind: string;
      name: string;
      table?: string;
    }[];
    const col = colHits.find((h) => h.kind === 'column' && h.name === 'artist_id');
    expect(col?.table).toBe('albums');
  });

  it('rejects an empty search query', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/search?q=`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('reports materializedViews: false for sqlite', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/connect`,
    });
    const { capabilities } = res.json() as {
      capabilities: { materializedViews: boolean };
    };
    expect(capabilities.materializedViews).toBe(false);
  });

  it('creates a view from a query via the DDL endpoint (save-as-view path)', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/ddl/apply`,
      payload: {
        statements: [
          'CREATE VIEW "top_artists" AS\nSELECT id, name FROM artists WHERE country = \'FR\'',
        ],
      },
    });
    expect(create.statusCode).toBe(200);

    const tables = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/tables`,
    });
    const created = (tables.json() as { name: string; kind: string }[]).find(
      (v) => v.name === 'top_artists',
    );
    expect(created?.kind).toBe('view');

    const def = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/tables/top_artists/definition`,
    });
    expect((def.json() as { definition: string | null }).definition).toMatch(
      /top_artists/i,
    );
  });
});
