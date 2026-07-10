import { GoogleGenAI } from '@google/genai';
import type { AiChatOptions, AiProvider, AiTextChunk } from '../types.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini';
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, model = DEFAULT_GEMINI_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async *chatStream(opts: AiChatOptions): AsyncIterable<AiTextChunk> {
    const contents = opts.messages.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents,
      config: {
        systemInstruction: opts.system,
        temperature: 0.2,
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield { type: 'text', delta: text };
    }
  }
}

export function geminiFromEnv(env = process.env): GeminiProvider | null {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GeminiProvider(apiKey, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
}
