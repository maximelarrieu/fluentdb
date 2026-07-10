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
