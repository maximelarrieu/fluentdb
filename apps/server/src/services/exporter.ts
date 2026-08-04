import type {
  CellValue,
  ExportFormat,
  QueryColumn,
  QueryResultSet,
} from '@fluentdb/shared';

export function csvEscape(value: CellValue): string {
  if (value === null) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function toCsv(result: QueryResultSet): string {
  const lines: string[] = [];
  lines.push(result.columns.map((c) => csvEscape(c.name)).join(','));
  for (const row of result.rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function toJson(result: QueryResultSet): string {
  const objects = result.rows.map((row) => {
    const obj: Record<string, CellValue> = {};
    result.columns.forEach((c, i) => {
      obj[c.name] = row[i] ?? null;
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

/** Escape a cell for a Markdown table cell (pipes, newlines). */
function mdEscape(value: CellValue): string {
  if (value === null) return '';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Render a value as a portable SQL literal (double-quoted idents elsewhere). */
export function sqlLiteral(value: CellValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Double-quote a SQL identifier, escaping embedded quotes. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export const exportContentType: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  sql: 'application/sql; charset=utf-8',
};

export const exportExtension: Record<ExportFormat, string> = {
  csv: 'csv',
  json: 'json',
  markdown: 'md',
  sql: 'sql',
};

/**
 * A streaming writer that serializes a result set to one of the export
 * formats, one row at a time, so large exports never buffer in memory.
 * The caller feeds columns once, then each row, then calls `end()`.
 */
export interface ExportWriter {
  columns(cols: QueryColumn[]): void;
  row(values: CellValue[]): void;
  end(): void;
}

export function createExportWriter(
  format: ExportFormat,
  write: (chunk: string) => void,
  opts: { tableName?: string } = {},
): ExportWriter {
  let cols: QueryColumn[] = [];
  let first = true;
  const table = quoteIdent((opts.tableName || 'export').replace(/[\r\n]/g, ' '));

  if (format === 'json') write('[');

  return {
    columns(c) {
      cols = c;
      if (format === 'csv') {
        write(c.map((x) => csvEscape(x.name)).join(',') + '\r\n');
      } else if (format === 'markdown') {
        write(`| ${c.map((x) => mdEscape(x.name)).join(' | ')} |\n`);
        write(`| ${c.map(() => '---').join(' | ')} |\n`);
      }
    },
    row(values) {
      if (format === 'csv') {
        write(values.map(csvEscape).join(',') + '\r\n');
      } else if (format === 'markdown') {
        write(`| ${values.map(mdEscape).join(' | ')} |\n`);
      } else if (format === 'sql') {
        const names = cols.map((c) => quoteIdent(c.name)).join(', ');
        const vals = values.map(sqlLiteral).join(', ');
        write(`INSERT INTO ${table} (${names}) VALUES (${vals});\n`);
      } else {
        const obj: Record<string, CellValue> = {};
        cols.forEach((c, i) => {
          obj[c.name] = values[i] ?? null;
        });
        write((first ? '\n' : ',\n') + JSON.stringify(obj));
        first = false;
      }
    },
    end() {
      if (format === 'json') write('\n]\n');
    },
  };
}
