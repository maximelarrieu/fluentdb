import Database from 'better-sqlite3';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DashboardWidget, WidgetInput, WidgetPatch } from '@fluentdb/shared';

/**
 * Custom-dashboard widgets: a saved read-only query + a visualization type,
 * scoped to a (connection, database). `database` is normalized to '' when the
 * engine has no multiple databases.
 */
export class DashboardStore {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    this.db = new Database(path.join(dataDir, 'fluentdb.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS dashboard_widgets (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        database TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        sql TEXT NOT NULL,
        viz TEXT NOT NULL,
        size TEXT NOT NULL DEFAULT 'md',
        orientation TEXT NOT NULL DEFAULT 'horizontal',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`,
    );
    // Migrate tables created before the orientation column existed.
    const cols = this.db
      .prepare(`PRAGMA table_info(dashboard_widgets)`)
      .all() as { name: string }[];
    if (!cols.some((c) => c.name === 'orientation')) {
      this.db.exec(
        `ALTER TABLE dashboard_widgets ADD COLUMN orientation TEXT NOT NULL DEFAULT 'horizontal'`,
      );
    }
  }

  private key(database?: string | null): string {
    return database ?? '';
  }

  private map(r: Record<string, unknown>): DashboardWidget {
    return {
      id: String(r.id),
      title: String(r.title),
      sql: String(r.sql),
      viz: r.viz as DashboardWidget['viz'],
      size: r.size as DashboardWidget['size'],
      orientation: (r.orientation ?? 'horizontal') as DashboardWidget['orientation'],
      position: Number(r.position),
    };
  }

  list(connectionId: string, database?: string | null): DashboardWidget[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, sql, viz, size, orientation, position FROM dashboard_widgets
         WHERE connection_id = ? AND database = ?
         ORDER BY position, created_at`,
      )
      .all(connectionId, this.key(database)) as Record<string, unknown>[];
    return rows.map((r) => this.map(r));
  }

  create(
    connectionId: string,
    database: string | null | undefined,
    input: WidgetInput,
  ): DashboardWidget {
    const id = randomUUID();
    const next =
      (this.db
        .prepare(
          `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM dashboard_widgets
           WHERE connection_id = ? AND database = ?`,
        )
        .get(connectionId, this.key(database)) as { n: number }).n ?? 0;
    this.db
      .prepare(
        `INSERT INTO dashboard_widgets
         (id, connection_id, database, title, sql, viz, size, orientation, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        connectionId,
        this.key(database),
        input.title,
        input.sql,
        input.viz,
        input.size,
        input.orientation,
        next,
      );
    return { id, position: next, ...input };
  }

  update(id: string, patch: WidgetPatch): DashboardWidget | null {
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const k of ['title', 'sql', 'viz', 'size', 'orientation'] as const) {
      if (patch[k] !== undefined) {
        fields.push(`${k} = ?`);
        params.push(patch[k]);
      }
    }
    if (fields.length > 0) {
      params.push(id);
      this.db
        .prepare(`UPDATE dashboard_widgets SET ${fields.join(', ')} WHERE id = ?`)
        .run(...params);
    }
    const row = this.db
      .prepare(
        'SELECT id, title, sql, viz, size, orientation, position FROM dashboard_widgets WHERE id = ?',
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM dashboard_widgets WHERE id = ?').run(id);
  }

  /** Persist a new order (array of widget ids in display order). */
  reorder(ids: string[]): void {
    const stmt = this.db.prepare(
      'UPDATE dashboard_widgets SET position = ? WHERE id = ?',
    );
    const tx = this.db.transaction((list: string[]) => {
      list.forEach((id, i) => stmt.run(i, id));
    });
    tx(ids);
  }

  clear(connectionId: string): void {
    this.db
      .prepare('DELETE FROM dashboard_widgets WHERE connection_id = ?')
      .run(connectionId);
  }

  close(): void {
    this.db.close();
  }
}
