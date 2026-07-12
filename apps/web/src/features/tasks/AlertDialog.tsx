import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  alertOps,
  alertOpSymbol,
  type AlertOp,
  type ScheduledTask,
} from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input, Select } from '../../components/ui/Input.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';

/** Define a user-set numeric threshold that raises an in-app alert on breach. */
export function AlertDialog({
  task,
  numericCols,
  onClose,
}: {
  task: ScheduledTask;
  numericCols: string[];
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(task.alert != null);
  const [column, setColumn] = useState(task.alert?.column ?? numericCols[0] ?? '');
  const [op, setOp] = useState<AlertOp>(task.alert?.op ?? 'gt');
  const [threshold, setThreshold] = useState(String(task.alert?.threshold ?? ''));

  const save = useMutation({
    mutationFn: () =>
      api.updateTask(task.id, {
        alert:
          enabled && column && threshold.trim() !== ''
            ? { column, op, threshold: Number(threshold) }
            : null,
      }),
    onSuccess: () => {
      toast.push('success', enabled ? 'Alerte enregistrée' : 'Alerte désactivée');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const canSave =
    !enabled || (column !== '' && threshold.trim() !== '' && !Number.isNaN(Number(threshold)));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Alerte sur seuil"
      description="Sois notifié quand une valeur dépasse le seuil que tu définis."
      className="w-[560px]"
    >
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Activer une alerte pour cette tâche
        </label>

        {numericCols.length === 0 ? (
          <p className="text-[12px] text-muted">
            Aucune colonne numérique dans les résultats récents — lance la tâche
            au moins une fois pour pouvoir choisir une colonne.
          </p>
        ) : (
          <div
            className={`flex items-end gap-2 ${enabled ? '' : 'opacity-40 pointer-events-none'}`}
          >
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-muted">Colonne</span>
              <Select value={column} onChange={(e) => setColumn(e.target.value)}>
                {numericCols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-muted">Condition</span>
              <Select value={op} onChange={(e) => setOp(e.target.value as AlertOp)}>
                {alertOps.map((o) => (
                  <option key={o} value={o}>
                    {alertOpSymbol[o]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] flex-1">
              <span className="text-muted">Seuil</span>
              <Input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="ex. 1000"
              />
            </label>
          </div>
        )}

        {enabled && column && threshold.trim() !== '' && (
          <p className="text-[12px] text-muted">
            Alerte si <span className="mono text-text">{column}</span>{' '}
            {alertOpSymbol[op]} <span className="mono text-text">{threshold}</span>{' '}
            sur au moins une ligne.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Spinner className="text-current" />} Enregistrer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
