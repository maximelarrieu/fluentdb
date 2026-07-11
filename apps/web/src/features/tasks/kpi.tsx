import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { api } from '../../api/client.js';
import { TASKS_POLL_MS } from './notifications.js';
import { taskMetric, taskDelta, type TaskMetric, type TaskDelta } from './dashboard.js';

/** Live metric (value + delta) for a task, from its polled snapshot history. */
export function useTaskMetric(taskId: string): {
  metric: TaskMetric;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: ['task-snapshots', taskId],
    queryFn: () => api.taskSnapshots(taskId),
    refetchInterval: TASKS_POLL_MS,
  });
  return { metric: taskMetric(q.data ?? []), isLoading: q.isLoading };
}

function deltaText(d: TaskDelta): string {
  if (d.dir === 'flat') return 'stable';
  if (d.pct == null) {
    return `${Math.abs(d.diff) >= 1000 ? Math.round(Math.abs(d.diff)) : Math.abs(d.diff)}`;
  }
  const abs = Math.abs(d.pct);
  return `${abs < 10 ? abs.toFixed(1) : Math.round(abs)} %`;
}

/**
 * Compact change indicator vs the previous run. Neutral by design — an arrow
 * shows direction without implying good/bad (growth can be either).
 */
export function DeltaChip({
  delta,
  className = '',
}: {
  delta: TaskDelta | null;
  className?: string;
}) {
  if (!delta) return null;
  const Icon =
    delta.dir === 'up' ? ArrowUpRight : delta.dir === 'down' ? ArrowDownRight : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-muted tabular-nums ${className}`}
      title="Variation depuis l'exécution précédente"
    >
      <Icon size={12} className="shrink-0" />
      {deltaText(delta)}
    </span>
  );
}

export { taskDelta };
