import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  defaultPorts,
  engineKinds,
  engineLabels,
  PASSWORD_UNCHANGED,
  type ConnectionInput,
  type ConnectionSummary,
  type EngineKind,
} from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Input, Select, Field } from '../../components/ui/Input.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { useToast } from '../../components/ui/Toast.js';
import { Spinner } from '../../components/ui/misc.js';

const COLORS: { value: NonNullable<ConnectionInput['color']>; hex: string }[] = [
  { value: 'gray', hex: '#8b93a7' },
  { value: 'blue', hex: '#6d8bff' },
  { value: 'green', hex: '#3fb884' },
  { value: 'amber', hex: '#f0b429' },
  { value: 'red', hex: '#f2555a' },
  { value: 'purple', hex: '#a78bfa' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ConnectionSummary | null;
  initial?: Partial<ConnectionInput>;
}

function blankForm(initial?: Partial<ConnectionInput>): ConnectionInput {
  return {
    name: '',
    engine: 'postgres',
    host: '127.0.0.1',
    port: 5432,
    user: '',
    password: '',
    database: '',
    file: '',
    color: 'blue',
    ssl: false,
    isReadOnly: false,
    ...initial,
  };
}

export function ConnectionForm({ open, onOpenChange, editing, initial }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<ConnectionInput>(() =>
    editing
      ? {
          ...blankForm(),
          ...editing,
          password: editing.hasPassword ? PASSWORD_UNCHANGED : '',
        }
      : blankForm(initial),
  );

  const update = <K extends keyof ConnectionInput>(
    key: K,
    value: ConnectionInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const onEngineChange = (engine: EngineKind) =>
    setForm((f) => ({
      ...f,
      engine,
      port: defaultPorts[engine] ?? undefined,
    }));

  const test = useMutation({
    mutationFn: () => api.testConnection({ ...form, id: editing?.id }),
    onSuccess: (r) => toast.push('success', `Connexion OK — ${r.serverVersion}`),
    onError: (e: ApiError) => toast.push('error', e.message),
  });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.updateConnection(editing.id, form)
        : api.createConnection(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      toast.push('success', editing ? 'Connexion mise à jour' : 'Connexion créée');
      onOpenChange(false);
    },
    onError: (e: ApiError) => toast.push('error', e.message),
  });

  const isSqlite = form.engine === 'sqlite';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Modifier la connexion' : 'Nouvelle connexion'}
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Nom">
          <Input
            value={form.name}
            autoFocus
            placeholder="Ma base de prod"
            onChange={(e) => update('name', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Moteur">
            <Select
              value={form.engine}
              onChange={(e) => onEngineChange(e.target.value as EngineKind)}
            >
              {engineKinds.map((k) => (
                <option key={k} value={k}>
                  {engineLabels[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Couleur">
            <div className="flex items-center gap-1.5 h-8">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => update('color', c.value)}
                  className="h-5 w-5 rounded-full border-2 transition-transform"
                  style={{
                    background: c.hex,
                    borderColor:
                      form.color === c.value ? '#fff' : 'transparent',
                    transform: form.color === c.value ? 'scale(1.15)' : 'none',
                  }}
                />
              ))}
            </div>
          </Field>
        </div>

        {isSqlite ? (
          <Field label="Fichier de base de données" hint="Chemin absolu du fichier .db / .sqlite">
            <Input
              value={form.file ?? ''}
              placeholder="/chemin/vers/base.sqlite"
              onChange={(e) => update('file', e.target.value)}
            />
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="Hôte">
                <Input
                  value={form.host ?? ''}
                  onChange={(e) => update('host', e.target.value)}
                />
              </Field>
              <Field label="Port">
                <Input
                  type="number"
                  value={form.port ?? ''}
                  onChange={(e) => update('port', Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Utilisateur">
                <Input
                  value={form.user ?? ''}
                  onChange={(e) => update('user', e.target.value)}
                />
              </Field>
              <Field label="Mot de passe">
                <Input
                  type="password"
                  value={form.password ?? ''}
                  placeholder={editing?.hasPassword ? '••••••••' : ''}
                  onChange={(e) => update('password', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Base de données">
              <Input
                value={form.database ?? ''}
                onChange={(e) => update('database', e.target.value)}
              />
            </Field>
          </>
        )}

        <div className="flex items-center gap-4 pt-0.5">
          {!isSqlite && (
            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={form.ssl ?? false}
                onChange={(e) => update('ssl', e.target.checked)}
              />
              SSL
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={form.isReadOnly ?? false}
              onChange={(e) => update('isReadOnly', e.target.checked)}
            />
            Lecture seule
          </label>
        </div>

        <div className="flex items-center justify-between pt-2 mt-1 border-t border-border-soft">
          <Button
            variant="subtle"
            onClick={() => test.mutate()}
            disabled={test.isPending}
          >
            {test.isPending && <Spinner />}
            Tester
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.name}
            >
              {save.isPending && <Spinner className="text-white" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
