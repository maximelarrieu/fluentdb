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
 * Turn the current query into a (materialized) view. Builds the
 * `CREATE VIEW … AS <select>` statement and runs it through the DDL endpoint,
 * which enforces the read-only guard server-side.
 */
export function SaveAsViewDialog({
  sql,
  materialized: initialMaterialized,
  canMaterialized,
  dialect,
  onClose,
}: {
  sql: string;
  materialized: boolean;
  canMaterialized: boolean;
  dialect: Dialect;
  onClose: () => void;
}) {
  const { active, database, schema, bumpSchema } = useWorkspace();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [materialized, setMaterialized] = useState(
    initialMaterialized && canMaterialized,
  );

  // Only PostgreSQL can attach a comment to a view (COMMENT ON VIEW). MySQL
  // views and SQLite have no comment mechanism, so the field is hidden there.
  const supportsComment = dialect === 'postgres';

  const target = useMemo(
    () =>
      dialect === 'postgres' && schema
        ? `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, name || 'nom_de_la_vue')}`
        : quoteIdent(dialect, name || 'nom_de_la_vue'),
    [dialect, schema, name],
  );

  const statements = useMemo(() => {
    const body = sql.trim().replace(/;\s*$/, '');
    const kw = materialized ? 'CREATE MATERIALIZED VIEW' : 'CREATE VIEW';
    const out = [`${kw} ${target} AS\n${body}`];
    const desc = description.trim();
    if (supportsComment && desc) {
      const kind = materialized ? 'MATERIALIZED VIEW' : 'VIEW';
      out.push(`COMMENT ON ${kind} ${target} IS '${desc.replace(/'/g, "''")}'`);
    }
    return out;
  }, [sql, target, materialized, description, supportsComment]);

  const previewSql = statements.map((s) => `${s};`).join('\n\n');

  const create = useMutation({
    // Both statements run in one transaction server-side, so the comment can't
    // land without the view (or vice-versa).
    mutationFn: () => api.ddlApply(active!.id, statements, database),
    onSuccess: () => {
      toast.push(
        'success',
        materialized ? 'Vue matérialisée créée' : 'Vue créée',
      );
      bumpSchema();
      onClose();
    },
    onError: (err) =>
      toast.push('error', err instanceof ApiError ? err.message : String(err)),
  });

  const validName = /\S/.test(name);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Enregistrer la requête en vue"
      description="La requête devient une vue réutilisable dans la base."
      className="w-[620px]"
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Nom</span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ma_vue"
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

        {canMaterialized && (
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
            disabled={!validName || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending && <Spinner className="text-current" />} Créer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
