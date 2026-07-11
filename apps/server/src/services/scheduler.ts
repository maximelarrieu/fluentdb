import {
  alertOpSymbol,
  type AlertOp,
  type CellValue,
  type QueryColumn,
  type ScheduledTask,
  type TaskSchedule,
  type TaskSnapshot,
} from '@fluentdb/shared';
import type { TasksStore } from '../store/tasksStore.js';
import type { ConnectionManager } from './connectionManager.js';
import { analyzeScript } from '../sql/analyze.js';

const TICK_MS = 30_000;
const MAX_ROWS = 1000;

function breaches(value: number, op: AlertOp, threshold: number): boolean {
  switch (op) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
  }
}

/**
 * Evaluate a task's threshold against a run's rows. Returns a short breach
 * summary (e.g. "3 ligne(s) > 1000 sur « size »") or null when nothing breaches.
 */
function evaluateAlert(
  task: ScheduledTask,
  columns: QueryColumn[],
  rows: CellValue[][],
): string | null {
  const rule = task.alert;
  if (!rule) return null;
  const idx = columns.findIndex((c) => c.name === rule.column);
  if (idx < 0) return null;
  let count = 0;
  for (const row of rows) {
    const raw = row[idx];
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n) && breaches(n, rule.op, rule.threshold)) count++;
  }
  if (count === 0) return null;
  return `${count} ligne(s) ${alertOpSymbol[rule.op]} ${rule.threshold} sur « ${rule.column} »`;
}

/**
 * Fires scheduled tasks while the server is running. A single ticker checks
 * every task's `nextRunAt`; anything due (including runs missed while the app
 * was closed — their nextRunAt is in the past) fires once, then reschedules
 * forward. Only read statements are allowed.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly runningIds = new Set<string>();

  constructor(
    private readonly store: TasksStore,
    private readonly manager: ConnectionManager,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  /** Next fire time after `from` for a schedule, as an ISO string. */
  computeNextRun(schedule: TaskSchedule, from: Date): string {
    if (schedule.kind === 'interval') {
      return new Date(from.getTime() + schedule.everyMinutes * 60_000).toISOString();
    }
    const next = new Date(from);
    next.setHours(schedule.hour, schedule.minute, 0, 0);
    if (next.getTime() <= from.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  start(): void {
    if (this.timer) return;
    // Backfill any task missing a nextRunAt, then tick immediately (catch-up).
    const now = new Date();
    for (const t of this.store.list()) {
      if (t.enabled && !t.nextRunAt) {
        this.store.setNextRun(t.id, this.computeNextRun(t.schedule, now));
      }
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const now = new Date();
    for (const task of this.store.list()) {
      if (!task.enabled || this.runningIds.has(task.id)) continue;
      const due = task.nextRunAt == null || new Date(task.nextRunAt) <= now;
      if (!due) continue;
      // Reschedule forward first so a slow/erroring run can't fire in a loop.
      this.store.setNextRun(task.id, this.computeNextRun(task.schedule, now));
      await this.runTask(task).catch((err) =>
        this.log(`task ${task.id} failed: ${(err as Error).message}`),
      );
    }
  }

  /** Execute a task now and store a snapshot. Returns it (or the error one). */
  async runTask(task: ScheduledTask): Promise<TaskSnapshot> {
    if (this.runningIds.has(task.id)) {
      throw new Error('Task already running');
    }
    this.runningIds.add(task.id);
    const started = Date.now();
    try {
      // Scheduled tasks are read-only by design — never mutate on a timer.
      const analyzed = analyzeScript(task.sql);
      const offending = analyzed.find((s) => s.kind !== 'read');
      if (offending) {
        return this.store.recordSnapshot(task.id, {
          status: 'error',
          durationMs: Date.now() - started,
          rowCount: 0,
          columns: [],
          rows: [],
          truncated: false,
          error: `Seules les requêtes de lecture sont planifiables (${offending.operation} refusé).`,
          alert: null,
        });
      }

      if (!this.manager.isConnected(task.connectionId)) {
        await this.manager.connect(task.connectionId);
      }
      const driver = await this.manager.getDriver(
        task.connectionId,
        task.database ?? undefined,
      );
      const sets = await driver.runQuery(task.sql, {
        queryId: `task-${task.id}-${started}`,
        maxRows: MAX_ROWS,
      });
      // The meaningful output is the last statement that returns columns.
      const result =
        [...sets].reverse().find((s) => s.columns.length > 0) ?? sets.at(-1);

      return this.store.recordSnapshot(task.id, {
        status: 'ok',
        durationMs: Date.now() - started,
        rowCount: result?.rowCount ?? 0,
        columns: result?.columns ?? [],
        rows: result?.rows ?? [],
        truncated: result?.truncated ?? false,
        error: null,
        alert: evaluateAlert(task, result?.columns ?? [], result?.rows ?? []),
      });
    } catch (err) {
      return this.store.recordSnapshot(task.id, {
        status: 'error',
        durationMs: Date.now() - started,
        rowCount: 0,
        columns: [],
        rows: [],
        truncated: false,
        error: (err as Error).message,
        alert: null,
      });
    } finally {
      this.runningIds.delete(task.id);
    }
  }
}
