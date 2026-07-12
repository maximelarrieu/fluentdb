import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import {
  ScheduleFields,
  formToSchedule,
  type ScheduleForm,
} from './ScheduleFields.js';

/** Turn the current query into a recurring, read-only scheduled task. */
export function ScheduleTaskDialog({
  sql,
  onClose,
}: {
  sql: string;
  onClose: () => void;
}) {
  const { active, database, openTasks } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [db, setDb] = useState(database ?? '');
  const [schedule, setSchedule] = useState<ScheduleForm>({
    kind: 'daily',
    time: '09:00',
    everyMinutes: 60,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createTask({
        name: name.trim(),
        connectionId: active!.id,
        database: db.trim() || null,
        sql: sql.trim(),
        schedule: formToSchedule(schedule),
        enabled: true,
      }),
    onSuccess: () => {
      toast.push('success', 'Tâche planifiée créée');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
      openTasks();
    },
    onError: (err) =>
      toast.push('error', err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Planifier cette requête"
      description="Exécution automatique tant que FluentDB tourne (lecture seule)."
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

        <div>
          <span className="text-xs text-muted">Requête</span>
          <pre className="mt-1 text-[12px] mono whitespace-pre-wrap bg-panel-2 rounded-lg p-3 max-h-[32vh] overflow-auto">
            {sql.trim()}
          </pre>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending && <Spinner className="text-current" />} Planifier
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
