import { z } from 'zod';
import type { EngineKind } from './connections.js';

export type PlanNodeKind =
  | 'scan_seq'
  | 'scan_index'
  | 'join'
  | 'sort'
  | 'aggregate'
  | 'other';

export interface PlanNode {
  id: string;
  /** Human label, e.g. "Seq Scan on orders" or "SEARCH albums USING INDEX …" */
  label: string;
  /** Filter / condition / extra info shown under the label */
  detail?: string;
  /** Table involved, when known */
  relation?: string;
  kind: PlanNodeKind;
  estimatedRows: number | null;
  /** Only populated when analyzed (ANALYZE actually ran the query) */
  actualRows: number | null;
  /** Share of the total query cost, 0..1, for heat coloring (null if unknown) */
  costPct: number | null;
  /** Wall time on this node in ms (ANALYZE only) */
  timeMs: number | null;
  warnings: string[];
  children: PlanNode[];
}

export interface QueryPlan {
  engine: EngineKind;
  analyzed: boolean;
  root: PlanNode;
  /** Raw EXPLAIN text/JSON for the "raw" toggle */
  rawText?: string;
}

export const explainRequestSchema = z.object({
  sql: z.string().min(1),
  database: z.string().optional(),
  /** Ask the engine to actually run the query for real metrics (reads only). */
  analyze: z.boolean().optional(),
});
export type ExplainRequest = z.infer<typeof explainRequestSchema>;
