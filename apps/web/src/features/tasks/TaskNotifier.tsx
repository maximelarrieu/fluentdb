import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.js';
import { TASKS_POLL_MS } from './notifications.js';

/**
 * Polls scheduled tasks and shows an in-app toast when a task produces a new
 * result. Mounted once, app-wide. Baselines on first load so existing results
 * don't toast on startup — only genuinely new snapshots do.
 */
export function TaskNotifier() {
  const toast = useToast();
  const lastSeen = useRef<Record<string, number> | null>(null);

  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: api.tasks,
    refetchInterval: TASKS_POLL_MS,
  });

  useEffect(() => {
    if (!tasks.data) return;
    const current: Record<string, number> = {};
    for (const t of tasks.data) {
      if (t.lastSnapshotId != null) current[t.id] = t.lastSnapshotId;
    }
    // First fetch: baseline silently.
    if (lastSeen.current === null) {
      lastSeen.current = current;
      return;
    }
    for (const t of tasks.data) {
      const prev = lastSeen.current[t.id] ?? 0;
      if (t.lastSnapshotId != null && t.lastSnapshotId > prev) {
        if (t.lastStatus === 'error') {
          toast.push('error', `Tâche « ${t.name} » : échec`);
        } else if (t.lastAlert) {
          toast.push('error', `⚠️ Alerte « ${t.name} » : ${t.lastAlert}`);
        } else {
          toast.push(
            'success',
            `Nouveau résultat : « ${t.name} » (${t.lastRowCount ?? 0} ligne(s))`,
          );
        }
      }
    }
    lastSeen.current = current;
  }, [tasks.data, toast]);

  return null;
}
