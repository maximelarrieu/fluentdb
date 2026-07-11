import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskSchedule } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';

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
  const [kind, setKind] = useState<TaskSchedule['kind']>('daily');
  const [time, setTime] = useState('09:00');
  const [everyMinutes, setEveryMinutes] = useState(60);

  const create = useMutation({
    mutationFn: () => {
      const [h, m] = time.split(':').map((n) => parseInt(n, 10));
      const schedule: TaskSchedule =
        kind === 'daily'
          ? { kind: 'daily', hour: h || 0, minute: m || 0 }
          : { kind: 'interval', everyMinutes: Math.max(1, everyMinutes) };
      return api.createTask({
        name: name.trim(),
        connectionId: active!.id,
        database: database ?? null,
        sql: sql.trim(),
        schedule,
        enabled: true,
      });
    },
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

        <div className="flex gap-2 text-[13px]">
          <button
            type="button"
            onClick={() => setKind('daily')}
            className={`flex-1 rounded-lg border px-3 py-2 text-left ${
              kind === 'daily' ? 'border-accent ring-1 ring-accent/40' : 'border-border'
            }`}
          >
            <div className="font-medium">Chaque jour</div>
            <div className="text-[11px] text-muted">À une heure précise</div>
          </button>
          <button
            type="button"
            onClick={() => setKind('interval')}
            className={`flex-1 rounded-lg border px-3 py-2 text-left ${
              kind === 'interval' ? 'border-accent ring-1 ring-accent/40' : 'border-border'
            }`}
          >
            <div className="font-medium">À intervalle</div>
            <div className="text-[11px] text-muted">Toutes les N minutes</div>
          </button>
        </div>

        {kind === 'daily' ? (
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted">Heure</span>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-32"
            />
          </label>
        ) : (
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted">Toutes les</span>
            <Input
              type="number"
              min={1}
              value={everyMinutes}
              onChange={(e) => setEveryMinutes(parseInt(e.target.value, 10) || 1)}
              className="w-24"
            />
            <span className="text-xs text-muted">minutes</span>
          </label>
        )}

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
            {create.isPending && <Spinner className="text-white" />} Planifier
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
