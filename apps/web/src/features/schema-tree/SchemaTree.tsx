import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table2,
  Eye,
  ChevronDown,
  Search,
  RefreshCw,
  Columns3,
  Workflow,
} from 'lucide-react';
import type { TableInfo } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Input, Select } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner, Badge } from '../../components/ui/misc.js';
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
    schemaVersion,
  } = useWorkspace();
  const [filter, setFilter] = useState('');

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

  if (!active) return null;

  const filtered = (tables.data ?? []).filter((t) =>
    t.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const tablesList = filtered.filter((t) => t.kind === 'table');
  const viewsList = filtered.filter((t) => t.kind === 'view');

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
          onOpen={(t) => openTable(t.name, t.schema)}
          onStructure={(t) => openStructure(t.name, t.schema)}
        />
        {viewsList.length > 0 && (
          <TreeSection
            label="Vues"
            count={viewsList.length}
            items={viewsList}
            isView
            onOpen={(t) => openTable(t.name, t.schema)}
            onStructure={(t) => openStructure(t.name, t.schema)}
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
    </div>
  );
}

function TreeSection({
  label,
  count,
  items,
  isView,
  onOpen,
  onStructure,
}: {
  label: string;
  count: number;
  items: TableInfo[];
  isView?: boolean;
  onOpen: (t: TableInfo) => void;
  onStructure: (t: TableInfo) => void;
}) {
  const [open, setOpen] = useState(true);
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
        items.map((t) => (
          <div
            key={`${t.schema ?? ''}.${t.name}`}
            className="group flex items-center gap-2 pl-6 pr-2 py-1 hover:bg-panel-2 cursor-pointer"
            onClick={() => onOpen(t)}
          >
            {isView ? (
              <Eye size={13} className="text-amber shrink-0" />
            ) : (
              <Table2 size={13} className="text-accent shrink-0" />
            )}
            <span className="text-[13px] truncate flex-1">{t.name}</span>
            {t.rowEstimate != null && (
              <span className="text-[10px] text-muted/60 opacity-0 group-hover:opacity-100">
                {formatNumber(t.rowEstimate)}
              </span>
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
        ))}
    </div>
  );
}
