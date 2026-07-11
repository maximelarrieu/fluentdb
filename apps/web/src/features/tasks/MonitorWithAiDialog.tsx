import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import {
  alertOps,
  alertOpSymbol,
  type AlertOp,
  type MonitorProposal,
} from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input, Select } from '../../components/ui/Input.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import {
  ScheduleFields,
  formToSchedule,
  scheduleToForm,
  type ScheduleForm,
} from './ScheduleFields.js';

const EXAMPLES = [
  'La taille de chaque table du schéma public, chaque jour à 9h',
  "Le nombre de commandes créées aujourd'hui, toutes les 30 minutes",
  'Le nombre de sessions actives, alerte au-dessus de 500',
];

/**
 * Describe a monitoring wish in natural language; the assistant drafts a
 * read-only scheduled task (query + schedule + optional threshold) that the
 * user reviews and edits before anything is created.
 */
export function MonitorWithAiDialog({ onClose }: { onClose: () => void }) {
  const { active, database, openTasks } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [description, setDescription] = useState('');
  const [proposal, setProposal] = useState<MonitorProposal | null>(null);

  // Review-form state, seeded from the proposal.
  const [name, setName] = useState('');
  const [sql, setSql] = useState('');
  const [schedule, setSchedule] = useState<ScheduleForm>({
    kind: 'daily',
    time: '09:00',
    everyMinutes: 60,
  });
  const [alertOn, setAlertOn] = useState(false);
  const [alertCol, setAlertCol] = useState('');
  const [alertOp, setAlertOp] = useState<AlertOp>('gt');
  const [alertThreshold, setAlertThreshold] = useState('');

  const generate = useMutation({
    mutationFn: () =>
      api.aiMonitor({
        connectionId: active!.id,
        database: database ?? undefined,
        description: description.trim(),
      }),
    onSuccess: (p) => {
      setProposal(p);
      setName(p.name);
      setSql(p.sql);
      setSchedule(scheduleToForm(p.schedule));
      setAlertOn(p.alert != null);
      setAlertCol(p.alert?.column ?? '');
      setAlertOp(p.alert?.op ?? 'gt');
      setAlertThreshold(p.alert != null ? String(p.alert.threshold) : '');
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createTask({
        name: name.trim(),
        connectionId: active!.id,
        database: database ?? null,
        sql: sql.trim(),
        schedule: formToSchedule(schedule),
        enabled: true,
        alert:
          alertOn && alertCol && alertThreshold.trim() !== ''
            ? { column: alertCol, op: alertOp, threshold: Number(alertThreshold) }
            : null,
      }),
    onSuccess: () => {
      toast.push('success', 'Tâche planifiée créée');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
      openTasks();
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  const canCreate =
    name.trim() !== '' &&
    sql.trim() !== '' &&
    (!alertOn ||
      (alertCol.trim() !== '' &&
        alertThreshold.trim() !== '' &&
        !Number.isNaN(Number(alertThreshold))));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nouvelle surveillance avec l'IA"
      description="Décris ce que tu veux surveiller ; l'assistant propose une requête de lecture, une planification et un seuil, que tu valides."
      className="w-[640px]"
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Que veux-tu surveiller ?</span>
          <textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="ex. la taille de chaque table du schéma public, chaque jour à 9h, alerte au-dessus de 10 Go"
            className="text-[13px] bg-bg border border-border rounded-lg p-2.5 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 resize-y"
          />
        </label>

        {!proposal && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDescription(ex)}
                className="text-[11px] text-muted hover:text-text border border-border-soft rounded-full px-2 py-0.5"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            variant={proposal ? 'default' : 'primary'}
            size="sm"
            disabled={!description.trim() || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? <Spinner /> : <Sparkles size={13} />}
            {proposal ? 'Régénérer' : 'Générer la proposition'}
          </Button>
        </div>

        {proposal && (
          <div className="flex flex-col gap-4 border-t border-border-soft pt-4">
            {proposal.notes && (
              <p className="text-[12px] text-muted italic">{proposal.notes}</p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Nom</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <ScheduleFields value={schedule} onChange={setSchedule} />

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Requête (lecture seule)</span>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                spellCheck={false}
                rows={6}
                className="text-[12px] mono whitespace-pre bg-bg border border-border rounded-lg p-3 max-h-[28vh] overflow-auto outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 resize-y"
              />
            </label>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={alertOn}
                  onChange={(e) => setAlertOn(e.target.checked)}
                />
                Alerter sur un seuil
              </label>
              <div
                className={`flex items-end gap-2 ${alertOn ? '' : 'opacity-40 pointer-events-none'}`}
              >
                <label className="flex flex-col gap-1 text-[12px] flex-1">
                  <span className="text-muted">Colonne</span>
                  <Input
                    value={alertCol}
                    onChange={(e) => setAlertCol(e.target.value)}
                    placeholder="colonne numérique"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px]">
                  <span className="text-muted">Condition</span>
                  <Select
                    value={alertOp}
                    onChange={(e) => setAlertOp(e.target.value as AlertOp)}
                  >
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
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(e.target.value)}
                    placeholder="ex. 1000"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button
                variant="primary"
                disabled={!canCreate || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending && <Spinner className="text-white" />} Planifier
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
