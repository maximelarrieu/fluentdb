import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Gauge,
  RefreshCw,
  Search,
  X,
  Trash2,
  FileCode2,
  WandSparkles,
  Copy,
  ChevronRight,
} from 'lucide-react';
import {
  queryStatSortKeys,
  type QueryStat,
  type QueryStatSort,
} from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner, EmptyState } from '../../components/ui/misc.js';
import { CopyableSql } from '../../components/ui/CopyableSql.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { formatNumber } from '../../lib/format.js';

const SORT_LABEL: Record<QueryStatSort, string> = {
  total: 'Temps cumulé',
  mean: 'Temps moyen',
  calls: "Nombre d'appels",
  rows: 'Lignes',
  stddev: 'Instabilité (σ)',
};

/** Human-readable duration from milliseconds. */
function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(2)} s`;
  if (ms >= 1) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
  return `${ms.toFixed(2)} ms`;
}

function StatRow({
  s,
  aiOn,
}: {
  s: QueryStat;
  aiOn: boolean;
}) {
  const { openQuery, toggleAi } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const optimize = () => {
    toggleAi(true);
    window.dispatchEvent(
      new CustomEvent('fluentdb:ai', {
        detail: { mode: 'index_advice', sql: s.query },
      }),
    );
  };

  return (
    <>
      <tr className="group border-b border-border-soft/50 hover:bg-panel-2/40 align-top">
        <td className="py-1.5 px-2">
          <button
            className="flex items-start gap-1.5 text-left w-full"
            onClick={() => setOpen((o) => !o)}
            title={open ? 'Réduire' : 'Voir la requête complète'}
          >
            <ChevronRight
              size={13}
              className={`mt-0.5 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <span
              className={`mono text-[12px] ${open ? 'whitespace-pre-wrap' : 'truncate max-w-[46ch] inline-block'}`}
            >
              {s.query}
            </span>
          </button>
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">
          {formatNumber(s.calls)}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">
          <div>{fmtMs(s.totalMs)}</div>
          <div className="h-1 mt-0.5 rounded-full bg-panel-2 overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.min(100, s.pctTotal * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-muted/70">
            {(s.pctTotal * 100).toFixed(1)} %
          </div>
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">{fmtMs(s.meanMs)}</td>
        <td className="py-1.5 px-2 text-right tabular-nums text-muted">
          {fmtMs(s.maxMs)}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums text-muted">
          {fmtMs(s.stddevMs)}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">
          {s.cacheHitRatio == null ? (
            <span className="text-muted/40">—</span>
          ) : (
            <span
              className={
                s.cacheHitRatio < 0.9 ? 'text-amber' : 'text-muted'
              }
            >
              {(s.cacheHitRatio * 100).toFixed(0)} %
            </span>
          )}
        </td>
        <td className="py-1.5 px-2">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            <button
              className="text-muted hover:text-text"
              title="Ouvrir dans un éditeur SQL"
              aria-label="Ouvrir dans un éditeur"
              onClick={() => openQuery(s.query)}
            >
              <FileCode2 size={13} />
            </button>
            {aiOn && (
              <button
                className="text-muted hover:text-accent"
                title="Optimiser avec l'IA (index / réécriture)"
                aria-label="Optimiser avec l'IA"
                onClick={optimize}
              >
                <WandSparkles size={13} />
              </button>
            )}
            <button
              className="text-muted hover:text-text"
              title="Copier la requête"
              aria-label="Copier la requête"
              onClick={() => {
                void navigator.clipboard?.writeText(s.query);
                toast.push('info', 'Requête copiée');
              }}
            >
              <Copy size={13} />
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border-soft/50 bg-panel/40">
          <td colSpan={8} className="px-2 py-2">
            <CopyableSql sql={s.query} />
          </td>
        </tr>
      )}
    </>
  );
}

