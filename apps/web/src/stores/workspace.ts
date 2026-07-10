import { create } from 'zustand';
import type { ConnectCapabilities } from '@fluentdb/shared';
import { nanoid } from '../lib/nanoid.js';

export interface TableTab {
  kind: 'table';
  id: string;
  table: string;
  schema?: string;
  title: string;
}
export interface QueryTab {
  kind: 'query';
  id: string;
  title: string;
  sql: string;
}
export interface StructureTab {
  kind: 'structure';
  id: string;
  table: string;
  schema?: string;
  title: string;
}
export type Tab = TableTab | QueryTab | StructureTab;

interface ActiveConnection {
  id: string;
  name: string;
  engine: string;
  capabilities: ConnectCapabilities;
  database?: string;
}

interface WorkspaceState {
  active: ActiveConnection | null;
  database: string | undefined;
  schema: string | undefined;
  tabs: Tab[];
  activeTabId: string | null;
  aiOpen: boolean;
  schemaVersion: number;

  setActive: (conn: ActiveConnection | null) => void;
  setDatabase: (database: string | undefined) => void;
  setSchema: (schema: string | undefined) => void;
  openTable: (table: string, schema?: string) => void;
  openStructure: (table: string, schema?: string) => void;
  openQuery: (sql?: string) => void;
  setTabSql: (id: string, sql: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  toggleAi: (open?: boolean) => void;
  bumpSchema: () => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  active: null,
  database: undefined,
  schema: undefined,
  tabs: [],
  activeTabId: null,
  aiOpen: false,
  schemaVersion: 0,

  setActive: (conn) =>
    set({
      active: conn,
      database: conn?.database,
      schema: undefined,
      tabs: [],
      activeTabId: null,
    }),
  setDatabase: (database) => set({ database, schema: undefined }),
  setSchema: (schema) => set({ schema }),

  openTable: (table, schema) => {
    const existing = get().tabs.find(
      (t) => t.kind === 'table' && t.table === table && t.schema === schema,
    );
    if (existing) return set({ activeTabId: existing.id });
    const tab: TableTab = {
      kind: 'table',
      id: nanoid(),
      table,
      schema,
      title: table,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  openStructure: (table, schema) => {
    const existing = get().tabs.find(
      (t) => t.kind === 'structure' && t.table === table && t.schema === schema,
    );
    if (existing) return set({ activeTabId: existing.id });
    const tab: StructureTab = {
      kind: 'structure',
      id: nanoid(),
      table,
      schema,
      title: `${table} · structure`,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  openQuery: (sql = '') => {
    const count = get().tabs.filter((t) => t.kind === 'query').length + 1;
    const tab: QueryTab = {
      kind: 'query',
      id: nanoid(),
      title: `Requête ${count}`,
      sql,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  setTabSql: (id, sql) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.kind === 'query' ? { ...t, sql } : t,
      ),
    })),

  closeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId =
        s.activeTabId === id
          ? (tabs.at(-1)?.id ?? null)
          : s.activeTabId;
      return { tabs, activeTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),
  toggleAi: (open) => set((s) => ({ aiOpen: open ?? !s.aiOpen })),
  bumpSchema: () => set((s) => ({ schemaVersion: s.schemaVersion + 1 })),
}));
