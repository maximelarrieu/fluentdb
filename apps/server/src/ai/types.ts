import type { ChatMessage } from '@fluentdb/shared';

export interface AiChatOptions {
  system: string;
  messages: ChatMessage[];
}

export interface AiTextChunk {
  type: 'text';
  delta: string;
}

/**
 * A provider is a pure text-completion stream. It has NO access to any
 * Driver: the assistant can only produce text — SQL it suggests reaches
 * the database exclusively through POST /api/.../query, i.e. a user click.
 */
export interface AiProvider {
  readonly id: string;
  readonly model: string;
  chatStream(opts: AiChatOptions): AsyncIterable<AiTextChunk>;
}

/** Extract ```sql fenced blocks from a completed markdown answer. */
export function extractSqlBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```sql\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const sql = m[1]!.trim();
    if (sql) blocks.push(sql);
  }
  return blocks;
}

/**
 * Parse the first JSON object out of a model answer, whether it came back in a
 * ```json fenced block or as a bare object. Returns null when nothing parses.
 */
export function extractJson(markdown: string): unknown {
  const fenced = /```json\s*\n([\s\S]*?)```/i.exec(markdown);
  const candidate = fenced
    ? fenced[1]!
    : markdown.slice(markdown.indexOf('{'), markdown.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/** Accumulate a provider's stream into a single string (one-shot calls). */
export async function collectStream(
  stream: AsyncIterable<AiTextChunk>,
): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk.delta;
  return text;
}
