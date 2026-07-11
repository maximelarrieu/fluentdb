import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from '../../lib/nanoid.js';

export interface Snippet {
  id: string;
  name: string;
  sql: string;
}

interface SnippetState {
  snippets: Snippet[];
  add: (name: string, sql: string) => void;
  remove: (id: string) => void;
}

/** Named SQL snippets / favourites, persisted locally across sessions. */
export const useSnippets = create<SnippetState>()(
  persist(
    (set) => ({
      snippets: [],
      add: (name, sql) =>
        set((s) => ({
          snippets: [{ id: nanoid(), name: name.trim(), sql }, ...s.snippets],
        })),
      remove: (id) =>
        set((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) })),
    }),
    { name: 'fluentdb.snippets' },
  ),
);
