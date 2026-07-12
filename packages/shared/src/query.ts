import { z } from 'zod';

/**
 * Values are JSON-safe by the time they cross the API: drivers stringify
 * bigints/dates/buffers so the grid never loses precision.
 */
export type CellValue = string | number | boolean | null;

export interface QueryColumn {
  name: string;
  dataType?: string;
}

export interface QueryResultSet {
  columns: QueryColumn[];
  rows: CellValue[][];
  rowCount: number;
  truncated: boolean;
  affectedRows?: number;
  statement?: string;
}

export interface QueryResponse {
  queryId: string;
  resultSets: QueryResultSet[];
  durationMs: number;
}

export const sortSpecSchema = z.object({
  column: z.string(),
  dir: z.enum(['asc', 'desc']),
});
export type SortSpec = z.infer<typeof sortSpecSchema>;

export const filterOps = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'starts_with',
  'is_null',
  'not_null',
] as const;
export type FilterOp = (typeof filterOps)[number];

export const filterOpLabels: Record<FilterOp, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'contains',
  starts_with: 'starts with',
  is_null: 'is NULL',
  not_null: 'is not NULL',
};

export const filterSpecSchema = z.object({
  column: z.string(),
  op: z.enum(filterOps),
  value: z.string().optional(),
});
export type FilterSpec = z.infer<typeof filterSpecSchema>;

export const rowQuerySchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(1000).default(100),
  sorts: z.array(sortSpecSchema).default([]),
  filters: z.array(filterSpecSchema).default([]),
  /** Force an exact COUNT(*) instead of the planner estimate. */
  exactCount: z.boolean().optional(),
});
export type RowQuery = z.infer<typeof rowQuerySchema>;

export interface PageResult {
  columns: QueryColumn[];
  rows: CellValue[][];
  /** Total row count for the current filters (exact or estimated). */
  total: number | null;
  /** True when `total` is a planner estimate, not an exact count. */
  approximate: boolean;
  pkColumns: string[];
}

export interface HistoryEntry {
  id: number;
  connectionId: string;
  connectionName: string;
  database: string | null;
  sql: string;
  durationMs: number;
  rowCount: number | null;
  error: string | null;
  executedAt: string;
}
