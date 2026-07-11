import { useState } from 'react';
import { Download, AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import type { QueryResponse } from '@fluentdb/shared';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/misc.js';
import { formatDuration, formatNumber } from '../../lib/format.js';
import { DataGrid } from '../data-grid/DataGrid.js';

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

  if (!result) {
    return (
      <div className="h-full flex items-center justify-center text-muted text-sm">
        Exécute une requête pour voir les résultats (Ctrl/Cmd + Entrée)
      </div>
    );
  }

  const sets = result.resultSets;
  const current = sets[Math.min(activeSet, sets.length - 1)];
  const hasRows = current && current.columns.length > 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2 h-8 border-b border-border-soft bg-panel text-xs">
        {sets.length > 1 &&
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
          {current && current.columns.length > 0 && (
            <span>· {formatNumber(current.rowCount)} ligne(s)</span>
          )}
          {current?.truncated && <Badge tone="amber">tronqué</Badge>}
          {current?.affectedRows != null && current.columns.length === 0 && (
            <span>· {current.affectedRows} ligne(s) affectée(s)</span>
          )}
          {hasRows && (
            <div className="flex items-center gap-1 ml-1">
              <Button size="sm" variant="ghost" onClick={() => onExport('csv')}>
                <Download size={12} /> CSV
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onExport('json')}>
                <Download size={12} /> JSON
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {hasRows ? (
          <DataGrid columns={current.columns} rows={current.rows} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            {current?.affectedRows != null
              ? `Requête exécutée — ${current.affectedRows} ligne(s) affectée(s)`
              : 'Requête exécutée avec succès'}
          </div>
        )}
      </div>
    </div>
  );
}
