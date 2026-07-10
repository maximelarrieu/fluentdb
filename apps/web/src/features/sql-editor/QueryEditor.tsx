import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Play, Sparkles, WandSparkles } from 'lucide-react';
import type { QueryResponse } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { CodeEditor } from './CodeEditor.js';
import { ResultsPane } from './ResultsPane.js';

export function QueryEditor({ tabId, sql }: { tabId: string; sql: string }) {
  const { active, database, setTabSql, toggleAi } = useWorkspace();
  const toast = useToast();
  const connId = active!.id;

  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSql, setLastSql] = useState('');

  const meta = useQuery({
    queryKey: ['autocomplete', connId, database],
    queryFn: () => api.autocomplete(connId, database),
  });

  const run = useMutation({
    mutationFn: (query: string) => {
      setLastSql(query);
      return api.query(connId, { sql: query, database, maxRows: 1000 });
    },
    onSuccess: (r) => {
      setResult(r);
      setError(null);
    },
    onError: (e: ApiError) => {
      setError(e.detail ? `${e.message}\n${e.detail}` : e.message);
      setResult(null);
    },
  });

  const runAll = () => {
    if (sql.trim()) run.mutate(sql);
  };
  const runSelection = (selection: string) => {
    const q = selection.trim() || sql.trim();
    if (q) run.mutate(q);
  };

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
          disabled={run.isPending || !sql.trim()}
        >
          {run.isPending ? <Spinner className="text-white" /> : <Play size={13} />}
          Exécuter
        </Button>
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
    </div>
  );
}
