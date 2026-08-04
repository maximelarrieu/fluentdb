/** One normalized statement from the engine's statement-statistics view. */
export interface QueryStat {
  /** Engine statement id (stringified — may be a bigint), null if unavailable. */
  queryId: string | null;
  /** Normalized query text ($1-style placeholders). */
  query: string;
  calls: number;
  /** Cumulative execution time (ms) across all calls. */
  totalMs: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  /** Standard deviation of execution time (ms) — high = unstable latency. */
  stddevMs: number;
  /** Total rows returned/affected across all calls. */
  rows: number;
  /** Share of the grand-total execution time, 0..1. */
  pctTotal: number;
  /** Shared-buffer cache hit ratio 0..1, or null when there was no block IO. */
  cacheHitRatio: number | null;
}

export const queryStatSortKeys = [
  'total',
  'mean',
  'calls',
  'rows',
  'stddev',
] as const;
export type QueryStatSort = (typeof queryStatSortKeys)[number];

export interface QueryStatsResult {
  /** False when the stats source (e.g. pg_stat_statements) isn't available. */
  available: boolean;
  /** When unavailable: why, and how to enable it. */
  reason?: string;
  /** SQL the user can run to enable the source (shown with the reason). */
  enableSql?: string;
  rows: QueryStat[];
}
