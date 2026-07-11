import { useQuery } from '@tanstack/react-query';
import { Clock, LayoutDashboard, AlertTriangle } from 'lucide-react';
import type { ScheduledTask } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Spinner, EmptyState } from '../../components/ui/misc.js';
import { formatNumber } from '../../lib/format.js';
import { useWorkspace } from '../../stores/workspace.js';
import { useTaskSeen, unseenTasks, TASKS_POLL_MS } from './notifications.js';
import { groupByDatabase, scheduleLabel } from './TasksView.js';
import { useTaskMetric, DeltaChip } from './kpi.js';
import { taskDelta } from './dashboard.js';

/** Colours mirror the trend palette so tiles read as the same system. */
const OK_LINE = '#3987e5';
const ALERT_LINE = '#c98500';

/** A tiny inline sparkline (no chart lib). Flat baseline until ≥2 points. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 140;
  const h = 34;
  if (points.length < 2) {
    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <line x1={0} y1={h - 2} x2={w} y2={h - 2} stroke={color} strokeOpacity={0.3} strokeWidth={1.5} />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 3;
  const step = w / (points.length - 1);
  const coords = points.map((y, i) => {
    const px = i * step;
    const py = pad + (h - pad * 2) * (1 - (y - min) / span);
    return [px, py] as const;
  });
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${coords[0]![0]},${h} ${line} ${coords.at(-1)![0]},${h}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polygon points={area} fill={color} fillOpacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={coords.at(-1)![0]} cy={coords.at(-1)![1]} r={2.5} fill={color} />
    </svg>
  );
}

function fmtNext(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function TaskTile({
  task,
  unseen,
  onOpen,
}: {
  task: ScheduledTask;
  unseen: boolean;
  onOpen: () => void;
}) {
  const { metric, isLoading } = useTaskMetric(task.id);
  const delta = taskDelta(metric);
  const alert = task.lastStatus !== 'error' && task.lastAlert;
  const errored = task.lastStatus === 'error';
  const line = alert ? ALERT_LINE : OK_LINE;

  const caption = metric.valueCol
    ? metric.multiRow
      ? `total · ${metric.valueCol}`
      : metric.valueCol
    : 'lignes';

  return (
    <button
      onClick={onOpen}
      className={`text-left rounded-xl border bg-panel p-3 flex flex-col gap-2 transition-colors hover:bg-panel-2/60 ${
        errored
          ? 'border-red/40'
          : alert
            ? 'border-amber/40'
            : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            errored ? 'bg-red' : alert ? 'bg-amber' : task.lastStatus === 'ok' ? 'bg-green' : 'bg-muted/40'
          }`}
        />
        <span className="text-[13px] font-medium truncate flex-1">{task.name}</span>
        {unseen && (
          <span className="w-2 h-2 rounded-full bg-accent shrink-0" title="Nouveau résultat" />
        )}
        {!task.enabled && (
          <span className="text-[10px] text-muted px-1 rounded bg-panel-2">pause</span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          {errored ? (
            <span className="text-red text-[13px] flex items-center gap-1">
              <AlertTriangle size={14} /> échec
            </span>
          ) : metric.latest != null ? (
            <>
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-2xl font-semibold leading-none tabular-nums truncate">
                  {formatNumber(metric.latest)}
                </span>
                {delta && <DeltaChip delta={delta} className="text-[11px] shrink-0" />}
              </div>
              <div className="text-[10px] text-muted mt-1 truncate">{caption}</div>
            </>
          ) : (
            <span className="text-muted text-[13px]">en attente…</span>
          )}
        </div>
        <div className="w-24 shrink-0 self-center">
          {isLoading ? (
            <div className="h-[34px]" />
          ) : (
            <Sparkline points={metric.points} color={line} />
          )}
        </div>
      </div>

      {alert && (
        <div className="text-[11px] text-amber flex items-center gap-1 truncate">
          <AlertTriangle size={12} className="shrink-0" /> {task.lastAlert}
        </div>
      )}

      <div className="text-[10px] text-muted flex items-center gap-1 mt-auto pt-1 truncate">
        <Clock size={11} className="shrink-0" />
        {scheduleLabel(task.schedule)} · prochaine {fmtNext(task.nextRunAt)}
      </div>
    </button>
  );
}

export function DashboardView() {
  const openTasks = useWorkspace((s) => s.openTasks);
  const seen = useTaskSeen((s) => s.seen);
  const markSeen = useTaskSeen((s) => s.markSeen);

  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: api.tasks,
    refetchInterval: TASKS_POLL_MS,
  });

  if (tasks.isLoading) return <Spinner className="m-4" />;
  const list = tasks.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        icon={<LayoutDashboard size={40} strokeWidth={1.2} />}
        title="Aucune tâche à afficher"
        hint="Planifie des requêtes de lecture depuis l'éditeur SQL : elles apparaîtront ici sous forme de tuiles avec leur dernière valeur et leur tendance."
      />
    );
  }

  const unseenIds = new Set(unseenTasks(list, seen).map((t) => t.id));
  const groups = groupByDatabase(list);

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-border sticky top-0 bg-bg z-10">
        <LayoutDashboard size={15} className="text-accent" />
        <span className="text-[13px] font-semibold">Tableau de bord</span>
        <span className="text-[11px] text-muted">
          {list.length} tâche{list.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2">
              {g.database ?? g.connectionName}
              {g.database && (
                <span className="text-muted/60 normal-case"> · {g.connectionName}</span>
              )}
            </div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
              {g.tasks.map((t) => (
                <TaskTile
                  key={t.id}
                  task={t}
                  unseen={unseenIds.has(t.id)}
                  onOpen={() => {
                    markSeen(t.id, t.lastSnapshotId);
                    openTasks(t.id);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
