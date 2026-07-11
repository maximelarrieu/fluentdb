import type { PlanNode, PlanNodeKind } from '@fluentdb/shared';

/**
 * MySQL's EXPLAIN FORMAT=JSON nests a `query_block` with operations like
 * `nested_loop`, `table`, `ordering_operation`, `grouping_operation`. We
 * normalize best-effort into our uniform tree.
 */
interface MyBlock {
  table?: MyTable;
  nested_loop?: { table?: MyTable }[];
  ordering_operation?: MyBlock;
  grouping_operation?: MyBlock;
  duplicates_removal?: MyBlock;
  query_block?: MyBlock;
}
interface MyTable {
  table_name?: string;
  access_type?: string;
  key?: string;
  rows_examined_per_scan?: number;
  rows_produced_per_join?: number;
  filtered?: string;
  attached_condition?: string;
  possible_keys?: string[];
}

function tableNode(t: MyTable, path: string): PlanNode {
  const access = (t.access_type ?? '').toLowerCase();
  let kind: PlanNodeKind = 'other';
  if (access === 'all') kind = 'scan_seq';
  else if (access === 'ref' || access === 'eq_ref' || access === 'range' || access === 'index')
    kind = 'scan_index';

  const label = `${t.access_type ?? 'access'}${t.table_name ? ` on ${t.table_name}` : ''}${
    t.key ? ` (${t.key})` : ''
  }`;
  const warnings: string[] = [];
  if (kind === 'scan_seq') {
    warnings.push(
      'Parcours complet de table (access_type ALL) — un index sur les colonnes du filtre pourrait accélérer la requête',
    );
  }
  return {
    id: path,
    label,
    detail: t.attached_condition,
    relation: t.table_name,
    kind,
    estimatedRows:
      typeof t.rows_examined_per_scan === 'number'
        ? t.rows_examined_per_scan
        : null,
    actualRows: null,
    costPct: null,
    timeMs: null,
    warnings,
    children: [],
  };
}

function walk(block: MyBlock, path: string): PlanNode[] {
  const nodes: PlanNode[] = [];
  const nested = block.ordering_operation ?? block.grouping_operation ?? block.duplicates_removal;
  if (nested) return walk(nested, path);
  if (block.query_block) return walk(block.query_block, path);
  if (block.nested_loop) {
    block.nested_loop.forEach((entry, i) => {
      if (entry.table) nodes.push(tableNode(entry.table, `${path}.${i}`));
    });
    return nodes;
  }
  if (block.table) nodes.push(tableNode(block.table, `${path}.0`));
  return nodes;
}

export function normalizeMysqlPlan(explainJson: unknown): PlanNode {
  const parsed =
    typeof explainJson === 'string' ? safeParse(explainJson) : explainJson;
  const qb = (parsed as { query_block?: MyBlock })?.query_block;
  const children = qb ? walk(qb, '0') : [];
  return {
    id: 'root',
    label: 'QUERY PLAN',
    kind: 'other',
    estimatedRows: null,
    actualRows: null,
    costPct: null,
    timeMs: null,
    warnings: [],
    children,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
