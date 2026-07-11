import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Play,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Power,
} from 'lucide-react';
import type { ScheduledTask, TaskSchedule, TaskSnapshot } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner, EmptyState, Badge } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { DataGrid } from '../data-grid/DataGrid.js';
import { useTaskSeen } from './notifications.js';

export function scheduleLabel(s: TaskSchedule): string {
  return s.kind === 'daily'
    ? `chaque jour à ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
    : `toutes les ${s.everyMinutes} min`;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function TasksView() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const markSeen = useTaskSeen((s) => s.markSeen);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: api.tasks,
    refetchInterval: 30_000,
  });

  const list = tasks.data ?? [];
  const selected = list.find((t) => t.id === selectedId) ?? list[0] ?? null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    if (selected)
      queryClient.invalidateQueries({ queryKey: ['task-snapshots', selected.id] });
  };

  const run = useMutation({
    mutationFn: (id: string) => api.runTask(id),
    onSuccess: (snap) => {
      toast.push(
        snap.status === 'ok' ? 'success' : 'error',
        snap.status === 'ok'
          ? `Exécutée — ${snap.rowCount} ligne(s)`
          : `Échec : ${snap.error}`,
      );
      invalidate();
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });
  const toggle = useMutation({
    mutationFn: (t: ScheduledTask) =>
      api.updateTask(t.id, { enabled: !t.enabled }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      setSelectedId(null);
      invalidate();
    },
  });

  if (tasks.isLoading) return <Spinner className="m-4" />;
  if (list.length === 0) {
    return (
      <EmptyState
        icon={<Clock size={40} strokeWidth={1.2} />}
        title="Aucune tâche planifiée"
        hint="Depuis l'éditeur SQL, écris une requête de lecture puis « Planifier » pour l'exécuter automatiquement (ex. chaque jour à 9h)."
      />
    );
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="w-72 shrink-0 border-r border-border overflow-auto">
        {list.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setSelectedId(t.id);
              markSeen(t.id, t.lastSnapshotId);
            }}
            className={`w-full text-left px-3 py-2 border-b border-border-soft/50 ${
              selected?.id === t.id ? 'bg-panel-2' : 'hover:bg-panel-2/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <StatusDot task={t} />
              <span className="text-[13px] font-medium truncate flex-1">
                {t.name}
              </span>
              {!t.enabled && <Badge>en pause</Badge>}
            </div>
            <div className="text-[11px] text-muted mt-0.5 truncate">
              {t.connectionName} · {scheduleLabel(t.schedule)}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <TaskDetail
          key={selected.id}
          task={selected}
          onRun={() => run.mutate(selected.id)}
          running={run.isPending}
          onToggle={() => toggle.mutate(selected)}
          onDelete={() => remove.mutate(selected.id)}
          onSeen={() => markSeen(selected.id, selected.lastSnapshotId)}
        />
      )}
    </div>
  );
}

function StatusDot({ task }: { task: ScheduledTask }) {
  const color =
    task.lastStatus === 'error'
      ? 'bg-red'
      : task.lastStatus === 'ok'
        ? 'bg-green'
        : 'bg-muted/40';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function TaskDetail({
  task,
  onRun,
  running,
  onToggle,
  onDelete,
  onSeen,
}: {
  task: ScheduledTask;
  onRun: () => void;
  running: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSeen: () => void;
}) {
  const [snapId, setSnapId] = useState<number | null>(null);
  const snapshots = useQuery({
    queryKey: ['task-snapshots', task.id],
    queryFn: () => api.taskSnapshots(task.id),
  });
  const snaps = snapshots.data ?? [];
  const current: TaskSnapshot | undefined =
    snaps.find((s) => s.id === snapId) ?? snaps[0];

  // Viewing the task marks its latest result as seen.
  useEffect(() => {
    onSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.lastSnapshotId]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border">
        <span className="text-[13px] font-semibold truncate">{task.name}</span>
        <span className="text-[11px] text-muted truncate">
          {scheduleLabel(task.schedule)} · prochaine : {fmt(task.nextRunAt)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="default" onClick={onRun} disabled={running}>
            {running ? <Spinner /> : <Play size={13} />} Exécuter
          </Button>
          <Button size="sm" variant="ghost" onClick={onToggle}>
            <Power size={13} /> {task.enabled ? 'Mettre en pause' : 'Activer'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-56 shrink-0 border-r border-border overflow-auto">
          <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted">
            Historique
          </div>
          {snaps.map((s) => (
            <button
              key={s.id}
              onClick={() => setSnapId(s.id)}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 border-b border-border-soft/40 ${
                current?.id === s.id ? 'bg-panel-2' : 'hover:bg-panel-2/50'
              }`}
            >
              {s.status === 'ok' ? (
                <CheckCircle2 size={13} className="text-green shrink-0" />
              ) : (
                <AlertTriangle size={13} className="text-red shrink-0" />
              )}
              <span className="text-[12px] truncate flex-1">{fmt(s.ranAt)}</span>
              <span className="text-[10px] text-muted">
                {s.status === 'ok' ? `${s.rowCount}` : 'err'}
              </span>
            </button>
          ))}
          {snaps.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-muted">
              Aucune exécution encore.
            </p>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {!current ? (
            <div className="h-full flex items-center justify-center text-muted text-sm">
              Lance la tâche pour voir un résultat.
            </div>
          ) : current.status === 'error' ? (
            <div className="h-full flex items-start gap-2 p-4 text-red text-[13px] mono overflow-auto">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <pre className="whitespace-pre-wrap">{current.error}</pre>
            </div>
          ) : (
            <DataGrid columns={current.columns} rows={current.rows} />
          )}
        </div>
      </div>
    </div>
  );
}
