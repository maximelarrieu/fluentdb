import { z } from 'zod';

export const aiModes = [
  'chat',
  'generate_sql',
  'explain',
  'fix',
  'index_advice',
  'explain_object',
] as const;
export type AiMode = (typeof aiModes)[number];

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const aiChatRequestSchema = z.object({
  connectionId: z.string().optional(),
  database: z.string().optional(),
  mode: z.enum(aiModes).default('chat'),
  messages: z.array(chatMessageSchema).min(1),
  context: z
    .object({
      currentSql: z.string().optional(),
      error: z.string().optional(),
      selectedTables: z.array(z.string()).optional(),
      /** Compact digest of the execution plan, for index advice */
      planSummary: z.string().optional(),
      /** Target object to explain, for the `explain_object` mode */
      object: z
        .object({
          name: z.string(),
          schema: z.string().optional(),
          kind: z.enum(['table', 'view', 'matview']),
        })
        .optional(),
    })
    .optional(),
});
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;

/** Events on the SSE stream of POST /api/ai/chat */
export type AiStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'sql_suggestion'; sql: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface AiStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
}
