import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD_UNCHANGED } from '@fluentdb/shared';
import { closeTestApp, makeTestApp, type TestApp } from './helpers.js';

describe('connections API', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(async () => {
    await closeTestApp(t);
  });

  it('creates, lists, updates and deletes a connection with secret redaction', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        name: 'pg prod',
        engine: 'postgres',
        host: 'db.example.com',
        port: 5432,
        user: 'app',
        password: 'hunter2',
        database: 'app',
        color: 'red',
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.password).toBeUndefined();
    expect(created.hasPassword).toBe(true);
    expect(created.connected).toBe(false);

    const list = await t.app.inject({ method: 'GET', url: '/api/connections' });
    const items = list.json() as { id: string; name: string }[];
    expect(items.some((c) => c.name === 'pg prod')).toBe(true);

    // update keeping the stored password via the sentinel
    const update = await t.app.inject({
      method: 'PUT',
      url: `/api/connections/${created.id}`,
      payload: {
        name: 'pg prod renamed',
        engine: 'postgres',
        host: 'db.example.com',
        port: 5433,
        user: 'app',
        password: PASSWORD_UNCHANGED,
        database: 'app',
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe('pg prod renamed');
    expect(update.json().hasPassword).toBe(true);

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/connections/${created.id}`,
    });
    expect(del.statusCode).toBe(200);
  });

  it('persists connections encrypted on disk', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    await t.app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        name: 'secret conn',
        engine: 'postgres',
        host: 'h',
        password: 'super-secret-value',
      },
    });
    const raw = fs.readFileSync(
      path.join(t.dataDir, 'connections.json.enc'),
      'utf8',
    );
    expect(raw).not.toContain('super-secret-value');
    expect(raw).not.toContain('secret conn');
  });

  it('tests a sqlite config without saving', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/connections/test',
      payload: { name: 'tmp', engine: 'sqlite', file: t.fixtureFile },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().serverVersion).toContain('SQLite');
  });

  it('rejects a bad sqlite path on test', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/connections/test',
      payload: { name: 'tmp', engine: 'sqlite', file: '/nope/missing.db' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('connects and reports capabilities', async () => {
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: { name: 'fixture', engine: 'sqlite', file: t.fixtureFile },
    });
    const { id } = create.json();
    const connect = await t.app.inject({
      method: 'POST',
      url: `/api/connections/${id}/connect`,
    });
    expect(connect.statusCode).toBe(200);
    const { capabilities } = connect.json();
    expect(capabilities.cancelQuery).toBe(false);
    expect(capabilities.serverVersion).toContain('SQLite');

    const list = await t.app.inject({ method: 'GET', url: '/api/connections' });
    const item = (list.json() as { id: string; connected: boolean }[]).find(
      (c) => c.id === id,
    );
    expect(item?.connected).toBe(true);
  });
});
