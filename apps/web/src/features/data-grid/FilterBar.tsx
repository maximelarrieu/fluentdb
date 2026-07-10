import { useState } from 'react';
import { Plus, X, Filter } from 'lucide-react';
import {
  filterOpLabels,
  filterOps,
  type FilterOp,
  type FilterSpec,
  type QueryColumn,
} from '@fluentdb/shared';
import { Button } from '../../components/ui/Button.js';
import { Input, Select } from '../../components/ui/Input.js';

const NO_VALUE_OPS: FilterOp[] = ['is_null', 'not_null'];

export function FilterBar({
  columns,
  filters,
  onChange,
}: {
  columns: QueryColumn[];
  filters: FilterSpec[];
  onChange: (filters: FilterSpec[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const add = () =>
    onChange([
      ...filters,
      { column: columns[0]?.name ?? '', op: 'eq', value: '' },
    ]);
  const update = (i: number, patch: Partial<FilterSpec>) =>
    onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(filters.filter((_, idx) => idx !== i));

  return (
    <div className="border-b border-border-soft bg-panel">
      <div className="flex items-center gap-2 px-2 h-9">
        <Button
          size="sm"
          variant={filters.length ? 'primary' : 'subtle'}
          onClick={() => {
            setOpen((o) => !o);
            if (!filters.length) add();
          }}
        >
          <Filter size={13} />
          Filtres{filters.length ? ` (${filters.length})` : ''}
        </Button>
        {filters.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            Effacer
          </Button>
        )}
      </div>

      {open && filters.length > 0 && (
        <div className="flex flex-col gap-1.5 px-2 pb-2">
          {filters.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Select
                value={f.column}
                onChange={(e) => update(i, { column: e.target.value })}
                className="w-40 h-7"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                value={f.op}
                onChange={(e) => update(i, { op: e.target.value as FilterOp })}
                className="w-32 h-7"
              >
                {filterOps.map((op) => (
                  <option key={op} value={op}>
                    {filterOpLabels[op]}
                  </option>
                ))}
              </Select>
              {!NO_VALUE_OPS.includes(f.op) && (
                <Input
                  value={f.value ?? ''}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder="valeur"
                  className="w-48 h-7"
                />
              )}
              <button
                onClick={() => remove(i)}
                className="text-muted hover:text-red p-1"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={add} className="w-fit">
            <Plus size={13} /> Ajouter un filtre
          </Button>
        </div>
      )}
    </div>
  );
}
