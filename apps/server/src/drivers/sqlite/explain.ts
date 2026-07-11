import type { PlanNode, PlanNodeKind } from '@fluentdb/shared';

export interface SqlitePlanRow {
  id: number;
  parent: number;
  detail: string;
}

function kindOf(detail: string): PlanNodeKind {
  const d = detail.toUpperCase();
  // SQLite: SEARCH = lookup via an index or the primary key; SCAN = full scan.
  if (d.startsWith('SEARCH')) return 'scan_index';
  if (d.startsWith('SCAN')) return 'scan_seq';
  if (d.includes('USE TEMP B-TREE') && d.includes('ORDER BY')) return 'sort';
  if (d.includes('USE TEMP B-TREE') && d.includes('GROUP BY')) return 'aggregate';
  return 'other';
}

function relationOf(detail: string): string | undefined {
  // "SCAN albums", "SEARCH albums USING INDEX ..."
  const m = /^(?:SCAN|SEARCH)\s+(\w+)/i.exec(detail);
  return m ? m[1] : undefined;
}

/**
 * Build a plan tree from SQLite's `EXPLAIN QUERY PLAN` rows (id/parent/detail).
 * SQLite gives no cost estimates, so coloring is heuristic (by kind).
 */
export function normalizeSqlitePlan(rows: SqlitePlanRow[]): PlanNode {
  const nodeById = new Map<number, PlanNode>();
  const childrenOf = new Map<number, PlanNode[]>();

  for (const r of rows) {
    const kind = kindOf(r.detail);
    const warnings: string[] = [];
    if (kind === 'scan_seq') {
      warnings.push(
        'Parcours complet de table (SCAN) — un index pourrait accélérer la requête',
      );
    }
    nodeById.set(r.id, {
      id: String(r.id),
      label: r.detail,
      relation: relationOf(r.detail),
      kind,
      estimatedRows: null,
      actualRows: null,
      costPct: null,
      timeMs: null,
      warnings,
      children: [],
    });
  }

  const roots: PlanNode[] = [];
  for (const r of rows) {
    const node = nodeById.get(r.id)!;
    if (r.parent === 0 || !nodeById.has(r.parent)) {
      roots.push(node);
    } else {
      const list = childrenOf.get(r.parent) ?? [];
      list.push(node);
      childrenOf.set(r.parent, list);
    }
  }
  for (const [parentId, kids] of childrenOf) {
    nodeById.get(parentId)!.children = kids;
  }

  // A query plan may have several top-level steps: wrap them under a synthetic
  // root so the tree always has a single entry point.
  if (roots.length === 1) return roots[0]!;
  return {
    id: 'root',
    label: 'QUERY PLAN',
    kind: 'other',
    estimatedRows: null,
    actualRows: null,
    costPct: null,
    timeMs: null,
    warnings: [],
    children: roots,
  };
}
