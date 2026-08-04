import { create } from 'zustand';
import type { QueryPlan, QueryResponse } from '@fluentdb/shared';

/**
 * Per-tab query result kept in memory so switching between query tabs (which
 * unmounts the inactive editor) doesn't discard the last result — the user no
 * longer has to re-run a query just because they visited another tab.
 *
 * Deliberately NOT persisted to localStorage: result sets can be large and are
 * cheap to reproduce; they live only for the session.
 */
export interface TabResultState {
  result: QueryResponse | null;
  error: string | null;
  /** The SQL that produced `result` — used by export and "fix with AI". */
  lastSql: string;
  plan: QueryPlan | null;
  bottom: 'results' | 'plan';
}

export const emptyTabResult: TabResultState = {
  result: null,
  error: null,
  lastSql: '',
  plan: null,
  bottom: 'results',
};

interface QueryResultsStore {
  byTab: Record<string, TabResultState>;
  patch: (tabId: string, p: Partial<TabResultState>) => void;
  clear: (tabId: string) => void;
}

export const useQueryResults = create<QueryResultsStore>((set) => ({
  byTab: {},
  patch: (tabId, p) =>
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: { ...(s.byTab[tabId] ?? emptyTabResult), ...p },
      },
    })),
  clear: (tabId) =>
    set((s) => {
      if (!s.byTab[tabId]) return s;
      const next = { ...s.byTab };
      delete next[tabId];
      return { byTab: next };
    }),
}));
