import mysql from 'mysql2/promise';
import type {
  AutocompleteCatalog,
  ConnectionConfig,
  DatabaseInfo,
  DdlChange,
  DdlPreview,
  HealthFinding,
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
import {
  buildCount,
  buildMutations,
  buildSelectPage,
} from '../sqlBuilder.js';
import { mysqlDialect } from './dialect.js';
import { buildMysqlDdl } from './ddl.js';
import { normalizeMysqlPlan } from './explain.js';

const SYSTEM_DBS = new Set([
  'mysql',
  'information_schema',
  'performance_schema',
  'sys',
]);

interface FieldMeta {
  name: string;
}

export class MysqlDriver implements Driver {
  readonly engine = 'mysql' as const;
  readonly dialect = mysqlDialect;
  readonly capabilities: DriverCapabilities = {
    multipleDatabases: true,
    schemas: false,
    cancelQuery: true,
    transactionalDdl: false,
    alterColumn: true,
    estimateRows: true,
    explain: true,
    explainAnalyze: false,
    materializedViews: false,
  };

  private pool: mysql.Pool | null = null;
  private readonly config: ConnectionConfig;
  private readonly database: string | undefined;
  /** queryId -> mysql thread id */
  private readonly running = new Map<string, number>();

  constructor(config: ConnectionConfig, database?: string) {
    this.config = config;
    this.database = database ?? config.database;
  }

  private poolConfig(): mysql.PoolOptions {
    return {
      host: this.config.host ?? 'localhost',
      port: this.config.port ?? 3306,
      user: this.config.user,
      password: this.config.password ?? '',
      database: this.database || undefined,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 5,
      multipleStatements: true,
      connectTimeout: 8000,
      // Return DATE/DATETIME as strings: avoids TZ shifts in the grid.
      dateStrings: true,
      // Keep 64-bit values lossless.
      supportBigNumbers: true,
      bigNumberStrings: true,
    };
  }

  private db(): mysql.Pool {
    if (!this.pool) throw new DriverError('Not connected', 500);
    return this.pool;
  }

  async connect(): Promise<void> {
    this.pool = mysql.createPool(this.poolConfig());
    await this.ping();
  }

  async disconnect(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }

  async ping(): Promise<void> {
    await this.db().query('SELECT 1');
  }

  async serverVersion(): Promise<string> {
    const [rows] = await this.db().query('SELECT VERSION() AS v');
    return `MySQL ${(rows as { v: string }[])[0]?.v ?? '?'}`;
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const [rows] = await this.db().query('SHOW DATABASES');
    return (rows as { Database: string }[])
      .map((r) => r.Database)
      .filter((name) => !SYSTEM_DBS.has(name))
      .sort()
      .map((name) => ({ name, isDefault: name === this.database }));
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    return [];
  }

  private dbName(): string {
    if (!this.database) {
      throw new DriverError('No database selected for this connection');
    }
    return this.database;
  }

  async listTables(): Promise<TableInfo[]> {
    const [rows] = await this.db().query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS row_estimate,
              TABLE_COMMENT AS comment
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [this.dbName()],
    );
    return (rows as Record<string, unknown>[]).map((r) => ({
      name: String(r.name),
      kind: String(r.type).includes('VIEW') ? ('view' as const) : ('table' as const),
      rowEstimate: r.row_estimate == null ? null : Number(r.row_estimate),
      comment: r.comment ? String(r.comment) : null,
    }));
  }

  async getTableStructure(ref: TableRef): Promise<TableStructure> {
    const db = this.db();
    const database = this.dbName();

    const [colRows] = await db.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY,
              EXTRA, ORDINAL_POSITION, COLUMN_COMMENT
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [database, ref.name],
    );
    const cols = colRows as Record<string, unknown>[];
    if (cols.length === 0) {
      throw new DriverError(`Table not found: ${ref.name}`, 404);
    }

    const columns = cols.map((c, i) => ({
      name: String(c.COLUMN_NAME),
      dataType: String(c.COLUMN_TYPE),
      nullable: c.IS_NULLABLE === 'YES',
      defaultValue: c.COLUMN_DEFAULT == null ? null : String(c.COLUMN_DEFAULT),
      isPrimaryKey: c.COLUMN_KEY === 'PRI',
      isAutoIncrement: String(c.EXTRA ?? '').includes('auto_increment'),
      comment: c.COLUMN_COMMENT ? String(c.COLUMN_COMMENT) : null,
      ordinal: i,
    }));

    const [idxRows] = await db.query(
      `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [database, ref.name],
    );
    const idxMap = new Map<
      string,
      { columns: string[]; unique: boolean; primary: boolean }
    >();
    for (const r of idxRows as Record<string, unknown>[]) {
      const name = String(r.INDEX_NAME);
      const entry = idxMap.get(name) ?? {
        columns: [],
        unique: Number(r.NON_UNIQUE) === 0,
        primary: name === 'PRIMARY',
      };
      entry.columns.push(String(r.COLUMN_NAME));
      idxMap.set(name, entry);
    }

    const [fkRows] = await db.query(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
      [database, ref.name],
    );
    const fkMap = new Map<
      string,
      { columns: string[]; referencedTable: string; referencedColumns: string[] }
    >();
    for (const r of fkRows as Record<string, unknown>[]) {
      const name = String(r.CONSTRAINT_NAME);
      const entry = fkMap.get(name) ?? {
        columns: [],
        referencedTable: String(r.REFERENCED_TABLE_NAME),
        referencedColumns: [],
      };
      entry.columns.push(String(r.COLUMN_NAME));
      entry.referencedColumns.push(String(r.REFERENCED_COLUMN_NAME));
      fkMap.set(name, entry);
    }

    const tables = await this.listTables();
    const table = tables.find((t) => t.name === ref.name) ?? {
      name: ref.name,
      kind: 'table' as const,
    };

    return {
      table,
      columns,
      primaryKey: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
      indexes: [...idxMap.entries()].map(([name, e]) => ({ name, ...e })),
      foreignKeys: [...fkMap.entries()].map(([name, e]) => ({ name, ...e })),
    };
  }

  async getAutocompleteCatalog(): Promise<AutocompleteCatalog> {
    const [rows] = await this.db().query(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [this.dbName()],
    );
    const catalog: AutocompleteCatalog = {};
    for (const r of rows as Record<string, unknown>[]) {
      const table = String(r.TABLE_NAME);
      (catalog[table] ??= []).push(String(r.COLUMN_NAME));
    }
    return catalog;
  }

  async runQuery(sql: string, opts: RunQueryOptions): Promise<QueryResultSet[]> {
    const conn = await this.db().getConnection();
    this.running.set(opts.queryId, conn.threadId);
    try {
      const [result, fields] = await conn.query({ sql, rowsAsArray: true });
      return this.toResultSets(result, fields, opts.maxRows);
    } catch (err) {
      throw new DriverError((err as Error).message);
    } finally {
      this.running.delete(opts.queryId);
      conn.release();
    }
  }

  private toResultSets(
    result: unknown,
    fields: unknown,
    maxRows: number,
  ): QueryResultSet[] {
    // Single statement: `fields` is a flat array of FieldPacket objects
    // (or undefined for an OK packet). Multi-statement: `fields` is an
    // array with one entry per statement, each a field array or undefined.
    const isMulti =
      Array.isArray(result) &&
      Array.isArray(fields) &&
      fields.length === result.length &&
      fields.every((f) => f === undefined || Array.isArray(f));

    const pairs: { res: unknown; flds: FieldMeta[] | undefined }[] = [];
    if (isMulti) {
      const fldArr = fields as unknown[];
      (result as unknown[]).forEach((res, i) => {
        pairs.push({ res, flds: fldArr[i] as FieldMeta[] | undefined });
      });
    } else {
      pairs.push({ res: result, flds: fields as FieldMeta[] | undefined });
    }

    return pairs.map(({ res, flds }) => {
      if (Array.isArray(res)) {
        const raw = res as unknown[][];
        const truncated = raw.length > maxRows;
        return {
          columns: (flds ?? []).map((f) => ({ name: f.name })),
          rows: (truncated ? raw.slice(0, maxRows) : raw).map((r) =>
            r.map(normalizeCell),
          ),
          rowCount: truncated ? maxRows : raw.length,
          truncated,
        };
      }
      const ok = res as { affectedRows?: number };
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: false,
        affectedRows: ok?.affectedRows ?? 0,
      };
    });
  }

  async cancelQuery(queryId: string): Promise<boolean> {
    const threadId = this.running.get(queryId);
    if (threadId === undefined) return false;
    const side = await mysql.createConnection({
      ...this.poolConfig(),
      multipleStatements: false,
    });
    try {
      await side.query('KILL QUERY ?', [threadId]);
      return true;
    } finally {
      await side.end().catch(() => {});
    }
  }

  async estimateRows(sql: string): Promise<number | null> {
    // EXPLAIN plans without executing. The classic format exposes a `rows`
    // estimate per access; we take the product across rows as a rough total.
    try {
      const [rows] = await this.db().query(`EXPLAIN ${sql}`);
      const plan = rows as { rows?: number | string | null }[];
      if (!Array.isArray(plan) || plan.length === 0) return null;
      let total = 1;
      let seen = false;
      for (const step of plan) {
        const n = step.rows == null ? null : Number(step.rows);
        if (n != null && Number.isFinite(n)) {
          total *= n;
          seen = true;
        }
      }
      return seen ? total : null;
    } catch {
      return null;
    }
  }

  async healthChecks(): Promise<HealthFinding[]> {
    const db = this.db();
    const findings: HealthFinding[] = [];
    const schema = this.database;
    const run = async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch {
        // best-effort
      }
    };

    // Tables without a primary key.
    await run(async () => {
      if (!schema) return;
      const [rows] = await db.query(
        `SELECT t.table_name AS \`table\`
         FROM information_schema.tables t
         LEFT JOIN information_schema.table_constraints c
           ON c.table_schema = t.table_schema
           AND c.table_name = t.table_name
           AND c.constraint_type = 'PRIMARY KEY'
         WHERE t.table_schema = ? AND t.table_type = 'BASE TABLE'
               AND c.constraint_name IS NULL
         ORDER BY t.table_name
         LIMIT 20`,
        [schema],
      );
      const list = rows as { table: string }[];
      if (list.length === 0) return;
      findings.push({
        id: 'mysql.no_pk',
        category: 'schema',
        severity: 'info',
        title: `${list.length} table(s) sans clé primaire`,
        detail:
          'Une clé primaire rend les lignes éditables dans la grille et est requise par la réplication basée sur les lignes (InnoDB en crée une cachée sinon).',
        table: { columns: ['table'], rows: list.map((r) => [r.table]) },
      });
    });

    // Connection pressure.
    await run(async () => {
      const [used] = await db.query(
        `SHOW STATUS LIKE 'Threads_connected'`,
      );
      const [max] = await db.query(`SHOW VARIABLES LIKE 'max_connections'`);
      const u = Number((used as { Value?: string }[])[0]?.Value ?? 0);
      const m = Number((max as { Value?: string }[])[0]?.Value ?? 0);
      if (!m) return;
      const pct = Math.round((u / m) * 100);
      findings.push({
        id: 'mysql.connections',
        category: 'connections',
        severity: pct >= 80 ? 'warn' : 'ok',
        title: `Connexions : ${u} / ${m} (${pct} %)`,
        detail:
          pct >= 80
            ? 'Proche de la limite de connexions — envisage un pooler ou de réduire les connexions applicatives.'
            : 'Utilisation des connexions dans une plage saine.',
      });
    });

    return findings;
  }

  async explain(sql: string): Promise<QueryPlan> {
    try {
      const [rows] = await this.db().query(`EXPLAIN FORMAT=JSON ${sql}`);
      // mysql2 returns rows with an EXPLAIN column holding the JSON string.
      const first = (rows as Record<string, unknown>[])[0] ?? {};
      const raw = (first.EXPLAIN ?? Object.values(first)[0]) as string;
      return {
        engine: 'mysql',
        analyzed: false,
        root: normalizeMysqlPlan(raw),
        rawText: typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2),
      };
    } catch (err) {
      throw new DriverError((err as Error).message);
    }
  }

  async selectRows(ref: TableRef, q: RowQuery): Promise<PageResult> {
    const structure = await this.getTableStructure(ref);
    const known = new Set(structure.columns.map((c) => c.name));

    const page = buildSelectPage(this.dialect, ref, q, known);
    const count = buildCount(this.dialect, ref, q.filters, known);
    const db = this.db();
    const [[pageRows], [countRows]] = await Promise.all([
      db.query({ sql: page.sql, values: page.params, rowsAsArray: true }),
      db.query({ sql: count.sql, values: count.params }),
    ]);

    return {
      columns: structure.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
      })),
      rows: (pageRows as unknown[][]).map((r) => r.map(normalizeCell)),
      total: Number((countRows as { n: unknown }[])[0]?.n ?? 0),
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

    const conn = await this.db().getConnection();
    const result: MutationResult = { inserted: 0, updated: 0, deleted: 0 };
    try {
      await conn.beginTransaction();
      for (const s of stmts.inserts) {
        const [r] = await conn.execute(s.sql, s.params);
        result.inserted += (r as { affectedRows: number }).affectedRows;
      }
      for (const s of stmts.updates) {
        const [r] = await conn.execute(s.sql, s.params);
        const affected = (r as { affectedRows: number }).affectedRows;
        if (affected === 0) {
          throw new DriverError(
            'Update matched no row (row may have been modified elsewhere)',
            409,
          );
        }
        result.updated += affected;
      }
      for (const s of stmts.deletes) {
        const [r] = await conn.execute(s.sql, s.params);
        result.deleted += (r as { affectedRows: number }).affectedRows;
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      if (err instanceof DriverError) throw err;
      throw new DriverError((err as Error).message);
    } finally {
      conn.release();
    }
    return result;
  }

  buildDdl(change: DdlChange): DdlPreview {
    return buildMysqlDdl(change);
  }

  async applyDdl(statements: string[]): Promise<void> {
    const conn = await this.db().getConnection();
    try {
      for (const s of statements) await conn.query(s);
    } catch (err) {
      throw new DriverError((err as Error).message);
    } finally {
      conn.release();
    }
  }

  async getViewDefinition(ref: TableRef): Promise<string | null> {
    const [rows] = await this.db().query(
      `SELECT VIEW_DEFINITION AS def FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [this.dbName(), ref.name],
    );
    const def = (rows as Record<string, unknown>[])[0]?.def;
    return def == null ? null : String(def);
  }

  async searchObjects(query: string, limit = 50): Promise<SearchHit[]> {
    const db = this.db();
    const database = this.dbName();
    const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const [objRows] = await db.query(
      `SELECT TABLE_NAME AS name,
              CASE WHEN TABLE_TYPE LIKE '%VIEW%' THEN 'view' ELSE 'table' END AS kind
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE ?
       ORDER BY TABLE_NAME LIMIT ?`,
      [database, like, limit],
    );
    const [colRows] = await db.query(
      `SELECT TABLE_NAME AS tbl, COLUMN_NAME AS name, COLUMN_TYPE AS data_type
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND COLUMN_NAME LIKE ?
       ORDER BY COLUMN_NAME LIMIT ?`,
      [database, like, limit],
    );
    const hits: SearchHit[] = [
      ...(objRows as Record<string, unknown>[]).map((r) => ({
        kind: String(r.kind) as SearchHit['kind'],
        name: String(r.name),
      })),
      ...(colRows as Record<string, unknown>[]).map((r) => ({
        kind: 'column' as const,
        name: String(r.name),
        table: String(r.tbl),
        dataType: String(r.data_type),
      })),
    ];
    return hits.slice(0, limit);
  }
}
