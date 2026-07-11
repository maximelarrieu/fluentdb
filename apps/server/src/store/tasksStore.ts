import Database from 'better-sqlite3';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type {
  ScheduledTask,
  ScheduledTaskInput,
  TaskSchedule,
  TaskSnapshot,
} from '@fluentdb/shared';

/** Keep each task's snapshot history bounded. */
const MAX_SNAPSHOTS_PER_TASK = 200;

interface SnapshotInput {
  status: 'ok' | 'error';
  durationMs: number;
  rowCount: number;
  columns: TaskSnapshot['columns'];
  rows: TaskSnapshot['rows'];
  truncated: boolean;
  error: string | null;
}

/**
 * Persists scheduled tasks and their result snapshots in a local SQLite file.
 * Snapshots keep the history so the UI can show results over time.
 */
export class TasksStore {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    this.db = new Database(path.join(dataDir, 'scheduler.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        database TEXT,
        sql TEXT NOT NULL,
        schedule_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_run_at TEXT,
        next_run_at TEXT,
        last_status TEXT,
        last_row_count INTEGER,
        last_error TEXT,
        last_snapshot_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS task_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        ran_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        row_count INTEGER NOT NULL,
        columns_json TEXT NOT NULL,
        rows_json TEXT NOT NULL,
        truncated INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_task ON task_snapshots(task_id, id DESC);
    `);
  }

  private rowToTask(r: Record<string, unknown>): ScheduledTask {
    return {
      id: String(r.id),
      name: String(r.name),
      connectionId: String(r.connection_id),
      connectionName: String(r.connection_name),
      database: r.database == null ? null : String(r.database),
      sql: String(r.sql),
      schedule: JSON.parse(String(r.schedule_json)) as TaskSchedule,
      enabled: Number(r.enabled) === 1,
      createdAt: String(r.created_at),
      lastRunAt: r.last_run_at == null ? null : String(r.last_run_at),
      nextRunAt: r.next_run_at == null ? null : String(r.next_run_at),
      lastStatus:
        r.last_status == null
          ? null
          : (String(r.last_status) as ScheduledTask['lastStatus']),
      lastRowCount: r.last_row_count == null ? null : Number(r.last_row_count),
      lastError: r.last_error == null ? null : String(r.last_error),
      lastSnapshotId:
        r.last_snapshot_id == null ? null : Number(r.last_snapshot_id),
    };
  }

  create(
    input: ScheduledTaskInput,
    connectionName: string,
    nextRunAt: string | null,
  ): ScheduledTask {
    const id = nanoid();
    this.db
      .prepare(
        `INSERT INTO scheduled_tasks
         (id, name, connection_id, connection_name, database, sql, schedule_json, enabled, next_run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.connectionId,
        connectionName,
        input.database ?? null,
        input.sql,
        JSON.stringify(input.schedule),
        input.enabled ? 1 : 0,
        nextRunAt,
      );
    return this.get(id)!;
  }

  update(
    id: string,
    patch: Partial<ScheduledTaskInput>,
    nextRunAt?: string | null,
  ): ScheduledTask | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    this.db
      .prepare(
        `UPDATE scheduled_tasks
         SET name = ?, database = ?, sql = ?, schedule_json = ?, enabled = ?, next_run_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.name ?? cur.name,
        patch.database === undefined ? cur.database : (patch.database ?? null),
        patch.sql ?? cur.sql,
        JSON.stringify(patch.schedule ?? cur.schedule),
        (patch.enabled ?? cur.enabled) ? 1 : 0,
        nextRunAt === undefined ? cur.nextRunAt : nextRunAt,
        id,
      );
    return this.get(id);
  }

  get(id: string): ScheduledTask | undefined {
    const r = this.db
      .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return r ? this.rowToTask(r) : undefined;
  }

  list(): ScheduledTask[] {
    const rows = this.db
      .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToTask(r));
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM task_snapshots WHERE task_id = ?').run(id);
  }

  setNextRun(id: string, nextRunAt: string | null): void {
    this.db
      .prepare('UPDATE scheduled_tasks SET next_run_at = ? WHERE id = ?')
      .run(nextRunAt, id);
  }

  /** Store a run result and update the task's last-run summary. */
  recordSnapshot(taskId: string, snap: SnapshotInput): TaskSnapshot {
    const info = this.db
      .prepare(
        `INSERT INTO task_snapshots
         (task_id, status, duration_ms, row_count, columns_json, rows_json, truncated, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        taskId,
        snap.status,
        snap.durationMs,
        snap.rowCount,
        JSON.stringify(snap.columns),
        JSON.stringify(snap.rows),
        snap.truncated ? 1 : 0,
        snap.error,
      );
    const snapshotId = Number(info.lastInsertRowid);
    this.db
      .prepare(
        `UPDATE scheduled_tasks
         SET last_run_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             last_status = ?, last_row_count = ?, last_error = ?, last_snapshot_id = ?
         WHERE id = ?`,
      )
      .run(snap.status, snap.rowCount, snap.error, snapshotId, taskId);
    // Trim old snapshots for this task.
    this.db
      .prepare(
        `DELETE FROM task_snapshots WHERE task_id = ? AND id NOT IN
         (SELECT id FROM task_snapshots WHERE task_id = ? ORDER BY id DESC LIMIT ?)`,
      )
      .run(taskId, taskId, MAX_SNAPSHOTS_PER_TASK);
    return this.getSnapshot(snapshotId)!;
  }

  private rowToSnapshot(r: Record<string, unknown>): TaskSnapshot {
    return {
      id: Number(r.id),
      taskId: String(r.task_id),
      ranAt: String(r.ran_at),
      status: String(r.status) as TaskSnapshot['status'],
      durationMs: Number(r.duration_ms),
      rowCount: Number(r.row_count),
      columns: JSON.parse(String(r.columns_json)),
      rows: JSON.parse(String(r.rows_json)),
      truncated: Number(r.truncated) === 1,
      error: r.error == null ? null : String(r.error),
    };
  }

  getSnapshot(id: number): TaskSnapshot | undefined {
    const r = this.db
      .prepare('SELECT * FROM task_snapshots WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return r ? this.rowToSnapshot(r) : undefined;
  }

  listSnapshots(taskId: string, limit = 50): TaskSnapshot[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM task_snapshots WHERE task_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(taskId, limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToSnapshot(r));
  }

  close(): void {
    this.db.close();
  }
}
