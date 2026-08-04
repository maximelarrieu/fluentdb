import { useEffect } from 'react';
import { useWorkspace } from '../../stores/workspace.js';

/** True on Apple platforms — used to label the modifier key ⌘ vs Ctrl. */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

const MOD = IS_MAC ? '⌘' : 'Ctrl';

export interface Shortcut {
  keys: string;
  label: string;
}
export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/** Canonical list shown in the help dialog. Keep in sync with the hook below. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Général',
    items: [
      { keys: `${MOD} K`, label: 'Recherche & commandes (palette)' },
      { keys: '?', label: 'Afficher cette aide' },
      { keys: `${MOD} ⌥ B`, label: 'Afficher / masquer les connexions' },
      { keys: `${MOD} ⌥ A`, label: "Afficher / masquer l'assistant IA" },
    ],
  },
  {
    title: 'Onglets',
    items: [
      { keys: `${MOD} ⌥ N`, label: 'Nouvelle requête' },
      { keys: `${MOD} ⌥ W`, label: "Fermer l'onglet actif" },
      { keys: '⌥ 1 … 9', label: "Aller à l'onglet N" },
      { keys: `${MOD} ⌥ ← / →`, label: 'Onglet précédent / suivant' },
    ],
  },
  {
    title: 'Éditeur & résultats',
    items: [
      { keys: `${MOD} ↵`, label: 'Exécuter la requête' },
      { keys: `⇧ ${MOD} ↵`, label: 'Exécuter la sélection' },
      { keys: `${MOD} F`, label: 'Rechercher dans les résultats' },
    ],
  },
];

/** True when focus is in a text field where typing shouldn't trigger `?`. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    el.isContentEditable ||
    !!el.closest('.cm-editor')
  );
}

/**
 * Global keyboard shortcuts, bound once at the app root. Combos use
 * mod(⌘/Ctrl)+Alt or Alt to avoid clashing with browser/devtools defaults.
 */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useWorkspace.getState();
      const mod = e.metaKey || e.ctrlKey;

      // "?" opens help (unless typing in a field).
      if (e.key === '?' && !isTyping(e.target)) {
        e.preventDefault();
        s.toggleShortcuts(true);
        return;
      }

      // Alt+1..9 → activate tab N (no mod, to dodge browser tab switching).
      if (e.altKey && !mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        s.activateTabByIndex(Number(e.key));
        return;
      }

      if (!(mod && e.altKey)) return;
      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          s.openQuery();
          break;
        case 'w':
          e.preventDefault();
          if (s.activeTabId) s.closeTab(s.activeTabId);
          break;
        case 'b':
          e.preventDefault();
          s.toggleSidebar();
          break;
        case 'a':
          e.preventDefault();
          s.toggleAi();
          break;
        case 'arrowright':
          e.preventDefault();
          s.cycleTab(1);
          break;
        case 'arrowleft':
          e.preventDefault();
          s.cycleTab(-1);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
