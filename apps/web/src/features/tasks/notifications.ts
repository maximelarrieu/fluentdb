import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import type { ScheduledTask } from '@fluentdb/shared';
import { api } from '../../api/client.js';

const KEY = 'fluentdb.tasks.seen';

/** How often the task list is polled while the app is open. */
export const TASKS_POLL_MS = 10_000;

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

interface SeenState {
  seen: Record<string, number>;
  /** Mark a task's latest snapshot as seen (clears its "new" badge). */
  markSeen: (taskId: string, snapshotId: number | null) => void;
}

/** Per-task last-seen snapshot id, persisted so badges survive reloads. */
export const useTaskSeen = create<SeenState>((set, get) => ({
  seen: load(),
  markSeen: (taskId, snapshotId) => {
    if (snapshotId == null) return;
    const seen = { ...get().seen, [taskId]: snapshotId };
    localStorage.setItem(KEY, JSON.stringify(seen));
    set({ seen });
  },
}));

/** Tasks whose latest snapshot is newer than what the user has seen. */
export function unseenTasks(
  tasks: ScheduledTask[],
  seen: Record<string, number>,
): ScheduledTask[] {
  return tasks.filter(
    (t) => t.lastSnapshotId != null && t.lastSnapshotId > (seen[t.id] ?? 0),
  );
}

/**
 * Live count of executed-but-unconsulted tasks. Reads the shared (polled)
 * task-list cache and the seen store, so every badge using it updates both as
 * runs land and as results are consulted.
 */
export function useUnseenTaskCount(): number {
  const seen = useTaskSeen((s) => s.seen);
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: api.tasks,
    refetchInterval: TASKS_POLL_MS,
  });
  return unseenTasks(tasks.data ?? [], seen).length;
}
