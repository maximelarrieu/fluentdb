import { z } from 'zod';
import { taskScheduleSchema, taskAlertSchema } from './tasks.js';

export const aiModes = [
  'chat',
  'generate_sql',
  'explain',
  'fix',
  'index_advice',
  'explain_object',
  'chartable_sql',
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

/** Turn a natural-language monitoring wish into a scheduled-task proposal. */
export const monitorRequestSchema = z.object({
  connectionId: z.string().min(1),
  database: z.string().optional(),
  description: z.string().min(1).max(2000),
});
export type MonitorRequest = z.infer<typeof monitorRequestSchema>;

/**
 * A reviewable proposal the user confirms before anything is created. The SQL
 * is validated read-only server-side; the user can still edit every field.
 */
export const monitorProposalSchema = z.object({
  name: z.string().min(1).max(120),
  sql: z.string().min(1),
  schedule: taskScheduleSchema,
  alert: taskAlertSchema.nullable().default(null),
  /** One-sentence, human-facing explanation of what was proposed. */
  notes: z.string().default(''),
});
export type MonitorProposal = z.infer<typeof monitorProposalSchema>;

/** Ask the assistant to generate realistic mock rows for a table. */
export const mockGenerateRequestSchema = z.object({
  connectionId: z.string().min(1),
  database: z.string().optional(),
  schema: z.string().optional(),
  table: z.string().min(1),
  count: z.number().int().min(1).max(100),
});
export type MockGenerateRequest = z.infer<typeof mockGenerateRequestSchema>;

const mockCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * A preview of generated rows the user reviews before inserting. `columns` are
 * the target columns (auto-increment PKs excluded); each row maps column → value.
 */
export interface MockRowsPreview {
  columns: string[];
  rows: Record<string, z.infer<typeof mockCellSchema>>[];
}
