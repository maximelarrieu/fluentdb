import { useState } from 'react';
import { Bookmark, Trash2, FileCode2 } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { useToast } from '../../components/ui/Toast.js';
import { useSnippets } from './snippets.js';

/** Manage named SQL snippets: save the current query, load or delete one. */
export function SnippetsDialog({
  currentSql,
  onLoad,
  onClose,
}: {
  currentSql: string;
  onLoad: (sql: string) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const snippets = useSnippets((s) => s.snippets);
  const add = useSnippets((s) => s.add);
  const remove = useSnippets((s) => s.remove);
  const [name, setName] = useState('');

  const save = () => {
    if (!name.trim() || !currentSql.trim()) return;
    add(name, currentSql);
    setName('');
    toast.push('success', 'Snippet enregistré');
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Snippets SQL"
      description="Enregistre des requêtes favorites pour les recharger en un clic."
      className="w-[620px]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted">
              Enregistrer la requête actuelle sous…
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="ex. Top clients du mois"
              disabled={!currentSql.trim()}
            />
          </label>
          <Button
            variant="primary"
            onClick={save}
            disabled={!name.trim() || !currentSql.trim()}
          >
            <Bookmark size={13} /> Enregistrer
          </Button>
        </div>
        {!currentSql.trim() && (
          <p className="text-[11px] text-muted -mt-2">
            L'éditeur est vide — écris une requête pour pouvoir l'enregistrer.
          </p>
        )}

        <div className="border-t border-border-soft pt-3 max-h-[46vh] overflow-auto flex flex-col gap-1.5">
          {snippets.length === 0 ? (
            <p className="text-[13px] text-muted py-3 text-center">
              Aucun snippet pour l'instant.
            </p>
          ) : (
            snippets.map((s) => (
              <div
                key={s.id}
                className="group flex items-center gap-2 rounded-lg border border-border-soft px-2.5 py-2 hover:bg-panel-2/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{s.name}</div>
                  <div className="text-[11px] text-muted mono truncate">
                    {s.sql.replace(/\s+/g, ' ').trim()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onLoad(s.sql);
                    onClose();
                  }}
                >
                  <FileCode2 size={13} /> Charger
                </Button>
                <button
                  className="text-muted hover:text-red p-1 opacity-0 group-hover:opacity-100"
                  title="Supprimer"
                  onClick={() => remove(s.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
