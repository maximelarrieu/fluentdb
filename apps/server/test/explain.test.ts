import { describe, expect, it } from 'vitest';
import { normalizePgPlan } from '../src/drivers/postgres/explain.js';
import { normalizeSqlitePlan } from '../src/drivers/sqlite/explain.js';

describe('normalizePgPlan', () => {
  const explain = {
    Plan: {
      'Node Type': 'Hash Join',
      'Total Cost': 200,
      'Plan Rows': 500,
      'Hash Cond': '(a.id = b.a_id)',
      Plans: [
        {
          'Node Type': 'Seq Scan',
          'Relation Name': 'big_table',
          'Total Cost': 180,
          'Plan Rows': 100000,
          Filter: "(status = 'x')",
        },
        {
          'Node Type': 'Index Scan',
          'Relation Name': 'small_table',
          'Index Name': 'small_pk',
          'Total Cost': 8,
          'Plan Rows': 1,
        },
      ],
    },
  };

  it('maps node types to kinds and computes cost share', () => {
    const root = normalizePgPlan(explain, false);
    expect(root.kind).toBe('join');
    expect(root.label).toContain('Hash Join');
    expect(root.children).toHaveLength(2);

    const seq = root.children[0]!;
    expect(seq.kind).toBe('scan_seq');
    expect(seq.label).toBe('Seq Scan on big_table');
    expect(seq.costPct).toBeCloseTo(0.9, 5); // 180 / 200
    expect(seq.warnings.length).toBeGreaterThan(0); // big filtered seq scan

    const idx = root.children[1]!;
    expect(idx.kind).toBe('scan_index');
    expect(idx.label).toContain('small_pk');
    expect(idx.warnings).toHaveLength(0);
  });

  it('reads actual rows only when analyzed', () => {
    const withActual = {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 't',
        'Total Cost': 1,
        'Plan Rows': 10,
        'Actual Rows': 12,
        'Actual Total Time': 3.5,
      },
    };
    expect(normalizePgPlan(withActual, false).actualRows).toBeNull();
    const analyzed = normalizePgPlan(withActual, true);
    expect(analyzed.actualRows).toBe(12);
    expect(analyzed.timeMs).toBeCloseTo(3.5, 5);
  });
});

describe('normalizeSqlitePlan', () => {
  it('builds a tree and flags full scans', () => {
    const root = normalizeSqlitePlan([
      { id: 1, parent: 0, detail: 'SCAN albums' },
      { id: 2, parent: 0, detail: 'SEARCH artists USING INTEGER PRIMARY KEY (rowid=?)' },
    ]);
    // two top-level steps → synthetic root
    expect(root.children).toHaveLength(2);
    const scan = root.children.find((c) => c.label.startsWith('SCAN'))!;
    expect(scan.kind).toBe('scan_seq');
    expect(scan.warnings.length).toBeGreaterThan(0);
    const search = root.children.find((c) => c.label.startsWith('SEARCH'))!;
    expect(search.kind).toBe('scan_index');
    expect(search.relation).toBe('artists');
  });
});
