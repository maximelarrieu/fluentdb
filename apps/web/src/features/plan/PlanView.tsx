import { useMemo, useState } from 'react';
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import { AlertTriangle, Code2, Gauge, Sparkles } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { QueryPlan } from '@fluentdb/shared';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/misc.js';
import { cn } from '../../lib/cn.js';
import { useTheme } from '../../stores/theme.js';
import { PlanNodeCard } from './PlanNodeCard.js';
import { collectWarnings, costliestNode, layoutPlan } from './layout.js';

const nodeTypes = { plan: PlanNodeCard };

export function PlanView({
  plan,
  onSuggestIndex,
}: {
  plan: QueryPlan;
  onSuggestIndex?: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const { theme } = useTheme();
  const palette = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string, fb: string) =>
      cs.getPropertyValue(name).trim() || fb;
    return {
      border: read('--color-border', '#2b3038'),
      panel2: read('--color-panel-2', '#1f232a'),
      bg: read('--color-bg', '#101215'),
    };
  }, [theme]);
  const { nodes, edges } = useMemo(() => layoutPlan(plan.root), [plan.root]);
  const warnings = useMemo(
    () => [...new Set(collectWarnings(plan.root))],
    [plan.root],
  );
  const costliest = useMemo(() => costliestNode(plan.root), [plan.root]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2.5 h-8 border-b border-border-soft bg-panel text-xs">
        <Gauge size={13} className="text-accent" />
        <span className="text-muted">
          {plan.analyzed ? 'Plan mesuré (ANALYZE)' : 'Plan estimé (EXPLAIN)'}
        </span>
        {costliest.costPct != null && (
          <Badge tone="default">
            étape la plus coûteuse : {costliest.label} ({Math.round(costliest.costPct * 100)}%)
          </Badge>
        )}
        {warnings.length > 0 && (
          <span className="flex items-center gap-1 text-amber">
            <AlertTriangle size={12} /> {warnings.length} alerte(s)
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {onSuggestIndex && warnings.length > 0 && (
            <Button size="sm" variant="primary" onClick={onSuggestIndex}>
              <Sparkles size={13} /> Suggérer un index
            </Button>
          )}
          <Button
            size="sm"
            variant={showRaw ? 'default' : 'ghost'}
            onClick={() => setShowRaw((v) => !v)}
          >
            <Code2 size={13} /> Brut
          </Button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="px-3 py-1.5 border-b border-amber/20 bg-amber/5 flex flex-col gap-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px] text-amber">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {w}
            </div>
          ))}
        </div>
      )}

      <div className={cn('flex-1 min-h-0', showRaw && 'hidden')}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={palette.border} gap={20} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={palette.panel2}
            maskColor={`${palette.bg}66`}
            className="!bg-panel !border !border-border"
          />
        </ReactFlow>
      </div>

      {showRaw && (
        <pre className="flex-1 min-h-0 overflow-auto p-3 text-[12px] mono text-muted whitespace-pre-wrap">
          {plan.rawText ?? 'Aucune sortie brute'}
        </pre>
      )}
    </div>
  );
}
