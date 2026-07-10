import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={cn('animate-spin text-muted', className)} />;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
      {icon && <div className="text-muted/50">{icon}</div>}
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted mt-1 max-w-xs">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'accent' | 'green' | 'amber' | 'red';
}) {
  const tones = {
    default: 'bg-panel-2 text-muted border-border',
    accent: 'bg-accent/15 text-accent border-accent/30',
    green: 'bg-green/15 text-green border-green/30',
    amber: 'bg-amber/15 text-amber border-amber/30',
    red: 'bg-red/15 text-red border-red/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border uppercase tracking-wide',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
