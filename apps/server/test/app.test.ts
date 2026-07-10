import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, makeTestApp, type TestApp } from './helpers.js';

describe('app basics', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(async () => {
    await closeTestApp(t);
  });

  it('serves /api/health', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, name: 'fluentdb' });
  });

  it('rejects non-local Host headers (DNS-rebinding guard)', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'evil.example.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts 127.0.0.1 with port as Host', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: '127.0.0.1:4983' },
    });
    expect(res.statusCode).toBe(200);
  });
});
