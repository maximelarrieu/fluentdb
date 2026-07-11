import type { TableKind } from './schema.js';

export interface ErdColumn {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  nullable: boolean;
}

export interface ErdTable {
  name: string;
  schema?: string;
  /** table (default when omitted), view or materialized view */
  kind?: TableKind;
  columns: ErdColumn[];
}

/**
 * `fk` (default) links a foreign-key column to its target. `lineage` links a
 * view / materialized view to a table or view it reads from.
 */
export type ErdRelationKind = 'fk' | 'lineage';

export interface ErdRelation {
  name: string;
  kind?: ErdRelationKind;
  from: { table: string; schema?: string; columns: string[] };
  to: { table: string; schema?: string; columns: string[] };
}

export interface ErdSchema {
  tables: ErdTable[];
  relations: ErdRelation[];
  /** Number of tables omitted if the schema was too large to fully load */
  truncated?: number;
}
