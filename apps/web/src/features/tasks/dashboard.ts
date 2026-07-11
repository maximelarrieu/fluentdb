import type { TaskSnapshot } from '@fluentdb/shared';
import { numericColumns } from './trend.js';

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export interface TaskMetric {
  /** The numeric column summarised across rows, or null when there is none. */
  valueCol: string | null;
  /** One metric value per successful snapshot, oldest → newest. */
  points: number[];
  /** Latest metric value, or null when there is no successful run. */
  latest: number | null;
  /** Rows in the latest successful snapshot. */
  latestRowCount: number;
  /** Whether the latest successful run returned more than one row. */
  multiRow: boolean;
}

/**
 * Summarise a task's history into a single scalar per run for the dashboard:
 * the sum of its first numeric column (so a COUNT stays itself and a
 * size-per-table query becomes a total), or the row count when the query has
 * no numeric column. Pure — no rendering.
 */
export function taskMetric(snapshots: TaskSnapshot[]): TaskMetric {
  const ok = snapshots
    .filter((s) => s.status === 'ok' && s.rows.length > 0)
    .sort((a, b) => a.ranAt.localeCompare(b.ranAt));
  const valueCol = numericColumns(snapshots)[0] ?? null;
  const points: number[] = [];
  for (const s of ok) {
    if (valueCol) {
      const idx = s.columns.findIndex((c) => c.name === valueCol);
      let sum = 0;
      let any = false;
      for (const row of s.rows) {
        const n = num(row[idx]);
        if (n !== null) {
          sum += n;
          any = true;
        }
      }
      points.push(any ? sum : 0);
    } else {
      points.push(s.rowCount);
    }
  }
  const latestSnap = ok.at(-1);
  return {
    valueCol,
    points,
    latest: points.at(-1) ?? null,
    latestRowCount: latestSnap?.rowCount ?? 0,
    multiRow: (latestSnap?.rows.length ?? 0) > 1,
  };
}
