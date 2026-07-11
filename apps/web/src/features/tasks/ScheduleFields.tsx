import type { TaskSchedule } from '@fluentdb/shared';
import { Input } from '../../components/ui/Input.js';

/** Editable form state for a schedule (both "kind" branches held at once). */
export interface ScheduleForm {
  kind: TaskSchedule['kind'];
  /** "HH:MM" for the daily branch. */
  time: string;
  /** Minutes for the interval branch. */
  everyMinutes: number;
}

export function scheduleToForm(s: TaskSchedule): ScheduleForm {
  return s.kind === 'daily'
    ? {
        kind: 'daily',
        time: `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`,
        everyMinutes: 60,
      }
    : { kind: 'interval', time: '09:00', everyMinutes: s.everyMinutes };
}

export function formToSchedule(f: ScheduleForm): TaskSchedule {
  if (f.kind === 'daily') {
    const [h, m] = f.time.split(':').map((n) => parseInt(n, 10));
    return { kind: 'daily', hour: h || 0, minute: m || 0 };
  }
  return { kind: 'interval', everyMinutes: Math.max(1, f.everyMinutes) };
}

/** Daily / interval picker shared by the create and edit dialogs. */
export function ScheduleFields({
  value,
  onChange,
}: {
  value: ScheduleForm;
  onChange: (next: ScheduleForm) => void;
}) {
  return (
    <>
      <div className="flex gap-2 text-[13px]">
        <button
          type="button"
          onClick={() => onChange({ ...value, kind: 'daily' })}
          className={`flex-1 rounded-lg border px-3 py-2 text-left ${
            value.kind === 'daily'
              ? 'border-accent ring-1 ring-accent/40'
              : 'border-border'
          }`}
        >
          <div className="font-medium">Chaque jour</div>
          <div className="text-[11px] text-muted">À une heure précise</div>
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, kind: 'interval' })}
          className={`flex-1 rounded-lg border px-3 py-2 text-left ${
            value.kind === 'interval'
              ? 'border-accent ring-1 ring-accent/40'
              : 'border-border'
          }`}
        >
          <div className="font-medium">À intervalle</div>
          <div className="text-[11px] text-muted">Toutes les N minutes</div>
        </button>
      </div>

      {value.kind === 'daily' ? (
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted">Heure</span>
          <Input
            type="time"
            value={value.time}
            onChange={(e) => onChange({ ...value, time: e.target.value })}
            className="w-32"
          />
        </label>
      ) : (
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted">Toutes les</span>
          <Input
            type="number"
            min={1}
            value={value.everyMinutes}
            onChange={(e) =>
              onChange({
                ...value,
                everyMinutes: parseInt(e.target.value, 10) || 1,
              })
            }
            className="w-24"
          />
          <span className="text-xs text-muted">minutes</span>
        </label>
      )}
    </>
  );
}
