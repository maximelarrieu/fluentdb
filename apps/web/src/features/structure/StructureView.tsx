import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound, Trash2, Pencil, Copy } from 'lucide-react';
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
import { ColumnDialog } from './ColumnDialog.js';

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
  const [columnDialog, setColumnDialog] = useState<{
    mode: 'add' | 'edit';
    column?: ColumnInfo;
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

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
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
                  <td className="py-1.5 px-2 mono text-[#f2a15a]">
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
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
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
                  className="flex items-center gap-2 text-[13px] py-1 px-2 rounded hover:bg-panel-2/40"
                >
                  <span className="mono">{ix.name}</span>
                  <span className="text-muted mono">
                    ({ix.columns.join(', ')})
                  </span>
                  {ix.primary && <Badge tone="amber">PK</Badge>}
                  {ix.unique && !ix.primary && <Badge tone="accent">unique</Badge>}
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
