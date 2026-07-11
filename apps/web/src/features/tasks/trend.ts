import type { TaskSnapshot } from '@fluentdb/shared';

/** Dark categorical palette (validated for the app surface, fixed order). */
export const SERIES_COLORS = [
  '#3987e5',
  '#199e70',
  '#c98500',
  '#008300',
  '#9085e9',
  '#e66767',
  '#d55181',
  '#d95926',
];
const MAX_SERIES = SERIES_COLORS.length;

export interface TrendPoint {
  x: number; // epoch ms of the snapshot
  y: number;
}
export interface TrendSeries {
  key: string;
  color: string;
  points: TrendPoint[];
}
export interface Trend {
  series: TrendSeries[];
  /** Series dropped beyond MAX_SERIES (kept the largest by latest value). */
  truncatedSeries: number;
  hasData: boolean;
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Columns whose values look numeric across the successful snapshots. */
export function numericColumns(snapshots: TaskSnapshot[]): string[] {
  const ok = snapshots.filter((s) => s.status === 'ok' && s.rows.length > 0);
  const first = ok[0];
  if (!first) return [];
  const cols = first.columns.map((c) => c.name);
  return cols.filter((_, i) =>
    ok.some((s) => s.rows.some((r) => num(r[i]) !== null)),
  );
}

export function textColumns(snapshots: TaskSnapshot[]): string[] {
  const first = snapshots.find((s) => s.status === 'ok' && s.rows.length > 0);
  if (!first) return [];
  const numeric = new Set(numericColumns(snapshots));
  return first.columns.map((c) => c.name).filter((n) => !numeric.has(n));
}

/**
 * Build a time series from a task's snapshots: one line per distinct label
 * value (or a single line when there is no label column). X is the run time,
 * Y is the chosen numeric column. Pure — no rendering.
 */
export function buildTrend(
  snapshots: TaskSnapshot[],
  valueCol: string,
  labelCol: string | null,
): Trend {
  const ok = [...snapshots]
    .filter((s) => s.status === 'ok')
    .sort((a, b) => a.ranAt.localeCompare(b.ranAt));

  const map = new Map<string, TrendPoint[]>();
  for (const snap of ok) {
    const valueIdx = snap.columns.findIndex((c) => c.name === valueCol);
    if (valueIdx < 0) continue;
    const labelIdx = labelCol
      ? snap.columns.findIndex((c) => c.name === labelCol)
      : -1;
    const x = new Date(snap.ranAt).getTime();
    for (const row of snap.rows) {
      const y = num(row[valueIdx]);
      if (y === null) continue;
      const key = labelIdx >= 0 ? String(row[labelIdx] ?? '∅') : valueCol;
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push({ x, y });
    }
  }

  // Keep the largest series by their latest value; fold the rest away.
  const all = [...map.entries()]
    .map(([key, points]) => ({ key, points }))
    .filter((s) => s.points.length > 0)
    .sort((a, b) => b.points.at(-1)!.y - a.points.at(-1)!.y);

  const kept = all.slice(0, MAX_SERIES);
  return {
    series: kept.map((s, i) => ({
      key: s.key,
      color: SERIES_COLORS[i]!,
      points: s.points,
    })),
    truncatedSeries: all.length - kept.length,
    hasData: kept.some((s) => s.points.length >= 2),
  };
}
