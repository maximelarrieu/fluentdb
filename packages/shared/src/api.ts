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

export interface ApiError {
  error: string;
  detail?: string;
}
