import type {
  AutocompleteCatalog,
  CellValue,
  ConnectionConfig,
  DatabaseInfo,
  DdlChange,
  DdlPreview,
  EngineKind,
  MutationResult,
  PageResult,
  QueryResultSet,
  RowChanges,
  RowQuery,
  SchemaInfo,
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

  runQuery(sql: string, opts: RunQueryOptions): Promise<QueryResultSet[]>;
  /** Returns true if a running query was found and a cancel was issued. */
  cancelQuery(queryId: string): Promise<boolean>;

  selectRows(ref: TableRef, q: RowQuery): Promise<PageResult>;
  mutateRows(ref: TableRef, changes: RowChanges): Promise<MutationResult>;

  /** Pure: DdlChange -> SQL statements + warnings. Never executes. */
  buildDdl(change: DdlChange): DdlPreview;
  applyDdl(statements: string[]): Promise<void>;
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
