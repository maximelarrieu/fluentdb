import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Search,
  X,
  Table as TableIcon,
  BarChart3,
} from 'lucide-react';
import type { CellValue, QueryResponse } from '@fluentdb/shared';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/misc.js';
import { formatDuration, formatNumber } from '../../lib/format.js';
import { DataGrid } from '../data-grid/DataGrid.js';
import { ResultChart } from './ResultChart.js';

/** Case-insensitive substring match across every cell of a row. */
function rowMatches(row: CellValue[], needle: string): boolean {
  for (const v of row) {
    if (v == null) continue;
    if (String(v).toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function ResultsPane({
  result,
  error,
  onExport,
  onFix,
}: {
  result: QueryResponse | null;
  error: string | null;
  onExport: (format: 'csv' | 'json') => void;
  /** Present when an AI provider is configured — offers a one-click fix. */
  onFix?: () => void;
}) {
  const [activeSet, setActiveSet] = useState(0);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'chart'>('grid');
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset the in-result search + view when the result or active set changes.
  useEffect(() => {
    setSearch('');
    setView('grid');
  }, [result, activeSet]);

  const sets = result?.resultSets;
  const current = sets?.[Math.min(activeSet, sets.length - 1)];
  const hasRows = !!current && current.columns.length > 0;

  // ⌘F / Ctrl+F focuses the in-result search while a grid is shown.
  useEffect(() => {
    if (!hasRows) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasRows]);

  const needle = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!current) return [];
    if (!needle) return current.rows;
    return current.rows.filter((r) => rowMatches(r, needle));
  }, [current, needle]);

  if (error) {
    return (
      <div className="h-full flex flex-col gap-3 p-4 overflow-auto">
        <div className="flex items-start gap-2 text-red text-[13px] mono">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap">{error}</pre>
        </div>
        {onFix && (
          <div>
            <Button size="sm" variant="default" onClick={onFix}>
              <Wrench size={13} /> Corriger avec l'IA
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (!result || !current) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-sm">
        Exécute une requête pour voir les résultats (Ctrl/Cmd + Entrée)
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2 h-8 border-b border-border-soft bg-panel text-xs">
        {sets && sets.length > 1 &&
          sets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSet(i)}
              className={`px-2 py-0.5 rounded ${
                i === activeSet ? 'bg-panel-2 text-text' : 'text-muted'
              }`}
            >
              Résultat {i + 1}
            </button>
          ))}
        <div className="flex items-center gap-2 ml-auto text-muted">
          <CheckCircle2 size={12} className="text-green" />
          <span>{formatDuration(result.durationMs)}</span>
          {current.columns.length > 0 && (
            <span>· {formatNumber(current.rowCount)} ligne(s)</span>
          )}
          {current.truncated && <Badge tone="amber">tronqué</Badge>}
          {current.affectedRows != null && current.columns.length === 0 && (
            <span>· {current.affectedRows} ligne(s) affectée(s)</span>
          )}
          {hasRows && (
            <>
              <div className="flex items-center rounded-md border border-border overflow-hidden ml-1">
                <button
                  onClick={() => setView('grid')}
                  title="Vue grille"
                  aria-label="Vue grille"
                  aria-pressed={view === 'grid'}
                  className={`flex items-center gap-1 px-2 h-6 ${
                    view === 'grid'
                      ? 'bg-accent/12 text-accent'
                      : 'hover:bg-panel-2 hover:text-text'
                  }`}
                >
                  <TableIcon size={12} aria-hidden="true" /> Grille
                </button>
                <button
                  onClick={() => setView('chart')}
                  title="Vue graphique"
                  aria-label="Vue graphique"
                  aria-pressed={view === 'chart'}
                  className={`flex items-center gap-1 px-2 h-6 border-l border-border ${
                    view === 'chart'
                      ? 'bg-accent/12 text-accent'
                      : 'hover:bg-panel-2 hover:text-text'
                  }`}
                >
                  <BarChart3 size={12} aria-hidden="true" /> Graphique
                </button>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => onExport('csv')}>
                  <Download size={12} /> CSV
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onExport('json')}>
                  <Download size={12} /> JSON
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* In-result search (⌘F): filters the loaded rows client-side. */}
      {hasRows && view === 'grid' && (
        <div className="flex items-center gap-2 px-2 h-8 border-b border-border-soft bg-panel/60">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
              placeholder="Rechercher dans les résultats…  ⌘F"
              aria-label="Rechercher dans les résultats"
              className="h-6 w-full pl-6 pr-6 text-[12px] rounded bg-bg border border-border focus:border-accent focus:ring-1 focus:ring-accent/40 outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>
          {needle && (
            <span className="text-[11px] text-muted tabular-nums shrink-0">
              {formatNumber(filteredRows.length)} / {formatNumber(current.rows.length)}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {hasRows ? (
          view === 'chart' ? (
            <ResultChart columns={current.columns} rows={current.rows} />
          ) : needle && filteredRows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted text-sm">
              Aucune ligne ne contient «&nbsp;{search}&nbsp;».
            </div>
          ) : (
            <DataGrid columns={current.columns} rows={filteredRows} />
          )
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            {current.affectedRows != null
              ? `Requête exécutée — ${current.affectedRows} ligne(s) affectée(s)`
              : 'Requête exécutée avec succès'}
          </div>
        )}
      </div>
    </div>
  );
}
