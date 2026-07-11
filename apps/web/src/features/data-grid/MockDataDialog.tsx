import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Wand2 } from 'lucide-react';
import type { MockRowsPreview } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';

function cell(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  return String(v);
}

/**
 * Generate realistic fake rows for a table with the assistant, preview them,
 * then insert on confirmation (parameterized, via the normal mutate path).
 */
export function MockDataDialog({
  connectionId,
  database,
  schema,
  table,
  onClose,
  onInserted,
}: {
  connectionId: string;
  database?: string;
  schema?: string;
  table: string;
  onClose: () => void;
  onInserted: () => void;
}) {
  const toast = useToast();
  const [count, setCount] = useState(20);
  const [preview, setPreview] = useState<MockRowsPreview | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      api.aiMock({
        connectionId,
        database,
        schema,
        table,
        count: Math.min(100, Math.max(1, count)),
      }),
    onSuccess: setPreview,
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const insert = useMutation({
    mutationFn: () =>
      api.mutate(
        connectionId,
        table,
        { inserts: preview!.rows, updates: [], deletes: [] },
        database,
        schema,
      ),
    onSuccess: (r) => {
      toast.push('success', `${r.inserted} ligne(s) insérée(s)`);
      onInserted();
      onClose();
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Données de test — ${table}`}
      description="L'assistant génère des lignes réalistes à partir de la structure de la table. Relis-les avant de les insérer."
      className="w-[720px]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Nombre de lignes</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
              className="w-28"
            />
          </label>
          <Button
            variant={preview ? 'default' : 'primary'}
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? <Spinner /> : <Sparkles size={13} />}
            {preview ? 'Régénérer' : 'Générer'}
          </Button>
        </div>

        {preview && (
          <>
            <div className="max-h-[46vh] overflow-auto rounded-lg border border-border">
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0 bg-panel-2">
                  <tr>
                    {preview.columns.map((c) => (
                      <th
                        key={c}
                        className="text-left font-medium px-2 py-1.5 border-b border-border mono whitespace-nowrap"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border-soft/40">
                      {preview.columns.map((c) => (
                        <td
                          key={c}
                          className={`px-2 py-1 mono whitespace-nowrap ${
                            row[c] == null ? 'text-muted/50 italic' : ''
                          }`}
                        >
                          {cell(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-[12px] text-muted">
                {preview.rows.length} ligne(s) prête(s) à insérer
              </span>
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={() => insert.mutate()}
                disabled={insert.isPending || preview.rows.length === 0}
              >
                {insert.isPending ? <Spinner className="text-white" /> : <Wand2 size={13} />}
                Insérer {preview.rows.length} ligne(s)
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
