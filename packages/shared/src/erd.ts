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
  columns: ErdColumn[];
}

export interface ErdRelation {
  name: string;
  from: { table: string; schema?: string; columns: string[] };
  to: { table: string; schema?: string; columns: string[] };
}

export interface ErdSchema {
  tables: ErdTable[];
  relations: ErdRelation[];
  /** Number of tables omitted if the schema was too large to fully load */
  truncated?: number;
}
