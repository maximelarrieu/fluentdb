import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Play, Square, Sparkles, WandSparkles } from 'lucide-react';
import type { QueryPlanResponse, QueryResponse } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { nanoid } from '../../lib/nanoid.js';
import { CodeEditor } from './CodeEditor.js';
import { ResultsPane } from './ResultsPane.js';
import { ConfirmExecutionDialog } from './ConfirmExecutionDialog.js';

export function QueryEditor({ tabId, sql }: { tabId: string; sql: string }) {
  const { active, database, setTabSql, toggleAi, skipExecConfirm, setSkipExecConfirm } =
    useWorkspace();
  const toast = useToast();
  const connId = active!.id;
  const canCancel = active!.capabilities.cancelQuery;

  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSql, setLastSql] = useState('');
  // id of the query currently in flight, so the Cancel button can target it
  const runningQueryId = useRef<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // write/DDL awaiting confirmation before it runs
  const [pending, setPending] = useState<{ plan: QueryPlanResponse; sql: string } | null>(
    null,
  );
  const [analyzing, setAnalyzing] = useState(false);

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
    },
    onError: (e: ApiError) => {
      setError(e.detail ? `${e.message}\n${e.detail}` : e.message);
      setResult(null);
    },
    onSettled: () => {
      runningQueryId.current = null;
      setCancelling(false);
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
        <span className="text-[11px] text-muted ml-1">
          ⌘/Ctrl+↵ tout · ⇧⌘/Ctrl+↵ sélection
        </span>
        <div className="ml-auto flex items-center gap-1.5">
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
          <ResultsPane result={result} error={error} onExport={exportData} />
        </div>
      </div>

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
