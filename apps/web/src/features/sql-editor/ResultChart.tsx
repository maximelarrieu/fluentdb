import { useMemo, useState } from 'react';
import type { CellValue, QueryColumn } from '@fluentdb/shared';
import { formatNumber } from '../../lib/format.js';
import { BarChart3 } from 'lucide-react';

const MAX_BARS = 40;

function toNumber(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Index of the first column that parses as numeric across the sampled rows. */
function firstNumericCol(columns: QueryColumn[], rows: CellValue[][]): number {
  const sample = rows.slice(0, 20);
  for (let c = 0; c < columns.length; c++) {
    if (sample.length > 0 && sample.every((r) => toNumber(r[c]!) !== null)) {
      return c;
    }
  }
  return -1;
}

/**
 * One-click visualization of a result set: a horizontal bar chart (label
 * column × numeric column), sorted descending, top-N. Single-hue by design,
 * with direct value labels and column pickers. The grid stays the accessible
 * source of truth — this is an optional lens toggled from the results toolbar.
 */
export function ResultChart({
  columns,
  rows,
}: {
  columns: QueryColumn[];
  rows: CellValue[][];
}) {
  const defaultValue = useMemo(
    () => firstNumericCol(columns, rows),
    [columns, rows],
  );
  // Label defaults to the first column that isn't the value column.
  const defaultLabel = useMemo(() => {
    const i = columns.findIndex((_, idx) => idx !== defaultValue);
    return i === -1 ? 0 : i;
  }, [columns, defaultValue]);

  const [labelCol, setLabelCol] = useState(defaultLabel);
  const [valueCol, setValueCol] = useState(defaultValue);

  const data = useMemo(() => {
    if (valueCol < 0) return [];
    return rows
      .map((r) => ({
        label: r[labelCol] == null ? '∅' : String(r[labelCol]),
        value: toNumber(r[valueCol]!) ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_BARS);
  }, [rows, labelCol, valueCol]);

  if (defaultValue < 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-muted text-sm p-6 text-center">
        <BarChart3 size={32} strokeWidth={1.2} className="opacity-50" />
        <p>Aucune colonne numérique à visualiser.</p>
        <p className="text-xs max-w-xs">
          Ajoute une colonne de valeurs (COUNT, SUM, un montant…) pour tracer un
          graphique.
        </p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 0);
  const min = Math.min(...data.map((d) => d.value), 0);
  // Bars are anchored at zero; support negative values by splitting the track.
  const span = max - Math.min(min, 0) || 1;

  return (
    <div className="h-full flex flex-col">
      {/* Column pickers — which field is the label, which is the value. */}
      <div className="flex items-center gap-3 px-3 h-9 border-b border-border-soft text-[12px] text-muted shrink-0">
        <label className="flex items-center gap-1.5">
          Libellé
          <select
            value={labelCol}
            onChange={(e) => setLabelCol(Number(e.target.value))}
            className="h-6 rounded bg-bg border border-border px-1 text-[12px] text-text outline-none focus:border-accent"
          >
            {columns.map((c, i) => (
              <option key={c.name} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Valeur
          <select
            value={valueCol}
            onChange={(e) => setValueCol(Number(e.target.value))}
            className="h-6 rounded bg-bg border border-border px-1 text-[12px] text-text outline-none focus:border-accent"
          >
            {columns.map((c, i) => (
              <option key={c.name} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {rows.length > MAX_BARS && (
          <span className="ml-auto text-[11px]">
            {MAX_BARS} premières valeurs (sur {formatNumber(rows.length)})
          </span>
        )}
      </div>

      <div
        className="flex-1 overflow-auto p-3 flex flex-col gap-1"
        role="img"
        aria-label={`Graphique à barres : ${columns[valueCol]?.name} par ${columns[labelCol]?.name}`}
      >
        {data.map((d, i) => {
          const pct = ((d.value - Math.min(min, 0)) / span) * 100;
          return (
            <div key={i} className="flex items-center gap-2 h-6 text-[12px] group">
              <span
                className="w-40 shrink-0 truncate text-right text-muted group-hover:text-text"
                title={d.label}
              >
                {d.label}
              </span>
              <div className="flex-1 relative h-4 rounded-sm bg-panel-2 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm bg-accent/70 group-hover:bg-accent transition-colors"
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 mono tabular-nums text-right">
                {formatNumber(d.value)}
              </span>
            </div>
          );
        })}
        {data.length === 0 && (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            Aucune donnée à tracer.
          </div>
        )}
      </div>
    </div>
  );
}
