export interface DatabaseInfo {
  name: string;
  isDefault?: boolean;
}

export interface SchemaInfo {
  name: string;
  isDefault?: boolean;
}

export type TableKind = 'table' | 'view' | 'matview';

export interface TableInfo {
  name: string;
  schema?: string;
  kind: TableKind;
  rowEstimate?: number | null;
  comment?: string | null;
  /** Materialized views only: whether the view currently holds data. */
  isPopulated?: boolean | null;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  comment?: string | null;
  ordinal: number;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedSchema?: string;
  referencedColumns: string[];
}

export interface TableStructure {
  table: TableInfo;
  columns: ColumnInfo[];
  primaryKey: string[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export type RoutineKind = 'function' | 'procedure';

/** A stored function or procedure. `definition` is the CREATE statement. */
export interface RoutineInfo {
  name: string;
  schema?: string;
  kind: RoutineKind;
  /** Return type (functions) — null for procedures / when unavailable. */
  returns?: string | null;
  /** Formatted argument list, e.g. "oid integer". */
  args?: string | null;
  language?: string | null;
  definition?: string | null;
}

/** A table trigger. */
export interface TriggerInfo {
  name: string;
  schema?: string;
  /** The table the trigger fires on. */
  table: string;
  /** BEFORE / AFTER / INSTEAD OF (when known). */
  timing?: string | null;
  /** INSERT / UPDATE / DELETE … */
  events?: string[];
  definition?: string | null;
}

/** { "schema.table" | "table": [columns] } — feeds CodeMirror's schema-aware completion. */
export type AutocompleteCatalog = Record<string, string[]>;

export interface TableRef {
  database?: string;
  schema?: string;
  name: string;
}
