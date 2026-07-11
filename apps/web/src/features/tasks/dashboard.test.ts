import { describe, expect, it } from 'vitest';
import type { TaskSnapshot } from '@fluentdb/shared';
import { taskMetric, taskDelta } from './dashboard.js';

function snap(
  id: number,
  ranAt: string,
  columns: string[],
  rows: (string | number)[][],
  status: 'ok' | 'error' = 'ok',
): TaskSnapshot {
  return {
    id,
    taskId: 't',
    ranAt,
    status,
    durationMs: 1,
    rowCount: rows.length,
    columns: columns.map((name) => ({ name })),
    rows,
    truncated: false,
    error: status === 'error' ? 'boom' : null,
    alert: null,
  };
}

describe('taskMetric', () => {
  it('uses a single numeric value as-is over time', () => {
    const m = taskMetric([
      snap(1, '2026-01-01T09:00:00Z', ['n'], [[10]]),
      snap(2, '2026-01-02T09:00:00Z', ['n'], [[14]]),
    ]);
    expect(m.valueCol).toBe('n');
    expect(m.points).toEqual([10, 14]);
    expect(m.latest).toBe(14);
    expect(m.multiRow).toBe(false);
  });

  it('sums the numeric column across rows (e.g. total size)', () => {
    const m = taskMetric([
      snap(1, '2026-01-01T09:00:00Z', ['tbl', 'size'], [
        ['a', 5],
        ['b', 8],
      ]),
    ]);
    expect(m.valueCol).toBe('size');
    expect(m.points).toEqual([13]);
    expect(m.multiRow).toBe(true);
    expect(m.latestRowCount).toBe(2);
  });

  it('falls back to the row count when there is no numeric column', () => {
    const m = taskMetric([
      snap(1, '2026-01-01T09:00:00Z', ['name'], [['a'], ['b'], ['c']]),
    ]);
    expect(m.valueCol).toBeNull();
    expect(m.points).toEqual([3]);
    expect(m.latest).toBe(3);
  });

  it('ignores failed runs and reports no data when empty', () => {
    const m = taskMetric([
      snap(1, '2026-01-01T09:00:00Z', ['n'], [], 'error'),
    ]);
    expect(m.points).toEqual([]);
    expect(m.latest).toBeNull();
  });

  it('exposes the previous value for a delta', () => {
    const m = taskMetric([
      snap(1, '2026-01-01T09:00:00Z', ['n'], [[100]]),
      snap(2, '2026-01-02T09:00:00Z', ['n'], [[112]]),
    ]);
    expect(m.previous).toBe(100);
    expect(m.latest).toBe(112);
  });
});

describe('taskDelta', () => {
  const m = (points: number[]): Parameters<typeof taskDelta>[0] => ({
    valueCol: 'n',
    points,
    latest: points.at(-1) ?? null,
    previous: points.length >= 2 ? points[points.length - 2]! : null,
    latestRowCount: 1,
    multiRow: false,
  });

  it('is null with fewer than two runs', () => {
    expect(taskDelta(m([]))).toBeNull();
    expect(taskDelta(m([5]))).toBeNull();
  });

  it('computes direction and percentage', () => {
    expect(taskDelta(m([100, 112]))).toEqual({ dir: 'up', diff: 12, pct: 12 });
    expect(taskDelta(m([100, 75]))).toEqual({ dir: 'down', diff: -25, pct: -25 });
  });

  it('reports a flat change and a null percentage from zero', () => {
    expect(taskDelta(m([8, 8]))).toEqual({ dir: 'flat', diff: 0, pct: 0 });
    expect(taskDelta(m([0, 5]))).toEqual({ dir: 'up', diff: 5, pct: null });
  });
});
