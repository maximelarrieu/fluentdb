import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Play } from 'lucide-react';
import type {
  DashboardWidget,
  QueryResultSet,
  WidgetSize,
  WidgetViz,
} from '@fluentdb/shared';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import { api, ApiError } from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.js';
import { WidgetChart } from './WidgetChart.js';

const VIZ: { v: WidgetViz; label: string }[] = [
  { v: 'number', label: 'Nombre' },
  { v: 'bar', label: 'Barres' },
  { v: 'line', label: 'Lignes' },
  { v: 'pie', label: 'Camembert' },
  { v: 'table', label: 'Table' },
];
const SIZES: { s: WidgetSize; label: string }[] = [
  { s: 'sm', label: 'S' },
  { s: 'md', label: 'M' },
  { s: 'lg', label: 'L' },
];

export function WidgetBuilder({
  connId,
  database,
  existing,
  onClose,
}: {
  connId: string;
  database?: string;
  existing: DashboardWidget | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [sql, setSql] = useState(existing?.sql ?? '');
  const [viz, setViz] = useState<WidgetViz>(existing?.viz ?? 'bar');
  const [size, setSize] = useState<WidgetSize>(existing?.size ?? 'md');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<QueryResultSet | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const gen = useMutation({
    mutationFn: () => api.aiWidget({ connectionId: connId, database, description }),
    onSuccess: (r) => {
      setTitle((t) => t || r.title);
      setSql(r.sql);
      setViz(r.viz);
      setPreview(null);
      toast.push('success', 'Widget généré — vérifie et enregistre');
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const run = useMutation({
    mutationFn: () =>
      api.query(connId, {
        sql,
        database,
        maxRows: 200,
        queryId: `widget-preview-${Date.now()}`,
      }),
    onSuccess: (r) => setPreview(r.resultSets[0] ?? null),
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const save = useMutation({
    mutationFn: () => {
      const input = { title: title.trim(), sql: sql.trim(), viz, size };
      return existing
        ? api.updateWidget(connId, existing.id, input)
        : api.createWidget(connId, input, database);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgets', connId, database] });
      toast.push('success', existing ? 'Widget mis à jour' : 'Widget ajouté');
      onClose();
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? 'Modifier le widget' : 'Nouveau widget'}
      description="Une requête en lecture seule + un type de visualisation."
      className="w-[760px]"
    >
      <div className="flex flex-col gap-3">
        {/* NL → AI */}
        <div className="flex items-end gap-2">
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-[11px] text-muted">
              Décris le widget (l'IA génère la requête)
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && description.trim()) gen.mutate();
              }}
              placeholder="ex. ventes totales par mois sur 12 mois"
              className="h-8 rounded-md bg-bg border border-border px-2.5 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <Button
            variant="default"
            onClick={() => gen.mutate()}
            disabled={!description.trim() || gen.isPending}
          >
            {gen.isPending ? <Spinner className="text-current" /> : <Sparkles size={14} />}
            Générer
          </Button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Titre</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre du widget"
            className="h-8 rounded-md bg-bg border border-border px-2.5 text-[13px] outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Requête SQL (lecture seule)</span>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="SELECT …"
            className="w-full resize-y rounded-md bg-bg border border-border px-2.5 py-2 text-[12px] mono outline-none focus:border-accent"
          />
        </label>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted">Type</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              {VIZ.map((o) => (
                <button
                  key={o.v}
                  onClick={() => setViz(o.v)}
                  className={`px-2 h-7 text-[12px] border-l border-border first:border-l-0 ${
                    viz === o.v ? 'bg-accent/12 text-accent' : 'hover:bg-panel-2'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted">Taille</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              {SIZES.map((o) => (
                <button
                  key={o.s}
                  onClick={() => setSize(o.s)}
                  className={`px-2.5 h-7 text-[12px] border-l border-border first:border-l-0 ${
                    size === o.s ? 'bg-accent/12 text-accent' : 'hover:bg-panel-2'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            variant="subtle"
            className="ml-auto"
            onClick={() => run.mutate()}
            disabled={!sql.trim() || run.isPending}
          >
            {run.isPending ? <Spinner className="text-current" /> : <Play size={13} />}
            Aperçu
          </Button>
        </div>

        {preview && (
          <div className="h-56 rounded-lg border border-border-soft bg-bg overflow-hidden">
            <WidgetChart columns={preview.columns} rows={preview.rows} viz={viz} />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="subtle" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={!title.trim() || !sql.trim() || save.isPending}
          >
            {save.isPending && <Spinner className="text-current" />}
            {existing ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
