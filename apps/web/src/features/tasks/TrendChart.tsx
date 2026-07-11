import { useEffect, useMemo, useRef, useState } from 'react';
import type { Trend } from './trend.js';
import { formatNumber } from '../../lib/format.js';

const M = { l: 60, r: 16, t: 16, b: 34 };

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step / 1000; v += step) ticks.push(v);
  return ticks;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Multi-series line chart of a task's numeric trend over time. Inline SVG,
 * theme-aware (dark surface), with a legend (identity never by color alone),
 * direct end-labels for few series, and a hover crosshair + tooltip.
 */
export function TrendChart({
  trend,
  unit,
  threshold,
}: {
  trend: Trend;
  unit?: string;
  threshold?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [size, setSize] = useState({ W: 800, H: 320 });

  // Render at real pixel size (no SVG stretching → no distorted text).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setSize({ W: e.contentRect.width, H: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { W, H } = size;

  const model = useMemo(() => {
    const pts = trend.series.flatMap((s) => s.points);
    const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
    const xMin = xs[0] ?? 0;
    const xMax = xs.at(-1) ?? 1;
    const extra = threshold != null ? [threshold] : [];
    const yMaxRaw = Math.max(...pts.map((p) => p.y), 0, ...extra);
    const yMinRaw = Math.min(...pts.map((p) => p.y), 0, ...extra);
    const yTicks = niceTicks(yMinRaw, yMaxRaw || 1, 4);
    const yMax = Math.max(yMaxRaw, yTicks.at(-1) ?? 1);
    const yMin = Math.min(yMinRaw, yTicks[0] ?? 0);
    const sx = (x: number) =>
      xMax === xMin
        ? (M.l + (W - M.r)) / 2
        : M.l + ((x - xMin) / (xMax - xMin)) * (W - M.l - M.r);
    const sy = (y: number) =>
      yMax === yMin
        ? (M.t + (H - M.b)) / 2
        : H - M.b - ((y - yMin) / (yMax - yMin)) * (H - M.t - M.b);
    return { xs, xMin, xMax, yMin, yMax, yTicks, sx, sy };
  }, [trend, W, H, threshold]);

  const singleSeries = trend.series.length === 1;

  const onMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || model.xs.length === 0) return;
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    // nearest snapshot time to the cursor
    let nearest = model.xs[0]!;
    let best = Infinity;
    for (const x of model.xs) {
      const d = Math.abs(model.sx(x) - vbX);
      if (d < best) {
        best = d;
        nearest = x;
      }
    }
    setHoverX(nearest);
  };

  const hoverRows =
    hoverX == null
      ? []
      : trend.series
          .map((s) => ({
            key: s.key,
            color: s.color,
            y: s.points.find((p) => p.x === hoverX)?.y,
          }))
          .filter((r) => r.y !== undefined);

  const tooltipLeft = hoverX == null ? 0 : (model.sx(hoverX) / W) * 100;

  return (
    <div className="flex flex-col h-full">
      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="absolute inset-0"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverX(null)}
        >
          {/* y grid + labels */}
          {model.yTicks.map((t) => (
            <g key={t}>
              <line
                x1={M.l}
                x2={W - M.r}
                y1={model.sy(t)}
                y2={model.sy(t)}
                stroke="#262b38"
                strokeWidth={1}
              />
              <text
                x={M.l - 8}
                y={model.sy(t) + 4}
                textAnchor="end"
                fontSize={11}
                fill="#8b93a7"
              >
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {/* x labels (up to ~6) */}
          {model.xs
            .filter(
              (_, i, a) =>
                a.length <= 6 || i % Math.ceil(a.length / 6) === 0 || i === a.length - 1,
            )
            .map((x) => (
              <text
                key={x}
                x={model.sx(x)}
                y={H - M.b + 18}
                textAnchor="middle"
                fontSize={10}
                fill="#8b93a7"
              >
                {fmtTime(x)}
              </text>
            ))}
          {/* alert threshold line */}
          {threshold != null && (
            <g>
              <line
                x1={M.l}
                x2={W - M.r}
                y1={model.sy(threshold)}
                y2={model.sy(threshold)}
                stroke="#f0b429"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <text
                x={M.l + 4}
                y={model.sy(threshold) - 4}
                fontSize={10}
                fill="#f0b429"
              >
                seuil {formatNumber(threshold)}
              </text>
            </g>
          )}
          {/* hover crosshair */}
          {hoverX != null && (
            <line
              x1={model.sx(hoverX)}
              x2={model.sx(hoverX)}
              y1={M.t}
              y2={H - M.b}
              stroke="#6d8bff"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}
          {/* series lines + markers + end labels */}
          {trend.series.map((s) => {
            const d = s.points
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${model.sx(p.x)},${model.sy(p.y)}`)
              .join(' ');
            const last = s.points.at(-1)!;
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
                {s.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={model.sx(p.x)}
                    cy={model.sy(p.y)}
                    r={hoverX === p.x ? 4 : 2.5}
                    fill={s.color}
                  />
                ))}
                {trend.series.length <= 4 && (
                  <text
                    x={Math.min(model.sx(last.x) + 6, W - 2)}
                    y={model.sy(last.y) - 5}
                    fontSize={10}
                    fill="#e4e7ee"
                    textAnchor="end"
                  >
                    {s.key}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hoverX != null && hoverRows.length > 0 && (
          <div
            className="absolute top-2 pointer-events-none rounded-md border border-border bg-panel-2 px-2 py-1.5 text-[11px] shadow-xl"
            style={{
              left: `calc(${tooltipLeft}% + ${tooltipLeft > 60 ? '-140px' : '10px'})`,
            }}
          >
            <div className="text-muted mb-1">{fmtTime(hoverX)}</div>
            {hoverRows.map((r) => (
              <div key={r.key} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ background: r.color }}
                />
                <span className="truncate max-w-[140px]">{r.key}</span>
                <span className="ml-auto mono">
                  {formatNumber(r.y!)}
                  {unit ? ` ${unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* legend — always present for >= 2 series */}
      {!singleSeries && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 py-2 border-t border-border-soft">
          {trend.series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: s.color }}
              />
              <span className="truncate max-w-[160px]">{s.key}</span>
            </span>
          ))}
          {trend.truncatedSeries > 0 && (
            <span className="text-[11px] text-muted">
              +{trend.truncatedSeries} série(s) masquée(s)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
