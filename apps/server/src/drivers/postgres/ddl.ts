import type { DdlChange, DdlPreview, NewColumn } from '@fluentdb/shared';
import { DriverError } from '../types.js';
import { postgresDialect } from './dialect.js';

const q = postgresDialect.quoteIdent;

function tableName(schema: string | undefined, table: string): string {
  return schema ? `${q(schema)}.${q(table)}` : q(table);
}

function columnDef(col: NewColumn): string {
  const type = col.isAutoIncrement
    ? col.dataType.toLowerCase() === 'bigint'
      ? 'bigint GENERATED ALWAYS AS IDENTITY'
      : 'integer GENERATED ALWAYS AS IDENTITY'
    : col.dataType;
  let def = `${q(col.name)} ${type}`;
  if (!col.nullable) def += ' NOT NULL';
  if (col.defaultValue !== null && col.defaultValue !== '') {
    def += ` DEFAULT ${col.defaultValue}`;
  }
  return def;
}

export function buildPostgresDdl(change: DdlChange): DdlPreview {
  const warnings: string[] = [];
  switch (change.kind) {
    case 'createTable': {
      const defs = change.columns.map(columnDef);
      const pk = change.columns.filter((c) => c.isPrimaryKey);
      if (pk.length > 0) {
        defs.push(`PRIMARY KEY (${pk.map((c) => q(c.name)).join(', ')})`);
      }
      return {
        statements: [
          `CREATE TABLE ${tableName(change.schema, change.table)} (\n  ${defs.join(',\n  ')}\n)`,
        ],
        warnings,
      };
    }
    case 'dropTable':
      return {
        statements: [`DROP TABLE ${tableName(change.schema, change.table)}`],
        warnings,
      };
    case 'renameTable':
      return {
        statements: [
          `ALTER TABLE ${tableName(change.schema, change.table)} RENAME TO ${q(change.newName)}`,
        ],
        warnings,
      };
    case 'addColumn':
      return {
        statements: [
          `ALTER TABLE ${tableName(change.schema, change.table)} ADD COLUMN ${columnDef(change.column)}`,
        ],
        warnings,
      };
    case 'alterColumn': {
      const t = tableName(change.schema, change.table);
      const col = q(change.column);
      const statements: string[] = [];
      if (change.dataType !== undefined) {
        statements.push(
          `ALTER TABLE ${t} ALTER COLUMN ${col} TYPE ${change.dataType} USING ${col}::${change.dataType}`,
        );
      }
      if (change.nullable !== undefined) {
        statements.push(
          `ALTER TABLE ${t} ALTER COLUMN ${col} ${change.nullable ? 'DROP' : 'SET'} NOT NULL`,
        );
      }
      if (change.defaultValue !== undefined) {
        statements.push(
          change.defaultValue === null || change.defaultValue === ''
            ? `ALTER TABLE ${t} ALTER COLUMN ${col} DROP DEFAULT`
            : `ALTER TABLE ${t} ALTER COLUMN ${col} SET DEFAULT ${change.defaultValue}`,
        );
      }
      if (change.newName !== undefined && change.newName !== change.column) {
        statements.push(
          `ALTER TABLE ${t} RENAME COLUMN ${col} TO ${q(change.newName)}`,
        );
      }
      if (statements.length === 0) throw new DriverError('Nothing to change');
      return { statements, warnings };
    }
    case 'dropColumn':
      return {
        statements: [
          `ALTER TABLE ${tableName(change.schema, change.table)} DROP COLUMN ${q(change.column)}`,
        ],
        warnings,
      };
    case 'createIndex':
      return {
        statements: [
          `CREATE ${change.unique ? 'UNIQUE ' : ''}INDEX ${q(change.name)} ON ${tableName(change.schema, change.table)} (${change.columns.map(q).join(', ')})`,
        ],
        warnings,
      };
    case 'dropIndex':
      return {
        statements: [
          `DROP INDEX ${change.schema ? `${q(change.schema)}.` : ''}${q(change.name)}`,
        ],
        warnings,
      };
  }
}