export function QueryPerfView() {
  const { active, database } = useWorkspace();
  const toast = useToast();
  const [sort, setSort] = useState<QueryStatSort>('total');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [hideSystem, setHideSystem] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus });
  const aiOn = aiStatus.data?.configured ?? false;

  const stats = useQuery({
    queryKey: ['query-stats', active?.id, database, sort, debounced, hideSystem],
    queryFn: () =>
      api.queryStats(active!.id, {
        sort,
        limit: 50,
        search: debounced || undefined,
        hideSystem,
        database,
      }),
    enabled: !!active,
  });

  const reset = useMutation({
    mutationFn: () => api.resetQueryStats(active!.id, database),
    onSuccess: () => {
      toast.push('success', 'Statistiques réinitialisées');
      stats.refetch();
    },
    onError: (e: Error) => toast.push('error', e.message),
  });

  const rows = useMemo(() => stats.data?.rows ?? [], [stats.data]);

  if (!active) return <EmptyState title="Aucune connexion active" />;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 h-11 border-b border-border bg-bg">
        <Gauge size={15} className="text-accent" />
        <span className="text-[13px] font-semibold">Performance des requêtes</span>
        {stats.data?.available && (
          <span className="text-[11px] text-muted">
            {formatNumber(rows.length)} requête(s)
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (
                confirm(
                  'Réinitialiser les statistiques (pg_stat_statements_reset) ?',
                )
              )
                reset.mutate();
            }}
            disabled={reset.isPending || !stats.data?.available}
            title="Remettre les compteurs à zéro pour mesurer une fenêtre"
          >
            <Trash2 size={13} /> Réinitialiser
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => stats.refetch()}
            disabled={stats.isFetching}
          >
            {stats.isFetching ? <Spinner /> : <RefreshCw size={13} />} Actualiser
          </Button>
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-border-soft bg-panel/40">
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          {queryStatSortKeys.map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`px-2.5 h-7 text-[12px] border-l first:border-l-0 border-border ${
                sort === k
                  ? 'bg-accent/12 text-accent'
                  : 'hover:bg-panel-2 hover:text-text text-muted'
              }`}
            >
              {SORT_LABEL[k]}
            </button>
          ))}
        </div>
        <label
          className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer ml-2 select-none"
          title="Masquer les requêtes internes de FluentDB et des catalogues système"
        >
          <input
            type="checkbox"
            checked={hideSystem}
            onChange={(e) => setHideSystem(e.target.checked)}
          />
          Masquer les requêtes système
        </label>
        <div className="relative flex-1 max-w-sm ml-auto">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
            placeholder="Filtrer par texte de requête…"
            className="h-7 w-full pl-7 pr-7 text-[12px] rounded bg-bg border border-border focus:border-accent focus:ring-1 focus:ring-accent/40 outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Effacer"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {stats.isLoading ? (
          <Spinner className="m-4" />
        ) : stats.isError ? (
          <div className="p-4 text-sm text-red">
            {(stats.error as Error).message}
          </div>
        ) : !stats.data?.available ? (
          <div className="p-4 max-w-xl">
            <div className="rounded-xl border border-border bg-panel p-4">
              <div className="text-[13px] font-medium mb-1">
                Statistiques indisponibles
              </div>
              <p className="text-[12px] text-muted mb-3">
                {stats.data?.reason ??
                  "La source de statistiques n'est pas disponible."}
              </p>
              {stats.data?.enableSql && (
                <>
                  <p className="text-[12px] text-muted mb-1">
                    Active l'extension (nécessite un rechargement du serveur si
                    elle n'est pas préchargée) :
                  </p>
                  <CopyableSql sql={stats.data.enableSql} />
                </>
              )}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Aucune requête enregistrée"
            hint="Lance quelques requêtes puis actualise, ou réinitialise les compteurs pour repartir de zéro."
          />
        ) : (
          <table className="w-full text-[12px] border-collapse">
            <thead className="text-muted text-[11px] sticky top-0 bg-bg z-10">
              <tr className="border-b border-border">
                <th className="text-left font-medium px-2 py-1.5">Requête</th>
                <th className="text-right font-medium px-2 py-1.5">Appels</th>
                <th className="text-right font-medium px-2 py-1.5">
                  Temps cumulé
                </th>
                <th className="text-right font-medium px-2 py-1.5">Moyen</th>
                <th className="text-right font-medium px-2 py-1.5">Max</th>
                <th className="text-right font-medium px-2 py-1.5">σ</th>
                <th className="text-right font-medium px-2 py-1.5">Cache</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <StatRow key={s.queryId ?? i} s={s} aiOn={aiOn} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
