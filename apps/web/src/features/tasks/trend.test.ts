import { describe, expect, it } from 'vitest';
import type { TaskSnapshot } from '@fluentdb/shared';
import { buildTrend, numericColumns, textColumns } from './trend.js';

function snap(
  id: number,
  ranAt: string,
  columns: string[],
  rows: (string | number)[][],
): TaskSnapshot {
  return {
    id,
    taskId: 't',
    ranAt,
    status: 'ok',
    durationMs: 1,
    rowCount: rows.length,
    columns: columns.map((name) => ({ name })),
    rows,
    truncated: false,
    error: null,
  };
}

describe('trend', () => {
  it('detects numeric and text columns', () => {
    const s = [snap(1, '2026-01-01T09:00:00Z', ['tbl', 'n'], [['a', 10]])];
    expect(numericColumns(s)).toEqual(['n']);
    expect(textColumns(s)).toEqual(['tbl']);
  });

  it('builds a single series over time (no label)', () => {
    const s = [
      snap(1, '2026-01-01T09:00:00Z', ['n'], [[10]]),
      snap(2, '2026-01-02T09:00:00Z', ['n'], [[14]]),
    ];
    const t = buildTrend(s, 'n', null);
    expect(t.series).toHaveLength(1);
    expect(t.series[0]!.points.map((p) => p.y)).toEqual([10, 14]);
    expect(t.hasData).toBe(true);
  });

  it('builds one series per label value, ordered by latest value', () => {
    const s = [
      snap(1, '2026-01-01T09:00:00Z', ['tbl', 'size'], [
        ['albums', 5],
        ['artists', 8],
      ]),
      snap(2, '2026-01-02T09:00:00Z', ['tbl', 'size'], [
        ['albums', 20],
        ['artists', 9],
      ]),
    ];
    const t = buildTrend(s, 'size', 'tbl');
    expect(t.series.map((x) => x.key)).toEqual(['albums', 'artists']); // 20 > 9
    expect(t.series[0]!.points).toHaveLength(2);
  });

  it('ignores failed snapshots and non-numeric values', () => {
    const ok = snap(1, '2026-01-01T09:00:00Z', ['n'], [[10]]);
    const bad: TaskSnapshot = {
      ...snap(2, '2026-01-02T09:00:00Z', ['n'], [[0]]),
      status: 'error',
      rows: [],
      error: 'boom',
    };
    const t = buildTrend([ok, bad], 'n', null);
    expect(t.series[0]!.points).toHaveLength(1);
    expect(t.hasData).toBe(false); // only one point
  });

  it('caps to 8 series and reports the rest', () => {
    const rows = Array.from({ length: 12 }, (_, i) => [`t${i}`, i + 1]);
    const s = [
      snap(1, '2026-01-01T09:00:00Z', ['tbl', 'v'], rows),
      snap(2, '2026-01-02T09:00:00Z', ['tbl', 'v'], rows),
    ];
    const t = buildTrend(s, 'v', 'tbl');
    expect(t.series).toHaveLength(8);
    expect(t.truncatedSeries).toBe(4);
  });
});
