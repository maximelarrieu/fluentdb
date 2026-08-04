import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as RD from '@radix-ui/react-dialog';
import {
  type LucideIcon,
  Search,
  Table2,
  Eye,
  Layers,
  Columns3,
  FileCode2,
  Workflow,
  LayoutGrid,
  Clock,
  HeartPulse,
  Activity,
  Users,
  Sparkles,
  PanelLeft,
  SunMoon,
  Keyboard,
} from 'lucide-react';
import type { SearchHit } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Spinner } from '../../components/ui/misc.js';
import { useWorkspace } from '../../stores/workspace.js';
import { useTheme } from '../../stores/theme.js';

const ICON = { table: Table2, view: Eye, matview: Layers, column: Columns3 };
const COLOR = {
  table: 'text-accent',
  view: 'text-amber',
  matview: 'text-green',
  column: 'text-muted',
};

interface Action {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords: string;
  run: () => void;
}

/**
 * Global palette (⌘/Ctrl+K): runs quick actions (navigation, toggles) and
 * searches tables, views, materialized views and columns — opening the object
 * on select.
 */
export function CommandPalette() {
  const ws = useWorkspace();
  const { active, database, openTable, openStructure } = ws;
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // ⌘/Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset transient state whenever it opens/closes.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
    }
    setSelected(0);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery({
    queryKey: ['search', active?.id, database, debounced],
    queryFn: () => api.search(active!.id, debounced, database),
    enabled: open && !!active && debounced.length >= 1,
  });

  const close = () => setOpen(false);
  const act = (fn: () => void) => {
    fn();
    close();
  };

  const actions = useMemo<Action[]>(() => {
    const caps = active?.capabilities;
    const list: Action[] = [
      { id: 'query', label: 'Nouvelle requête', icon: FileCode2, keywords: 'sql editor nouvelle requete', run: () => act(ws.openQuery) },
      { id: 'erd', label: 'Diagramme ERD', icon: Workflow, keywords: 'erd diagramme schema relations', run: () => act(ws.openErd) },
      { id: 'board', label: 'Tableaux de bord', icon: LayoutGrid, keywords: 'dashboard widgets tableau de bord', run: () => act(ws.openBoard) },
      { id: 'tasks', label: 'Tâches planifiées', icon: Clock, keywords: 'taches planifiees jobs cron', run: () => act(() => ws.openTasks()) },
      { id: 'health', label: 'Santé de la base', icon: HeartPulse, keywords: 'sante health diagnostics index', run: () => act(ws.openHealth) },
      ...(caps?.activityMonitor
        ? [{ id: 'activity', label: 'Activité & sessions', icon: Activity, keywords: 'activite sessions locks requetes', run: () => act(ws.openActivity) } as Action]
        : []),
      { id: 'roles', label: 'Rôles & privilèges', icon: Users, keywords: 'roles utilisateurs privileges droits', run: () => act(ws.openRoles) },
      { id: 'ai', label: "Afficher / masquer l'assistant IA", icon: Sparkles, keywords: 'assistant ia ai chat', run: () => act(() => ws.toggleAi()) },
      { id: 'sidebar', label: 'Afficher / masquer les connexions', icon: PanelLeft, keywords: 'barre laterale connexions sidebar', run: () => act(() => ws.toggleSidebar()) },
      { id: 'theme', label: 'Basculer le thème clair / sombre', icon: SunMoon, keywords: 'theme clair sombre dark light', run: () => act(theme.toggle) },
      { id: 'shortcuts', label: 'Raccourcis clavier', icon: Keyboard, keywords: 'raccourcis clavier aide help shortcuts', run: () => act(() => ws.toggleShortcuts(true)) },
    ];
    const q = debounced.toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) => a.label.toLowerCase().includes(q) || a.keywords.includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.capabilities, debounced, theme, ws]);

  const hits = useMemo(() => results.data ?? [], [results.data]);
  // Unified navigable list: actions first, then object hits.
  const total = actions.length + hits.length;
  useEffect(() => setSelected(0), [debounced, total]);

  if (!active) return null;

  const openHit = (hit: SearchHit) => {
    if (hit.kind === 'column') openStructure(hit.table!, hit.schema);
    else openTable(hit.name, hit.schema);
    close();
  };

  const runSelected = () => {
    if (selected < actions.length) actions[selected]?.run();
    else hits[selected - actions.length] && openHit(hits[selected - actions.length]!);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, total - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runSelected();
    }
  };

  return (
    <RD.Root open={open} onOpenChange={setOpen}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <RD.Content
          className="fixed left-1/2 top-[15%] z-50 -translate-x-1/2 w-[560px] max-w-[92vw] rounded-xl border border-border bg-panel shadow-2xl overflow-hidden"
          aria-describedby={undefined}
        >
          <RD.Title className="sr-only">Recherche & commandes</RD.Title>
          <div className="flex items-center gap-2 px-3 h-11 border-b border-border-soft">
            <Search size={15} className="text-muted shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Chercher une table, une vue, une colonne — ou une action…"
              className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted"
            />
            {results.isFetching && <Spinner />}
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-auto py-1">
            {actions.length > 0 && (
              <>
                <p className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted/60">
                  Actions
                </p>
                {actions.map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.id}
                      onMouseEnter={() => setSelected(i)}
                      onClick={a.run}
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px] ${
                        i === selected ? 'bg-panel-2' : ''
                      }`}
                    >
                      <Icon size={14} className="text-muted shrink-0" />
                      <span className="truncate">{a.label}</span>
                    </button>
                  );
                })}
              </>
            )}

            {hits.length > 0 && (
              <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-muted/60">
                Objets
              </p>
            )}
            {hits.map((hit, i) => {
              const idx = actions.length + i;
              const Icon = ICON[hit.kind];
              const qualified = hit.schema ? `${hit.schema}.` : '';
              return (
                <button
                  key={`${hit.kind}:${hit.schema ?? ''}:${hit.table ?? ''}:${hit.name}:${i}`}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => openHit(hit)}
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px] ${
                    idx === selected ? 'bg-panel-2' : ''
                  }`}
                >
                  <Icon size={14} className={`${COLOR[hit.kind]} shrink-0`} />
                  <span className="truncate">
                    {hit.kind === 'column' ? (
                      <>
                        <span className="text-muted">
                          {qualified}
                          {hit.table}.
                        </span>
                        <span className="font-medium">{hit.name}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-muted">{qualified}</span>
                        <span className="font-medium">{hit.name}</span>
                      </>
                    )}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted/60 shrink-0">
                    {hit.kind === 'matview'
                      ? 'matview'
                      : hit.kind === 'column'
                        ? (hit.dataType ?? 'colonne')
                        : hit.kind}
                  </span>
                </button>
              );
            })}

            {debounced.length >= 1 &&
              total === 0 &&
              !results.isFetching && (
                <p className="px-3 py-6 text-center text-[13px] text-muted">
                  Aucun résultat pour « {debounced} »
                </p>
              )}
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
