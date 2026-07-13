import { useState, type ReactNode } from 'react';
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
  FileCode2,
  WandSparkles,
  Clock,
  LayoutDashboard,
  HeartPulse,
  Activity,
  Users,
  Sparkles,
  Copy,
  Pencil,
  Trash2,
  Eraser,
  Hash,
  Database,
  X,
  Braces,
  Cog,
  Zap,
  LayoutGrid,
} from 'lucide-react';
import { useUnseenTaskCount } from '../tasks/notifications.js';
import type {
  TableInfo,
  TableKind,
  RoutineInfo,
  TriggerInfo,
} from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Input, Select } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Spinner, Badge } from '../../components/ui/misc.js';
import {
  ContextMenu,
  CtxItem,
  CtxSeparator,
  CtxLabel,
} from '../../components/ui/ContextMenu.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { formatNumber } from '../../lib/format.js';
import { RenameTableDialog } from './RenameTableDialog.js';

export function SchemaTree() {
  const {
    active,
    database,
    schema,
    tabs,
    activeTabId,
    setDatabase,
    setSchema,
    openTable,
    openStructure,
    openQuery,
    openErd,
    openTasks,
    openDashboard,
    openHealth,
    openActivity,
    openRoles,
    openBoard,
    requestMockData,
    schemaVersion,
    toggleAi,
  } = useWorkspace();
  const unseenCount = useUnseenTaskCount();
  const [filter, setFilter] = useState('');
  const [defTarget, setDefTarget] = useState<TableInfo | null>(null);
  const [renameTarget, setRenameTarget] = useState<TableInfo | null>(null);
  const [codeView, setCodeView] = useState<{
    title: string;
    subtitle?: string;
    code: string;
  } | null>(null);
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

  const routines = useQuery({
    queryKey: ['routines', active?.id, database, schema, schemaVersion],
    queryFn: () => api.routines(active!.id, database, schema),
    enabled: !!active && (active?.capabilities.routines ?? false),
  });

  const triggers = useQuery({
    queryKey: ['triggers', active?.id, database, schema, schemaVersion],
    queryFn: () => api.triggers(active!.id, database, schema),
    enabled: !!active && (active?.capabilities.triggers ?? false),
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
  const flt = filter.toLowerCase();
  const routinesAll = routines.data ?? [];
  const functionsList = routinesAll.filter(
    (r) => r.kind === 'function' && r.name.toLowerCase().includes(flt),
  );
  const proceduresList = routinesAll.filter(
    (r) => r.kind === 'procedure' && r.name.toLowerCase().includes(flt),
  );
  const triggersList = (triggers.data ?? []).filter(
    (t) =>
      t.name.toLowerCase().includes(flt) || t.table.toLowerCase().includes(flt),
  );
  const totalObjects = (tables.data ?? []).length;
  const shownObjects = filtered.length;

  // Active tab drives in-tree / toolbar highlighting so the panel reflects
  // what's open (nav-state-active).
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeView = activeTab?.kind;
  const activeObjKey =
    activeTab && (activeTab.kind === 'table' || activeTab.kind === 'structure')
      ? `${activeTab.schema ?? ''}.${activeTab.table}`
      : null;

  const aiOn = aiStatus.data?.configured ?? false;
  const qc2 = active.engine === 'mysql' ? '`' : '"';
  const qid = (s: string) => `${qc2}${s}${qc2}`;
  const qname = (t: TableInfo) =>
    t.schema ? `${qid(t.schema)}.${qid(t.name)}` : qid(t.name);
  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text);
    toast.push('info', `${label} copié`);
  };
  const dropSql = (t: TableInfo) =>
    t.kind === 'view'
      ? `DROP VIEW ${qname(t)};`
      : t.kind === 'matview'
        ? `DROP MATERIALIZED VIEW ${qname(t)};`
        : `DROP TABLE ${qname(t)};`;
  const truncateSql = (t: TableInfo) =>
    active.engine === 'sqlite'
      ? `DELETE FROM ${qname(t)};`
      : `TRUNCATE TABLE ${qname(t)};`;

  // Right-click menu for any schema object. Destructive actions open their SQL
  // in a new editor so they pass through the usual write confirmation.
  const objectMenu = (t: TableInfo): ReactNode => (
    <>
      <CtxLabel>{t.name}</CtxLabel>
      <CtxItem icon={<Eye size={14} />} onSelect={() => openTable(t.name, t.schema)}>
        Ouvrir les données
      </CtxItem>
      <CtxItem
        icon={<Columns3 size={14} />}
        onSelect={() => openStructure(t.name, t.schema)}
      >
        Voir la structure
      </CtxItem>
      {t.kind !== 'table' && (
        <CtxItem icon={<FileCode size={14} />} onSelect={() => setDefTarget(t)}>
          Voir la définition
        </CtxItem>
      )}
      <CtxSeparator />
      <CtxItem
        icon={<FileCode2 size={14} />}
        onSelect={() => openQuery(`SELECT * FROM ${qname(t)} LIMIT 100;`)}
      >
        SELECT * (nouvel éditeur)
      </CtxItem>
      <CtxItem
        icon={<Hash size={14} />}
        onSelect={() => openQuery(`SELECT count(*) FROM ${qname(t)};`)}
      >
        Compter les lignes
      </CtxItem>
      {t.kind === 'matview' && active.capabilities.materializedViews && (
        <CtxItem icon={<RefreshCw size={14} />} onSelect={() => refresh.mutate(t)}>
          Rafraîchir
        </CtxItem>
      )}
      {t.kind === 'table' && aiOn && (
        <CtxItem
          icon={<Sparkles size={14} />}
          onSelect={() => requestMockData(t.name, t.schema)}
        >
          Générer des données de test (IA)
        </CtxItem>
      )}
      {aiOn && (
        <CtxItem
          icon={<WandSparkles size={14} />}
          onSelect={() => explainObject(t)}
        >
          Expliquer avec l'IA
        </CtxItem>
      )}
      <CtxSeparator />
      <CtxItem icon={<Copy size={14} />} onSelect={() => copy(qname(t), 'Nom')}>
        Copier le nom
      </CtxItem>
      <CtxSeparator />
      {t.kind === 'table' && (
        <>
          <CtxItem icon={<Pencil size={14} />} onSelect={() => setRenameTarget(t)}>
            Renommer…
          </CtxItem>
          <CtxItem
            danger
            icon={<Eraser size={14} />}
            onSelect={() => openQuery(truncateSql(t))}
          >
            Vider…
          </CtxItem>
        </>
      )}
      <CtxItem
        danger
        icon={<Trash2 size={14} />}
        onSelect={() => openQuery(dropSql(t))}
      >
        Supprimer…
      </CtxItem>
    </>
  );

  return (
    <div className="w-60 shrink-0 flex flex-col border-r border-border bg-panel h-full">
      {/* Workspace tools — compact icon toolbar (was six full-height rows
          that pushed the object list out of view). */}
      <div className="px-2 pt-2 pb-1.5 flex items-center gap-0.5 border-b border-border-soft">
        <ToolButton
          icon={<Workflow size={15} />}
          label="Diagramme ERD"
          active={activeView === 'erd'}
          onClick={openErd}
        />
        <ToolButton
          icon={<HeartPulse size={15} />}
          label="Bilan de santé"
          active={activeView === 'health'}
          onClick={openHealth}
        />
        {active.capabilities.activityMonitor && (
          <ToolButton
            icon={<Activity size={15} />}
            label="Activité"
            active={activeView === 'activity'}
            onClick={openActivity}
          />
        )}
        {active.capabilities.activityMonitor && (
          <ToolButton
            icon={<Users size={15} />}
            label="Rôles & privilèges"
            active={activeView === 'roles'}
            onClick={openRoles}
          />
        )}
        <ToolButton
          icon={<LayoutGrid size={15} />}
          label="Tableaux de bord"
          active={activeView === 'board'}
          onClick={openBoard}
        />
        <ToolButton
          icon={<LayoutDashboard size={15} />}
          label="Tableau de bord (tâches)"
          active={activeView === 'dashboard'}
          badge={unseenCount > 0}
          onClick={openDashboard}
        />
        <ToolButton
          icon={<Clock size={15} />}
          label="Tâches planifiées"
          active={activeView === 'tasks'}
          badge={unseenCount > 0}
          onClick={() => openTasks()}
        />
      </div>

      {/* Connection context: database + schema pickers. */}
      {(active.capabilities.multipleDatabases ||
        (active.capabilities.schemas && (schemas.data?.length ?? 0) > 0)) && (
        <div className="px-2.5 pt-2 flex flex-col gap-1.5">
          {active.capabilities.multipleDatabases && (
            <PickerSelect
              icon={<Database size={12} />}
              value={database ?? ''}
              onChange={(v) => setDatabase(v || undefined)}
            >
              {databases.data?.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </PickerSelect>
          )}
          {active.capabilities.schemas && (schemas.data?.length ?? 0) > 0 && (
            <PickerSelect
              icon={<Layers size={12} />}
              value={schema ?? ''}
              onChange={(v) => setSchema(v || undefined)}
            >
              <option value="">public (défaut)</option>
              {schemas.data?.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </PickerSelect>
          )}
        </div>
      )}

      {/* Search across objects. */}
      <div className="px-2.5 pt-2 pb-2 border-b border-border-soft">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Rechercher tables & vues…"
            className="pl-7 pr-12 h-7"
            aria-label="Rechercher parmi les tables et vues"
          />
          {filter ? (
            <button
              onClick={() => setFilter('')}
              aria-label="Effacer la recherche"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-0.5"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : (
            totalObjects > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted/70 tabular-nums pointer-events-none">
                {totalObjects}
              </span>
            )
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {tables.isLoading && <Spinner className="m-3" />}
        {tables.isError && (
          <p className="text-xs text-red px-3 py-2">
            {(tables.error as Error).message}
          </p>
        )}
        {!tables.isLoading &&
          !tables.isError &&
          totalObjects > 0 &&
          shownObjects === 0 && (
            <p className="text-xs text-muted px-3 py-4 text-center">
              Aucun objet ne correspond à «&nbsp;{filter}&nbsp;».
            </p>
          )}
        {!tables.isLoading && !tables.isError && totalObjects === 0 && (
          <p className="text-xs text-muted px-3 py-4 text-center">
            Aucune table dans ce schéma.
          </p>
        )}

        {tablesList.length > 0 && (
          <TreeSection
            label="Tables"
            count={tablesList.length}
            items={tablesList}
            kind="table"
            activeKey={activeObjKey}
            onOpen={(t) => openTable(t.name, t.schema)}
            onStructure={(t) => openStructure(t.name, t.schema)}
            onExplain={aiStatus.data?.configured ? explainObject : undefined}
            menuItems={objectMenu}
          />
        )}
        {viewsList.length > 0 && (
          <TreeSection
            label="Vues"
            count={viewsList.length}
            items={viewsList}
            kind="view"
            activeKey={activeObjKey}
            onOpen={(t) => openTable(t.name, t.schema)}
            onStructure={(t) => openStructure(t.name, t.schema)}
            onDefinition={setDefTarget}
            onExplain={aiStatus.data?.configured ? explainObject : undefined}
            menuItems={objectMenu}
          />
        )}
        {matviewsList.length > 0 && (
          <TreeSection
            label="Vues matérialisées"
            count={matviewsList.length}
            items={matviewsList}
            kind="matview"
            activeKey={activeObjKey}
            onOpen={(t) => openTable(t.name, t.schema)}
            onStructure={(t) => openStructure(t.name, t.schema)}
            onDefinition={setDefTarget}
            onRefresh={active.capabilities.materializedViews ? refresh.mutate : undefined}
            refreshingName={refresh.isPending ? refresh.variables?.name : undefined}
            onExplain={aiStatus.data?.configured ? explainObject : undefined}
            menuItems={objectMenu}
          />
        )}

        {functionsList.length > 0 && (
          <RoutineSection
            label="Fonctions"
            icon={Braces}
            iconColor="text-num"
            items={functionsList}
            onOpen={(r) =>
              setCodeView({
                title: r.name,
                subtitle: [r.args && `(${r.args})`, r.returns && `→ ${r.returns}`]
                  .filter(Boolean)
                  .join(' '),
                code: r.definition ?? '— définition indisponible —',
              })
            }
            onCopy={(r) => copy(r.name, 'Nom')}
          />
        )}
        {proceduresList.length > 0 && (
          <RoutineSection
            label="Procédures"
            icon={Cog}
            iconColor="text-accent"
            items={proceduresList}
            onOpen={(r) =>
              setCodeView({
                title: r.name,
                subtitle: r.args ? `(${r.args})` : undefined,
                code: r.definition ?? '— définition indisponible —',
              })
            }
            onCopy={(r) => copy(r.name, 'Nom')}
          />
        )}
        {triggersList.length > 0 && (
          <TriggerSection
            items={triggersList}
            onOpen={(t) =>
              setCodeView({
                title: t.name,
                subtitle: [t.timing, t.events?.join('/'), `sur ${t.table}`]
                  .filter(Boolean)
                  .join(' '),
                code: t.definition ?? '— définition indisponible —',
              })
            }
            onCopy={(t) => copy(t.name, 'Nom')}
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
          aria-label="Rafraîchir l'arbre des objets"
        >
          <RefreshCw size={13} aria-hidden="true" />
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

      {renameTarget && (
        <RenameTableDialog
          table={renameTarget.name}
          schema={renameTarget.schema}
          onClose={() => setRenameTarget(null)}
        />
      )}

      {codeView && (
        <Dialog
          open
          onOpenChange={(o) => !o && setCodeView(null)}
          title={codeView.title}
          description={codeView.subtitle}
          className="w-[680px]"
        >
          <pre className="text-[12px] mono whitespace-pre-wrap bg-panel-2 rounded-lg p-3 overflow-auto max-h-[60vh]">
            {codeView.code}
          </pre>
        </Dialog>
      )}
    </div>
  );
}

/** Compact workspace-tool button (icon + tooltip) with active + badge state. */
function ToolButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  badge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex-1 h-8 rounded-md flex items-center justify-center transition-colors ${
        active
          ? 'bg-accent/12 text-accent'
          : 'text-muted hover:text-text hover:bg-panel-2'
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {badge && (
        <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
      )}
    </button>
  );
}

/** Native select with a leading icon, styled to match the quiet chrome. */
function PickerSelect({
  icon,
  value,
  onChange,
  children,
}: {
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <span
        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        aria-hidden="true"
      >
        {icon}
      </span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 pl-6 text-[12px]"
      >
        {children}
      </Select>
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
  activeKey,
  onOpen,
  onStructure,
  onDefinition,
  onRefresh,
  onExplain,
  refreshingName,
  menuItems,
}: {
  label: string;
  count: number;
  items: TableInfo[];
  kind: TableKind;
  activeKey?: string | null;
  onOpen: (t: TableInfo) => void;
  onStructure: (t: TableInfo) => void;
  onDefinition?: (t: TableInfo) => void;
  onRefresh?: (t: TableInfo) => void;
  onExplain?: (t: TableInfo) => void;
  refreshingName?: string;
  menuItems?: (t: TableInfo) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const Icon = KIND_ICON[kind];
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="sticky top-0 z-[1] bg-panel flex items-center gap-1 w-full px-2 py-1 text-[11px] uppercase tracking-wide text-muted hover:text-text"
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
          const key = `${t.schema ?? ''}.${t.name}`;
          const isActive = activeKey === key;
          const row = (
            <div
              className={`group flex items-center gap-2 pl-6 pr-2 py-1 cursor-pointer border-l-2 ${
                isActive
                  ? 'bg-panel-2 border-accent'
                  : 'border-transparent hover:bg-panel-2'
              }`}
              onClick={() => onOpen(t)}
            >
              <Icon
                size={13}
                className={`${isActive ? 'text-accent' : KIND_COLOR[kind]} shrink-0`}
              />
              <span
                className={`text-[13px] truncate flex-1 ${isActive ? 'font-medium text-text' : ''}`}
              >
                {t.name}
              </span>
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
          return menuItems ? (
            <ContextMenu key={key} menu={menuItems(t)}>
              {row}
            </ContextMenu>
          ) : (
            <div key={key} className="contents">
              {row}
            </div>
          );
        })}
    </div>
  );
}

/** Collapsible list of stored functions / procedures. */
function RoutineSection({
  label,
  icon: Icon,
  iconColor,
  items,
  onOpen,
  onCopy,
}: {
  label: string;
  icon: typeof Table2;
  iconColor: string;
  items: RoutineInfo[];
  onOpen: (r: RoutineInfo) => void;
  onCopy: (r: RoutineInfo) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="sticky top-0 z-[1] bg-panel flex items-center gap-1 w-full px-2 py-1 text-[11px] uppercase tracking-wide text-muted hover:text-text"
      >
        <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        {label}
        <Badge>{items.length}</Badge>
      </button>
      {open &&
        items.map((r) => (
          <ContextMenu
            key={`${r.schema ?? ''}.${r.name}`}
            menu={
              <>
                <CtxLabel>{r.name}</CtxLabel>
                <CtxItem icon={<FileCode size={14} />} onSelect={() => onOpen(r)}>
                  Voir la définition
                </CtxItem>
                <CtxItem icon={<Copy size={14} />} onSelect={() => onCopy(r)}>
                  Copier le nom
                </CtxItem>
              </>
            }
          >
            <div
              className="group flex items-center gap-2 pl-6 pr-2 py-1 cursor-pointer hover:bg-panel-2"
              onClick={() => onOpen(r)}
              title={r.returns ? `${r.name} → ${r.returns}` : r.name}
            >
              <Icon size={13} className={`${iconColor} shrink-0`} />
              <span className="text-[13px] truncate flex-1">{r.name}</span>
              {r.returns && (
                <span className="text-[10px] text-muted/60 mono truncate max-w-[70px] opacity-0 group-hover:opacity-100">
                  {r.returns}
                </span>
              )}
            </div>
          </ContextMenu>
        ))}
    </div>
  );
}

/** Collapsible list of table triggers. */
function TriggerSection({
  items,
  onOpen,
  onCopy,
}: {
  items: TriggerInfo[];
  onOpen: (t: TriggerInfo) => void;
  onCopy: (t: TriggerInfo) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="sticky top-0 z-[1] bg-panel flex items-center gap-1 w-full px-2 py-1 text-[11px] uppercase tracking-wide text-muted hover:text-text"
      >
        <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        Triggers
        <Badge>{items.length}</Badge>
      </button>
      {open &&
        items.map((t) => (
          <ContextMenu
            key={`${t.schema ?? ''}.${t.table}.${t.name}`}
            menu={
              <>
                <CtxLabel>{t.name}</CtxLabel>
                <CtxItem icon={<FileCode size={14} />} onSelect={() => onOpen(t)}>
                  Voir la définition
                </CtxItem>
                <CtxItem icon={<Copy size={14} />} onSelect={() => onCopy(t)}>
                  Copier le nom
                </CtxItem>
              </>
            }
          >
            <div
              className="group flex items-center gap-2 pl-6 pr-2 py-1 cursor-pointer hover:bg-panel-2"
              onClick={() => onOpen(t)}
              title={`${t.name} · ${t.timing ?? ''} ${t.events?.join('/') ?? ''} sur ${t.table}`}
            >
              <Zap size={13} className="text-amber shrink-0" />
              <span className="text-[13px] truncate flex-1">{t.name}</span>
              <span className="text-[10px] text-muted/60 truncate max-w-[80px] opacity-0 group-hover:opacity-100">
                {t.table}
              </span>
            </div>
          </ContextMenu>
        ))}
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
