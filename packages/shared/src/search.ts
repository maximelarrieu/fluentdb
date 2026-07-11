import type { TableKind } from './schema.js';

export type SearchHitKind = 'table' | 'view' | 'matview' | 'column';

export interface SearchHit {
  kind: SearchHitKind;
  /** Object name, or column name when kind is 'column'. */
  name: string;
  schema?: string;
  /** For a column hit: the table/view it belongs to. */
  table?: string;
  /** For a column hit: the kind of the owning object (to open it correctly). */
  tableKind?: TableKind;
  /** For a column hit: its data type. */
  dataType?: string;
}
