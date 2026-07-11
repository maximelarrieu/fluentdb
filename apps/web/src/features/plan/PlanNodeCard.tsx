import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  ScanLine,
  KeyRound,
  GitMerge,
  ArrowDownWideNarrow,
  Sigma,
  Box,
  AlertTriangle,
} from 'lucide-react';
import type { PlanNodeKind } from '@fluentdb/shared';
import type { PlanFlowNode } from './layout.js';
import { cn } from '../../lib/cn.js';
import { formatNumber } from '../../lib/format.js';

const KIND_ICON: Record<PlanNodeKind, React.ReactNode> = {
  scan_seq: <ScanLine size={13} />,
  scan_index: <KeyRound size={13} />,
  join: <GitMerge size={13} />,
  sort: <ArrowDownWideNarrow size={13} />,
  aggregate: <Sigma size={13} />,
  other: <Box size={13} />,
};

// Cost heat: green (cheap) → amber → red (expensive).
function heat(costPct: number | null, hasWarning: boolean): string {
  if (hasWarning) return 'border-red/60 bg-red/10';
  if (costPct == null) return 'border-border bg-panel';
  if (costPct >= 0.66) return 'border-red/60 bg-red/10';
  if (costPct >= 0.33) return 'border-amber/50 bg-amber/10';
  return 'border-green/40 bg-green/5';
}

function PlanNodeCardImpl({ data }: NodeProps<PlanFlowNode>) {
  const { node } = data;
  const rows = node.actualRows ?? node.estimatedRows;
  const hasWarning = node.warnings.length > 0;

  return (
    <div className={cn('rounded-lg border w-[230px] shadow-md', heat(node.costPct, hasWarning))}>
      <Handle type="target" position={Position.Top} className="!bg-border !w-1.5 !h-1.5" />
      <div className="px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-muted shrink-0">{KIND_ICON[node.kind]}</span>
          <span className="text-[12px] font-medium truncate" title={node.label}>
            {node.label}
          </span>
          {hasWarning && <AlertTriangle size={12} className="text-red ml-auto shrink-0" />}
        </div>
        {node.detail && (
          <div className="text-[10px] text-muted/80 mono truncate mt-0.5" title={node.detail}>
            {node.detail}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted">
          {rows != null && (
            <span>
              {node.actualRows != null ? '' : '≈ '}
              {formatNumber(rows)} lignes
            </span>
          )}
          {node.costPct != null && (
            <span className="ml-auto">{Math.round(node.costPct * 100)}% coût</span>
          )}
          {node.timeMs != null && <span>{node.timeMs.toFixed(1)} ms</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border !w-1.5 !h-1.5" />
    </div>
  );
}

export const PlanNodeCard = memo(PlanNodeCardImpl);
