import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  Trash2,
  Undo2,
  RefreshCw,
  Sparkles,
  Copy,
  ArrowUp,
  ArrowDown,
  Filter,
  KeyRound,
  Braces,
  Ban,
} from 'lucide-react';
import type {
  CellValue,
  DdlChange,
  FilterSpec,
  QueryColumn,
  RowChanges,
  SortSpec,
} from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import {
  CtxItem,
  CtxSeparator,
  CtxLabel,
} from '../../components/ui/ContextMenu.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { formatNumber } from '../../lib/format.js';
import { DataGrid } from './DataGrid.js';
import { FilterBar } from './FilterBar.js';
import { MockDataDialog } from './MockDataDialog.js';
import { DdlDialog } from '../structure/DdlDialog.js';

const PAGE_SIZE = 100;
const editKey = (rowIndex: number, column: string) => `${rowIndex}::${column}`;

export function TableView({ table, schema }: { table: string; schema?: string }) {
  const { active, database, mockRequest, clearMockRequest, bumpSchema } =
    useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const [ddl, setDdl] = useState<DdlChange | null>(null);

  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec | null>(null);
  const [filters, setFilters] = useState<FilterSpec[]>([]);
  const [edits, setEdits] = useState<Map<string, CellValue>>(new Map());
  const [newRows, setNewRows] = useState<Record<string, CellValue>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mockOpen, setMockOpen] = useState(false);
  const [exactCount, setExactCount] = useState(false);
  // Keyset cursor (fast pagination on big tables); depth 0 = first page.
  const [cursor, setCursor] = useState<{ after?: CellValue; before?: CellValue }>(
    {},
  );
  const [depth, setDepth] = useState(0);
  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus });

  // Pop the mock-data dialog when the tree asked for it on this table.
  useEffect(() => {
    if (mockRequest && mockRequest.table === table && mockRequest.schema === schema) {
      setMockOpen(true);
      clearMockRequest();
    }
  }, [mockRequest, table, schema, clearMockRequest]);

  const connId = active!.id;

  const queryKey = [
    'rows',
    connId,
    database,
    schema,
    table,
    page,
    sort,
    filters,
    exactCount,
    cursor,
  ];
  const rowsQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.rows(connId, table, {
        page,
        pageSize: PAGE_SIZE,
        sorts: sort ? [sort] : [],
        filters,
        exactCount,
        after: cursor.after as string | number | undefined,
        before: cursor.before as string | number | undefined,
        database,
        schema,
      }),
  });

  const data = rowsQuery.data;
  // Editable when the table exposes a primary key (needed to target rows).
  const editable = (data?.pkColumns.length ?? 0) > 0;

  // New (unsaved) rows are appended after the fetched rows so they can be
  // edited inline in the same grid; edits on those indices route to newRows.
  const baseRowCount = data?.rows.length ?? 0;
  const displayRows = useMemo(() => {
    if (!data) return [];
    const blanks = newRows.map((r) =>
      data.columns.map((c) => r[c.name] ?? null),
    );
    return [...data.rows, ...blanks];
  }, [data, newRows]);

  const dirtyCount = edits.size + newRows.length + selected.size;

  const resetPending = () => {
    setEdits(new Map());
    setNewRows([]);
    setSelected(new Set());
  };

  const save = useMutation({
    mutationFn: () => {
      if (!data) throw new Error('No data');
      const updatesByRow = new Map<number, Record<string, CellValue>>();
      for (const [key, value] of edits) {
        const [rowIdxStr, column] = key.split('::');
        const rowIdx = Number(rowIdxStr);
        const obj = updatesByRow.get(rowIdx) ?? {};
        obj[column!] = value;
        updatesByRow.set(rowIdx, obj);
      }
      const pkIndexes = data.pkColumns.map((pk) =>
        data.columns.findIndex((c) => c.name === pk),
      );
      const keyForRow = (rowIdx: number): Record<string, CellValue> => {
        const row = data.rows[rowIdx]!;
        const key: Record<string, CellValue> = {};
        data.pkColumns.forEach((pk, i) => {
          key[pk] = row[pkIndexes[i]!] ?? null;
        });
        return key;
      };

      const changes: RowChanges = {
        inserts: newRows,
        updates: [...updatesByRow.entries()].map(([rowIdx, changes]) => ({
          key: keyForRow(rowIdx),
          changes,
        })),
        deletes: [...selected].map((rowIdx) => ({ key: keyForRow(rowIdx) })),
      };
      return api.mutate(connId, table, changes, database, schema);
    },
    onSuccess: (r) => {
      toast.push(
        'success',
        `Enregistré : ${r.inserted} ajout(s), ${r.updated} modif(s), ${r.deleted} suppression(s)`,
      );
      resetPending();
      qc.invalidateQueries({ queryKey: ['rows', connId] });
    },
    onError: (e: ApiError) => toast.push('error', e.message),
  });

  const onEdit = (rowIndex: number, column: string, value: CellValue) => {
    // Edits on appended rows update the pending insert instead of updates.
    if (rowIndex >= baseRowCount) {
      const newIdx = rowIndex - baseRowCount;
      setNewRows((rows) =>
        rows.map((r, i) => (i === newIdx ? { ...r, [column]: value } : r)),
      );
      return;
    }
    setEdits((prev) => {
      const next = new Map(prev);
      const original = data?.rows[rowIndex]?.[
        data.columns.findIndex((c) => c.name === column)
      ];
      if (value === (original ?? null)) next.delete(editKey(rowIndex, column));
      else next.set(editKey(rowIndex, column), value);
      return next;
    });
  };

  // Any change to sort/filters restarts paging from the first page.
  const resetPaging = () => {
    setPage(0);
    setCursor({});
    setDepth(0);
  };

  const onSort = (column: string) => {
    setSort((prev) =>
      prev?.column === column
        ? prev.dir === 'asc'
          ? { column, dir: 'desc' }
          : null
        : { column, dir: 'asc' },
    );
    resetPaging();
  };

  const columns = data?.columns ?? [];
  const totalPages = data?.total ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const keysetCol = data?.keysetColumn ?? null;
  const keysetIdx = keysetCol
    ? columns.findIndex((c) => c.name === keysetCol)
    : -1;
  const serverRows = data?.rows ?? [];

  const goNext = () => {
    if (keysetCol && keysetIdx >= 0) {
      const last = serverRows.at(-1);
      if (!last) return;
      setCursor({ after: last[keysetIdx] as CellValue });
      setDepth((d) => d + 1);
    } else {
      setPage((p) => p + 1);
    }
  };
  const goPrev = () => {
    if (keysetCol && keysetIdx >= 0) {
      const first = serverRows[0];
      if (depth <= 1) {
        resetPaging();
        return;
      }
      if (first) {
        setCursor({ before: first[keysetIdx] as CellValue });
        setDepth((d) => Math.max(0, d - 1));
      }
    } else {
      setPage((p) => Math.max(0, p - 1));
    }
  };
  const prevDisabled = keysetCol ? depth === 0 : page === 0;
  const nextDisabled = keysetCol
    ? serverRows.length < PAGE_SIZE
    : data?.approximate
      ? serverRows.length < PAGE_SIZE
      : page + 1 >= totalPages;

  const addRow = () => {
    setNewRows((r) => [...r, {}]);
    toast.push(
      'info',
      'Nouvelle ligne — édite-la puis Enregistrer (les valeurs par défaut/NULL sont utilisées si vides)',
    );
  };

  // Right-click menu for a column header.
  const columnMenu = (col: QueryColumn) => (
    <>
      <CtxLabel>{col.name}</CtxLabel>
      <CtxItem
        icon={<Copy size={14} />}
        onSelect={() => {
          void navigator.clipboard?.writeText(col.name);
          toast.push('info', 'Nom copié');
        }}
      >
        Copier le nom
      </CtxItem>
      <CtxSeparator />
      <CtxItem
        icon={<ArrowUp size={14} />}
        onSelect={() => {
          setSort({ column: col.name, dir: 'asc' });
          resetPaging();
        }}
      >
        Trier croissant
      </CtxItem>
      <CtxItem
        icon={<ArrowDown size={14} />}
        onSelect={() => {
          setSort({ column: col.name, dir: 'desc' });
          resetPaging();
        }}
      >
        Trier décroissant
      </CtxItem>
      <CtxItem
        icon={<Filter size={14} />}
        onSelect={() => {
          setFilters((f) =>
            f.some((x) => x.column === col.name && !x.value)
              ? f
              : [...f, { column: col.name, op: 'eq', value: '' }],
          );
          resetPaging();
        }}
      >
        Filtrer par cette colonne
      </CtxItem>
      <CtxSeparator />
      <CtxItem
        icon={<KeyRound size={14} />}
        onSelect={() =>
          setDdl({
            kind: 'createIndex',
            table,
            schema,
            name: `idx_${table}_${col.name}`,
            columns: [col.name],
            unique: false,
          })
        }
      >
        Créer un index…
      </CtxItem>
      <CtxItem
        danger
        icon={<Trash2 size={14} />}
        onSelect={() => setDdl({ kind: 'dropColumn', table, schema, column: col.name })}
      >
        Supprimer la colonne…
      </CtxItem>
    </>
  );

  // Right-click menu for a data cell / row.
  const cellMenu = (rowIndex: number, col: QueryColumn, value: CellValue) => {
    const rowObj = Object.fromEntries(
      columns.map((c, i) => [c.name, displayRows[rowIndex]?.[i] ?? null]),
    );
    return (
      <>
        <CtxItem
          icon={<Copy size={14} />}
          onSelect={() => {
            void navigator.clipboard?.writeText(value === null ? '' : String(value));
            toast.push('info', 'Valeur copiée');
          }}
        >
          Copier la valeur
        </CtxItem>
        <CtxItem
          icon={<Braces size={14} />}
          onSelect={() => {
            void navigator.clipboard?.writeText(JSON.stringify(rowObj, null, 2));
            toast.push('info', 'Ligne copiée (JSON)');
          }}
        >
          Copier la ligne (JSON)
        </CtxItem>
        <CtxSeparator />
        <CtxItem
          icon={<Filter size={14} />}
          onSelect={() => {
            setFilters((f) => [
              ...f.filter((x) => x.column !== col.name),
              value === null
                ? { column: col.name, op: 'is_null' }
                : { column: col.name, op: 'eq', value: String(value) },
            ]);
            resetPaging();
          }}
        >
          Filtrer par cette valeur
        </CtxItem>
        {editable && (
          <>
            <CtxSeparator />
            <CtxItem
              icon={<Ban size={14} />}
              onSelect={() => onEdit(rowIndex, col.name, null)}
            >
              Mettre à NULL
            </CtxItem>
            <CtxItem
              danger
              icon={<Trash2 size={14} />}
              onSelect={() => {
                setSelected((prev) => new Set(prev).add(rowIndex));
                toast.push(
                  'info',
                  'Ligne marquée pour suppression — Enregistrer pour appliquer',
                );
              }}
            >
              Supprimer la ligne
            </CtxItem>
          </>
        )}
      </>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {mockOpen && (
        <MockDataDialog
          connectionId={connId}
          database={database}
          schema={schema}
          table={table}
          onClose={() => setMockOpen(false)}
          onInserted={() =>
            qc.invalidateQueries({ queryKey: ['rows', connId] })
          }
        />
      )}
      {ddl && (
        <DdlDialog
          change={ddl}
          table={table}
          schema={schema}
          onClose={() => setDdl(null)}
          onApplied={() => {
            setDdl(null);
            qc.invalidateQueries({ queryKey: ['rows', connId] });
            bumpSchema();
          }}
        />
      )}
      <FilterBar
        columns={columns}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          resetPaging();
        }}
      />

      <div className="flex-1 min-h-0">
        {rowsQuery.isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Spinner />
          </div>
        ) : rowsQuery.isError ? (
          <div className="p-4 text-sm text-red">
            {(rowsQuery.error as Error).message}
          </div>
        ) : (
          <DataGrid
            columns={columns}
            rows={displayRows}
            pkColumns={data?.pkColumns}
            edits={edits}
            editable={editable}
            onEdit={onEdit}
            onSort={onSort}
            sortState={sort}
            columnMenu={columnMenu}
            cellMenu={cellMenu}
            selectedRows={editable ? selected : undefined}
            onSelectRow={
              editable
                ? (i, sel) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (sel) next.add(i);
                      else next.delete(i);
                      return next;
                    })
                : undefined
            }
          />
        )}
      </div>

      {dirtyCount > 0 && (
        <div className="flex items-center justify-between px-3 h-11 bg-amber/10 border-t border-amber/30">
          <span className="text-[13px] text-amber">
            {edits.size} cellule(s) modifiée(s), {newRows.length} ajout(s),{' '}
            {selected.size} à supprimer
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={resetPending}>
              <Undo2 size={13} /> Annuler
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? <Spinner className="text-current" /> : <Save size={13} />}
              Enregistrer
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-3 h-9 border-t border-border bg-panel text-xs">
        <div className="flex items-center gap-2">
          {editable ? (
            <>
              <Button size="sm" variant="ghost" onClick={addRow}>
                <Plus size={13} /> Ligne
              </Button>
              {selected.size > 0 && (
                <span className="text-muted flex items-center gap-1">
                  <Trash2 size={12} /> {selected.size} sélectionnée(s)
                </span>
              )}
            </>
          ) : (
            <span className="text-muted/70">
              Lecture seule — pas de clé primaire détectée
            </span>
          )}
          {/* Mock data only inserts rows, so a primary key is not required. */}
          {aiStatus.data?.configured && (
            <Button size="sm" variant="ghost" onClick={() => setMockOpen(true)}>
              <Sparkles size={13} /> Données de test
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted flex items-center gap-1.5">
            {data?.approximate ? '~' : ''}
            {formatNumber(data?.total ?? 0)} ligne(s)
            {data?.approximate && (
              <button
                className="text-accent hover:underline"
                title="Compter exactement (COUNT(*))"
                onClick={() => setExactCount(true)}
              >
                compter
              </button>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              disabled={prevDisabled}
              onClick={goPrev}
              title="Page précédente"
              aria-label="Page précédente"
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </Button>
            <span className="text-muted tabular-nums">
              {keysetCol
                ? `page ${depth + 1}`
                : data?.approximate
                  ? `page ${page + 1}`
                  : `${page + 1} / ${totalPages}`}
            </span>
            <Button
              size="icon"
              variant="ghost"
              disabled={nextDisabled}
              onClick={goNext}
              title="Page suivante"
              aria-label="Page suivante"
            >
              <ChevronRight size={14} aria-hidden="true" />
            </Button>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => rowsQuery.refetch()}
            title="Rafraîchir"
            aria-label="Rafraîchir les données"
          >
            <RefreshCw size={13} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
