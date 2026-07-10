import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ErdSchema } from '@fluentdb/shared';
import {
  closeTestApp,
  createAndConnect,
  makeTestApp,
  type TestApp,
} from './helpers.js';

describe('ERD endpoint over sqlite', () => {
  let t: TestApp;
  let id: string;

  beforeAll(async () => {
    t = await makeTestApp();
    id = await createAndConnect(t);
  });
  afterAll(async () => {
    await closeTestApp(t);
  });

  it('returns tables, columns and relations', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/connections/${id}/erd`,
    });
    expect(res.statusCode).toBe(200);
    const erd = res.json() as ErdSchema;

    const names = erd.tables.map((t) => t.name);
    expect(names).toContain('artists');
    expect(names).toContain('albums');
    // views are excluded from the diagram
    expect(names).not.toContain('recent_albums');

    const albums = erd.tables.find((t) => t.name === 'albums')!;
    const artistId = albums.columns.find((c) => c.name === 'artist_id')!;
    expect(artistId.isForeignKey).toBe(true);
    const pk = albums.columns.find((c) => c.name === 'id')!;
    expect(pk.isPrimaryKey).toBe(true);

    const rel = erd.relations.find(
      (r) => r.from.table === 'albums' && r.to.table === 'artists',
    );
    expect(rel).toBeTruthy();
    expect(rel!.from.columns).toContain('artist_id');
    expect(rel!.to.columns).toContain('id');
  });
});
