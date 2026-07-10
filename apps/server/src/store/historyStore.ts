import Database from 'better-sqlite3';
import path from 'node:path';
import type { HistoryEntry } from '@fluentdb/shared';

export interface HistoryInput {
  connectionId: string;
  connectionName: string;
  database: string | null;
  sql: string;
  durationMs: number;
  rowCount: number | null;
  error: string | null;
}

const MAX_ENTRIES = 2000;

export class HistoryStore {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    this.db = new Database(path.join(dataDir, 'fluentdb.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS query_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_id TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        database TEXT,
        sql TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        row_count INTEGER,
        error TEXT,
        executed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`,
    );
  }

  add(entry: HistoryInput): void {
    this.db
      .prepare(
        `INSERT INTO query_history
         (connection_id, connection_name, database, sql, duration_ms, row_count, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.connectionId,
        entry.connectionName,
        entry.database,
        entry.sql,
        entry.durationMs,
        entry.rowCount,
        entry.error,
      );
    // Keep the table bounded.
    this.db
      .prepare(
        `DELETE FROM query_history WHERE id NOT IN
         (SELECT id FROM query_history ORDER BY id DESC LIMIT ?)`,
      )
      .run(MAX_ENTRIES);
  }

  list(connectionId?: string, search?: string, limit = 200): HistoryEntry[] {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (connectionId) {
      clauses.push('connection_id = ?');
      params.push(connectionId);
    }
    if (search) {
      clauses.push('sql LIKE ?');
      params.push(`%${search}%`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT id, connection_id, connection_name, database, sql,
                duration_ms, row_count, error, executed_at
         FROM query_history ${where} ORDER BY id DESC LIMIT ?`,
      )
      .all(...params) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: Number(r.id),
      connectionId: String(r.connection_id),
      connectionName: String(r.connection_name),
      database: r.database == null ? null : String(r.database),
      sql: String(r.sql),
      durationMs: Number(r.duration_ms),
      rowCount: r.row_count == null ? null : Number(r.row_count),
      error: r.error == null ? null : String(r.error),
      executedAt: String(r.executed_at),
    }));
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM query_history WHERE id = ?').run(id);
  }

  clear(connectionId?: string): void {
    if (connectionId) {
      this.db
        .prepare('DELETE FROM query_history WHERE connection_id = ?')
        .run(connectionId);
    } else {
      this.db.prepare('DELETE FROM query_history').run();
    }
  }

  close(): void {
    this.db.close();
  }
}
