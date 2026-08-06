import type { CellValue, ExportFormat, QueryColumn } from '@fluentdb/shared';

export const EXPORT_EXT: Record<ExportFormat, string> = {
  csv: 'csv',
  json: 'json',
  markdown: 'md',
  sql: 'sql',
};

export const EXPORT_LABEL: Record<ExportFormat, string> = {
  csv: 'CSV',
  json: 'JSON',
  markdown: 'Markdown',
  sql: 'SQL (INSERT)',
};

export const exportFormatOrder: ExportFormat[] = ['csv', 'json', 'markdown', 'sql'];

/** POST an export request and trigger a browser download of the streamed file. */
export async function postDownload(
  url: string,
  body: unknown,
  baseName: string,
  format: ExportFormat,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Échec de l'export");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${baseName}.${EXPORT_EXT[format]}`;
  a.click();
  URL.revokeObjectURL(href);
}

/** Render loaded rows as a Markdown table (for clipboard — Slack/Notion). */
export function rowsToMarkdown(columns: QueryColumn[], rows: CellValue[][]): string {
  const esc = (v: CellValue) =>
    v === null ? '' : String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const head = `| ${columns.map((c) => esc(c.name)).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(esc).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

/** Render loaded rows as tab-separated values (for clipboard — spreadsheets). */
export function rowsToTsv(columns: QueryColumn[], rows: CellValue[][]): string {
  const esc = (v: CellValue) =>
    v === null ? '' : String(v).replace(/[\t\r\n]/g, ' ');
  const head = columns.map((c) => esc(c.name)).join('\t');
  const body = rows.map((r) => r.map(esc).join('\t'));
  return [head, ...body].join('\n');
}

function csvEscape(v: CellValue): string {
  if (v === null) return '';
  const s = typeof v === 'string' ? v : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function rowsToCsv(columns: QueryColumn[], rows: CellValue[][]): string {
  const lines = [columns.map((c) => csvEscape(c.name)).join(',')];
  for (const r of rows) lines.push(r.map((v) => csvEscape(v ?? null)).join(','));
  return lines.join('\r\n') + '\r\n';
}

function rowsToJson(columns: QueryColumn[], rows: CellValue[][]): string {
  const objs = rows.map((r) => {
    const o: Record<string, CellValue> = {};
    columns.forEach((c, i) => (o[c.name] = r[i] ?? null));
    return o;
  });
  return JSON.stringify(objs, null, 2);
}

function sqlLiteral(v: CellValue): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function rowsToSqlInserts(
  columns: QueryColumn[],
  rows: CellValue[][],
  table: string,
): string {
  const t = `"${table.replace(/"/g, '""')}"`;
  const cols = columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(', ');
  return (
    rows
      .map(
        (r) =>
          `INSERT INTO ${t} (${cols}) VALUES (${r
            .map((v) => sqlLiteral(v ?? null))
            .join(', ')});`,
      )
      .join('\n') + '\n'
  );
}

const EXPORT_MIME: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  sql: 'application/sql;charset=utf-8',
};

/** Trigger a download of in-memory text as a file. */
export function downloadText(
  baseName: string,
  format: ExportFormat,
  text: string,
): void {
  const blob = new Blob([text], { type: EXPORT_MIME[format] });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${baseName}.${EXPORT_EXT[format]}`;
  a.click();
  URL.revokeObjectURL(href);
}

/**
 * Export already-loaded rows to a file entirely client-side — no server
 * round-trip, no re-running the SQL. This is what query results use, so
 * multi-statement scripts, temp views and multiple result sets all export
 * cleanly (each result set is exported as what's displayed).
 */
export function exportRowsClient(
  format: ExportFormat,
  columns: QueryColumn[],
  rows: CellValue[][],
  baseName: string,
): void {
  const text =
    format === 'csv'
      ? rowsToCsv(columns, rows)
      : format === 'json'
        ? rowsToJson(columns, rows)
        : format === 'markdown'
          ? rowsToMarkdown(columns, rows) + '\n'
          : rowsToSqlInserts(columns, rows, baseName);
  downloadText(baseName, format, text);
}
