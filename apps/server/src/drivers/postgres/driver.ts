import pg from 'pg';
import type {
  AutocompleteCatalog,
  ConnectionConfig,
  DatabaseInfo,
  DbSession,
  LockWait,
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
  type ExportSink,
} from '../types.js';
import {
  buildCount,
  buildMutations,
  buildPage,
} from '../sqlBuilder.js';
import { postgresDialect } from './dialect.js';
import { buildPostgresDdl } from './ddl.js';
import { normalizePgPlan } from './explain.js';

const DEFAULT_SCHEMA = 'public';

// node-pg has no parser for the `name[]` type (OID 1003) and returns the raw
// '{a,b}' string instead of a JS array. Catalog introspection aggregates
// identifier names (index/FK/column lists), so an unparsed name[] silently
// becomes a string and breaks every `.join()`/`[0]` on it (ERD edges, table
// structure…). Reuse node-pg's own text[] parser (OID 1009) so any name[]
// always arrives as an array — a process-wide guard against that whole class
// of bug, in addition to the explicit ::text casts in the queries below.
// (@types/pg only types the OID enum, so retype the numeric OIDs loosely.)
const pgTypes = pg.types as unknown as {
  getTypeParser: (oid: number) => (value: string) => unknown;
  setTypeParser: (oid: number, parser: (value: string) => unknown) => void;
};
pgTypes.setTypeParser(1003, pgTypes.getTypeParser(1009));

interface PgPlanNode {
  'Node Type'?: string;
  'Plan Rows'?: number;
  Plans?: PgPlanNode[];
}

/**
 * Pull the affected-row estimate from an EXPLAIN plan tree. For writes the
 * top ModifyTable node reports 0 rows (unless RETURNING); the real estimate
 * lives on its scan child, so we descend through ModifyTable nodes.
 */
function estimateFromPlan(plan: PgPlanNode | undefined): number | null {
  if (!plan) return null;
  if (
    plan['Node Type'] === 'ModifyTable' &&
    plan.Plans &&
    plan.Plans.length > 0
  ) {
    return estimateFromPlan(plan.Plans[0]);
  }
  const rows = plan['Plan Rows'];
  return typeof rows === 'number' ? Math.round(rows) : null;
}

export class PostgresDriver implements Driver {
  readonly engine = 'postgres' as const;
  readonly dialect = postgresDialect;
  readonly capabilities: DriverCapabilities = {
    multipleDatabases: true,
    schemas: true,
    cancelQuery: true,
    transactionalDdl: true,
    alterColumn: true,
    estimateRows: true,
    explain: true,
    explainAnalyze: true,
    materializedViews: true,
    activityMonitor: true,
  };

  private pool: pg.Pool | null = null;
  private readonly config: ConnectionConfig;
  private readonly database: string | undefined;
  /** queryId -> backend PID of the client executing it */
  private readonly running = new Map<string, number>();

  constructor(config: ConnectionConfig, database?: string) {
    this.config = config;
    this.database = database ?? config.database;
  }

  private poolConfig(): pg.PoolConfig {
    return {
      host: this.config.host ?? 'localhost',
      port: this.config.port ?? 5432,
      user: this.config.user,
      password: this.config.password ?? '',
      database: this.database || 'postgres',
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
      connectionTimeoutMillis: 8000,
    };
  }

  private db(): pg.Pool {
    if (!this.pool) throw new DriverError('Not connected', 500);
    return this.pool;
  }

  async connect(): Promise<void> {
    this.pool = new pg.Pool(this.poolConfig());
    // surface pool-level errors (dropped connections) instead of crashing
    this.pool.on('error', () => {});
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
    const res = await this.db().query('SHOW server_version');
    return `PostgreSQL ${res.rows[0]?.server_version ?? '?'}`;
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const res = await this.db().query(
      `SELECT datname AS name FROM pg_database
       WHERE datistemplate = false ORDER BY datname`,
    );
    return res.rows.map((r) => ({
      name: r.name,
      isDefault: r.name === this.database,
    }));
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    const res = await this.db().query(
      `SELECT nspname AS name FROM pg_namespace
       WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
       ORDER BY nspname`,
    );
    return res.rows.map((r) => ({
      name: r.name,
      isDefault: r.name === DEFAULT_SCHEMA,
    }));
  }

