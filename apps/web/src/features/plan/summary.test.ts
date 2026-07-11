import { describe, expect, it } from 'vitest';
import type { PlanNode, QueryPlan } from '@fluentdb/shared';
import { summarizePlan } from './summary.js';

function node(p: Partial<PlanNode>): PlanNode {
  return {
    id: '0',
    label: 'Node',
    kind: 'other',
    estimatedRows: null,
    actualRows: null,
    costPct: null,
    timeMs: null,
    warnings: [],
    children: [],
    ...p,
  };
}

describe('summarizePlan', () => {
  it('highlights sequential scans with table, filter and rows', () => {
    const plan: QueryPlan = {
      engine: 'postgres',
      analyzed: false,
      root: node({
        label: 'Hash Join',
        kind: 'join',
        costPct: 1,
        children: [
          node({
            id: '1',
            label: 'Seq Scan on albums',
            kind: 'scan_seq',
            relation: 'albums',
            detail: 'year > 2000',
            estimatedRows: 1000,
            costPct: 0.9,
          }),
        ],
      }),
    };
    const text = summarizePlan(plan);
    expect(text).toContain('Sequential scans');
    expect(text).toContain('table albums');
    expect(text).toContain('filter year > 2000');
    expect(text).toContain('~1000 rows');
    expect(text).toContain('Most expensive steps');
  });

  it('reports when nothing stands out', () => {
    const plan: QueryPlan = {
      engine: 'sqlite',
      analyzed: false,
      root: node({ label: 'SEARCH t USING INDEX', kind: 'scan_index' }),
    };
    expect(summarizePlan(plan)).toContain('No obvious sequential scan');
  });
});
