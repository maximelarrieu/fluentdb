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
  const [materialized, setMaterialized] = useState(
    initialMaterialized && canMaterialized,
  );

  const statement = useMemo(() => {
    const body = sql.trim().replace(/;\s*$/, '');
    const target =
      dialect === 'postgres' && schema
        ? `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, name || 'nom_de_la_vue')}`
        : quoteIdent(dialect, name || 'nom_de_la_vue');
    const kw = materialized ? 'CREATE MATERIALIZED VIEW' : 'CREATE VIEW';
    return `${kw} ${target} AS\n${body}`;
  }, [sql, name, materialized, dialect, schema]);

  const create = useMutation({
    mutationFn: () => api.ddlApply(active!.id, [statement], database),
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
            {statement}
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
            {create.isPending && <Spinner className="text-white" />} Créer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
