import Database from 'better-sqlite3';
import path from 'node:path';

/**
 * Per-(connection, database) free-text business context the user maintains to
 * feed the AI assistant (units, enum meanings, canonical joins, gotchas…).
 * Injected into the AI system prompt ahead of the structural schema digest.
 * `database` is normalized to '' when the engine has no multiple databases.
 */
export class AiContextStore {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    this.db = new Database(path.join(dataDir, 'fluentdb.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ai_context (
        connection_id TEXT NOT NULL,
        database TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (connection_id, database)
      )`,
    );
  }

  private key(database?: string | null): string {
    return database ?? '';
  }

  get(connectionId: string, database?: string | null): string {
    const row = this.db
      .prepare(
        'SELECT content FROM ai_context WHERE connection_id = ? AND database = ?',
      )
      .get(connectionId, this.key(database)) as { content?: string } | undefined;
    return row?.content ?? '';
  }

  set(connectionId: string, database: string | null | undefined, content: string): void {
    const trimmed = content.trim();
    if (!trimmed) {
      this.delete(connectionId, database);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO ai_context (connection_id, database, content, updated_at)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(connection_id, database)
         DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      )
      .run(connectionId, this.key(database), trimmed);
  }

  delete(connectionId: string, database?: string | null): void {
    this.db
      .prepare(
        'DELETE FROM ai_context WHERE connection_id = ? AND database = ?',
      )
      .run(connectionId, this.key(database));
  }

  /** Remove all context rows for a connection (on connection delete). */
  clear(connectionId: string): void {
    this.db
      .prepare('DELETE FROM ai_context WHERE connection_id = ?')
      .run(connectionId);
  }

  close(): void {
    this.db.close();
  }
}
