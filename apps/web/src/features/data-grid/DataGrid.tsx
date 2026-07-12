import {
  useMemo,
  useRef,
  useState,
  useEffect,
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { CellValue, PageResult, QueryColumn } from '@fluentdb/shared';
import { formatCell } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';
import { ContextMenu } from '../../components/ui/ContextMenu.js';

export interface EditedCell {
  rowIndex: number;
  column: string;
  value: CellValue;
}

interface Props {
  columns: QueryColumn[];
  rows: CellValue[][];
  pkColumns?: string[];
  loading?: boolean;
  /** column -> pending edits keyed by row index */
  edits?: Map<string, CellValue>;
  onEdit?: (rowIndex: number, column: string, value: CellValue) => void;
  onSort?: (column: string) => void;
  sortState?: { column: string; dir: 'asc' | 'desc' } | null;
  selectedRows?: Set<number>;
  onSelectRow?: (rowIndex: number, selected: boolean) => void;
  editable?: boolean;
  /** Right-click menu for a column header. */
  columnMenu?: (col: QueryColumn) => ReactNode;
  /** Right-click menu for a data cell. */
  cellMenu?: (rowIndex: number, col: QueryColumn, value: CellValue) => ReactNode;
}

const editKey = (rowIndex: number, column: string) => `${rowIndex}::${column}`;

export function DataGrid({
  columns,
  rows,
  pkColumns = [],
  loading,
  edits,
  onEdit,
  onSort,
  sortState,
  selectedRows,
  onSelectRow,
  editable,
  columnMenu,
  cellMenu,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ row: number; col: string } | null>(
    null,
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 12,
  });

  const pkSet = useMemo(() => new Set(pkColumns), [pkColumns]);
  const colWidths = useMemo(
    () => columns.map((c) => Math.min(360, Math.max(120, c.name.length * 9 + 60))),
    [columns],
  );
  const gridTemplate = useMemo(
    () =>
      `${onSelectRow ? '36px ' : ''}${colWidths.map((w) => `${w}px`).join(' ')} 1fr`,
    [colWidths, onSelectRow],
  );

  return (
    <div className="h-full flex flex-col bg-bg">
      <div ref={parentRef} className="flex-1 overflow-auto relative">
        <div style={{ minWidth: 'max-content' }}>
          {/* header */}
          <div
            className="sticky top-0 z-10 grid bg-panel border-b border-border text-[12px]"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {onSelectRow && <div className="border-r border-border-soft" />}
            {columns.map((c) => {
              const header = (
                <button
                  onClick={() => onSort?.(c.name)}
                  disabled={!onSort}
                  className={cn(
                    'flex items-center gap-1 px-2.5 h-8 text-left border-r border-border-soft w-full',
                    'font-medium truncate hover:bg-panel-2 disabled:hover:bg-transparent',
                  )}
                  title={c.dataType}
                >
                  {pkSet.has(c.name) && (
                    <span className="text-amber text-[10px]" title="Clé primaire">
                      ★
                    </span>
                  )}
                  <span className="truncate">{c.name}</span>
                  {sortState?.column === c.name && (
                    <span className="text-accent ml-auto">
                      {sortState.dir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              );
              return columnMenu ? (
                <ContextMenu key={c.name} menu={columnMenu(c)}>
                  {header}
                </ContextMenu>
              ) : (
                <div key={c.name} className="contents">
                  {header}
                </div>
              );
            })}
            <div className="h-8" />
          </div>

          {/* rows */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const row = rows[vRow.index]!;
              const isSelected = selectedRows?.has(vRow.index);
              return (
                <div
                  key={vRow.key}
                  className={cn(
                    'grid absolute left-0 right-0 border-b border-border-soft text-[12px]',
                    isSelected ? 'bg-accent/10' : 'hover:bg-panel/60',
                  )}
                  style={{
                    gridTemplateColumns: gridTemplate,
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  {onSelectRow && (
                    <div className="flex items-center justify-center border-r border-border-soft">
                      <input
                        type="checkbox"
                        checked={isSelected ?? false}
                        onChange={(e) =>
                          onSelectRow(vRow.index, e.target.checked)
                        }
                      />
                    </div>
                  )}
                  {columns.map((c, ci) => {
                    const k = editKey(vRow.index, c.name);
                    const hasEdit = edits?.has(k);
                    const value = hasEdit ? edits!.get(k)! : row[ci]!;
                    const isEditing =
                      editing?.row === vRow.index && editing?.col === c.name;
                    const cell = (
                      <Cell
                        value={value ?? null}
                        dirty={hasEdit}
                        editable={editable && !!onEdit}
                        editing={isEditing}
                        onStartEdit={() =>
                          setEditing({ row: vRow.index, col: c.name })
                        }
                        onCommit={(v) => {
                          onEdit?.(vRow.index, c.name, v);
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    );
                    return cellMenu && !isEditing ? (
                      <ContextMenu
                        key={c.name}
                        menu={cellMenu(vRow.index, c, value ?? null)}
                      >
                        {cell}
                      </ContextMenu>
                    ) : (
                      <div key={c.name} className="contents">
                        {cell}
                      </div>
                    );
                  })}
                  <div />
                </div>
              );
            })}
          </div>
        </div>

        {!loading && rows.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            Aucune ligne
          </div>
        )}
      </div>
    </div>
  );
}

const Cell = forwardRef<
  HTMLDivElement,
  {
    value: CellValue;
    dirty?: boolean;
    editable?: boolean;
    editing: boolean;
    onStartEdit: () => void;
    onCommit: (value: CellValue) => void;
    onCancel: () => void;
  } & HTMLAttributes<HTMLDivElement>
>(function Cell(
  {
    value,
    dirty,
    editable,
    editing,
    onStartEdit,
    onCommit,
    onCancel,
    ...rest
  },
  ref,
) {
  const { text, kind } = formatCell(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  useEffect(() => {
    if (editing) {
      setDraft(value === null ? '' : String(value));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="px-2.5 h-full bg-panel-2 border border-accent outline-none text-[12px] mono w-full"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(draft);
          else if (e.key === 'Escape') onCancel();
          else if (e.key === 'Delete' && e.shiftKey) onCommit(null);
        }}
      />
    );
  }

  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        'px-2.5 flex items-center border-r border-border-soft truncate cursor-default',
        'mono',
        dirty && 'bg-amber/15',
        editable && 'cursor-text',
      )}
      onDoubleClick={editable ? onStartEdit : undefined}
      title={text}
    >
      <span
        className={cn(
          'truncate',
          kind === 'null' && 'text-muted/50 italic',
          kind === 'number' && 'text-[#7fd6b0]',
          kind === 'bool' && 'text-accent',
          kind === 'json' && 'text-amber/90',
          kind === 'blob' && 'text-muted/60',
        )}
      >
        {text}
      </span>
    </div>
  );
});

export type { PageResult };
