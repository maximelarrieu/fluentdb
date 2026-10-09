import type { AiChatOptions, AiProvider, AiTextChunk } from '../types.js';

export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
// Benchmarked against qwen3:4b-instruct on generate_sql: as accurate, ~30%
// faster, and small enough (1.9 GB) to keep a 16k context on a 4 GB GPU.
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5-coder:3b';
// Ollama's own default context window is small enough to silently truncate
// the schema digest (up to 80 tables).
export const DEFAULT_OLLAMA_NUM_CTX = 16384;

interface OllamaChatLine {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

/**
 * Local model served by Ollama (native /api/chat, NDJSON stream). Only the
 * answer `content` is forwarded — a thinking model's reasoning stays out.
 */
export class OllamaProvider implements AiProvider {
  readonly id = 'ollama';

  constructor(
    readonly model = DEFAULT_OLLAMA_MODEL,
    private readonly baseUrl = DEFAULT_OLLAMA_BASE_URL,
    private readonly numCtx = DEFAULT_OLLAMA_NUM_CTX,
  ) {}

  async *chatStream(opts: AiChatOptions): AsyncIterable<AiTextChunk> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/api/chat`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: true,
          messages: [
            { role: 'system', content: opts.system },
            ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          options: { temperature: 0.2, num_ctx: this.numCtx },
        }),
      });
    } catch (err) {
      throw new Error(
        `Ollama injoignable sur ${this.baseUrl} — lance « ollama serve » (${(err as Error).message})`,
      );
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Ollama a répondu ${res.status} : ${detail || res.statusText}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const bytes of res.body as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(bytes, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        const chunk = parseLine(line);
        if (chunk) yield chunk;
      }
    }
    const chunk = parseLine(buffer.trim());
    if (chunk) yield chunk;
  }
}

function parseLine(line: string): AiTextChunk | null {
  if (!line) return null;
  const data = JSON.parse(line) as OllamaChatLine;
  if (data.error) throw new Error(`Ollama : ${data.error}`);
  const delta = data.message?.content;
  return delta ? { type: 'text', delta } : null;
}

export function ollamaFromEnv(env = process.env): OllamaProvider {
  const numCtx = Number(env.OLLAMA_NUM_CTX);
  return new OllamaProvider(
    env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
    env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
    Number.isInteger(numCtx) && numCtx > 0 ? numCtx : DEFAULT_OLLAMA_NUM_CTX,
  );
}
