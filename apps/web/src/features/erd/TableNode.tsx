import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { KeyRound, Link2, Table2, Eye, Layers } from 'lucide-react';
import type { TableNode as TableNodeType } from './layout.js';
import { cn } from '../../lib/cn.js';

const KIND_ICON = { table: Table2, view: Eye, matview: Layers };
const KIND_COLOR = {
  table: 'text-accent',
  view: 'text-amber',
  matview: 'text-green',
};

function TableNodeImpl({ id, data, selected }: NodeProps<TableNodeType>) {
  const { table, dimmed, highlighted } = data;
  const kind = table.kind ?? 'table';
  const KindIcon = KIND_ICON[kind];
  return (
    <div
      className={cn(
        'rounded-lg border bg-panel shadow-lg overflow-hidden w-[240px] transition-opacity',
        selected || highlighted
          ? 'border-accent ring-1 ring-accent/50'
          : 'border-border',
        dimmed && 'opacity-25',
      )}
    >
      <div className="px-2.5 h-[34px] flex items-center gap-1.5 bg-panel-2 border-b border-border-soft">
        <KindIcon size={12} className={cn(KIND_COLOR[kind], 'shrink-0')} />
        <span className="text-[13px] font-semibold truncate">{table.name}</span>
        {kind !== 'table' && (
          <span className="text-[9px] uppercase tracking-wide text-muted shrink-0">
            {kind === 'matview' ? 'mat' : 'vue'}
          </span>
        )}
        {table.schema && table.schema !== 'public' && (
          <span className="text-[10px] text-muted truncate ml-auto">
            {table.schema}
          </span>
        )}
      </div>
      <div>
        {table.columns.map((c) => (
          <div
            key={c.name}
            className="relative flex items-center gap-1.5 px-2.5 h-[22px] text-[11px] border-b border-border-soft/40 last:border-0"
          >
            <Handle
              type="target"
              position={Position.Left}
              id={`${id}::${c.name}::target`}
              className="!w-1.5 !h-1.5 !bg-transparent !border-0"
            />
            {c.isPrimaryKey ? (
              <KeyRound size={11} className="text-amber shrink-0" />
            ) : c.isForeignKey ? (
              <Link2 size={11} className="text-accent shrink-0" />
            ) : (
              <span className="w-[11px] shrink-0" />
            )}
            <span className={cn('truncate mono', c.isPrimaryKey && 'font-semibold')}>
              {c.name}
            </span>
            <span className="ml-auto text-muted/70 mono truncate max-w-[90px]">
              {c.dataType}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`${id}::${c.name}::source`}
              className="!w-1.5 !h-1.5 !bg-transparent !border-0"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeImpl);
