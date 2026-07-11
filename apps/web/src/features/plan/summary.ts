import type { PlanNode, QueryPlan } from '@fluentdb/shared';

function flatten(root: PlanNode): PlanNode[] {
  const out: PlanNode[] = [];
  const walk = (n: PlanNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

/**
 * Compact, model-friendly digest of an execution plan for index advice.
 * Highlights sequential scans and the costliest steps with their table,
 * filter and estimated rows — the inputs an index recommendation needs.
 */
export function summarizePlan(plan: QueryPlan): string {
  const nodes = flatten(plan.root);
  const lines: string[] = [
    `Engine: ${plan.engine}${plan.analyzed ? ' (analyzed)' : ''}`,
  ];

  const seqScans = nodes.filter((n) => n.kind === 'scan_seq');
  if (seqScans.length > 0) {
    lines.push('Sequential scans (candidates for an index):');
    for (const n of seqScans) {
      const bits = [n.relation ? `table ${n.relation}` : n.label];
      if (n.detail) bits.push(`filter ${n.detail}`);
      const rows = n.actualRows ?? n.estimatedRows;
      if (rows != null) bits.push(`~${rows} rows`);
      lines.push(`- ${bits.join(', ')}`);
    }
  }

  const costly = nodes
    .filter((n) => n.costPct != null && n.costPct >= 0.33)
    .sort((a, b) => (b.costPct ?? 0) - (a.costPct ?? 0))
    .slice(0, 5);
  if (costly.length > 0) {
    lines.push('Most expensive steps:');
    for (const n of costly) {
      lines.push(
        `- ${n.label}${n.detail ? ` (${n.detail})` : ''} — ${Math.round(
          (n.costPct ?? 0) * 100,
        )}% of cost`,
      );
    }
  }

  if (seqScans.length === 0 && costly.length === 0) {
    lines.push('No obvious sequential scan or dominant cost step.');
  }
  return lines.join('\n');
}
