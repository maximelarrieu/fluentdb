import type { DdlChange, DdlPreview, NewColumn } from '@fluentdb/shared';
import { DriverError } from '../types.js';
import { mysqlDialect } from './dialect.js';

const q = mysqlDialect.quoteIdent;

function columnDef(col: NewColumn): string {
  let def = `${q(col.name)} ${col.dataType}`;
  if (!col.nullable) def += ' NOT NULL';
  if (col.isAutoIncrement) def += ' AUTO_INCREMENT';
  if (col.defaultValue !== null && col.defaultValue !== '') {
    def += ` DEFAULT ${col.defaultValue}`;
  }
  return def;
}

export function buildMysqlDdl(change: DdlChange): DdlPreview {
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
          `RENAME TABLE ${q(change.table)} TO ${q(change.newName)}`,
        ],
        warnings,
      };
    case 'addColumn':
      return {
        statements: [
          `ALTER TABLE ${q(change.table)} ADD COLUMN ${columnDef(change.column)}`,
        ],
        warnings,
      };
    case 'alterColumn': {
      // MySQL CHANGE COLUMN replaces the whole definition, so the full
      // target definition must be provided by the caller.
      if (change.dataType === undefined) {
        throw new DriverError(
          'MySQL requires the full column definition (type included) to alter a column',
        );
      }
      let def = `${q(change.newName ?? change.column)} ${change.dataType}`;
      if (change.nullable === false) def += ' NOT NULL';
      if (change.defaultValue != null && change.defaultValue !== '') {
        def += ` DEFAULT ${change.defaultValue}`;
      }
      warnings.push(
        'MySQL replaces the whole column definition — attributes not shown here (e.g. AUTO_INCREMENT) are dropped',
      );
      return {
        statements: [
          `ALTER TABLE ${q(change.table)} CHANGE COLUMN ${q(change.column)} ${def}`,
        ],
        warnings,
      };
    }
    case 'dropColumn':
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
      return {
        statements: [
          `DROP INDEX ${q(change.name)} ON ${q(change.table)}`,
        ],
        warnings,
      };
  }
}
