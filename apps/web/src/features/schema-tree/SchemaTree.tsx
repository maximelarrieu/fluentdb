import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Table2,
  Eye,
  Layers,
  ChevronDown,
  Search,
  RefreshCw,
  Columns3,
  Workflow,
  FileCode,
  WandSparkles,
  Clock,
} from 'lucide-react';
import { useUnseenTaskCount } from '../tasks/notifications.js';
import type { TableInfo, TableKind } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Input, Select } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Spinner, Badge } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { formatNumber } from '../../lib/format.js';

export function SchemaTree() {
  const {
    active,
    database,
    schema,
    setDatabase,
    setSchema,
    openTable,
    openStructure,
    openErd,
    openTasks,
    schemaVersion,
    toggleAi,
  } = useWorkspace();
  const unseenCount = useUnseenTaskCount();
  const [filter, setFilter] = useState('');
  const [defTarget, setDefTarget] = useState<TableInfo | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus });

  const explainObject = (t: TableInfo) => {
    toggleAi(true);
    window.dispatchEvent(
      new CustomEvent('fluentdb:ai', {
        detail: {
          mode: 'explain_object',
          object: { name: t.name, schema: t.schema, kind: t.kind },
        },
      }),
    );
  };

  const databases = useQuery({
    queryKey: ['databases', active?.id],
    queryFn: () => api.databases(active!.id),
    enabled: !!active && active.capabilities.multipleDatabases,
  });

  const schemas = useQuery({
    queryKey: ['schemas', active?.id, database],
    queryFn: () => api.schemas(active!.id, database),
    enabled: !!active && active.capabilities.schemas,
  });

  const tables = useQuery({
    queryKey: ['tables', active?.id, database, schema, schemaVersion],
    queryFn: () => api.tables(active!.id, database, schema),
    enabled: !!active,
  });

  const refresh = useMutation({
    mutationFn: (t: TableInfo) =>
      api.refreshMatview(active!.id, t.name, database, t.schema),
    onSuccess: (res) => {
      toast.push(
        'success',
        res.concurrent
          ? 'Vue matérialisée rafraîchie (sans verrou)'
          : 'Vue matérialisée rafraîchie',
      );
      queryClient.invalidateQueries({ queryKey: ['tables', active!.id] });
    },
    onError: (err) =>
      toast.push('error', err instanceof ApiError ? err.message : String(err)),
  });

  if (!active) return null;

  const filtered = (tables.data ?? []).filter((t) =>
    t.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const tablesList = filtered.filter((t) => t.kind === 'table');
  const viewsList = filtered.filter((t) => t.kind === 'view');
  const matviewsList = filtered.filter((t) => t.kind === 'matview');

  return (
    <div className="w-60 shrink-0 flex flex-col border-r border-border bg-panel h-full">
      <div className="px-2.5 pt-2.5 pb-2 flex flex-col gap-2 border-b border-border-soft">
        {active.capabilities.multipleDatabases && (
          <Select
            value={database ?? ''}
            onChange={(e) => setDatabase(e.target.value || undefined)}
          >
            {databases.data?.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        {active.capabilities.schemas && (schemas.data?.length ?? 0) > 0 && (
          <Select
            value={schema ?? ''}
            onChange={(e) => setSchema(e.target.value || undefined)}
          >
            <option value="">public (défaut)</option>
            {schemas.data?.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer les tables…"
            className="pl-7 h-7"
          />
        </div>
        <Button
          size="sm"
          variant="subtle"
          className="w-full justify-center"
          onClick={openErd}
        >
          <Workflow size={13} /> Diagramme ERD
        </Button>
        <Button
          size="sm"
          variant="subtle"
          className="w-full justify-center"
          onClick={openTasks}
        >
          <Clock size={13} /> Tâches planifiées
          {unseenCount > 0 && (
            <span className="ml-1 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] flex items-center justify-center">
              {unseenCount}
            </span>
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {tables.isLoading && <Spinner className="m-3" />}
        {tables.isError && (
          <p className="text-xs text-red px-3 py-2">
            {(tables.error as Error).message}
          </p>
        )}

        <TreeSection
          label="Tables"
          count={tablesList.length}
          items={tablesList}
          kind="table"
          onOpen={(t) => openTable(t.name, t.schema)}
          onStructure={(t) => openStructure(t.name, t.schema)}
          onExplain={aiStatus.data?.configured ? explainObject : undefined}
        />
        {viewsList.length > 0 && (
          <TreeSection
            label="Vues"
            count={viewsList.length}
            items={viewsList}
            kind="view"
            onOpen={(t) => openTable(t.name, t.schema)}
            onStructure={(t) => openStructure(t.name, t.schema)}
            onDefinition={setDefTarget}
            onExplain={aiStatus.data?.configured ? explainObject : undefined}
          />
        )}
        {matviewsList.length > 0 && (
          <TreeSection
            label="Vues matérialisées"
            count={matviewsList.length}
            items={matviewsList}
            kind="matview"
            onOpen={(t) => openTable(t.name, t.schema)}
            onStructure={(t) => openStructure(t.name, t.schema)}
            onDefinition={setDefTarget}
            onRefresh={active.capabilities.materializedViews ? refresh.mutate : undefined}
            refreshingName={refresh.isPending ? refresh.variables?.name : undefined}
            onExplain={aiStatus.data?.configured ? explainObject : undefined}
          />
        )}
      </div>

      <div className="flex items-center justify-between px-2 h-9 border-t border-border-soft">
        <span className="text-[11px] text-muted truncate mono px-1">
          {active.capabilities.serverVersion || active.engine}
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => tables.refetch()}
          title="Rafraîchir"
        >
          <RefreshCw size={13} />
        </Button>
      </div>

      {defTarget && (
        <DefinitionDialog
          connId={active.id}
          database={database}
          table={defTarget}
          onClose={() => setDefTarget(null)}
        />
      )}
    </div>
  );
}

const KIND_ICON: Record<TableKind, typeof Table2> = {
  table: Table2,
  view: Eye,
  matview: Layers,
};
const KIND_COLOR: Record<TableKind, string> = {
  table: 'text-accent',
  view: 'text-amber',
  matview: 'text-green',
};

function TreeSection({
  label,
  count,
  items,
  kind,
  onOpen,
  onStructure,
  onDefinition,
  onRefresh,
  onExplain,
  refreshingName,
}: {
  label: string;
  count: number;
  items: TableInfo[];
  kind: TableKind;
  onOpen: (t: TableInfo) => void;
  onStructure: (t: TableInfo) => void;
  onDefinition?: (t: TableInfo) => void;
  onRefresh?: (t: TableInfo) => void;
  onExplain?: (t: TableInfo) => void;
  refreshingName?: string;
}) {
  const [open, setOpen] = useState(true);
  const Icon = KIND_ICON[kind];
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 w-full px-2 py-1 text-[11px] uppercase tracking-wide text-muted hover:text-text"
      >
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? '' : '-rotate-90'}`}
        />
        {label}
        <Badge>{count}</Badge>
      </button>
      {open &&
        items.map((t) => {
          const refreshing = refreshingName === t.name;
          return (
            <div
              key={`${t.schema ?? ''}.${t.name}`}
              className="group flex items-center gap-2 pl-6 pr-2 py-1 hover:bg-panel-2 cursor-pointer"
              onClick={() => onOpen(t)}
            >
              <Icon size={13} className={`${KIND_COLOR[kind]} shrink-0`} />
              <span className="text-[13px] truncate flex-1">{t.name}</span>
              {kind === 'matview' && t.isPopulated === false && (
                <span
                  className="text-[9px] uppercase tracking-wide text-amber shrink-0"
                  title="Non peuplée — rafraîchis pour charger les données"
                >
                  vide
                </span>
              )}
              {t.rowEstimate != null && (
                <span className="text-[10px] text-muted/60 opacity-0 group-hover:opacity-100">
                  {formatNumber(t.rowEstimate)}
                </span>
              )}
              {onRefresh && (
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-text disabled:opacity-100"
                  title="Rafraîchir (REFRESH MATERIALIZED VIEW)"
                  disabled={refreshing}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh(t);
                  }}
                >
                  <RefreshCw
                    size={13}
                    className={refreshing ? 'animate-spin' : ''}
                  />
                </button>
              )}
              {onExplain && (
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent"
                  title="Expliquer avec l'assistant IA"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExplain(t);
                  }}
                >
                  <WandSparkles size={13} />
                </button>
              )}
              {onDefinition && (
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-text"
                  title="Voir la définition"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDefinition(t);
                  }}
                >
                  <FileCode size={13} />
                </button>
              )}
              <button
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-text"
                title="Structure"
                onClick={(e) => {
                  e.stopPropagation();
                  onStructure(t);
                }}
              >
                <Columns3 size={13} />
              </button>
            </div>
          );
        })}
    </div>
  );
}

function DefinitionDialog({
  connId,
  database,
  table,
  onClose,
}: {
  connId: string;
  database?: string;
  table: TableInfo;
  onClose: () => void;
}) {
  const def = useQuery({
    queryKey: ['definition', connId, database, table.schema, table.name],
    queryFn: () => api.viewDefinition(connId, table.name, database, table.schema),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={table.name}
      description={
        table.kind === 'matview' ? 'Vue matérialisée' : 'Vue'
      }
      className="w-[680px]"
    >
      {def.isLoading && <Spinner />}
      {def.isError && (
        <p className="text-xs text-red">{(def.error as Error).message}</p>
      )}
      {def.data && (
        <pre className="text-[12px] mono whitespace-pre-wrap bg-panel-2 rounded-lg p-3 overflow-auto max-h-[60vh]">
          {def.data.definition ?? '— définition indisponible —'}
        </pre>
      )}
    </Dialog>
  );
}
