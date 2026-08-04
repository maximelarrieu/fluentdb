import { z } from 'zod';
import { filterSpecSchema, sortSpecSchema } from './query.js';

/** File formats the exporter can stream a result set to. */
export const exportFormats = ['csv', 'json', 'markdown', 'sql'] as const;
export const exportFormatSchema = z.enum(exportFormats);
export type ExportFormat = (typeof exportFormats)[number];

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
  format: exportFormatSchema,
  database: z.string().optional(),
  sql: z.string().min(1),
  fileName: z.string().max(200).optional(),
  /** Target table name used by the `sql` (INSERT) format. */
  tableName: z.string().max(200).optional(),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;

/** Export a table's rows directly (server rebuilds the SELECT from the grid
 * state), so the current filters/sort are honored without a raw SQL string. */
export const tableExportRequestSchema = z.object({
  format: exportFormatSchema,
  database: z.string().optional(),
  schema: z.string().optional(),
  sorts: z.array(sortSpecSchema).default([]),
  filters: z.array(filterSpecSchema).default([]),
  fileName: z.string().max(200).optional(),
});
export type TableExportRequest = z.infer<typeof tableExportRequestSchema>;

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
  /**
   * True when `estimatedRows` is an EXACT affected-row count obtained by a
   * read-only `SELECT count(*)` over the statement's own target and WHERE
   * (UPDATE/DELETE). False/absent means it's a planner estimate.
   */
  exactRows?: boolean;
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
