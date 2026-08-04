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
