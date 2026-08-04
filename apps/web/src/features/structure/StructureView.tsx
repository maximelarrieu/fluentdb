import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound, Trash2, Pencil, Copy, FileCode, MessageSquareText } from 'lucide-react';
import type { ColumnInfo, DdlChange, TableStructure } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Badge, Spinner } from '../../components/ui/misc.js';
import {
  ContextMenu,
  CtxItem,
  CtxSeparator,
  CtxLabel,
} from '../../components/ui/ContextMenu.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { DdlDialog } from './DdlDialog.js';
import { TableDdlDialog } from './TableDdlDialog.js';
import { ColumnDialog } from './ColumnDialog.js';
import { CommentDialog, type CommentObject } from './CommentDialog.js';

export function StructureView({
  table,
  schema,
}: {
  table: string;
  schema?: string;
}) {
  const { active, database, bumpSchema } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const connId = active!.id;

  const [pendingChange, setPendingChange] = useState<DdlChange | null>(null);
  const [ddlOpen, setDdlOpen] = useState(false);
  const [columnDialog, setColumnDialog] = useState<{
    mode: 'add' | 'edit';
    column?: ColumnInfo;
  } | null>(null);
  // Comment editing target: the table/view itself, or a specific column.
  const [commentTarget, setCommentTarget] = useState<{
    object: CommentObject;
    column?: string;
    current?: string | null;
  } | null>(null);

  const structure = useQuery({
    queryKey: ['structure', connId, database, schema, table],
    queryFn: () => api.structure(connId, table, database, schema),
  });

  const dropColumn = useMutation({
    mutationFn: (column: string) =>
      api
        .ddlPreview(connId, { kind: 'dropColumn', table, schema, column }, database)
        .then((p) => api.ddlApply(connId, p.statements, database)),
    onSuccess: () => {
      toast.push('success', 'Colonne supprimée');
      structure.refetch();
    },
    onError: (e: ApiError) => toast.push('error', e.message),
  });

  const onApplied = () => {
    setPendingChange(null);
    setColumnDialog(null);
    structure.refetch();
    qc.invalidateQueries({ queryKey: ['tables', connId] });
    bumpSchema();
  };

  if (structure.isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (structure.isError) {
    return (
      <div className="p-4 text-red text-sm">
        {(structure.error as Error).message}
      </div>
    );
  }

  const s = structure.data as TableStructure;
  const canAlter = active!.capabilities.alterColumn;
  // COMMENT ON is generated for PostgreSQL only (MySQL views/columns and
  // SQLite lack a portable comment mechanism). Comments are still displayed.
  const canComment = active!.engine === 'postgres';
  const objectKind: CommentObject =
    s.table.kind === 'view'
      ? 'view'
      : s.table.kind === 'matview'
        ? 'matview'
        : 'table';

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold mono">
              {schema ? `${schema}.${table}` : table}
            </h2>
            {/* Object description (COMMENT ON) — shown here, editable on pg. */}
            {(s.table.comment || canComment) && (
              <div className="mt-1 flex items-start gap-1.5 group">
                {s.table.comment ? (
                  <p className="text-[13px] text-muted max-w-2xl">
                    {s.table.comment}
                  </p>
                ) : (
                  <p className="text-[13px] text-muted/50 italic">
                    Aucune description
                  </p>
                )}
                {canComment && (
                  <button
                    className="text-muted/60 hover:text-accent opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"
                    title="Modifier la description"
                    aria-label="Modifier la description de la table"
                    onClick={() =>
                      setCommentTarget({
                        object: objectKind,
                        current: s.table.comment ?? '',
                      })
                    }
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setDdlOpen(true)}>
            <FileCode size={13} /> Voir le SQL (CREATE)
          </Button>
        </div>
        <Section
          title="Colonnes"
          action={
            <Button size="sm" onClick={() => setColumnDialog({ mode: 'add' })}>
              <Plus size={13} /> Colonne
            </Button>
          }
        >
          <table className="w-full text-[13px]">
            <thead className="text-muted text-xs">
              <tr className="border-b border-border-soft">
                <th className="text-left font-medium py-1.5 px-2">Nom</th>
                <th className="text-left font-medium py-1.5 px-2">Type</th>
                <th className="text-left font-medium py-1.5 px-2">Null</th>
                <th className="text-left font-medium py-1.5 px-2">Défaut</th>
                <th className="text-left font-medium py-1.5 px-2">Commentaire</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {s.columns.map((c) => (
                <ContextMenu
                  key={c.name}
                  menu={
                    <>
                      <CtxLabel>{c.name}</CtxLabel>
                      <CtxItem
                        icon={<Copy size={14} />}
                        onSelect={() => {
                          void navigator.clipboard?.writeText(c.name);
                          toast.push('info', 'Nom copié');
                        }}
                      >
                        Copier le nom
                      </CtxItem>
                      {canAlter && (
                        <CtxItem
                          icon={<Pencil size={14} />}
                          onSelect={() =>
                            setColumnDialog({ mode: 'edit', column: c })
                          }
                        >
                          Modifier…
                        </CtxItem>
                      )}
                      {canComment && (
                        <CtxItem
                          icon={<MessageSquareText size={14} />}
                          onSelect={() =>
                            setCommentTarget({
                              object: 'column',
                              column: c.name,
                              current: c.comment ?? '',
                            })
                          }
                        >
                          Modifier le commentaire…
                        </CtxItem>
                      )}
                      <CtxItem
                        icon={<KeyRound size={14} />}
                        onSelect={() =>
                          setPendingChange({
                            kind: 'createIndex',
                            table,
                            schema,
                            name: `idx_${table}_${c.name}`,
                            columns: [c.name],
                            unique: false,
                          })
                        }
                      >
                        Créer un index…
                      </CtxItem>
                      <CtxSeparator />
                      <CtxItem
                        danger
                        icon={<Trash2 size={14} />}
                        onSelect={() =>
                          setPendingChange({
                            kind: 'dropColumn',
                            table,
                            schema,
                            column: c.name,
                          })
                        }
                      >
                        Supprimer la colonne…
                      </CtxItem>
                    </>
                  }
                >
                <tr
                  className="group border-b border-border-soft/50 hover:bg-panel-2/40"
                >
                  <td className="py-1.5 px-2 mono">
                    <span className="flex items-center gap-1.5">
                      {c.isPrimaryKey && (
                        <KeyRound size={12} className="text-amber" />
                      )}
                      {c.name}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 mono text-amber">
                    {c.dataType}
                    {c.isAutoIncrement && (
                      <Badge tone="accent">auto</Badge>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-muted">
                    {c.nullable ? 'NULL' : 'NOT NULL'}
                  </td>
                  <td className="py-1.5 px-2 text-muted mono truncate max-w-[160px]">
                    {c.defaultValue ?? '—'}
                  </td>
                  <td
                    className="py-1.5 px-2 text-muted truncate max-w-[220px]"
                    title={c.comment ?? undefined}
                  >
                    {c.comment ?? (
                      <span className="text-muted/40">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      {canComment && (
                        <button
                          className="text-muted hover:text-accent"
                          title="Modifier le commentaire"
                          aria-label={`Modifier le commentaire de ${c.name}`}
                          onClick={() =>
                            setCommentTarget({
                              object: 'column',
                              column: c.name,
                              current: c.comment ?? '',
                            })
                          }
                        >
                          <MessageSquareText size={13} />
                        </button>
                      )}
                      {canAlter && (
                        <button
                          className="text-muted hover:text-text"
                          onClick={() =>
                            setColumnDialog({ mode: 'edit', column: c })
                          }
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      <button
                        className="text-muted hover:text-red"
                        onClick={() => {
                          if (confirm(`Supprimer la colonne "${c.name}" ?`))
                            dropColumn.mutate(c.name);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
                </ContextMenu>
              ))}
            </tbody>
          </table>
        </Section>

        {s.indexes.length > 0 && (
          <Section title="Index">
            <div className="flex flex-col gap-1">
              {s.indexes.map((ix) => (
                <div
                  key={ix.name}
                  className="group flex items-center gap-2 text-[13px] py-1 px-2 rounded hover:bg-panel-2/40"
                >
                  <span className="mono">{ix.name}</span>
                  <span className="text-muted mono">
                    ({ix.columns.join(', ')})
                  </span>
                  {ix.primary && <Badge tone="amber">PK</Badge>}
                  {ix.unique && !ix.primary && <Badge tone="accent">unique</Badge>}
                  {/* Primary-key indexes can't be dropped on their own. */}
                  {!ix.primary && (
                    <button
                      className="ml-auto text-muted hover:text-red opacity-0 group-hover:opacity-100"
                      title="Supprimer l'index"
                      aria-label={`Supprimer l'index ${ix.name}`}
                      onClick={() =>
                        setPendingChange({
                          kind: 'dropIndex',
                          table,
                          schema,
                          name: ix.name,
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {s.foreignKeys.length > 0 && (
          <Section title="Clés étrangères">
            <div className="flex flex-col gap-1">
              {s.foreignKeys.map((fk) => (
                <div
                  key={fk.name}
                  className="text-[13px] py-1 px-2 mono text-muted"
                >
                  {fk.columns.join(', ')} →{' '}
                  <span className="text-accent">
                    {fk.referencedTable}({fk.referencedColumns.join(', ')})
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {columnDialog && (
        <ColumnDialog
          open
          onOpenChange={(o) => !o && setColumnDialog(null)}
          mode={columnDialog.mode}
          table={table}
          schema={schema}
          existing={columnDialog.column}
          onPreview={setPendingChange}
        />
      )}

      {pendingChange && (
        <DdlDialog
          change={pendingChange}
          table={table}
          schema={schema}
          onClose={() => setPendingChange(null)}
          onApplied={onApplied}
        />
      )}

      {ddlOpen && (
        <TableDdlDialog
          table={table}
          schema={schema}
          onClose={() => setDdlOpen(false)}
        />
      )}

      {commentTarget && (
        <CommentDialog
          object={commentTarget.object}
          table={table}
          schema={schema}
          column={commentTarget.column}
          current={commentTarget.current}
          onClose={() => setCommentTarget(null)}
          onApplied={() => {
            setCommentTarget(null);
            structure.refetch();
            bumpSchema();
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border-soft">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}
