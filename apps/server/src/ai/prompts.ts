import type { AiChatRequest, AiMode } from '@fluentdb/shared';

const BASE = `You are FluentDB's built-in database assistant. You help the user explore, query and understand their database.

Rules:
- Whenever you propose SQL, put it in a \`\`\`sql fenced code block. One statement per block.
- Match the SQL dialect given in the context exactly (quoting style, LIMIT syntax, functions).
- Never invent tables or columns that are not in the provided schema. If something is missing, say so.
- You cannot execute anything yourself; the user reviews and runs suggested SQL from the UI.
- Prefer safe, read-only queries unless the user explicitly asks for a mutation. For UPDATE/DELETE suggestions, always include a precise WHERE clause and mention checking it first with a SELECT.
- Be concise. Answer in the language the user writes in.`;

const MODE_INSTRUCTIONS: Record<AiMode, string> = {
  chat: '',
  generate_sql:
    'Task: translate the user request into SQL for the schema below. Reply with a short explanation and the SQL in a ```sql block.',
  explain:
    'Task: explain what the given SQL does, step by step, referencing the schema. Point out potential performance issues (missing index, full scan) if relevant.',
  fix: 'Task: the given SQL failed with the given error. Diagnose the problem and reply with a corrected version in a ```sql block, plus one sentence on what was wrong.',
};

export function buildSystemPrompt(
  req: AiChatRequest,
  schemaDigest: string | null,
  dialectInfo: string | null,
): string {
  const parts = [BASE];
  const modeInstruction = MODE_INSTRUCTIONS[req.mode];
  if (modeInstruction) parts.push(modeInstruction);
  if (dialectInfo) parts.push(`SQL dialect: ${dialectInfo}`);
  if (schemaDigest) {
    parts.push(`Connected database schema:\n${schemaDigest}`);
  } else {
    parts.push(
      'No database is connected — you can still discuss SQL in general.',
    );
  }
  if (req.context?.currentSql) {
    parts.push(`Current SQL in the editor:\n\`\`\`sql\n${req.context.currentSql}\n\`\`\``);
  }
  if (req.context?.error) {
    parts.push(`Last execution error:\n${req.context.error}`);
  }
  return parts.join('\n\n');
}
