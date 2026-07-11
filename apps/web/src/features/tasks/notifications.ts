import { create } from 'zustand';
import type { ScheduledTask } from '@fluentdb/shared';

const KEY = 'fluentdb.tasks.seen';

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
