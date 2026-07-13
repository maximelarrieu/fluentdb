import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  LayoutGrid,
  Plus,
  RefreshCw,
  MoreVertical,
  Pencil,
  Trash2,
  GripVertical,
} from 'lucide-react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import type { DashboardWidget, WidgetSize } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner, EmptyState } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { WidgetChart } from './WidgetChart.js';
import { WidgetBuilder } from './WidgetBuilder.js';

const Grid = WidthProvider(GridLayout);
const COLS = 12;
const DEFAULT_W: Record<WidgetSize, number> = { sm: 4, md: 6, lg: 12 };
const DEFAULT_H = 4;

/** Layout for RGL: stored placement when present, else a simple left→right flow. */
function buildLayout(widgets: DashboardWidget[]): Layout[] {
  let x = 0;
  let y = 0;
  return widgets.map((w) => {
    if (w.layout) {
      return { i: w.id, ...w.layout, minW: 2, minH: 2 };
    }
    const ww = DEFAULT_W[w.size];
    if (x + ww > COLS) {
      x = 0;
      y += DEFAULT_H;
    }
    const item = { i: w.id, x, y, w: ww, h: DEFAULT_H, minW: 2, minH: 2 };
    x += ww;
    return item;
  });
}

export function BoardView() {
  const { active, database } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const [builder, setBuilder] = useState<{ widget: DashboardWidget | null } | null>(
    null,
  );

  const widgets = useQuery({
    queryKey: ['widgets', active?.id, database],
    queryFn: () => api.widgets(active!.id, database),
    enabled: !!active,
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteWidget(active!.id, id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['widgets', active!.id, database] }),
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const saveLayout = useMutation({
    mutationFn: (layout: Layout[]) =>
      api.setWidgetLayout(
        active!.id,
        layout.map((l) => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h })),
      ),
    // Don't invalidate: keep RGL's live positions (a refetch would jump).
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const list = useMemo(() => widgets.data ?? [], [widgets.data]);
  const layout = useMemo(() => buildLayout(list), [list]);

  if (!active) return <EmptyState title="Aucune connexion active" />;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 h-11 border-b border-border bg-bg z-10 shrink-0">
        <LayoutGrid size={15} className="text-accent" />
        <span className="text-[13px] font-semibold">Tableau de bord</span>
        <span className="text-[11px] text-muted">{list.length} widget(s)</span>
        <span className="text-[11px] text-muted/60 hidden sm:inline">
          · glisse par la poignée, redimensionne par le coin
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => widgets.refetch()}
            disabled={widgets.isFetching}
            title="Actualiser"
          >
            {widgets.isFetching ? <Spinner /> : <RefreshCw size={13} />}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setBuilder({ widget: null })}>
            <Plus size={14} /> Nouveau widget
          </Button>
        </div>
      </div>

      {widgets.isLoading ? (
        <Spinner className="m-4" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid size={40} strokeWidth={1.2} />}
          title="Aucun widget"
          hint="Crée un widget : écris une requête ou décris-le en langage naturel, choisis une visualisation (nombre, barres, lignes, camembert, table)."
          action={
            <Button variant="primary" onClick={() => setBuilder({ widget: null })}>
              <Plus size={14} /> Nouveau widget
            </Button>
          }
        />
      ) : (
        <div className="flex-1 overflow-auto p-2">
          <Grid
            className="layout"
            layout={layout}
            cols={COLS}
            rowHeight={64}
            margin={[12, 12]}
            isBounded
            draggableHandle=".widget-drag"
            onDragStop={(l) => saveLayout.mutate(l)}
            onResizeStop={(l) => saveLayout.mutate(l)}
          >
            {list.map((w) => (
              <div key={w.id}>
                <WidgetCard
                  connId={active.id}
                  database={database}
                  widget={w}
                  onEdit={() => setBuilder({ widget: w })}
                  onDelete={() => del.mutate(w.id)}
                />
              </div>
            ))}
          </Grid>
        </div>
      )}

      {builder && (
        <WidgetBuilder
          connId={active.id}
          database={database}
          existing={builder.widget}
          onClose={() => setBuilder(null)}
        />
      )}
    </div>
  );
}

function WidgetCard({
  connId,
  database,
  widget,
  onEdit,
  onDelete,
}: {
  connId: string;
  database?: string;
  widget: DashboardWidget;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const q = useQuery({
    queryKey: ['widget-data', connId, database, widget.id, widget.sql],
    queryFn: () =>
      api.query(connId, {
        sql: widget.sql,
        database,
        maxRows: 200,
        queryId: `widget-${widget.id}`,
      }),
  });
  const set = q.data?.resultSets?.[0];

  return (
    <div className="h-full flex flex-col rounded-xl border border-border bg-panel overflow-hidden">
      <div className="flex items-center gap-2 px-2 h-9 border-b border-border-soft shrink-0">
        <span className="widget-drag flex items-center gap-1.5 flex-1 min-w-0 cursor-move">
          <GripVertical size={13} className="text-muted/50 shrink-0" />
          <span className="text-[12px] font-medium truncate" title={widget.title}>
            {widget.title}
          </span>
        </span>
        <button
          onClick={() => q.refetch()}
          title="Actualiser"
          aria-label="Actualiser le widget"
          className="text-muted hover:text-text shrink-0"
        >
          <RefreshCw size={12} aria-hidden="true" className={q.isFetching ? 'animate-spin' : ''} />
        </button>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button className="text-muted hover:text-text shrink-0" aria-label="Options du widget">
              <MoreVertical size={14} />
            </button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[150px] rounded-lg border border-border bg-panel-2 p-1 shadow-xl"
            >
              <Dropdown.Item
                onSelect={onEdit}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[highlighted]:bg-panel"
              >
                <Pencil size={13} /> Modifier
              </Dropdown.Item>
              <Dropdown.Item
                onSelect={onDelete}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none text-red data-[highlighted]:bg-red/10"
              >
                <Trash2 size={13} /> Supprimer
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
      <div className="flex-1 min-h-0">
        {q.isLoading ? (
          <Spinner className="m-3" />
        ) : q.isError ? (
          <div className="p-3 text-[11px] text-red mono overflow-auto h-full">
            {(q.error as Error).message}
          </div>
        ) : set ? (
          <WidgetChart
            columns={set.columns}
            rows={set.rows}
            viz={widget.viz}
            orientation={widget.orientation}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-xs">
            Aucun résultat
          </div>
        )}
      </div>
    </div>
  );
}
