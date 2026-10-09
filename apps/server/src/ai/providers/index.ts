import type { AiProvider } from '../types.js';
import { geminiFromEnv } from './gemini.js';
import { ollamaFromEnv } from './ollama.js';

export const AI_NOT_CONFIGURED =
  'No AI provider configured — set AI_PROVIDER=ollama (local model) or GEMINI_API_KEY and restart the server';

/**
 * `AI_PROVIDER` picks the provider explicitly. Without it, Gemini is used
 * when a key is present (behaviour before Ollama support), else none.
 */
export function aiProviderFromEnv(env = process.env): AiProvider | null {
  const choice = env.AI_PROVIDER?.trim().toLowerCase();
  if (choice === 'ollama') return ollamaFromEnv(env);
  if (choice === 'none') return null;
  if (choice && choice !== 'gemini') {
    throw new Error(`AI_PROVIDER inconnu : « ${env.AI_PROVIDER} » (ollama | gemini | none)`);
  }
  return geminiFromEnv(env);
}
