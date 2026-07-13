import { useMemo } from 'react';
import type {
  CellValue,
  QueryColumn,
  WidgetViz,
  WidgetOrientation,
} from '@fluentdb/shared';
import { formatNumber } from '../../lib/format.js';
import { DataGrid } from '../data-grid/DataGrid.js';
import { SERIES_COLORS } from '../tasks/trend.js';

function toNumber(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstNumericCol(columns: QueryColumn[], rows: CellValue[][]): number {
  const sample = rows.slice(0, 20);
  for (let c = 0; c < columns.length; c++) {
    if (sample.length > 0 && sample.every((r) => toNumber(r[c]!) !== null)) return c;
  }
  return -1;
}

/** Renders a result set as the chosen visualization. Headless — no toolbar. */
export function WidgetChart({
  columns,
  rows,
  viz,
  orientation = 'horizontal',
}: {
  columns: QueryColumn[];
  rows: CellValue[][];
  viz: WidgetViz;
  orientation?: WidgetOrientation;
}) {
  const valueCol = useMemo(() => firstNumericCol(columns, rows), [columns, rows]);
  const labelCol = useMemo(
    () => columns.findIndex((_, i) => i !== valueCol),
    [columns, valueCol],
  );

  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-xs">
        Aucune donnée
      </div>
    );
  }

  if (viz === 'table') {
    return <DataGrid columns={columns} rows={rows} />;
  }

  if (viz === 'number') {
    const col = valueCol >= 0 ? valueCol : 0;
    const raw = rows[0]?.[col];
    const n = toNumber(raw ?? null);
    return (
      <div className="h-full flex items-center justify-center p-3">
        <span className="text-4xl font-semibold tabular-nums mono truncate">
          {n != null ? formatNumber(n) : String(raw ?? '—')}
        </span>
      </div>
    );
  }

  if (valueCol < 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-xs px-3 text-center">
        Aucune colonne numérique à tracer.
      </div>
    );
  }

  const data = rows
    .map((r) => ({
      label: r[labelCol] == null ? '∅' : String(r[labelCol]),
      value: toNumber(r[valueCol]!) ?? 0,
    }))
    .slice(0, viz === 'pie' ? 8 : 50);

  if (viz === 'bar')
    return orientation === 'vertical' ? (
      <VerticalBarChart data={data} />
    ) : (
      <BarChart data={data} />
    );
  if (viz === 'line') return <LineChart data={data} />;
  return <PieChart data={data} />;
}

type Datum = { label: string; value: number };

function BarChart({ data }: { data: Datum[] }) {
  // Render in QUERY ORDER (respect the SQL ORDER BY — never re-sort here), and
  // scale bars by MAGNITUDE so the largest |value| gets the longest bar. This
  // makes "most negative first / biggest bar" Pareto charts work by simply
  // writing ORDER BY metric ASC.
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 0) || 1;
  // Only sign-color when the series mixes signs; a single-sign series stays
  // one hue (cleaner, per data-viz guidance).
  const mixed =
    data.some((d) => d.value < 0) && data.some((d) => d.value > 0);
  return (
    <div className="h-full overflow-auto p-2 flex flex-col gap-1">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2 h-5 text-[11px] group">
          <span className="w-24 shrink-0 truncate text-right text-muted" title={d.label}>
            {d.label}
          </span>
          <div className="flex-1 relative h-3.5 rounded-sm bg-panel-2 overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-sm ${
                mixed && d.value < 0 ? 'bg-red/60' : 'bg-accent/70'
              }`}
              style={{ width: `${Math.max((Math.abs(d.value) / maxAbs) * 100, 0.5)}%` }}
            />
          </div>
          <span className="w-16 shrink-0 mono tabular-nums text-right">
            {formatNumber(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function VerticalBarChart({ data }: { data: Datum[] }) {
  // Zero-baseline vertical bars in query order: positives rise, negatives hang
  // below zero (matches a classic Pareto of negative impacts).
  const W = 600;
  const H = 240;
  const M = { l: 46, r: 10, t: 12, b: 46 };
  const vals = data.map((d) => d.value);
  const yMin = Math.min(...vals, 0);
  const yMax = Math.max(...vals, 0);
  const span = yMax - yMin || 1;
  const plotH = H - M.t - M.b;
  const y = (v: number) => M.t + ((yMax - v) / span) * plotH;
  const y0 = y(0);
  const band = (W - M.l - M.r) / Math.max(data.length, 1);
  const bw = Math.min(band * 0.7, 46);
  const mixed = vals.some((v) => v < 0) && vals.some((v) => v > 0);
  const ticks = [yMax, yMax - span / 2, yMin];
  return (
    <div className="h-full w-full p-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={M.l - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--color-muted)">
              {formatNumber(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = M.l + band * i + band / 2;
          const top = Math.min(y0, y(d.value));
          const h = Math.max(Math.abs(y(d.value) - y0), 0.5);
          const neg = mixed && d.value < 0;
          return (
            <g key={i}>
              <rect
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={h}
                rx={2}
                fill={neg ? 'var(--color-red)' : 'var(--color-accent)'}
                opacity={0.8}
              />
              <text
                x={cx}
                y={H - M.b + 12}
                textAnchor="end"
                fontSize={8}
                fill="var(--color-muted)"
                transform={`rotate(-45 ${cx} ${H - M.b + 12})`}
              >
                {d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LineChart({ data }: { data: Datum[] }) {
  const W = 600;
  const H = 220;
  const M = { l: 44, r: 12, t: 12, b: 28 };
  const ys = data.map((d) => d.value);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);
  const span = yMax - yMin || 1;
  const sx = (i: number) =>
    data.length <= 1
      ? (M.l + W - M.r) / 2
      : M.l + (i / (data.length - 1)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - yMin) / span) * (H - M.t - M.b);
  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(i)},${sy(d.value)}`)
    .join(' ');
  const ticks = [yMin, yMin + span / 2, yMax];
  return (
    <div className="h-full w-full p-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={M.l - 6} y={sy(t) + 3} textAnchor="end" fontSize={9} fill="var(--color-muted)">
              {formatNumber(t)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
        {data.map((d, i) => (
          <circle key={i} cx={sx(i)} cy={sy(d.value)} r={2.5} fill="var(--color-accent)" />
        ))}
      </svg>
    </div>
  );
}

function PieChart({ data }: { data: Datum[] }) {
  const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;
  let angle = -Math.PI / 2;
  const cx = 60;
  const cy = 60;
  const r = 52;
  const slices = data.map((d, i) => {
    const frac = Math.max(d.value, 0) / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const path =
      frac >= 0.9999
        ? `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`
        : `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large},1 ${x1},${y1} Z`;
    return { path, color: SERIES_COLORS[i % SERIES_COLORS.length]!, d, frac };
  });
  return (
    <div className="h-full flex items-center gap-3 p-3 overflow-auto">
      <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="var(--color-panel)" strokeWidth={1} />
        ))}
      </svg>
      <div className="flex flex-col gap-1 text-[11px] min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="truncate max-w-[120px]">{s.d.label}</span>
            <span className="ml-auto mono text-muted">{Math.round(s.frac * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
