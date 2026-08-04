import { describe, expect, it } from 'vitest';
import type { QueryColumn } from '@fluentdb/shared';
import {
  createExportWriter,
  sqlLiteral,
} from '../src/services/exporter.js';

const cols: QueryColumn[] = [
  { name: 'id', dataType: 'int' },
  { name: 'label', dataType: 'text' },
];

function run(format: Parameters<typeof createExportWriter>[0], tableName?: string) {
  let out = '';
  const w = createExportWriter(format, (c) => (out += c), { tableName });
  w.columns(cols);
  w.row([1, "O'Brien"]);
  w.row([2, null]);
  w.end();
  return out;
}

describe('createExportWriter', () => {
  it('renders a Markdown table with header separator', () => {
    const md = run('markdown');
    expect(md).toBe(
      '| id | label |\n| --- | --- |\n| 1 | O\'Brien |\n| 2 |  |\n',
    );
  });

  it('renders SQL INSERT statements with quoted idents and escaped literals', () => {
    const sql = run('sql', 'people');
    expect(sql).toContain(
      `INSERT INTO "people" ("id", "label") VALUES (1, 'O''Brien');`,
    );
    expect(sql).toContain(
      `INSERT INTO "people" ("id", "label") VALUES (2, NULL);`,
    );
  });

  it('produces a valid JSON array', () => {
    const parsed = JSON.parse(run('json'));
    expect(parsed).toEqual([
      { id: 1, label: "O'Brien" },
      { id: 2, label: null },
    ]);
  });

  it('csv escapes quotes/commas and blanks nulls', () => {
    let out = '';
    const w = createExportWriter('csv', (c) => (out += c));
    w.columns(cols);
    w.row([1, 'a,b']);
    w.row([2, null]);
    w.end();
    expect(out).toBe('id,label\r\n1,"a,b"\r\n2,\r\n');
  });
});

describe('sqlLiteral', () => {
  it('quotes strings, passes numbers/bools, and maps null to NULL', () => {
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(42)).toBe('42');
    expect(sqlLiteral(true)).toBe('TRUE');
    expect(sqlLiteral("it's")).toBe("'it''s'");
  });
});
