import type { DdlChange, DdlPreview, NewColumn } from '@fluentdb/shared';
import { DriverError } from '../types.js';
import { sqliteDialect } from './dialect.js';

const q = sqliteDialect.quoteIdent;

function columnDef(col: NewColumn, inlinePk: boolean): string {
  let def = `${q(col.name)} ${col.dataType}`;
  if (inlinePk && col.isPrimaryKey) {
    def += ' PRIMARY KEY';
    if (col.isAutoIncrement) def += ' AUTOINCREMENT';
  }
  if (!col.nullable) def += ' NOT NULL';
  if (col.defaultValue !== null && col.defaultValue !== '') {
    def += ` DEFAULT ${col.defaultValue}`;
  }
  return def;
}

export function buildSqliteDdl(change: DdlChange): DdlPreview {
  const warnings: string[] = [];
  switch (change.kind) {
    case 'createTable': {
      const pkCols = change.columns.filter((c) => c.isPrimaryKey);
      // AUTOINCREMENT requires the inline `INTEGER PRIMARY KEY` form.
      const inlinePk =
        pkCols.length === 1 &&
        pkCols[0]!.dataType.toUpperCase() === 'INTEGER';
      const defs = change.columns.map((c) => columnDef(c, inlinePk));
      if (!inlinePk && pkCols.length > 0) {
        defs.push(`PRIMARY KEY (${pkCols.map((c) => q(c.name)).join(', ')})`);
      }
      return {
        statements: [
          `CREATE TABLE ${q(change.table)} (\n  ${defs.join(',\n  ')}\n)`,
        ],
        warnings,
      };
    }
    case 'dropTable':
      return { statements: [`DROP TABLE ${q(change.table)}`], warnings };
    case 'renameTable':
      return {
        statements: [
          `ALTER TABLE ${q(change.table)} RENAME TO ${q(change.newName)}`,
        ],
        warnings,
      };
    case 'addColumn': {
      if (change.column.isPrimaryKey) {
        throw new DriverError(
          'SQLite cannot add a PRIMARY KEY column to an existing table',
        );
      }
      if (!change.column.nullable && change.column.defaultValue === null) {
        warnings.push(
          'Adding a NOT NULL column without a default fails on non-empty tables',
        );
      }
      return {
        statements: [
          `ALTER TABLE ${q(change.table)} ADD COLUMN ${columnDef(change.column, false)}`,
        ],
        warnings,
      };
    }
    case 'alterColumn': {
      const wantsMoreThanRename =
        change.dataType !== undefined ||
        change.nullable !== undefined ||
        change.defaultValue !== undefined;
      if (wantsMoreThanRename) {
        throw new DriverError(
          'SQLite only supports renaming columns. Changing type, nullability or default requires recreating the table (use the SQL editor).',
        );
      }
      if (!change.newName) {
        throw new DriverError('Nothing to change');
      }
      return {
        statements: [
          `ALTER TABLE ${q(change.table)} RENAME COLUMN ${q(change.column)} TO ${q(change.newName)}`,
        ],
        warnings,
      };
    }
    case 'dropColumn':
      warnings.push('DROP COLUMN requires SQLite 3.35+');
      return {
        statements: [
          `ALTER TABLE ${q(change.table)} DROP COLUMN ${q(change.column)}`,
        ],
        warnings,
      };
    case 'createIndex':
      return {
        statements: [
          `CREATE ${change.unique ? 'UNIQUE ' : ''}INDEX ${q(change.name)} ON ${q(change.table)} (${change.columns.map(q).join(', ')})`,
        ],
        warnings,
      };
    case 'dropIndex':
      return { statements: [`DROP INDEX ${q(change.name)}`], warnings };
  }
}
