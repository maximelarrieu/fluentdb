import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  Play,
  Square,
  Sparkles,
  WandSparkles,
  Gauge,
  ChevronDown,
  Save,
} from 'lucide-react';
import type { QueryPlan, QueryPlanResponse, QueryResponse } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { nanoid } from '../../lib/nanoid.js';
import { CodeEditor } from './CodeEditor.js';
import { ResultsPane } from './ResultsPane.js';
import { ConfirmExecutionDialog } from './ConfirmExecutionDialog.js';
import { SaveAsViewDialog } from './SaveAsViewDialog.js';
import { PlanView } from '../plan/PlanView.js';
import { summarizePlan } from '../plan/summary.js';

export function QueryEditor({ tabId, sql }: { tabId: string; sql: string }) {
  const { active, database, setTabSql, toggleAi, skipExecConfirm, setSkipExecConfirm } =
    useWorkspace();
  const toast = useToast();
  const connId = active!.id;
  const canCancel = active!.capabilities.cancelQuery;
  const canExplain = active!.capabilities.explain;
  const canAnalyze = active!.capabilities.explainAnalyze;
  const canMatview = active!.capabilities.materializedViews;

  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSql, setLastSql] = useState('');
  // bottom pane shows either query results or the execution plan
  const [bottom, setBottom] = useState<'results' | 'plan'>('results');
  const [plan, setPlan] = useState<QueryPlan | null>(null);
  // id of the query currently in flight, so the Cancel button can target it
  const runningQueryId = useRef<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // write/DDL awaiting confirmation before it runs
  const [pending, setPending] = useState<{ plan: QueryPlanResponse; sql: string } | null>(
    null,
  );
  const [analyzing, setAnalyzing] = useState(false);
  // "save as view" dialog: null when closed, else the preselected view kind
  const [saveView, setSaveView] = useState<{ materialized: boolean } | null>(
    null,
  );

  const meta = useQuery({
    queryKey: ['autocomplete', connId, database],
    queryFn: () => api.autocomplete(connId, database),
  });

  const run = useMutation({
    mutationFn: (query: string) => {
      setLastSql(query);
      const queryId = nanoid(12);
      runningQueryId.current = queryId;
      return api.query(connId, { sql: query, database, maxRows: 1000, queryId });
    },
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      setBottom('results');
    },
    onError: (e: ApiError) => {
      setError(e.detail ? `${e.message}\n${e.detail}` : e.message);
      setResult(null);
      setBottom('results');
    },
    onSettled: () => {
      runningQueryId.current = null;
      setCancelling(false);
    },
  });

  const explainPlan = useMutation({
    mutationFn: (opts: { analyze: boolean }) =>
      api.explain(connId, sql, { database, analyze: opts.analyze }),
    onSuccess: (p) => {
      setPlan(p);
      setError(null);
      setBottom('plan');
    },
    onError: (e: ApiError) => {
      setError(e.detail ? `${e.message}\n${e.detail}` : e.message);
      setBottom('results');
    },
  });

  const cancel = async () => {
    const id = runningQueryId.current;
    if (!id) return;
    setCancelling(true);
    try {
      const { cancelled } = await api.cancelQuery(id);
      toast.push(
        cancelled ? 'info' : 'error',
        cancelled ? 'Annulation demandée' : "La requête n'a pas pu être annulée",
      );
    } catch {
      toast.push('error', "Échec de l'annulation");
    }
  };

  // Safe-by-design gate: analyze first; run reads immediately, but hold
  // writes/DDL behind the confirmation dialog (unless muted for the session).
  const requestRun = async (query: string) => {
    const q = query.trim();
    if (!q) return;
    if (skipExecConfirm) {
      run.mutate(q);
      return;
    }
    setAnalyzing(true);
    try {
      const plan = await api.queryPlan(connId, q, database);
      if (plan.requiresConfirmation) {
        setPending({ plan, sql: q });
      } else {
        run.mutate(q);
      }
    } catch {
      // if analysis fails, fall back to executing (server still guards writes)
      run.mutate(q);
    } finally {
      setAnalyzing(false);
    }
  };

  const runAll = () => void requestRun(sql);
  const runSelection = (selection: string) =>
    void requestRun(selection.trim() || sql);

  const exportData = async (format: 'csv' | 'json') => {
    const res = await fetch(api.exportUrl(connId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ format, sql: lastSql, database, fileName: 'query' }),
    });
    if (!res.ok) {
      toast.push('error', "Échec de l'export");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const explain = () => {
    toggleAi(true);
    window.dispatchEvent(
      new CustomEvent('fluentdb:ai', {
        detail: { mode: 'explain', sql },
      }),
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2 h-9 border-b border-border-soft bg-panel">
        <Button
          size="sm"
          variant="primary"
          onClick={runAll}
          disabled={run.isPending || analyzing || !sql.trim()}
        >
          {run.isPending || analyzing ? (
            <Spinner className="text-white" />
          ) : (
            <Play size={13} />
          )}
          Exécuter
        </Button>
        {run.isPending && canCancel && (
          <Button
            size="sm"
            variant="danger"
            onClick={cancel}
            disabled={cancelling}
          >
            <Square size={12} /> {cancelling ? 'Annulation…' : 'Annuler'}
          </Button>
        )}
        {canExplain && (
          <AnalyzeButton
            disabled={!sql.trim() || explainPlan.isPending}
            pending={explainPlan.isPending}
            canAnalyze={canAnalyze}
            onExplain={() => explainPlan.mutate({ analyze: false })}
            onAnalyze={() => explainPlan.mutate({ analyze: true })}
          />
        )}
        <span className="text-[11px] text-muted ml-1">
          ⌘/Ctrl+↵ tout · ⇧⌘/Ctrl+↵ sélection
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {canMatview ? (
            <SaveViewButton
              disabled={!sql.trim()}
              onView={() => setSaveView({ materialized: false })}
              onMatview={() => setSaveView({ materialized: true })}
            />
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSaveView({ materialized: false })}
              disabled={!sql.trim()}
            >
              <Save size={13} /> Enregistrer en vue
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={explain} disabled={!sql.trim()}>
            <WandSparkles size={13} /> Expliquer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toggleAi(true)}>
            <Sparkles size={13} /> Assistant
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="h-[42%] min-h-[120px] border-b border-border overflow-hidden">
          {meta.data && (
            <CodeEditor
              value={sql}
              dialect={meta.data.dialect}
              catalog={meta.data.catalog}
              onChange={(v) => setTabSql(tabId, v)}
              onRun={runAll}
              onRunSelection={runSelection}
            />
          )}
        </div>
        <div className="flex-1 min-h-0">
          {bottom === 'plan' && plan && !error ? (
            <PlanView
              plan={plan}
              onSuggestIndex={() => {
                toggleAi(true);
                window.dispatchEvent(
                  new CustomEvent('fluentdb:ai', {
                    detail: {
                      mode: 'index_advice',
                      sql,
                      planSummary: summarizePlan(plan),
                    },
                  }),
                );
              }}
            />
          ) : (
            <ResultsPane result={result} error={error} onExport={exportData} />
          )}
        </div>
      </div>

      {saveView && meta.data && (
        <SaveAsViewDialog
          sql={sql}
          materialized={saveView.materialized}
          canMaterialized={canMatview}
          dialect={meta.data.dialect}
          onClose={() => setSaveView(null)}
        />
      )}

      {pending && (
        <ConfirmExecutionDialog
          plan={pending.plan}
          onCancel={() => setPending(null)}
          onSkipSession={(skip) => setSkipExecConfirm(skip)}
          onConfirm={() => {
            const q = pending.sql;
            setPending(null);
            run.mutate(q);
          }}
        />
      )}
    </div>
  );
}

/** "Analyser" split button: EXPLAIN estimate, with an optional ANALYZE item. */
function AnalyzeButton({
  disabled,
  pending,
  canAnalyze,
  onExplain,
  onAnalyze,
}: {
  disabled: boolean;
  pending: boolean;
  canAnalyze: boolean;
  onExplain: () => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="flex items-center">
      <Button
        size="sm"
        variant="default"
        onClick={onExplain}
        disabled={disabled}
        className={canAnalyze ? 'rounded-r-none' : undefined}
      >
        {pending ? <Spinner /> : <Gauge size={13} />} Analyser
      </Button>
      {canAnalyze && (
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <Button
              size="sm"
              variant="default"
              disabled={disabled}
              className="rounded-l-none border-l border-border px-1.5"
            >
              <ChevronDown size={13} />
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              align="start"
              sideOffset={4}
              className="z-50 min-w-[220px] rounded-lg border border-border bg-panel-2 p-1 shadow-xl"
            >
              <Dropdown.Item
                onSelect={onExplain}
                className="flex flex-col rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[highlighted]:bg-panel"
              >
                Estimer (EXPLAIN)
                <span className="text-[11px] text-muted">
                  Plan estimé, sans exécuter la requête
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                onSelect={onAnalyze}
                className="flex flex-col rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[highlighted]:bg-panel"
              >
                Mesurer (ANALYZE)
                <span className="text-[11px] text-muted">
                  Exécute la requête pour des métriques réelles
                </span>
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      )}
    </div>
  );
}

/** "Enregistrer" split button: view by default, matview from the menu. */
function SaveViewButton({
  disabled,
  onView,
  onMatview,
}: {
  disabled: boolean;
  onView: () => void;
  onMatview: () => void;
}) {
  return (
    <div className="flex items-center">
      <Button
        size="sm"
        variant="ghost"
        onClick={onView}
        disabled={disabled}
        className="rounded-r-none"
      >
        <Save size={13} /> Enregistrer en vue
      </Button>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="rounded-l-none border-l border-border px-1.5"
          >
            <ChevronDown size={13} />
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[240px] rounded-lg border border-border bg-panel-2 p-1 shadow-xl"
          >
            <Dropdown.Item
              onSelect={onView}
              className="flex flex-col rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[highlighted]:bg-panel"
            >
              Vue
              <span className="text-[11px] text-muted">
                Recalculée à chaque lecture
              </span>
            </Dropdown.Item>
            <Dropdown.Item
              onSelect={onMatview}
              className="flex flex-col rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[highlighted]:bg-panel"
            >
              Vue matérialisée
              <span className="text-[11px] text-muted">
                Stocke le résultat ; à rafraîchir
              </span>
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