  async listTables(schema = DEFAULT_SCHEMA): Promise<TableInfo[]> {
    const res = await this.db().query(
      `SELECT c.relname AS name,
              n.nspname AS schema,
              CASE c.relkind
                WHEN 'm' THEN 'matview'
                WHEN 'v' THEN 'view'
                ELSE 'table'
              END AS kind,
              CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS row_estimate,
              CASE WHEN c.relkind = 'm' THEN c.relispopulated ELSE NULL END AS is_populated,
              obj_description(c.oid, 'pg_class') AS comment
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p', 'v', 'm') AND n.nspname = $1
       ORDER BY c.relname`,
      [schema],
    );
    return res.rows.map((r) => ({
      name: r.name,
      schema: r.schema,
      kind: r.kind,
      rowEstimate: r.row_estimate === null ? null : Number(r.row_estimate),
      isPopulated: r.is_populated,
      comment: r.comment,
    }));
  }

  async getTableStructure(ref: TableRef): Promise<TableStructure> {
    const schema = ref.schema ?? DEFAULT_SCHEMA;
    const db = this.db();

    const colsRes = await db.query(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default,
              is_identity, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, ref.name],
    );
    // Materialized views are absent from information_schema — fall back to
    // pg_catalog so their columns (and data browsing) still work.
    let colRows = colsRes.rows;
    if (colRows.length === 0) {
      const pgCat = await db.query(
        `SELECT a.attname AS column_name,
                format_type(a.atttypid, a.atttypmod) AS data_type,
                NULL AS udt_name,
                CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
                pg_get_expr(d.adbin, d.adrelid) AS column_default,
                'NO' AS is_identity,
                a.attnum AS ordinal_position
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE n.nspname = $1 AND c.relname = $2
           AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [schema, ref.name],
      );
      colRows = pgCat.rows;
    }
    if (colRows.length === 0) {
      throw new DriverError(`Table not found: ${schema}.${ref.name}`, 404);
    }

    const pkRes = await db.query(
      `SELECT a.attname AS name
       FROM pg_index ix
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
       WHERE ix.indisprimary AND t.relname = $1 AND n.nspname = $2
       ORDER BY k.ord`,
      [ref.name, schema],
    );
    const pk = pkRes.rows.map((r) => r.name as string);
    const pkSet = new Set(pk);

    const columns = colRows.map((r, i) => ({
      name: r.column_name as string,
      dataType:
        r.data_type === 'USER-DEFINED' || r.data_type === 'ARRAY'
          ? (r.udt_name as string)
          : (r.data_type as string),
      nullable: r.is_nullable === 'YES',
      defaultValue: r.column_default as string | null,
      isPrimaryKey: pkSet.has(r.column_name),
      isAutoIncrement:
        r.is_identity === 'YES' ||
        (typeof r.column_default === 'string' &&
          r.column_default.startsWith('nextval(')),
      ordinal: i,
    }));

    const idxRes = await db.query(
      // cast to text[] — array_agg of the `name` type yields name[], which
      // node-pg returns as a raw '{...}' string instead of a JS array.
      `SELECT i.relname AS name,
              ix.indisunique AS is_unique,
              ix.indisprimary AS is_primary,
              array_agg(COALESCE(a.attname, '(expr)')::text ORDER BY k.ord) AS columns
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum AND k.attnum > 0
       WHERE t.relname = $1 AND n.nspname = $2
       GROUP BY i.relname, ix.indisunique, ix.indisprimary
       ORDER BY i.relname`,
      [ref.name, schema],
    );

    const fkRes = await db.query(
      // attname is the `name` type; node-pg has no parser for name[] and would
      // return the raw '{a,b}' string, so cast to text[] which it parses.
      `SELECT con.conname AS name,
              (SELECT array_agg(a.attname::text ORDER BY k.ord)
               FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS columns,
              rn.nspname AS ref_schema,
              rt.relname AS ref_table,
              (SELECT array_agg(a.attname::text ORDER BY k.ord)
               FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS ref_columns
       FROM pg_constraint con
       JOIN pg_class t ON t.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_class rt ON rt.oid = con.confrelid
       JOIN pg_namespace rn ON rn.oid = rt.relnamespace
       WHERE con.contype = 'f' AND t.relname = $1 AND n.nspname = $2`,
      [ref.name, schema],
    );

    const tables = await this.listTables(schema);
    const table = tables.find((t) => t.name === ref.name) ?? {
      name: ref.name,
      schema,
      kind: 'table' as const,
    };

    return {
      table,
      columns,
      primaryKey: pk,
      indexes: idxRes.rows.map((r) => ({
        name: r.name,
        columns: r.columns,
        unique: r.is_unique,
        primary: r.is_primary,
      })),
      foreignKeys: fkRes.rows.map((r) => ({
        name: r.name,
        columns: r.columns,
        referencedTable: r.ref_table,
        referencedSchema: r.ref_schema,
        referencedColumns: r.ref_columns,
      })),
    };
  }

  async getAutocompleteCatalog(): Promise<AutocompleteCatalog> {
    const res = await this.db().query(
      // information_schema covers tables and (plain) views; the UNION adds
      // materialized views, which information_schema does not expose.
      `SELECT table_schema, table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns
       FROM information_schema.columns
       WHERE table_schema NOT LIKE 'pg\\_%' AND table_schema <> 'information_schema'
       GROUP BY table_schema, table_name
       UNION ALL
       SELECT n.nspname AS table_schema, c.relname AS table_name,
              array_agg(a.attname::text ORDER BY a.attnum) AS columns
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       WHERE c.relkind = 'm' AND n.nspname NOT LIKE 'pg\\_%'
         AND n.nspname <> 'information_schema'
       GROUP BY n.nspname, c.relname`,
    );
    const catalog: AutocompleteCatalog = {};
    for (const r of res.rows) {
      const key =
        r.table_schema === DEFAULT_SCHEMA
          ? r.table_name
          : `${r.table_schema}.${r.table_name}`;
      catalog[key] = r.columns;
    }
    return catalog;
  }

  async searchObjects(query: string, limit = 50): Promise<SearchHit[]> {
    const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const relKind = `CASE c.relkind WHEN 'm' THEN 'matview' WHEN 'v' THEN 'view' ELSE 'table' END`;
    const notSystem = `n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`;
    const db = this.db();
    const [objects, columns] = await Promise.all([
      db.query(
        `SELECT n.nspname AS schema, c.relname AS name, ${relKind} AS kind
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r','p','v','m') AND ${notSystem} AND c.relname ILIKE $1
         ORDER BY c.relname LIMIT $2`,
        [like, limit],
      ),
      db.query(
        `SELECT n.nspname AS schema, c.relname AS "table", a.attname AS name,
                format_type(a.atttypid, a.atttypmod) AS data_type, ${relKind} AS table_kind
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r','p','v','m') AND ${notSystem}
           AND a.attnum > 0 AND NOT a.attisdropped AND a.attname ILIKE $1
         ORDER BY a.attname LIMIT $2`,
        [like, limit],
      ),
    ]);
    const hits: SearchHit[] = [
      ...objects.rows.map((r) => ({
        kind: r.kind as SearchHit['kind'],
        name: r.name as string,
        schema: r.schema as string,
      })),
      ...columns.rows.map((r) => ({
        kind: 'column' as const,
        name: r.name as string,
        schema: r.schema as string,
        table: r.table as string,
        tableKind: r.table_kind as SearchHit['tableKind'],
        dataType: r.data_type as string,
      })),
    ];
    return hits.slice(0, limit);
  }

  async runQuery(sql: string, opts: RunQueryOptions): Promise<QueryResultSet[]> {
    const client = await this.db().connect();
    const pid = (client as unknown as { processID: number }).processID;
    this.running.set(opts.queryId, pid);
    try {
      const result = await client.query({ text: sql, rowMode: 'array' });
      const list = Array.isArray(result) ? result : [result];
      return list.map((res) => {
        const isSelect = (res.fields?.length ?? 0) > 0;
        const raw = (res.rows ?? []) as unknown[][];
        const truncated = raw.length > opts.maxRows;
        return {
          columns: (res.fields ?? []).map((f: pg.FieldDef) => ({
            name: f.name,
          })),
          rows: (truncated ? raw.slice(0, opts.maxRows) : raw).map((r) =>
            r.map(normalizeCell),
          ),
          rowCount: truncated ? opts.maxRows : raw.length,
          truncated,
          affectedRows: isSelect ? undefined : (res.rowCount ?? 0),
          statement: res.command,
        };
      });
    } catch (err) {
      throw new DriverError((err as Error).message);
    } finally {
      this.running.delete(opts.queryId);
      client.release();
    }
  }

  async cancelQuery(queryId: string): Promise<boolean> {
    const pid = this.running.get(queryId);
    if (pid === undefined) return false;
    const side = new pg.Client(this.poolConfig());
    try {
      await side.connect();
      await side.query('SELECT pg_cancel_backend($1)', [pid]);
      return true;
    } finally {
      await side.end().catch(() => {});
    }
  }

  async streamQuery(sql: string, sink: ExportSink): Promise<void> {
    const client = await this.db().connect();
    const BATCH = 1000;
    let sentCols = false;
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`DECLARE fluent_export NO SCROLL CURSOR FOR ${sql}`);
      for (;;) {
        const res = await client.query({
          text: `FETCH ${BATCH} FROM fluent_export`,
          rowMode: 'array',
        });
        if (!sentCols) {
          sink.columns(res.fields.map((f) => ({ name: f.name })));
          sentCols = true;
        }
        for (const r of res.rows as unknown[][]) {
          sink.row(r.map(normalizeCell));
        }
        if (res.rows.length < BATCH) break;
      }
      await client.query('CLOSE fluent_export');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new DriverError((err as Error).message);
    } finally {
      client.release();
    }
  }

  async estimateRows(sql: string): Promise<number | null> {
    // EXPLAIN plans the statement without executing it (safe for writes).
    try {
      const res = await this.db().query(`EXPLAIN (FORMAT JSON) ${sql}`);
      const plan = (res.rows[0]?.['QUERY PLAN'] ?? res.rows[0])?.[0]?.Plan;
      return estimateFromPlan(plan);
    } catch {
      return null;
    }
  }

  async activeSessions(): Promise<DbSession[]> {
    const res = await this.db().query(
      `SELECT pid,
              usename AS "user",
              datname AS database,
              state,
              CASE WHEN wait_event IS NOT NULL
                   THEN wait_event_type || ': ' || wait_event END AS wait_event,
              EXTRACT(MILLISECONDS FROM (now() - state_change))::bigint AS duration_ms,
              left(query, 500) AS query,
              pid = pg_backend_pid() AS current
       FROM pg_stat_activity
       WHERE backend_type = 'client backend'
       ORDER BY state_change DESC NULLS LAST`,
    );
    return res.rows.map((r) => ({
      id: String(r.pid),
      user: r.user ?? null,
      database: r.database ?? null,
      state: r.state ?? null,
      waitEvent: r.wait_event ?? null,
      durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
      query: r.query ?? null,
      current: r.current === true,
    }));
  }

  async killSession(
    id: string,
    opts: { terminate: boolean },
  ): Promise<boolean> {
    const fn = opts.terminate ? 'pg_terminate_backend' : 'pg_cancel_backend';
    const res = await this.db().query(`SELECT ${fn}($1) AS ok`, [Number(id)]);
    return res.rows[0]?.ok === true;
  }

  async blockingLocks(): Promise<LockWait[]> {
    const res = await this.db().query(
      `SELECT bd.pid AS blocked_pid,
              bd.usename AS blocked_user,
              left(bd.query, 300) AS blocked_query,
              bg.pid AS blocking_pid,
              bg.usename AS blocking_user,
              left(bg.query, 300) AS blocking_query,
              EXTRACT(MILLISECONDS FROM (now() - bd.query_start))::bigint AS waited_ms
       FROM pg_stat_activity bd
       JOIN LATERAL unnest(pg_blocking_pids(bd.pid)) AS blk(pid) ON true
       JOIN pg_stat_activity bg ON bg.pid = blk.pid
       ORDER BY waited_ms DESC NULLS LAST`,
    );
    return res.rows.map((r) => ({
      blockedPid: String(r.blocked_pid),
      blockedUser: r.blocked_user ?? null,
      blockedQuery: r.blocked_query ?? null,
      blockingPid: String(r.blocking_pid),
      blockingUser: r.blocking_user ?? null,
      blockingQuery: r.blocking_query ?? null,
      waitedMs: r.waited_ms != null ? Number(r.waited_ms) : null,
    }));
  }

  async healthChecks(): Promise<HealthFinding[]> {
    const db = this.db();
    const findings: HealthFinding[] = [];
    const asTable = (res: pg.QueryResult) => ({
      columns: res.fields.map((f) => f.name),
      rows: res.rows.map((r) =>
        res.fields.map((f) => {
          const v = r[f.name];
          return v == null ? null : typeof v === 'number' ? v : String(v);
        }),
      ),
    });
    const run = async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch {
        // best-effort — a failing check never sinks the report
      }
    };

    // Unused indexes (never scanned; skip PK/unique).
    await run(async () => {
      const res = await db.query(
        `SELECT s.schemaname AS schema, s.relname AS "table",
                s.indexrelname AS index,
                pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
         FROM pg_stat_user_indexes s
         JOIN pg_index i ON i.indexrelid = s.indexrelid
         WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
         ORDER BY pg_relation_size(s.indexrelid) DESC
         LIMIT 10`,
      );
      if (res.rows.length === 0) return;
      const drop = res.rows
        .map((r) => `DROP INDEX ${r.schema}.${r.index};`)
        .join('\n');
      findings.push({
        id: 'pg.unused_indexes',
        category: 'indexes',
        severity: 'warn',
        title: `${res.rows.length} index jamais utilisé(s)`,
        detail:
          'Ces index n’ont jamais été scannés (idx_scan = 0) : ils occupent de l’espace et ralentissent les écritures. Vérifie avant de les supprimer (statistiques remises à zéro ? usage saisonnier ?).',
        remediationSql: drop,
        table: asTable(res),
      });
    });

    // Missing-index candidates (heavy sequential scans).
    await run(async () => {
      const res = await db.query(
        `SELECT relname AS "table", seq_scan, idx_scan, n_live_tup AS rows
         FROM pg_stat_user_tables
         WHERE seq_scan > 50 AND seq_scan > COALESCE(idx_scan, 0) * 2
               AND n_live_tup > 10000
         ORDER BY seq_scan DESC
         LIMIT 10`,
      );
      if (res.rows.length === 0) return;
      findings.push({
        id: 'pg.seq_scans',
        category: 'indexes',
        severity: 'warn',
        title: `${res.rows.length} table(s) souvent parcourue(s) sans index`,
        detail:
          'Beaucoup de scans séquentiels par rapport aux scans d’index sur des tables volumineuses — souvent le signe d’un index manquant sur les colonnes de filtre/jointure. Analyse les requêtes concernées (EXPLAIN) pour cibler l’index.',
        table: asTable(res),
      });
    });

    // Bloat / vacuum debt (dead tuples).
    await run(async () => {
      const res = await db.query(
        `SELECT relname AS "table", n_dead_tup AS dead, n_live_tup AS live,
                round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct
         FROM pg_stat_user_tables
         WHERE n_dead_tup > 1000 AND n_dead_tup > 0.2 * (n_live_tup + 1)
         ORDER BY n_dead_tup DESC
         LIMIT 10`,
      );
      if (res.rows.length === 0) return;
      const vacuum = res.rows
        .map((r) => `VACUUM (ANALYZE) ${r.table};`)
        .join('\n');
      findings.push({
        id: 'pg.dead_tuples',
        category: 'maintenance',
        severity: 'warn',
        title: `${res.rows.length} table(s) à nettoyer (VACUUM)`,
        detail:
          'Forte proportion de lignes mortes : le VACUUM automatique est peut-être en retard. Un VACUUM récupère l’espace et rafraîchit les statistiques.',
        remediationSql: vacuum,
        table: asTable(res),
      });
    });

    // Slow queries (requires pg_stat_statements).
    await run(async () => {
      try {
        const res = await db.query(
          `SELECT round(total_exec_time::numeric, 0) AS total_ms,
                  calls,
                  round(mean_exec_time::numeric, 1) AS mean_ms,
                  left(query, 120) AS query
           FROM pg_stat_statements
           ORDER BY total_exec_time DESC
           LIMIT 8`,
        );
        if (res.rows.length === 0) return;
        findings.push({
          id: 'pg.slow_queries',
          category: 'performance',
          severity: 'info',
          title: 'Requêtes les plus coûteuses',
          detail:
            'Classées par temps d’exécution cumulé (extension pg_stat_statements). Cible les premières pour optimiser (index, réécriture).',
          table: asTable(res),
        });
      } catch {
        findings.push({
          id: 'pg.stat_statements_off',
          category: 'performance',
          severity: 'info',
          title: 'Analyse des requêtes lentes indisponible',
          detail:
            'L’extension pg_stat_statements n’est pas active. Active-la (shared_preload_libraries + CREATE EXTENSION) pour voir les requêtes les plus coûteuses ici.',
          remediationSql: 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;',
        });
      }
    });

    // Tables without a primary key.
    await run(async () => {
      const res = await db.query(
        `SELECT n.nspname AS schema, c.relname AS "table"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r'
               AND n.nspname NOT IN ('pg_catalog', 'information_schema')
               AND NOT EXISTS (
                 SELECT 1 FROM pg_constraint con
                 WHERE con.conrelid = c.oid AND con.contype = 'p'
               )
         ORDER BY 1, 2
         LIMIT 20`,
      );
      if (res.rows.length === 0) return;
      findings.push({
        id: 'pg.no_pk',
        category: 'schema',
        severity: 'info',
        title: `${res.rows.length} table(s) sans clé primaire`,
        detail:
          'Une clé primaire rend les lignes éditables dans la grille, aide la réplication et les jointures. À ajouter quand c’est pertinent.',
        table: asTable(res),
      });
    });

    // Connection pressure.
    await run(async () => {
      const res = await db.query(
        `SELECT count(*)::int AS used,
                current_setting('max_connections')::int AS max
         FROM pg_stat_activity`,
      );
      const used = Number(res.rows[0]?.used ?? 0);
      const max = Number(res.rows[0]?.max ?? 0);
      if (!max) return;
      const pct = Math.round((used / max) * 100);
      findings.push({
        id: 'pg.connections',
        category: 'connections',
        severity: pct >= 80 ? 'warn' : 'ok',
        title: `Connexions : ${used} / ${max} (${pct} %)`,
        detail:
          pct >= 80
            ? 'Proche de la limite de connexions. Envisage un pooler (PgBouncer) ou de réduire les connexions applicatives.'
            : 'Utilisation des connexions dans une plage saine.',
      });
    });

    return findings;
  }

  async explain(sql: string, opts: { analyze: boolean }): Promise<QueryPlan> {
    const options = ['FORMAT JSON'];
    if (opts.analyze) options.push('ANALYZE', 'BUFFERS');
    try {
      const res = await this.db().query(
        `EXPLAIN (${options.join(', ')}) ${sql}`,
      );
      const entry = (res.rows[0]?.['QUERY PLAN'] ?? res.rows[0])?.[0];
      return {
        engine: 'postgres',
        analyzed: opts.analyze,
        root: normalizePgPlan(entry, opts.analyze),
        rawText: JSON.stringify(entry, null, 2),
      };
    } catch (err) {
      throw new DriverError((err as Error).message);
    }
  }

  async selectRows(ref: TableRef, q: RowQuery): Promise<PageResult> {
    const structure = await this.getTableStructure(ref);
    const known = new Set(structure.columns.map((c) => c.name));
    const scoped = { ...ref, schema: ref.schema ?? DEFAULT_SCHEMA };

    const page = buildPage(this.dialect, scoped, q, known, structure.primaryKey);
    const db = this.db();

    // Fast path: no filter + no exact request → use the planner's row estimate
    // (reltuples) instead of a full COUNT(*), which is slow on big tables.
    const wantExact = q.exactCount || q.filters.length > 0;
    let estimate: number | null = null;
    if (!wantExact) {
      estimate = await this.approxRowCount(scoped);
    }

    const pageRes = await db.query({
      text: page.built.sql,
      values: page.built.params,
      rowMode: 'array',
    });
    let rows = (pageRes.rows as unknown[][]).map((r) => r.map(normalizeCell));
    if (page.reversed) rows = rows.reverse();

    let total: number | null;
    let approximate: boolean;
    if (!wantExact && estimate != null && estimate >= 0) {
      total = estimate;
      approximate = true;
    } else {
      const count = buildCount(this.dialect, scoped, q.filters, known);
      const countRes = await db.query({ text: count.sql, values: count.params });
      total = Number(countRes.rows[0]?.n ?? 0);
      approximate = false;
    }

    return {
      columns: structure.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
      })),
      rows,
      total,
      approximate,
      keysetColumn: page.keysetColumn,
      pkColumns: structure.primaryKey,
    };
  }

  /** Planner row estimate from pg_class.reltuples; null when unavailable. */
  private async approxRowCount(ref: TableRef): Promise<number | null> {
    const qualified = ref.schema ? `${ref.schema}.${ref.name}` : ref.name;
    try {
      const res = await this.db().query(
        `SELECT reltuples::bigint AS n FROM pg_class WHERE oid = $1::regclass`,
        [qualified],
      );
      const n = Number(res.rows[0]?.n ?? -1);
      // reltuples is -1 (or 0) before the table has ever been analyzed.
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  async mutateRows(ref: TableRef, changes: RowChanges): Promise<MutationResult> {
    const structure = await this.getTableStructure(ref);
    const known = new Set(structure.columns.map((c) => c.name));
    const scoped = { ...ref, schema: ref.schema ?? DEFAULT_SCHEMA };
    const stmts = buildMutations(
      this.dialect,
      scoped,
      changes,
      known,
      structure.primaryKey,
    );

    const client = await this.db().connect();
    const result: MutationResult = { inserted: 0, updated: 0, deleted: 0 };
    try {
      await client.query('BEGIN');
      for (const s of stmts.inserts) {
        const r = await client.query(s.sql, s.params);
        result.inserted += r.rowCount ?? 0;
      }
      for (const s of stmts.updates) {
        const r = await client.query(s.sql, s.params);
        if ((r.rowCount ?? 0) === 0) {
          throw new DriverError(
            'Update matched no row (row may have been modified elsewhere)',
            409,
          );
        }
        result.updated += r.rowCount ?? 0;
      }
      for (const s of stmts.deletes) {
        const r = await client.query(s.sql, s.params);
        result.deleted += r.rowCount ?? 0;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof DriverError) throw err;
      throw new DriverError((err as Error).message);
    } finally {
      client.release();
    }
    return result;
  }

  buildDdl(change: DdlChange): DdlPreview {
    return buildPostgresDdl(change);
  }

  async applyDdl(statements: string[]): Promise<void> {
    const client = await this.db().connect();
    try {
      await client.query('BEGIN');
      for (const s of statements) await client.query(s);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new DriverError((err as Error).message);
    } finally {
      client.release();
    }
  }

  async getViewDefinition(ref: TableRef): Promise<string | null> {
    const schema = ref.schema ?? DEFAULT_SCHEMA;
    const res = await this.db().query(
      `SELECT pg_get_viewdef(c.oid, true) AS def
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('v', 'm')`,
      [schema, ref.name],
    );
    return (res.rows[0]?.def as string | undefined) ?? null;
  }

  async refreshMaterializedView(
    ref: TableRef,
  ): Promise<{ concurrent: boolean }> {
    const schema = ref.schema ?? DEFAULT_SCHEMA;
    const db = this.db();
    const meta = await db.query(
      `SELECT c.relispopulated AS populated,
              EXISTS (
                SELECT 1 FROM pg_index i
                WHERE i.indrelid = c.oid AND i.indisunique
              ) AS has_unique
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'm'`,
      [schema, ref.name],
    );
    if (meta.rows.length === 0) {
      throw new DriverError(
        `Materialized view not found: ${schema}.${ref.name}`,
        404,
      );
    }
    // CONCURRENTLY avoids locking readers but requires the view to be already
    // populated and to carry at least one unique index.
    const concurrent = Boolean(
      meta.rows[0].populated && meta.rows[0].has_unique,
    );
    const q = this.dialect.quoteIdent;
    const ident = `${q(schema)}.${q(ref.name)}`;
    await db.query(
      `REFRESH MATERIALIZED VIEW ${concurrent ? 'CONCURRENTLY ' : ''}${ident}`,
    );
    return { concurrent };
  }

  async listViewDependencies(
    schema = DEFAULT_SCHEMA,
  ): Promise<Array<{ dependent: TableRef; source: TableRef }>> {
    // A view's rule (pg_rewrite) depends on every relation it reads. This
    // catches both plain and materialized views, which information_schema's
    // view_table_usage misses for matviews.
    const res = await this.db().query(
      `SELECT DISTINCT
              dv.relname AS dep_name, dn.nspname AS dep_schema,
              sv.relname AS src_name, sn.nspname AS src_schema
       FROM pg_depend d
       JOIN pg_rewrite r ON r.oid = d.objid
       JOIN pg_class dv ON dv.oid = r.ev_class
       JOIN pg_namespace dn ON dn.oid = dv.relnamespace
       JOIN pg_class sv ON sv.oid = d.refobjid
       JOIN pg_namespace sn ON sn.oid = sv.relnamespace
       WHERE d.classid = 'pg_rewrite'::regclass
         AND d.refclassid = 'pg_class'::regclass
         AND dv.relkind IN ('v', 'm')
         AND sv.relkind IN ('r', 'p', 'v', 'm')
         AND dv.oid <> sv.oid
         AND dn.nspname = $1`,
      [schema],
    );
    return res.rows.map((r) => ({
      dependent: { name: r.dep_name, schema: r.dep_schema },
      source: { name: r.src_name, schema: r.src_schema },
    }));
  }
}
