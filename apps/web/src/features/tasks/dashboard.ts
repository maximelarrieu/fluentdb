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
  /** Metric value of the run just before the latest, or null. */
  previous: number | null;
  /** Rows in the latest successful snapshot. */
  latestRowCount: number;
  /** Whether the latest successful run returned more than one row. */
  multiRow: boolean;
}

export interface TaskDelta {
  dir: 'up' | 'down' | 'flat';
  /** Signed absolute change (latest − previous). */
  diff: number;
  /** Signed percentage change, or null when the previous value was 0. */
  pct: number | null;
}

/** Change of the latest metric vs the previous run, or null when < 2 runs. */
export function taskDelta(m: TaskMetric): TaskDelta | null {
  if (m.latest == null || m.previous == null) return null;
  const diff = m.latest - m.previous;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const pct = m.previous !== 0 ? (diff / m.previous) * 100 : null;
  return { dir, diff, pct };
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
    previous: points.length >= 2 ? points[points.length - 2]! : null,
    latestRowCount: latestSnap?.rowCount ?? 0,
    multiRow: (latestSnap?.rows.length ?? 0) > 1,
  };
}
