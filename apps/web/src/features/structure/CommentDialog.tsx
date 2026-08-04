import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { CopyableSql } from '../../components/ui/CopyableSql.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';

export type CommentObject = 'table' | 'view' | 'matview' | 'column';

const OBJ_KEYWORD: Record<CommentObject, string> = {
  table: 'TABLE',
  view: 'VIEW',
  matview: 'MATERIALIZED VIEW',
  column: 'COLUMN',
};

function q(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Edit an object's comment via `COMMENT ON …` (PostgreSQL). The statement is
 * built client-side and applied through the DDL endpoint (read-only guarded).
 * An empty comment clears it (`IS NULL`).
 */
export function CommentDialog({
  object,
  table,
  schema,
  column,
  current,
  onClose,
  onApplied,
}: {
  object: CommentObject;
  table: string;
  schema?: string;
  column?: string;
  current?: string | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { active, database } = useWorkspace();
  const toast = useToast();
  const [text, setText] = useState(current ?? '');

  const statement = useMemo(() => {
    const target = schema ? `${q(schema)}.${q(table)}` : q(table);
    const ref = object === 'column' ? `${target}.${q(column ?? '')}` : target;
    const value = text.trim() ? `'${text.replace(/'/g, "''")}'` : 'NULL';
    return `COMMENT ON ${OBJ_KEYWORD[object]} ${ref} IS ${value}`;
  }, [object, table, schema, column, text]);

  const apply = useMutation({
    mutationFn: () => api.ddlApply(active!.id, [statement], database),
    onSuccess: () => {
      toast.push('success', 'Commentaire mis à jour');
      onApplied();
    },
    onError: (err) =>
      toast.push('error', err instanceof ApiError ? err.message : String(err)),
  });

  const title =
    object === 'column'
      ? `Commentaire — ${column}`
      : `Commentaire — ${table}`;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Décris l'objet ; enregistré dans la base (COMMENT ON)."
      className="w-[560px]"
    >
      <div className="flex flex-col gap-4">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="À quoi sert cet objet, ce qu'il contient…"
          className="w-full rounded-md bg-bg border border-border px-2.5 py-1.5 text-[13px] placeholder:text-muted/60 outline-none resize-y focus:border-accent focus:ring-1 focus:ring-accent/40"
        />
        <div>
          <span className="text-xs text-muted">SQL généré</span>
          <div className="mt-1">
            <CopyableSql sql={`${statement};`} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={apply.isPending}
            onClick={() => apply.mutate()}
          >
            {apply.isPending && <Spinner className="text-current" />} Appliquer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
