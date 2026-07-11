import type {
  AutocompleteCatalog,
  CellValue,
  ConnectionConfig,
  DatabaseInfo,
  DdlChange,
  DdlPreview,
  EngineKind,
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

export interface Dialect {
  name: 'PostgreSQL' | 'MySQL' | 'SQLite';
  /** Maps to @codemirror/lang-sql dialects on the client */
  cmDialect: 'postgres' | 'mysql' | 'sqlite';
  quoteIdent(name: string): string;
  /** 1-based parameter placeholder: $1 / ? */
  placeholder(index: number): string;
  /** Column types offered in the structure editor */
  typeNames: string[];
}

export interface DriverCapabilities {
  multipleDatabases: boolean;
  schemas: boolean;
  cancelQuery: boolean;
  transactionalDdl: boolean;
  /** Whether ALTER COLUMN type/nullability/default is supported */
  alterColumn: boolean;
  /** Whether estimateRows() can return a meaningful estimate */
  estimateRows: boolean;
  /** Whether explain() returns a query plan tree */
  explain: boolean;
  /** Whether EXPLAIN ANALYZE (real metrics) is supported */
  explainAnalyze: boolean;
  /** Whether materialized views exist (refresh, populated state) */
  materializedViews: boolean;
}

export interface RunQueryOptions {
  queryId: string;
  maxRows: number;
}

/**
 * One Driver instance == one live connection (pool) to one database.
 * All introspection results are normalized to the shared types — the rest
 * of the app never sees engine-specific shapes.
 */
export interface Driver {
  readonly engine: EngineKind;
  readonly dialect: Dialect;
  readonly capabilities: DriverCapabilities;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<void>;
  serverVersion(): Promise<string>;

  listDatabases(): Promise<DatabaseInfo[]>;
  listSchemas(): Promise<SchemaInfo[]>;
  listTables(schema?: string): Promise<TableInfo[]>;
  getTableStructure(ref: TableRef): Promise<TableStructure>;
  getAutocompleteCatalog(): Promise<AutocompleteCatalog>;

  /**
   * Fuzzy catalog search across objects (tables/views/matviews) and column
   * names, for the global command palette. Returns at most `limit` hits.
   */
  searchObjects(query: string, limit?: number): Promise<SearchHit[]>;

  runQuery(sql: string, opts: RunQueryOptions): Promise<QueryResultSet[]>;
  /** Returns true if a running query was found and a cancel was issued. */
  cancelQuery(queryId: string): Promise<boolean>;

  /**
   * Estimate how many rows a statement would affect, via a dry-run EXPLAIN
   * that does NOT execute it. Returns null when unsupported or on failure.
   */
  estimateRows(sql: string): Promise<number | null>;

  /**
   * Return a normalized execution-plan tree. `analyze: true` asks for real
   * metrics (runs the query) — callers must only pass it for read statements.
   */
  explain(sql: string, opts: { analyze: boolean }): Promise<QueryPlan>;

  selectRows(ref: TableRef, q: RowQuery): Promise<PageResult>;
  mutateRows(ref: TableRef, changes: RowChanges): Promise<MutationResult>;

  /** Pure: DdlChange -> SQL statements + warnings. Never executes. */
  buildDdl(change: DdlChange): DdlPreview;
  applyDdl(statements: string[]): Promise<void>;

  /**
   * Read-only diagnostic checks over the engine's catalogs / stat views:
   * unused indexes, missing-index candidates, maintenance debt, slow queries,
   * tables without a primary key, connection pressure… Each finding may carry
   * a remediation SQL for the user to review. Engine-specific; best-effort
   * (individual checks that fail are skipped, never throwing the whole report).
   */
  healthChecks(): Promise<HealthFinding[]>;

  /**
   * The defining SQL of a view or materialized view, or null when the object
   * has no definition (a plain table) or the engine cannot provide one.
   */
  getViewDefinition?(ref: TableRef): Promise<string | null>;

  /**
   * Rebuild a materialized view's stored data (`REFRESH MATERIALIZED VIEW`).
   * Uses CONCURRENTLY when the view is populated and has a unique index, so
   * reads are not blocked; `concurrent` in the result says which path ran.
   * Only defined by engines whose capabilities.materializedViews is true.
   */
  refreshMaterializedView?(ref: TableRef): Promise<{ concurrent: boolean }>;

  /**
   * Data lineage: for each view / materialized view, the tables and views it
   * reads from. Powers the lineage edges in the ERD. Only defined by engines
   * that can resolve it (PostgreSQL); absent elsewhere.
   */
  listViewDependencies?(
    schema?: string,
  ): Promise<Array<{ dependent: TableRef; source: TableRef }>>;
}

export type DriverFactory = (config: ConnectionConfig, database?: string) => Driver;

/** JSON-safe cell normalization shared by all drivers. */
export function normalizeCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value as CellValue;
  if (t === 'number') {
    return Number.isFinite(value as number) ? (value as number) : String(value);
  }
  if (t === 'bigint') return (value as bigint).toString();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (value instanceof Buffer || value instanceof Uint8Array) {
    const buf = Buffer.from(value);
    return `\\x${buf.toString('hex').slice(0, 2000)}`;
  }
  // json / arrays / composite types
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class DriverError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
