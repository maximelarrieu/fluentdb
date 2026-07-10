import type { Dialect } from '../types.js';

export const sqliteDialect: Dialect = {
  name: 'SQLite',
  cmDialect: 'sqlite',
  quoteIdent: (name) => `"${name.replaceAll('"', '""')}"`,
  placeholder: () => '?',
  typeNames: [
    'INTEGER',
    'REAL',
    'TEXT',
    'BLOB',
    'NUMERIC',
    'BOOLEAN',
    'DATE',
    'DATETIME',
    'JSON',
  ],
};
