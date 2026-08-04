import { Dialog } from '../../components/ui/Dialog.js';
import { useWorkspace } from '../../stores/workspace.js';
import { SHORTCUT_GROUPS } from './shortcuts.js';

/** Splits a display combo like "⌘ ⌥ N" into individual <kbd> chips. */
function Keys({ combo }: { combo: string }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      {combo.split(' ').map((k, i) => (
        <kbd
          key={i}
          className="min-w-5 px-1.5 h-5 inline-flex items-center justify-center rounded border border-border bg-panel-2 text-[11px] mono text-muted"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog() {
  const { shortcutsOpen, toggleShortcuts } = useWorkspace();
  if (!shortcutsOpen) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && toggleShortcuts(false)}
      title="Raccourcis clavier"
      description="Les combinaisons évitent les raccourcis du navigateur."
      className="w-[560px]"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1.5">
            <h4 className="text-[11px] uppercase tracking-wide text-muted/70">
              {group.title}
            </h4>
            {group.items.map((sc) => (
              <div
                key={sc.label}
                className="flex items-center justify-between gap-3 text-[13px]"
              >
                <span className="text-text/90">{sc.label}</span>
                <Keys combo={sc.keys} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
