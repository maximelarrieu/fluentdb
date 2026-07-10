import dagre from 'dagre';
import type { Edge, Node } from '@xyflow/react';
import type { PlanNode } from '@fluentdb/shared';

export type PlanNodeData = { node: PlanNode; maxRows: number };
export type PlanFlowNode = Node<PlanNodeData, 'plan'>;

const NODE_WIDTH = 230;
const NODE_HEIGHT = 76;

/** Flatten the plan tree into React Flow nodes + edges with a top-down layout. */
export function layoutPlan(root: PlanNode): {
  nodes: PlanFlowNode[];
  edges: Edge[];
} {
  const flat: PlanNode[] = [];
  const walk = (n: PlanNode) => {
    flat.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  const maxRows = flat.reduce(
    (m, n) => Math.max(m, n.actualRows ?? n.estimatedRows ?? 0),
    0,
  );

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 55, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of flat) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  const edges: Edge[] = [];
  const link = (n: PlanNode) => {
    for (const c of n.children) {
      g.setEdge(n.id, c.id);
      edges.push({
        id: `${n.id}->${c.id}`,
        source: n.id,
        target: c.id,
        style: { stroke: '#3a4152', strokeWidth: 1.5 },
      });
      link(c);
    }
  };
  link(root);

  dagre.layout(g);

  const nodes: PlanFlowNode[] = flat.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: 'plan',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { node: n, maxRows },
    };
  });

  return { nodes, edges };
}

/** Deepest/most expensive node, for the summary banner. */
export function costliestNode(root: PlanNode): PlanNode {
  let worst = root;
  const walk = (n: PlanNode) => {
    if ((n.costPct ?? 0) > (worst.costPct ?? 0)) worst = n;
    n.children.forEach(walk);
  };
  walk(root);
  return worst;
}

export function collectWarnings(root: PlanNode): string[] {
  const out: string[] = [];
  const walk = (n: PlanNode) => {
    out.push(...n.warnings);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}
