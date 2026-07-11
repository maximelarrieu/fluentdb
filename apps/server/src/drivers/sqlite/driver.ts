import Database from 'better-sqlite3';
import fs from 'node:fs';
import type {
  AutocompleteCatalog,
  CellValue,
  ConnectionConfig,
  DatabaseInfo,
  DdlChange,
  DdlPreview,
  ForeignKeyInfo,
  HealthFinding,
  IndexInfo,
  MutationResult,
  PageResult,
  QueryPlan,
  QueryResultSet,
  RowChanges,
  RowQuery,
  SchemaInfo,
  SearchHit,
  TableInfo,
  TableRef,
  TableStructure,
} from '@fluentdb/shared';
import {
  DriverError,
  normalizeCell,
  type Driver,
  type DriverCapabilities,
  type RunQueryOptions,
} from '../types.js';
import { splitSqlStatements } from '../sqlSplit.js';
import {
  buildCount,
  buildMutations,
  buildSelectPage,
  type BuiltQuery,
} from '../sqlBuilder.js';
import { sqliteDialect } from './dialect.js';
import { buildSqliteDdl } from './ddl.js';
import { normalizeSqlitePlan, type SqlitePlanRow } from './explain.js';

/** better-sqlite3 cannot bind booleans — coerce to 0/1. */
function bindable(params: CellValue[]): (string | number | null)[] {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

export class SqliteDriver implements Driver {
  readonly engine = 'sqlite' as const;
  readonly dialect = sqliteDialect;
  readonly capabilities: DriverCapabilities = {
    multipleDatabases: false,
    schemas: false,
    cancelQuery: false,
    transactionalDdl: true,
    alterColumn: false,
    estimateRows: false,
    explain: true,
    explainAnalyze: false,
    materializedViews: false,
  };

  private db: Database.Database | null = null;
  private readonly file: string;

  constructor(config: ConnectionConfig) {
    if (!config.file) {
      throw new DriverError('SQLite connection requires a database file path');
    }
    this.file = config.file;
  }

  private conn(): Database.Database {
    if (!this.db) throw new DriverError('Not connected', 500);
    return this.db;
  }

  async connect(): Promise<void> {
    if (!fs.existsSync(this.file)) {
      throw new DriverError(`SQLite file not found: ${this.file}`);
    }
    this.db = new Database(this.file);
    this.db.pragma('foreign_keys = ON');
  }

  async disconnect(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  async ping(): Promise<void> {
    this.conn().prepare('SELECT 1').get();
  }

  async serverVersion(): Promise<string> {
    const row = this.conn()
      .prepare('SELECT sqlite_version() AS v')
      .get() as { v: string };
    return `SQLite ${row.v}`;
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    return [{ name: 'main', isDefault: true }];
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    return [];
  }

  async listTables(): Promise<TableInfo[]> {
    const rows = this.conn()
      .prepare(
        `SELECT name, type FROM sqlite_master
         WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as { name: string; type: string }[];
    return rows.map((r) => ({
      name: r.name,
      kind: r.type === 'view' ? 'view' : 'table',
      rowEstimate: null,
    }));
  }

  async getTableStructure(ref: TableRef): Promise<TableStructure> {
    const db = this.conn();
    const q = this.dialect.quoteIdent;
    const cols = db.pragma(`table_info(${q(ref.name)})`) as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];
    if (cols.length === 0) {
      throw new DriverError(`Table not found: ${ref.name}`, 404);
    }

    const pkCols = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
    const isRowidAlias =
      pkCols.length === 1 && pkCols[0]!.type.toUpperCase() === 'INTEGER';

    const columns = cols.map((c) => ({
      name: c.name,
      dataType: c.type || 'TEXT',
      nullable: c.notnull === 0 && c.pk === 0,
      defaultValue: c.dflt_value,
      isPrimaryKey: c.pk > 0,
      // An INTEGER PRIMARY KEY is a rowid alias: it auto-assigns even
      // without the AUTOINCREMENT keyword.
      isAutoIncrement: c.pk > 0 && isRowidAlias,
      ordinal: c.cid,
    }));

    const indexList = db.pragma(`index_list(${q(ref.name)})`) as {
      name: string;
      unique: number;
      origin: string;
    }[];
    const indexes: IndexInfo[] = indexList.map((ix) => {
      const info = db.pragma(`index_info(${q(ix.name)})`) as {
        name: string | null;
      }[];
      return {
        name: ix.name,
        columns: info.map((i) => i.name ?? '(expr)'),
        unique: ix.unique === 1,
        primary: ix.origin === 'pk',
      };
    });

    const fkRows = db.pragma(`foreign_key_list(${q(ref.name)})`) as {
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string | null;
    }[];
    const fkById = new Map<number, ForeignKeyInfo>();
    for (const fk of fkRows.sort((a, b) => a.seq - b.seq)) {
      const existing = fkById.get(fk.id);
      if (existing) {
        existing.columns.push(fk.from);
        existing.referencedColumns.push(fk.to ?? '');
      } else {
        fkById.set(fk.id, {
          name: `fk_${ref.name}_${fk.id}`,
          columns: [fk.from],
          referencedTable: fk.table,
          referencedColumns: [fk.to ?? ''],
        });
      }
    }

    const tables = await this.listTables();
    const table = tables.find((t) => t.name === ref.name) ?? {
      name: ref.name,
      kind: 'table' as const,
    };

    return {
      table,
      columns,
      primaryKey: pkCols.map((c) => c.name),
      indexes,
      foreignKeys: [...fkById.values()],
    };
  }

  async getAutocompleteCatalog(): Promise<AutocompleteCatalog> {
    const catalog: AutocompleteCatalog = {};
    for (const t of await this.listTables()) {
      const cols = this.conn().pragma(
        `table_info(${this.dialect.quoteIdent(t.name)})`,
      ) as { name: string }[];
      catalog[t.name] = cols.map((c) => c.name);
    }
    return catalog;
  }

  async runQuery(sql: string, opts: RunQueryOptions): Promise<QueryResultSet[]> {
    const db = this.conn();
    const statements = splitSqlStatements(sql);
    if (statements.length === 0) {
      throw new DriverError('No SQL statement to execute');
    }
    const results: QueryResultSet[] = [];
    for (const statement of statements) {
      let prepared: Database.Statement;
      try {
        prepared = db.prepare(statement);
      } catch (err) {
        throw new DriverError((err as Error).message);
      }
      if (prepared.reader) {
        const raw = prepared.raw(true).all() as unknown[][];
        const columns = prepared.columns().map((c) => ({
          name: c.name,
          dataType: c.type ?? undefined,
        }));
        const truncated = raw.length > opts.maxRows;
        const rows = (truncated ? raw.slice(0, opts.maxRows) : raw).map((r) =>
          r.map(normalizeCell),
        );
        results.push({
          columns,
          rows,
          rowCount: rows.length,
          truncated,
          statement,
        });
      } else {
        const info = prepared.run();
        results.push({
          columns: [],
          rows: [],
          rowCount: 0,
          truncated: false,
          affectedRows: info.changes,
          statement,
        });
      }
    }
    return results;
  }

  async cancelQuery(): Promise<boolean> {
    return false;
  }

  async estimateRows(): Promise<number | null> {
    // SQLite's EXPLAIN QUERY PLAN gives no row-count estimate.
    return null;
  }

  async healthChecks(): Promise<HealthFinding[]> {
    const db = this.conn();
    const findings: HealthFinding[] = [];

    // 1. Integrity check.
    try {
      const rows = db.pragma('integrity_check') as { integrity_check: string }[];
      const ok = rows.length === 1 && rows[0]!.integrity_check === 'ok';
      findings.push({
        id: 'sqlite.integrity',
        category: 'maintenance',
        severity: ok ? 'ok' : 'critical',
        title: ok ? 'Intégrité de la base : OK' : 'Corruption détectée',
        detail: ok
          ? 'PRAGMA integrity_check ne signale aucune anomalie.'
          : `PRAGMA integrity_check signale : ${rows
              .map((r) => r.integrity_check)
              .join('; ')}`,
      });
    } catch {
      // skip
    }

    // 2. Foreign-key violations.
    try {
      const bad = db.pragma('foreign_key_check') as {
        table: string;
        rowid: number;
      }[];
      if (bad.length > 0) {
        const byTable = new Map<string, number>();
        for (const r of bad) byTable.set(r.table, (byTable.get(r.table) ?? 0) + 1);
        findings.push({
          id: 'sqlite.fk',
          category: 'maintenance',
          severity: 'warn',
          title: `${bad.length} violation(s) de clé étrangère`,
          detail:
            'Des lignes référencent des clés inexistantes. Corrige les données ou les contraintes.',
          table: {
            columns: ['table', 'violations'],
            rows: [...byTable.entries()],
          },
        });
      }
    } catch {
      // skip
    }

    // 3. Tables without a primary key.
    try {
      const tables = (
        db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
          )
          .all() as { name: string }[]
      ).map((r) => r.name);
      const noPk = tables.filter((name) => {
        const cols = db.pragma(
          `table_info(${this.dialect.quoteIdent(name)})`,
        ) as { pk: number }[];
        return !cols.some((c) => c.pk > 0);
      });
      if (noPk.length > 0) {
        findings.push({
          id: 'sqlite.no_pk',
          category: 'schema',
          severity: 'info',
          title: `${noPk.length} table(s) sans clé primaire`,
          detail:
            'Une clé primaire est recommandée : elle rend les lignes éditables dans la grille et accélère les accès.',
          table: { columns: ['table'], rows: noPk.map((n) => [n]) },
        });
      }
    } catch {
      // skip
    }

    return findings;
  }

  async explain(sql: string): Promise<QueryPlan> {
    let rows: SqlitePlanRow[];
    try {
      rows = this.conn()
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all() as SqlitePlanRow[];
    } catch (err) {
      throw new DriverError((err as Error).message);
    }
    return {
      engine: 'sqlite',
      analyzed: false,
      root: normalizeSqlitePlan(rows),
    };
  }

  private exec(built: BuiltQuery): { rows: unknown[][]; columns: string[] } {
    const stmt = this.conn().prepare(built.sql);
    const rows = stmt.raw(true).all(...bindable(built.params)) as unknown[][];
    return { rows, columns: stmt.columns().map((c) => c.name) };
  }

  async selectRows(ref: TableRef, q: RowQuery): Promise<PageResult> {
    const structure = await this.getTableStructure(ref);
    const known = new Set(structure.columns.map((c) => c.name));

    const page = this.exec(buildSelectPage(this.dialect, ref, q, known));
    const count = this.exec(buildCount(this.dialect, ref, q.filters, known));

    return {
      columns: structure.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
      })),
      rows: page.rows.map((r) => r.map(normalizeCell)),
      total: Number(count.rows[0]?.[0] ?? 0),
      pkColumns: structure.primaryKey,
    };
  }

  async mutateRows(ref: TableRef, changes: RowChanges): Promise<MutationResult> {
    const structure = await this.getTableStructure(ref);
    const known = new Set(structure.columns.map((c) => c.name));
    const stmts = buildMutations(
      this.dialect,
      ref,
      changes,
      known,
      structure.primaryKey,
    );
    const db = this.conn();
    const result: MutationResult = { inserted: 0, updated: 0, deleted: 0 };
    const tx = db.transaction(() => {
      for (const s of stmts.inserts) {
        result.inserted += db.prepare(s.sql).run(...bindable(s.params)).changes;
      }
      for (const s of stmts.updates) {
        const changed = db.prepare(s.sql).run(...bindable(s.params)).changes;
        if (changed === 0) {
          throw new DriverError(
            'Update matched no row (row may have been modified elsewhere)',
            409,
          );
        }
        result.updated += changed;
      }
      for (const s of stmts.deletes) {
        result.deleted += db.prepare(s.sql).run(...bindable(s.params)).changes;
      }
    });
    try {
      tx();
    } catch (err) {
      if (err instanceof DriverError) throw err;
      throw new DriverError((err as Error).message);
    }
    return result;
  }

  buildDdl(change: DdlChange): DdlPreview {
    return buildSqliteDdl(change);
  }

  async applyDdl(statements: string[]): Promise<void> {
    const db = this.conn();
    const tx = db.transaction(() => {
      for (const s of statements) db.prepare(s).run();
    });
    try {
      tx();
    } catch (err) {
      throw new DriverError((err as Error).message);
    }
  }

  async getViewDefinition(ref: TableRef): Promise<string | null> {
    const row = this.conn()
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'view' AND name = ?`,
      )
      .get(ref.name) as { sql: string | null } | undefined;
    return row?.sql ?? null;
  }

  async searchObjects(query: string, limit = 50): Promise<SearchHit[]> {
    const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const db = this.conn();
    const objects = db
      .prepare(
        `SELECT name, type FROM sqlite_master
         WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
           AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT ?`,
      )
      .all(like, limit) as { name: string; type: string }[];
    const columns = db
      .prepare(
        `SELECT m.name AS tbl, m.type AS tbl_type, p.name AS name, p.type AS data_type
         FROM sqlite_master m JOIN pragma_table_info(m.name) p
         WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%'
           AND p.name LIKE ? ESCAPE '\\' ORDER BY p.name LIMIT ?`,
      )
      .all(like, limit) as {
      tbl: string;
      tbl_type: string;
      name: string;
      data_type: string;
    }[];
    const hits: SearchHit[] = [
      ...objects.map((o) => ({
        kind: (o.type === 'view' ? 'view' : 'table') as SearchHit['kind'],
        name: o.name,
      })),
      ...columns.map((c) => ({
        kind: 'column' as const,
        name: c.name,
        table: c.tbl,
        tableKind: (c.tbl_type === 'view' ? 'view' : 'table') as SearchHit['tableKind'],
        dataType: c.data_type,
      })),
    ];
    return hits.slice(0, limit);
  }
}
