import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Copy } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import { api, ApiError } from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.js';

const PLACEHOLDER = `Décris ici le métier de cette base pour l'assistant. Par exemple :

# Domaine
Boutique e-commerce. Une commande (orders) a plusieurs lignes (order_items).

# Unités & codes
- orders.total : en CENTIMES d'euro (diviser par 100 pour l'affichage)
- orders.status : 1=créée, 2=payée, 3=expédiée, 4=annulée
- prix HT partout ; TVA = 20 %

# Règles
- Toujours filtrer WHERE deleted_at IS NULL (soft delete)
- Client actif = au moins une commande sur les 12 derniers mois

# Jointures canoniques
order_items.order_id -> orders.id ; order_items.product_id -> products.id

Astuce : demande à Claude, dans ton projet, de te générer ce document à partir
de ton code, puis colle-le ici.`;

export function AiContextDialog({
  connectionId,
  connectionName,
  database,
  initialContent,
  onClose,
}: {
  connectionId: string;
  connectionName: string;
  database?: string;
  initialContent: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  const toast = useToast();

  // Always load the freshest stored value when opening.
  useEffect(() => {
    let cancelled = false;
    api
      .getAiContext(connectionId, database)
      .then((r) => {
        if (!cancelled) setContent(r.content);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId, database]);

  const save = useMutation({
    mutationFn: () => api.setAiContext(connectionId, content, database),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-context', connectionId, database] });
      toast.push('success', 'Contexte enregistré');
      onClose();
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const genPrompt = useMutation({
    mutationFn: () => api.aiContextPrompt(connectionId, database),
    onSuccess: async (r) => {
      try {
        await navigator.clipboard.writeText(r.prompt);
        toast.push(
          'success',
          'Prompt copié — colle-le à Claude dans ton projet, puis colle sa réponse ici.',
        );
      } catch {
        toast.push('info', 'Impossible de copier automatiquement.');
      }
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const scope = database ? `${connectionName} · ${database}` : connectionName;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Contexte IA de la base"
      description={`Envoyé à l'assistant avant le schéma, pour ${scope}. Structure uniquement côté schéma — ici, le métier.`}
      className="w-[680px]"
    >
      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            aria-label="Contexte métier de la base"
            className="w-full resize-y rounded-lg bg-bg border border-border px-3 py-2 text-[12px] mono leading-relaxed outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
          />
          <div className="rounded-lg border border-border-soft bg-panel-2/50 p-2.5 flex items-start gap-2.5">
            <Sparkles size={15} className="text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-text">
                Pas d'idée quoi écrire&nbsp;? Génère le prompt parfait à donner à
                Claude dans ton projet — il inclut le schéma réel de cette base.
                Claude te renverra le contexte, que tu colles ci-dessus.
              </p>
            </div>
            <Button
              size="sm"
              variant="default"
              className="shrink-0"
              onClick={() => genPrompt.mutate()}
              disabled={genPrompt.isPending}
            >
              {genPrompt.isPending ? (
                <Spinner className="text-current" />
              ) : (
                <Copy size={13} />
              )}
              Copier le prompt pour Claude
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted">
              {content.trim().length.toLocaleString()} caractères · Markdown
            </span>
            <div className="flex items-center gap-2">
              <Button variant="subtle" onClick={onClose}>
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
                {save.isPending && <Spinner className="text-current" />} Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
