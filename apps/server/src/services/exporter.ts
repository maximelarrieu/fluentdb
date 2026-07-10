import type { CellValue, QueryResultSet } from '@fluentdb/shared';

function csvEscape(value: CellValue): string {
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
