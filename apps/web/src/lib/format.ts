import type { CellValue } from '@fluentdb/shared';

export function formatCell(value: CellValue): {
  text: string;
  kind: 'null' | 'bool' | 'number' | 'text' | 'blob' | 'json';
} {
  if (value === null) return { text: 'NULL', kind: 'null' };
  if (typeof value === 'boolean') {
    return { text: value ? 'true' : 'false', kind: 'bool' };
  }
  if (typeof value === 'number') return { text: String(value), kind: 'number' };
  if (value.startsWith('\\x')) return { text: value, kind: 'blob' };
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return { text: value, kind: 'json' };
  }
  return { text: value, kind: 'text' };
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat().format(n);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
