import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';

type Dialect = 'postgres' | 'mysql' | 'sqlite';

/** Quote an identifier for the target dialect (backticks for MySQL). */
function quoteIdent(dialect: Dialect, name: string): string {
  return dialect === 'mysql'
    ? `\`${name.replaceAll('`', '``')}\``
    : `"${name.replaceAll('"', '""')}"`;
}

/**
 * Create or edit a (materialized) view. Builds the `CREATE [OR REPLACE] VIEW …`
 * statement (plus an optional COMMENT) and runs it through the DDL endpoint,
 * which enforces the read-only guard server-side.
 *
 * In `edit` mode the name is fixed, the SQL body is editable (prefilled with the
 * current definition), and the comment is synced (set or cleared).
 */
export function SaveAsViewDialog({
  sql,
  materialized: initialMaterialized,
  canMaterialized,
  dialect,
  onClose,
  mode = 'create',
  initialName = '',
  initialDescription = '',
  viewSchema,
}: {
  sql: string;
  materialized: boolean;
  canMaterialized: boolean;
  dialect: Dialect;
  onClose: () => void;
  mode?: 'create' | 'edit';
  initialName?: string;
  initialDescription?: string;
  /** In edit mode, the schema the view actually lives in. */
  viewSchema?: string;
}) {
  const { active, database, schema, bumpSchema } = useWorkspace();
  const toast = useToast();
  const isEdit = mode === 'edit';
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [body, setBody] = useState(sql);
  const [materialized, setMaterialized] = useState(
    isEdit ? initialMaterialized : initialMaterialized && canMaterialized,
  );

  // Only PostgreSQL can attach a comment to a view (COMMENT ON VIEW). MySQL
  // views and SQLite have no comment mechanism, so the field is hidden there.
  const supportsComment = dialect === 'postgres';
  const effectiveSchema = isEdit ? viewSchema : schema;

  const target = useMemo(
    () =>
      dialect === 'postgres' && effectiveSchema
        ? `${quoteIdent(dialect, effectiveSchema)}.${quoteIdent(dialect, name || 'nom_de_la_vue')}`
        : quoteIdent(dialect, name || 'nom_de_la_vue'),
    [dialect, effectiveSchema, name],
  );

  const statements = useMemo(() => {
    const b = body.trim().replace(/;\s*$/, '');
    const kind = materialized ? 'MATERIALIZED VIEW' : 'VIEW';
    const out: string[] = [];
    if (isEdit && materialized) {
      // Materialized views have no CREATE OR REPLACE — drop then recreate
      // (atomic: applyDdl wraps every statement in one transaction).
      out.push(`DROP MATERIALIZED VIEW ${target}`);
      out.push(`CREATE MATERIALIZED VIEW ${target} AS\n${b}`);
    } else if (isEdit) {
      out.push(`CREATE OR REPLACE VIEW ${target} AS\n${b}`);
    } else {
      out.push(`CREATE ${kind} ${target} AS\n${b}`);
    }
    const desc = description.trim();
    if (supportsComment && (desc || isEdit)) {
      // In edit mode always sync (set or clear); in create only when provided.
      out.push(
        `COMMENT ON ${kind} ${target} IS ${desc ? `'${desc.replace(/'/g, "''")}'` : 'NULL'}`,
      );
    }
    return out;
  }, [body, target, materialized, description, supportsComment, isEdit]);

  const previewSql = statements.map((s) => `${s};`).join('\n\n');

  const save = useMutation({
    mutationFn: () => api.ddlApply(active!.id, statements, database),
    onSuccess: () => {
      toast.push(
        'success',
        isEdit
          ? 'Vue mise à jour'
          : materialized
            ? 'Vue matérialisée créée'
            : 'Vue créée',
      );
      bumpSchema();
      onClose();
    },
    onError: (err) =>
      toast.push('error', err instanceof ApiError ? err.message : String(err)),
  });

  const validName = /\S/.test(name);
  const validBody = /\S/.test(body);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'Modifier la vue' : 'Enregistrer la requête en vue'}
      description={
        isEdit
          ? 'Modifie la définition et la description de la vue.'
          : 'La requête devient une vue réutilisable dans la base.'
      }
      className="w-[620px]"
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Nom</span>
          <Input
            autoFocus={!isEdit}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ma_vue"
            disabled={isEdit}
            title={isEdit ? 'Pour renommer, utilise « Renommer » dans l’arbre.' : undefined}
          />
        </label>

        {supportsComment && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              Description <span className="text-muted/60">(optionnelle)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="À quoi sert cette vue, ce qu'elle contient…"
              className="w-full rounded-md bg-bg border border-border px-2.5 py-1.5 text-[13px] placeholder:text-muted/60 outline-none resize-y focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
            <span className="text-[11px] text-muted/70">
              Enregistrée dans la base via COMMENT ON VIEW — visible dans
              l'arbre et par l'assistant.
            </span>
          </label>
        )}

        {isEdit && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Définition (SELECT)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full rounded-md bg-bg border border-border px-2.5 py-1.5 text-[12px] mono outline-none resize-y focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
          </label>
        )}

        {canMaterialized && !isEdit && (
          <div className="flex gap-2 text-[13px]">
            <button
              type="button"
              onClick={() => setMaterialized(false)}
              className={`flex-1 rounded-lg border px-3 py-2 text-left ${
                !materialized
                  ? 'border-accent ring-1 ring-accent/40'
                  : 'border-border'
              }`}
            >
              <div className="font-medium">Vue</div>
              <div className="text-[11px] text-muted">
                Recalculée à chaque lecture.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMaterialized(true)}
              className={`flex-1 rounded-lg border px-3 py-2 text-left ${
                materialized
                  ? 'border-accent ring-1 ring-accent/40'
                  : 'border-border'
              }`}
            >
              <div className="font-medium">Vue matérialisée</div>
              <div className="text-[11px] text-muted">
                Stocke le résultat ; à rafraîchir.
              </div>
            </button>
          </div>
        )}

        <div>
          <span className="text-xs text-muted">SQL généré</span>
          <pre className="mt-1 text-[12px] mono whitespace-pre-wrap bg-panel-2 rounded-lg p-3 max-h-[38vh] overflow-auto">
            {previewSql}
          </pre>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!validName || !validBody || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Spinner className="text-current" />}{' '}
            {isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
