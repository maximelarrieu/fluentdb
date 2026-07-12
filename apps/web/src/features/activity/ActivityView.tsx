import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, Ban, XCircle } from 'lucide-react';
import type { DbSession } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner, EmptyState, Badge } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';

const POLL_MS = 4000;

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}

export function ActivityView() {
  const { active, database } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const sessions = useQuery({
    queryKey: ['activity', active?.id, database],
    queryFn: () => api.activity(active!.id, database),
    enabled: !!active,
    refetchInterval: POLL_MS,
  });

  const kill = useMutation({
    mutationFn: (v: { pid: string; terminate: boolean }) =>
      api.killSession(active!.id, v.pid, { terminate: v.terminate, database }),
    onSuccess: (r, v) => {
      toast.push(
        r.killed ? 'success' : 'info',
        r.killed
          ? v.terminate
            ? 'Session terminée'
            : 'Requête annulée'
          : "Aucune action (session déjà terminée ?)",
      );
      qc.invalidateQueries({ queryKey: ['activity', active!.id] });
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  if (!active) return <EmptyState title="Aucune connexion active" />;
  if (!active.capabilities.activityMonitor) {
    return (
      <EmptyState
        icon={<Activity size={40} strokeWidth={1.2} />}
        title="Moniteur d'activité indisponible"
        hint="Ce moteur (SQLite) n'expose pas de sessions serveur."
      />
    );
  }

  const rows = sessions.data ?? [];
  const activeCount = rows.filter((s) => s.state === 'active' && !s.current).length;

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-3 px-4 h-11 border-b border-border sticky top-0 bg-bg z-10">
        <Activity size={15} className="text-accent" />
        <span className="text-[13px] font-semibold">Activité</span>
        <span className="text-[11px] text-muted">
          {rows.length} session(s){activeCount > 0 && ` · ${activeCount} active(s)`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => sessions.refetch()}
          disabled={sessions.isFetching}
        >
          {sessions.isFetching ? <Spinner /> : <RefreshCw size={13} />} Actualiser
        </Button>
      </div>

      {sessions.isLoading ? (
        <Spinner className="m-4" />
      ) : sessions.isError ? (
        <div className="p-4 text-sm text-red">
          {(sessions.error as Error).message}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Aucune session" />
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead className="bg-panel-2 border-b border-border">
              <tr className="text-left text-muted">
                <th className="px-3 py-1.5 font-medium">PID</th>
                <th className="px-3 py-1.5 font-medium">Utilisateur</th>
                <th className="px-3 py-1.5 font-medium">Base</th>
                <th className="px-3 py-1.5 font-medium">État</th>
                <th className="px-3 py-1.5 font-medium">Durée</th>
                <th className="px-3 py-1.5 font-medium">Requête</th>
                <th className="px-3 py-1.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s: DbSession) => (
                <tr
                  key={s.id}
                  className={`border-b border-border-soft/40 ${
                    s.current ? 'opacity-60' : 'hover:bg-panel-2/40'
                  }`}
                >
                  <td className="px-3 py-1.5 mono">
                    {s.id}
                    {s.current && <Badge>moi</Badge>}
                  </td>
                  <td className="px-3 py-1.5">{s.user ?? '—'}</td>
                  <td className="px-3 py-1.5">{s.database ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={
                        s.state === 'active' ? 'text-green' : 'text-muted'
                      }
                    >
                      {s.state ?? '—'}
                    </span>
                    {s.waitEvent && (
                      <span className="text-muted/60"> · {s.waitEvent}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-muted">
                    {fmtDuration(s.durationMs)}
                  </td>
                  <td className="px-3 py-1.5 mono max-w-[420px] truncate" title={s.query ?? ''}>
                    {s.query ?? '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    {!s.current && (
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Annuler la requête en cours"
                          onClick={() => kill.mutate({ pid: s.id, terminate: false })}
                        >
                          <Ban size={13} /> Annuler
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red"
                          title="Terminer la session"
                          onClick={() => kill.mutate({ pid: s.id, terminate: true })}
                        >
                          <XCircle size={13} /> Terminer
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
