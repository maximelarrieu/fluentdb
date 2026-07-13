import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Download, LayoutGrid, Search, Share2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { ErdSchema } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Spinner, EmptyState, Badge } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { useTheme } from '../../stores/theme.js';
import { TableNode } from './TableNode.js';
import { layoutErd, tableKey, type TableNodeData } from './layout.js';
import { exportDbml, exportPng, exportSvg } from './export.js';

const nodeTypes = { table: TableNode };

export function ErdView() {
  return (
    <ReactFlowProvider>
      <ErdInner />
    </ReactFlowProvider>
  );
}

function ErdInner() {
  const { active, database, schema, schemaVersion } = useWorkspace();
  const { theme } = useTheme();
  const toast = useToast();
  const connId = active!.id;
  const flowRef = useRef<HTMLDivElement>(null);
  const { fitView, setCenter } = useReactFlow();

  // Resolve the theme's actual colors (the ReactFlow canvas/minimap need real
  // color strings, not CSS vars). Recomputed when the theme toggles.
  const palette = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;
    return {
      accent: read('--color-accent', '#3fa89b'),
      green: read('--color-green', '#4bbe88'),
      amber: read('--color-amber', '#e0a63a'),
      border: read('--color-border', '#2b3038'),
      bg: read('--color-bg', '#101215'),
    };
  }, [theme]);

  const erd = useQuery({
    queryKey: ['erd', connId, database, schema, schemaVersion],
    queryFn: () => api.erd(connId, database, schema),
  });

  const layout = useMemo(
    () =>
      erd.data
        ? layoutErd(erd.data, {
            fkColor: palette.accent,
            lineageColor: palette.green,
          })
        : { nodes: [], edges: [] },
    [erd.data, palette],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // adjacency: node id -> set of directly-related node ids
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of layout.edges) {
      (map.get(e.source) ?? map.set(e.source, new Set()).get(e.source)!).add(
        e.target,
      );
      (map.get(e.target) ?? map.set(e.target, new Set()).get(e.target)!).add(
        e.source,
      );
    }
    return map;
  }, [layout.edges]);

  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
    setFocus(null);
  }, [layout, setNodes, setEdges]);

  // apply focus dimming/highlighting
  useEffect(() => {
    setNodes((cur) =>
      cur.map((n) => {
        if (!focus) return { ...n, data: { ...n.data, dimmed: false, highlighted: false } };
        const related = focus === n.id || adjacency.get(focus)?.has(n.id);
        return {
          ...n,
          data: { ...n.data, dimmed: !related, highlighted: n.id === focus },
        };
      }),
    );
    setEdges((cur) =>
      cur.map((e) => ({
        ...e,
        style: {
          ...e.style,
          opacity: !focus || e.source === focus || e.target === focus ? 1 : 0.15,
        },
      })),
    );
  }, [focus, adjacency, setNodes, setEdges]);

  const relayout = useCallback(() => {
    if (!erd.data) return;
    const next = layoutErd(erd.data, {
      fkColor: palette.accent,
      lineageColor: palette.green,
    });
    setNodes(next.nodes);
    setEdges(next.edges);
    setTimeout(() => fitView({ duration: 300, padding: 0.15 }), 50);
  }, [erd.data, palette, setNodes, setEdges, fitView]);

  const runSearch = (q: string) => {
    setSearch(q);
    const term = q.trim().toLowerCase();
    if (!term || !erd.data) return;
    const table = erd.data.tables.find((t) =>
      t.name.toLowerCase().includes(term),
    );
    if (!table) return;
    const id = tableKey(table.schema, table.name);
    const node = nodes.find((n) => n.id === id);
    if (node) {
      setFocus(id);
      setCenter(node.position.x + 120, node.position.y + 60, {
        zoom: 1.1,
        duration: 400,
      });
    }
  };

  const doExport = async (fmt: 'png' | 'svg' | 'dbml') => {
    try {
      if (fmt === 'dbml') {
        exportDbml(erd.data!, 'schema');
      } else {
        await fitView({ padding: 0.1 });
        await new Promise((r) => setTimeout(r, 250));
        const el = flowRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
        if (!el) return;
        if (fmt === 'png') await exportPng(el, 'erd');
        else await exportSvg(el, 'erd');
      }
      toast.push('success', `Diagramme exporté (${fmt.toUpperCase()})`);
    } catch (e) {
      toast.push('error', `Échec de l'export : ${(e as Error).message}`);
    }
  };

  if (erd.isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (erd.isError) {
    return <div className="p-4 text-red text-sm">{(erd.error as Error).message}</div>;
  }
  if ((erd.data?.tables.length ?? 0) === 0) {
    return (
      <EmptyState
        title="Aucune table à diagrammer"
        hint="Cette base ne contient pas encore de table."
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2 h-9 border-b border-border-soft bg-panel">
        <div className="relative w-56">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Chercher une table…"
            className="pl-7 h-7"
          />
        </div>
        <Button size="sm" variant="subtle" onClick={relayout}>
          <LayoutGrid size={13} /> Ré-agencer
        </Button>
        {focus && (
          <Button size="sm" variant="ghost" onClick={() => setFocus(null)}>
            Quitter le focus
          </Button>
        )}
        <span className="text-[11px] text-muted ml-1">
          Clic sur une table = focus sur ses relations
        </span>

        <div className="ml-auto flex items-center gap-2">
          {(erd.data?.truncated ?? 0) > 0 && (
            <Badge tone="amber">{erd.data!.truncated} tables masquées</Badge>
          )}
          <Dropdown.Root>
            <Dropdown.Trigger asChild>
              <Button size="sm" variant="default">
                <Download size={13} /> Exporter
              </Button>
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-[160px] rounded-lg border border-border bg-panel-2 p-1 shadow-xl"
              >
                {(['png', 'svg', 'dbml'] as const).map((fmt) => (
                  <Dropdown.Item
                    key={fmt}
                    onSelect={() => doExport(fmt)}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[highlighted]:bg-panel"
                  >
                    {fmt === 'dbml' ? <Share2 size={13} /> : <Download size={13} />}
                    {fmt === 'png' && 'Image PNG'}
                    {fmt === 'svg' && 'Image SVG'}
                    {fmt === 'dbml' && 'DBML (dbdiagram.io)'}
                  </Dropdown.Item>
                ))}
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
        </div>
      </div>

      <div ref={flowRef} className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_e, node) => setFocus(node.id)}
          onPaneClick={() => setFocus(null)}
          fitView
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={palette.border} gap={20} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              const kind = (n.data as TableNodeData)?.table?.kind ?? 'table';
              return kind === 'view'
                ? palette.amber
                : kind === 'matview'
                  ? palette.green
                  : palette.accent;
            }}
            nodeStrokeColor={palette.bg}
            maskColor={`${palette.bg}cc`}
            className="!bg-panel !border !border-border"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
