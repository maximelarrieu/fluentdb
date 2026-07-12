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
} from 'lucide-react';
import type {
  CellValue,
  FilterSpec,
  RowChanges,
  SortSpec,
} from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { formatNumber } from '../../lib/format.js';
import { DataGrid } from './DataGrid.js';
import { FilterBar } from './FilterBar.js';
import { MockDataDialog } from './MockDataDialog.js';

const PAGE_SIZE = 100;
const editKey = (rowIndex: number, column: string) => `${rowIndex}::${column}`;

export function TableView({ table, schema }: { table: string; schema?: string }) {
  const { active, database, mockRequest, clearMockRequest } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortSpec | null>(null);
  const [filters, setFilters] = useState<FilterSpec[]>([]);
  const [edits, setEdits] = useState<Map<string, CellValue>>(new Map());
  const [newRows, setNewRows] = useState<Record<string, CellValue>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mockOpen, setMockOpen] = useState(false);
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
  ];
  const rowsQuery = useQuery({
    queryKey,
    queryFn: () =>
      api.rows(connId, table, {
        page,
        pageSize: PAGE_SIZE,
        sorts: sort ? [sort] : [],
        filters,
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

  const onSort = (column: string) => {
    setSort((prev) =>
      prev?.column === column
        ? prev.dir === 'asc'
          ? { column, dir: 'desc' }
          : null
        : { column, dir: 'asc' },
    );
    setPage(0);
  };

  const columns = data?.columns ?? [];
  const totalPages = data?.total ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const addRow = () => {
    setNewRows((r) => [...r, {}]);
    toast.push(
      'info',
      'Nouvelle ligne — édite-la puis Enregistrer (les valeurs par défaut/NULL sont utilisées si vides)',
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
      <FilterBar
        columns={columns}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(0);
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
              {save.isPending ? <Spinner className="text-white" /> : <Save size={13} />}
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
          <span className="text-muted">
            {formatNumber(data?.total ?? 0)} ligne(s)
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-muted tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              size="icon"
              variant="ghost"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => rowsQuery.refetch()}
          >
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}
