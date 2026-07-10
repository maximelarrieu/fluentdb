import type { PlanNode, PlanNodeKind } from '@fluentdb/shared';

interface PgPlan {
  'Node Type'?: string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Plan Rows'?: number;
  'Actual Rows'?: number;
  'Total Cost'?: number;
  'Actual Total Time'?: number;
  Filter?: string;
  'Index Cond'?: string;
  'Hash Cond'?: string;
  'Join Filter'?: string;
  'Recheck Cond'?: string;
  Plans?: PgPlan[];
}

const SEQ_SCAN_ROW_WARN = 1000;

function kindOf(nodeType: string): PlanNodeKind {
  const t = nodeType.toLowerCase();
  if (t === 'seq scan') return 'scan_seq';
  if (t.includes('index') || t.includes('bitmap')) return 'scan_index';
  if (t.includes('join') || t.includes('nested loop')) return 'join';
  if (t.includes('sort')) return 'sort';
  if (t.includes('aggregate') || t === 'group') return 'aggregate';
  return 'other';
}

function detailOf(p: PgPlan): string | undefined {
  return (
    p.Filter ??
    p['Index Cond'] ??
    p['Hash Cond'] ??
    p['Join Filter'] ??
    p['Recheck Cond']
  );
}

function build(p: PgPlan, rootCost: number, analyzed: boolean, path: string): PlanNode {
  const nodeType = p['Node Type'] ?? 'Node';
  const kind = kindOf(nodeType);
  const relation = p['Relation Name'];
  let label = nodeType;
  if (relation) label += ` on ${relation}`;
  if (p['Index Name']) label += ` (${p['Index Name']})`;

  const estimatedRows = typeof p['Plan Rows'] === 'number' ? p['Plan Rows'] : null;
  const actualRows =
    analyzed && typeof p['Actual Rows'] === 'number' ? p['Actual Rows'] : null;
  const cost = p['Total Cost'];
  const costPct =
    typeof cost === 'number' && rootCost > 0 ? cost / rootCost : null;

  const warnings: string[] = [];
  if (
    kind === 'scan_seq' &&
    p.Filter &&
    (estimatedRows ?? 0) > SEQ_SCAN_ROW_WARN
  ) {
    warnings.push(
      'Parcours séquentiel filtré sur une table volumineuse — un index sur les colonnes du filtre pourrait accélérer la requête',
    );
  }

  return {
    id: path,
    label,
    detail: detailOf(p),
    relation,
    kind,
    estimatedRows,
    actualRows,
    costPct,
    timeMs:
      analyzed && typeof p['Actual Total Time'] === 'number'
        ? p['Actual Total Time']
        : null,
    warnings,
    children: (p.Plans ?? []).map((child, i) =>
      build(child, rootCost, analyzed, `${path}.${i}`),
    ),
  };
}

/** Normalize the object PostgreSQL returns under `QUERY PLAN` (arr[0]). */
export function normalizePgPlan(explain: unknown, analyzed: boolean): PlanNode {
  const entry = explain as { Plan?: PgPlan };
  const root = entry?.Plan ?? (explain as PgPlan);
  const rootCost = typeof root['Total Cost'] === 'number' ? root['Total Cost'] : 0;
  return build(root, rootCost, analyzed, '0');
}
