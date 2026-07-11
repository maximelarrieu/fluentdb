import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AiStreamEvent } from '@fluentdb/shared';
import { extractSqlBlocks } from '../src/ai/types.js';
import {
  FakeAiProvider,
  closeTestApp,
  createAndConnect,
  makeTestApp,
  type TestApp,
} from './helpers.js';

function parseSse(payload: string): AiStreamEvent[] {
  return payload
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

describe('extractSqlBlocks', () => {
  it('extracts fenced sql blocks only', () => {
    const text =
      'Voici :\n```sql\nSELECT 1;\n```\ntexte\n```js\nconsole.log(1)\n```\n```SQL\nSELECT 2;\n```';
    expect(extractSqlBlocks(text)).toEqual(['SELECT 1;', 'SELECT 2;']);
  });
});

describe('AI chat endpoint', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await makeTestApp({
      ai: new FakeAiProvider([
        'Voici la requête ',
        'demandée :\n```sql\nSELECT * FROM albums LIMIT 10;\n```\nVoilà.',
      ]),
    });
  });
  afterAll(async () => {
    await closeTestApp(t);
  });

  it('reports configured status', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/ai/status' });
    expect(res.json()).toEqual({
      configured: true,
      provider: 'fake',
      model: 'fake-1',
    });
  });

  it('streams SSE text deltas, sql suggestions and done', async () => {
    const id = await createAndConnect(t);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: {
        connectionId: id,
        mode: 'generate_sql',
        messages: [{ role: 'user', content: 'liste les albums' }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const events = parseSse(res.payload);
    const text = events
      .filter((e) => e.type === 'text')
      .map((e) => (e as { delta: string }).delta)
      .join('');
    expect(text).toContain('SELECT * FROM albums');

    const suggestion = events.find((e) => e.type === 'sql_suggestion');
    expect(suggestion).toEqual({
      type: 'sql_suggestion',
      sql: 'SELECT * FROM albums LIMIT 10;',
    });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('returns 503 when no provider is configured', async () => {
    const bare = await makeTestApp({ ai: null });
    const res = await bare.app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: { messages: [{ role: 'user', content: 'salut' }] },
    });
    expect(res.statusCode).toBe(503);
    await closeTestApp(bare);
  });

  it('handles index_advice mode with a plan summary', async () => {
    const app = await makeTestApp({
      ai: new FakeAiProvider([
        'Un index sur year aiderait :\n',
        '```sql\nCREATE INDEX idx_albums_year ON albums (year);\n```\n',
        'Attention : un index accélère les lectures mais ralentit les écritures.',
      ]),
    });
    const id = await createAndConnect(app);
    const res = await app.app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: {
        connectionId: id,
        mode: 'index_advice',
        messages: [{ role: 'user', content: 'propose un index' }],
        context: {
          currentSql: 'SELECT * FROM albums WHERE year > 2000',
          planSummary: 'Sequential scans:\n- table albums, filter year > 2000',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const events = parseSse(res.payload);
    const suggestion = events.find((e) => e.type === 'sql_suggestion');
    expect(suggestion).toEqual({
      type: 'sql_suggestion',
      sql: 'CREATE INDEX idx_albums_year ON albums (year);',
    });
    await closeTestApp(app);
  });

  it('injects object structure and definition for explain_object', async () => {
    // A provider that records the system prompt it was handed.
    let captured = '';
    const recorder = {
      id: 'rec',
      model: 'rec-1',
      // eslint-disable-next-line require-yield
      async *chatStream(opts: { system: string }) {
        captured = opts.system;
        return;
      },
    };
    const app = await makeTestApp({ ai: recorder as never });
    const id = await createAndConnect(app);
    const res = await app.app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: {
        connectionId: id,
        mode: 'explain_object',
        messages: [{ role: 'user', content: 'explique recent_albums' }],
        context: { object: { name: 'recent_albums', kind: 'view' } },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(captured).toContain('Object to explain:');
    expect(captured).toContain('recent_albums');
    // sqlite getViewDefinition returns the CREATE VIEW statement
    expect(captured).toContain('Definition:');
    expect(captured.toLowerCase()).toContain('create view');
    await closeTestApp(app);
  });
});

describe('schema digest', () => {
  it('serializes tables one per line with PK/FK info', async () => {
    const t2 = await makeTestApp();
    const id = await createAndConnect(t2);
    const { buildSchemaDigest } = await import('../src/ai/schemaContext.js');
    const driver = await t2.built.ctx.manager.getDriver(id);
    const digest = await buildSchemaDigest(driver, ['albums']);
    const lines = digest.split('\n');
    // preferred table first
    expect(lines[0]).toContain('albums');
    expect(lines[0]).toContain('FK artist_id -> artists(id)');
    expect(digest).toContain('- artists (id INTEGER PK');
    // views excluded, no row data
    expect(digest).not.toContain('recent_albums');
    expect(digest).not.toContain('Daft Punk');
    await closeTestApp(t2);
  });
});
