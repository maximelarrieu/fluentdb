import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ScheduledTask } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import {
  ScheduleFields,
  formToSchedule,
  scheduleToForm,
} from './ScheduleFields.js';

/** Edit an existing scheduled task in place (name, schedule, query). */
export function TaskEditDialog({
  task,
  onClose,
}: {
  task: ScheduledTask;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(task.name);
  const [db, setDb] = useState(task.database ?? '');
  const [sql, setSql] = useState(task.sql);
  const [schedule, setSchedule] = useState(scheduleToForm(task.schedule));

  const save = useMutation({
    mutationFn: () =>
      api.updateTask(task.id, {
        name: name.trim(),
        database: db.trim() || null,
        sql: sql.trim(),
        schedule: formToSchedule(schedule),
      }),
    onSuccess: () => {
      toast.push('success', 'Tâche mise à jour');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-snapshots', task.id] });
      onClose();
    },
    onError: (err) =>
      toast.push('error', err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Modifier la tâche"
      description="Change le nom, la planification ou la requête (lecture seule)."
      className="w-[600px]"
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Nom</span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Taille des tables"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">
            Base de données <span className="text-muted/60">(optionnel)</span>
          </span>
          <Input
            value={db}
            onChange={(e) => setDb(e.target.value)}
            placeholder="par défaut de la connexion"
          />
          <span className="text-[11px] text-muted/70">
            Cible la requête et regroupe la tâche par base dans l'onglet.
          </span>
        </label>

        <ScheduleFields value={schedule} onChange={setSchedule} />

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Requête</span>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            spellCheck={false}
            rows={8}
            className="text-[12px] mono whitespace-pre bg-bg border border-border rounded-lg p-3 max-h-[32vh] overflow-auto outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 resize-y"
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || !sql.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Spinner className="text-current" />} Enregistrer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
