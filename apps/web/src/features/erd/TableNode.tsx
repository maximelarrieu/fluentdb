import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { KeyRound, Link2 } from 'lucide-react';
import type { TableNode as TableNodeType } from './layout.js';
import { cn } from '../../lib/cn.js';

function TableNodeImpl({ id, data, selected }: NodeProps<TableNodeType>) {
  const { table, dimmed, highlighted } = data;
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
        <span className="text-[13px] font-semibold truncate">{table.name}</span>
        {table.schema && table.schema !== 'public' && (
          <span className="text-[10px] text-muted truncate">{table.schema}</span>
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
