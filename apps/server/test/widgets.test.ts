import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DashboardWidget } from '@fluentdb/shared';
import {
  FakeAiProvider,
  closeTestApp,
  createAndConnect,
  makeTestApp,
  type TestApp,
} from './helpers.js';

describe('dashboard widgets', () => {
  let t: TestApp;
  let id: string;

  beforeAll(async () => {
    t = await makeTestApp({ ai: new FakeAiProvider(['ok']) });
    id = await createAndConnect(t);
  });
  afterAll(async () => {
    await closeTestApp(t);
  });

  it('creates, lists, updates, reorders and deletes widgets', async () => {
    const create = async (title: string) =>
      (
        await t.app.inject({
          method: 'POST',
          url: `/api/connections/${id}/widgets`,
          payload: { title, sql: 'SELECT count(*) AS n FROM albums', viz: 'number', size: 'sm' },
        })
      ).json() as DashboardWidget;

    const a = await create('A');
    const b = await create('B');
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);

    // list
    let list = (
      await t.app.inject({ method: 'GET', url: `/api/connections/${id}/widgets` })
    ).json() as DashboardWidget[];
    expect(list.map((w) => w.title)).toEqual(['A', 'B']);

    // update
    const upd = await t.app.inject({
      method: 'PATCH',
      url: `/api/connections/${id}/widgets/${a.id}`,
      payload: { title: 'A2', viz: 'bar' },
    });
    expect((upd.json() as DashboardWidget).title).toBe('A2');
    expect((upd.json() as DashboardWidget).viz).toBe('bar');

    // reorder
    await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/widgets/reorder`,
      payload: { ids: [b.id, a.id] },
    });
    list = (
      await t.app.inject({ method: 'GET', url: `/api/connections/${id}/widgets` })
    ).json() as DashboardWidget[];
    expect(list.map((w) => w.title)).toEqual(['B', 'A2']);

    // delete
    await t.app.inject({
      method: 'DELETE',
      url: `/api/connections/${id}/widgets/${a.id}`,
    });
    list = (
      await t.app.inject({ method: 'GET', url: `/api/connections/${id}/widgets` })
    ).json() as DashboardWidget[];
    expect(list.map((w) => w.title)).toEqual(['B']);
  });

  it('generates a widget from natural language (read-only guard)', async () => {
    const ok = await makeTestApp({
      ai: new FakeAiProvider([
        '{"title":"Total","sql":"SELECT count(*) AS n FROM albums","viz":"number"}',
      ]),
    });
    const cid = await createAndConnect(ok);
    const res = await ok.app.inject({
      method: 'POST',
      url: '/api/ai/widget',
      payload: { connectionId: cid, description: 'combien d albums' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ viz: 'number' });
    await closeTestApp(ok);

    // A non-read-only proposal is rejected.
    const bad = await makeTestApp({
      ai: new FakeAiProvider([
        '{"title":"x","sql":"DELETE FROM albums","viz":"table"}',
      ]),
    });
    const bid = await createAndConnect(bad);
    const badRes = await bad.app.inject({
      method: 'POST',
      url: '/api/ai/widget',
      payload: { connectionId: bid, description: 'supprime tout' },
    });
    expect(badRes.statusCode).toBe(422);
    await closeTestApp(bad);
  });
});
