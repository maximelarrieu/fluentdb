import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { collectStream } from '../src/ai/types.js';
import {
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_NUM_CTX,
  OllamaProvider,
} from '../src/ai/providers/ollama.js';
import { aiProviderFromEnv } from '../src/ai/providers/index.js';

let server: http.Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

/** Fake Ollama: records the request body, answers with the given raw writes. */
async function fakeOllama(
  writes: string[],
  status = 200,
): Promise<{ url: string; body: () => any }> {
  let received = '';
  server = http.createServer((req, res) => {
    req.on('data', (c) => (received += c));
    req.on('end', async () => {
      res.writeHead(status, { 'content-type': 'application/x-ndjson' });
      for (const w of writes) {
        res.write(w);
        await new Promise((r) => setTimeout(r, 5));
      }
      res.end();
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, body: () => JSON.parse(received) };
}

const line = (o: object) => JSON.stringify(o) + '\n';

describe('OllamaProvider', () => {
  it('streams content deltas, even when NDJSON lines are split across chunks', async () => {
    const full =
      line({ message: { role: 'assistant', content: 'SELECT ' } }) +
      line({ message: { role: 'assistant', thinking: 'hmm', content: '' } }) +
      line({ message: { role: 'assistant', content: '1;' } }) +
      line({ done: true, message: { role: 'assistant', content: '' } });
    const fake = await fakeOllama([full.slice(0, 20), full.slice(20, 70), full.slice(70)]);

    const provider = new OllamaProvider('m', fake.url, 4096);
    const text = await collectStream(
      provider.chatStream({
        system: 'sys',
        messages: [{ role: 'user', content: 'q' }],
      }),
    );

    expect(text).toBe('SELECT 1;');
    expect(fake.body()).toMatchObject({
      model: 'm',
      stream: true,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'q' },
      ],
      options: { num_ctx: 4096 },
    });
  });

  it('surfaces HTTP and in-stream errors', async () => {
    const notFound = await fakeOllama(['{"error":"model \\"x\\" not found"}'], 404);
    await expect(
      collectStream(new OllamaProvider('x', notFound.url).chatStream({ system: '', messages: [] })),
    ).rejects.toThrow(/404.*not found/);
    server!.close();

    const midStream = await fakeOllama([line({ error: 'out of memory' })]);
    await expect(
      collectStream(new OllamaProvider('x', midStream.url).chatStream({ system: '', messages: [] })),
    ).rejects.toThrow(/out of memory/);
  });

  it('reports an unreachable server clearly', async () => {
    await expect(
      collectStream(
        new OllamaProvider('x', 'http://127.0.0.1:1').chatStream({ system: '', messages: [] }),
      ),
    ).rejects.toThrow(/Ollama injoignable/);
  });
});

describe('aiProviderFromEnv', () => {
  it('selects Ollama with defaults', () => {
    const p = aiProviderFromEnv({ AI_PROVIDER: 'ollama' });
    expect(p).toBeInstanceOf(OllamaProvider);
    expect(p!.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(DEFAULT_OLLAMA_NUM_CTX).toBeGreaterThanOrEqual(16384);
  });

  it('honours OLLAMA_MODEL', () => {
    expect(aiProviderFromEnv({ AI_PROVIDER: 'Ollama', OLLAMA_MODEL: 'qwen3:4b-instruct-2507-q4_K_M' })!.model).toBe(
      'qwen3:4b-instruct-2507-q4_K_M',
    );
  });

  it('keeps the Gemini fallback and the unconfigured case', () => {
    expect(aiProviderFromEnv({ GEMINI_API_KEY: 'k' })!.id).toBe('gemini');
    expect(aiProviderFromEnv({})).toBeNull();
    expect(aiProviderFromEnv({ AI_PROVIDER: 'none', GEMINI_API_KEY: 'k' })).toBeNull();
  });

  it('rejects an unknown provider', () => {
    expect(() => aiProviderFromEnv({ AI_PROVIDER: 'gpt' })).toThrow(/AI_PROVIDER inconnu/);
  });
});
