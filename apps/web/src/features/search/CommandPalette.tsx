import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as RD from '@radix-ui/react-dialog';
import { Search, Table2, Eye, Layers, Columns3 } from 'lucide-react';
import type { SearchHit } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Spinner } from '../../components/ui/misc.js';
import { useWorkspace } from '../../stores/workspace.js';

const ICON = { table: Table2, view: Eye, matview: Layers, column: Columns3 };
const COLOR = {
  table: 'text-accent',
  view: 'text-amber',
  matview: 'text-green',
  column: 'text-muted',
};

/**
 * Global search (⌘/Ctrl+K): finds tables, views, materialized views and
 * columns across the connected database and opens the object on select.
 */
export function CommandPalette() {
  const { active, database, openTable, openStructure } = useWorkspace();
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

  const hits = useMemo(() => results.data ?? [], [results.data]);
  useEffect(() => setSelected(0), [hits]);

  if (!active) return null;

  const openHit = (hit: SearchHit) => {
    if (hit.kind === 'column') {
      openStructure(hit.table!, hit.schema);
    } else {
      openTable(hit.name, hit.schema);
    }
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && hits[selected]) {
      e.preventDefault();
      openHit(hits[selected]);
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
          <RD.Title className="sr-only">Recherche globale</RD.Title>
          <div className="flex items-center gap-2 px-3 h-11 border-b border-border-soft">
            <Search size={15} className="text-muted shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Chercher une table, une vue, une colonne…"
              className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted"
            />
            {results.isFetching && <Spinner />}
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-auto py-1">
            {debounced.length >= 1 && hits.length === 0 && !results.isFetching && (
              <p className="px-3 py-6 text-center text-[13px] text-muted">
                Aucun résultat pour « {debounced} »
              </p>
            )}
            {debounced.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-muted">
                Tape pour chercher dans tout le schéma.
              </p>
            )}
            {hits.map((hit, i) => {
              const Icon = ICON[hit.kind];
              const qualified = hit.schema ? `${hit.schema}.` : '';
              return (
                <button
                  key={`${hit.kind}:${hit.schema ?? ''}:${hit.table ?? ''}:${hit.name}:${i}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => openHit(hit)}
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px] ${
                    i === selected ? 'bg-panel-2' : ''
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
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
