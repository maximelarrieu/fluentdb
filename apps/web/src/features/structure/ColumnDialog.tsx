import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnInfo, DdlChange } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input, Select, Field } from '../../components/ui/Input.js';
import { useWorkspace } from '../../stores/workspace.js';

export function ColumnDialog({
  open,
  onOpenChange,
  mode,
  table,
  schema,
  existing,
  onPreview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  table: string;
  schema?: string;
  existing?: ColumnInfo;
  onPreview: (change: DdlChange) => void;
}) {
  const { active, database } = useWorkspace();
  const [name, setName] = useState(existing?.name ?? '');
  const [dataType, setDataType] = useState(existing?.dataType ?? 'text');
  const [nullable, setNullable] = useState(existing?.nullable ?? true);
  const [defaultValue, setDefaultValue] = useState(existing?.defaultValue ?? '');
  const [isPk, setIsPk] = useState(existing?.isPrimaryKey ?? false);
  const [autoInc, setAutoInc] = useState(existing?.isAutoIncrement ?? false);

  const meta = useQuery({
    queryKey: ['autocomplete', active!.id, database],
    queryFn: () => api.autocomplete(active!.id, database),
  });
  const types = meta.data?.typeNames ?? ['text', 'integer', 'boolean'];

  const submit = () => {
    if (mode === 'add') {
      onPreview({
        kind: 'addColumn',
        table,
        schema,
        column: {
          name,
          dataType,
          nullable,
          defaultValue: defaultValue || null,
          isPrimaryKey: isPk,
          isAutoIncrement: autoInc,
        },
      });
    } else {
      onPreview({
        kind: 'alterColumn',
        table,
        schema,
        column: existing!.name,
        newName: name !== existing!.name ? name : undefined,
        dataType: dataType !== existing!.dataType ? dataType : undefined,
        nullable: nullable !== existing!.nullable ? nullable : undefined,
        defaultValue:
          (defaultValue || null) !== existing!.defaultValue
            ? defaultValue || null
            : undefined,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'add' ? 'Ajouter une colonne' : `Modifier ${existing?.name}`}
      className="w-[440px]"
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Nom">
          <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={dataType} onChange={(e) => setDataType(e.target.value)}>
            {!types.includes(dataType) && (
              <option value={dataType}>{dataType}</option>
            )}
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valeur par défaut (expression SQL)" hint="ex: 0, '', now()">
          <Input
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            placeholder="aucune"
          />
        </Field>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={nullable}
              onChange={(e) => setNullable(e.target.checked)}
            />
            Autorise NULL
          </label>
          {mode === 'add' && (
            <>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPk}
                  onChange={(e) => setIsPk(e.target.checked)}
                />
                Clé primaire
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoInc}
                  onChange={(e) => setAutoInc(e.target.checked)}
                />
                Auto-incrément
              </label>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border-soft">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name || !dataType}>
            Aperçu du SQL
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
