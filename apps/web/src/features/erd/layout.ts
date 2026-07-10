import dagre from 'dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { ErdSchema, ErdTable } from '@fluentdb/shared';

export type TableNodeData = {
  table: ErdTable;
  /** focus mode: fade tables unrelated to the selected one */
  dimmed?: boolean;
  /** the table is the current focus / search match */
  highlighted?: boolean;
};
export type TableNode = Node<TableNodeData, 'table'>;

const NODE_WIDTH = 240;
const HEADER_H = 34;
const ROW_H = 22;
const PADDING = 8;

const tableKey = (schema: string | undefined, name: string) =>
  schema ? `${schema}.${name}` : name;

function nodeHeight(t: ErdTable): number {
  return HEADER_H + t.columns.length * ROW_H + PADDING;
}

/**
 * Compute React Flow nodes + edges with a left→right dagre layout. Edges go
 * from the table carrying the FK to the referenced table, one per relation.
 */
export function layoutErd(schema: ErdSchema): {
  nodes: TableNode[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 90, marginx: 30, marginy: 30 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const t of schema.tables) {
    g.setNode(tableKey(t.schema, t.name), {
      width: NODE_WIDTH,
      height: nodeHeight(t),
    });
  }
  for (const rel of schema.relations) {
    const from = tableKey(rel.from.schema, rel.from.table);
    const to = tableKey(rel.to.schema, rel.to.table);
    if (g.hasNode(from) && g.hasNode(to)) g.setEdge(from, to);
  }

  dagre.layout(g);

  const nodes: TableNode[] = schema.tables.map((t) => {
    const key = tableKey(t.schema, t.name);
    const pos = g.node(key);
    return {
      id: key,
      type: 'table',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - nodeHeight(t) / 2,
      },
      data: { table: t },
    };
  });

  const edges: Edge[] = schema.relations.map((rel, i) => {
    const source = tableKey(rel.from.schema, rel.from.table);
    const target = tableKey(rel.to.schema, rel.to.table);
    return {
      id: `e${i}-${rel.name}`,
      source,
      target,
      // handles per column so the edge attaches at the FK column row
      sourceHandle: `${source}::${rel.from.columns[0]}::source`,
      targetHandle: `${target}::${rel.to.columns[0]}::target`,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6d8bff' },
      style: { stroke: '#6d8bff', strokeWidth: 1.5 },
      data: { source, target },
    };
  });

  return { nodes, edges };
}

export { tableKey };
