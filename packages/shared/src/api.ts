import { z } from 'zod';

export const queryRequestSchema = z.object({
  sql: z.string().min(1),
  database: z.string().optional(),
  maxRows: z.number().int().min(1).max(100_000).default(1000),
  /**
   * Optional client-generated id so the UI can cancel a query in flight
   * (via POST /queries/:queryId/cancel) before the response comes back.
   * The server generates one when omitted.
   */
  queryId: z.string().min(1).max(64).optional(),
});
export type QueryRequest = z.infer<typeof queryRequestSchema>;

export const exportRequestSchema = z.object({
  format: z.enum(['csv', 'json']),
  database: z.string().optional(),
  sql: z.string().min(1),
  fileName: z.string().max(200).optional(),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const queryPlanRequestSchema = z.object({
  sql: z.string().min(1),
  database: z.string().optional(),
});
export type QueryPlanRequest = z.infer<typeof queryPlanRequestSchema>;

export type StatementKind = 'read' | 'write' | 'ddl' | 'other';

export interface StatementPlan {
  sql: string;
  kind: StatementKind;
  operation: string;
  warnings: string[];
  /** null when the engine can't estimate (e.g. SQLite) or on EXPLAIN failure */
  estimatedRows: number | null;
}

export interface QueryPlanResponse {
  statements: StatementPlan[];
  /** true if any statement writes data or changes structure */
  requiresConfirmation: boolean;
}

export interface ApiError {
  error: string;
  detail?: string;
}
