import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutGrid,
  Plus,
  RefreshCw,
  MoreVertical,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
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

const SPAN: Record<WidgetSize, string> = {
  sm: 'col-span-6 sm:col-span-3 lg:col-span-2',
  md: 'col-span-6 lg:col-span-3',
  lg: 'col-span-6',
};

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

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderWidgets(active!.id, ids),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['widgets', active!.id, database] }),
  });

  if (!active) return <EmptyState title="Aucune connexion active" />;

  const list = widgets.data ?? [];

  const move = (index: number, dir: -1 | 1) => {
    const next = [...list];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    reorder.mutate(next.map((w) => w.id));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 h-11 border-b border-border sticky top-0 bg-bg z-10">
        <LayoutGrid size={15} className="text-accent" />
        <span className="text-[13px] font-semibold">Tableaux de bord</span>
        <span className="text-[11px] text-muted">{list.length} widget(s)</span>
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
          <Button
            size="sm"
            variant="primary"
            onClick={() => setBuilder({ widget: null })}
          >
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
        <div className="flex-1 overflow-auto p-3">
          <div className="grid grid-cols-6 gap-3 auto-rows-[260px]">
            {list.map((w, i) => (
              <div key={w.id} className={SPAN[w.size]}>
                <WidgetCard
                  connId={active.id}
                  database={database}
                  widget={w}
                  onEdit={() => setBuilder({ widget: w })}
                  onDelete={() => del.mutate(w.id)}
                  onMoveLeft={i > 0 ? () => move(i, -1) : undefined}
                  onMoveRight={i < list.length - 1 ? () => move(i, 1) : undefined}
                />
              </div>
            ))}
          </div>
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
  onMoveLeft,
  onMoveRight,
}: {
  connId: string;
  database?: string;
  widget: DashboardWidget;
  onEdit: () => void;
  onDelete: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
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
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border-soft shrink-0">
        <span className="text-[12px] font-medium truncate flex-1" title={widget.title}>
          {widget.title}
        </span>
        {onMoveLeft && (
          <button onClick={onMoveLeft} title="Déplacer à gauche" aria-label="Déplacer à gauche" className="text-muted hover:text-text">
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
        )}
        {onMoveRight && (
          <button onClick={onMoveRight} title="Déplacer à droite" aria-label="Déplacer à droite" className="text-muted hover:text-text">
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
        <button
          onClick={() => q.refetch()}
          title="Actualiser"
          aria-label="Actualiser le widget"
          className="text-muted hover:text-text"
        >
          <RefreshCw size={12} aria-hidden="true" className={q.isFetching ? 'animate-spin' : ''} />
        </button>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button className="text-muted hover:text-text" aria-label="Options du widget">
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
