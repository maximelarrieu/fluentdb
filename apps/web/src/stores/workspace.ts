import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
export interface ErdTab {
  kind: 'erd';
  id: string;
  title: string;
}
export interface TasksTab {
  kind: 'tasks';
  id: string;
  title: string;
}
export interface DashboardTab {
  kind: 'dashboard';
  id: string;
  title: string;
}
export interface HealthTab {
  kind: 'health';
  id: string;
  title: string;
}
export type Tab =
  | TableTab
  | QueryTab
  | StructureTab
  | ErdTab
  | TasksTab
  | DashboardTab
  | HealthTab;

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
  sidebarCollapsed: boolean;
  schemaVersion: number;
  /** Task the tasks view should select when opened (e.g. from the dashboard). */
  focusTaskId: string | null;
  /** Table whose data view should auto-open the mock-data dialog (from the tree). */
  mockRequest: { table: string; schema?: string } | null;

  setActive: (conn: ActiveConnection | null) => void;
  setDatabase: (database: string | undefined) => void;
  setSchema: (schema: string | undefined) => void;
  openTable: (table: string, schema?: string) => void;
  openStructure: (table: string, schema?: string) => void;
  openQuery: (sql?: string) => void;
  openErd: () => void;
  openTasks: (taskId?: string) => void;
  openDashboard: () => void;
  openHealth: () => void;
  /** Open a table's data view and flag it to pop the mock-data dialog. */
  requestMockData: (table: string, schema?: string) => void;
  clearMockRequest: () => void;
  setTabSql: (id: string, sql: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  toggleAi: (open?: boolean) => void;
  toggleSidebar: (collapsed?: boolean) => void;
  bumpSchema: () => void;
  /**
   * Refresh the active connection's capabilities after re-establishing it on
   * startup, WITHOUT clearing the restored tabs (unlike setActive).
   */
  reconnectActive: (capabilities: ConnectCapabilities) => void;
  /** Skip the write/DDL confirmation dialog for the rest of the session */
  skipExecConfirm: boolean;
  setSkipExecConfirm: (skip: boolean) => void;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
  active: null,
  database: undefined,
  schema: undefined,
  tabs: [],
  activeTabId: null,
  aiOpen: false,
  sidebarCollapsed: false,
  schemaVersion: 0,
  focusTaskId: null,
  mockRequest: null,
  skipExecConfirm: false,

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

  openErd: () => {
    const existing = get().tabs.find((t) => t.kind === 'erd');
    if (existing) return set({ activeTabId: existing.id });
    const tab: ErdTab = {
      kind: 'erd',
      id: nanoid(),
      title: 'Diagramme ERD',
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  openTasks: (taskId) => {
    set({ focusTaskId: taskId ?? null });
    const existing = get().tabs.find((t) => t.kind === 'tasks');
    if (existing) return set({ activeTabId: existing.id });
    const tab: TasksTab = {
      kind: 'tasks',
      id: nanoid(),
      title: 'Tâches planifiées',
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  openDashboard: () => {
    const existing = get().tabs.find((t) => t.kind === 'dashboard');
    if (existing) return set({ activeTabId: existing.id });
    const tab: DashboardTab = {
      kind: 'dashboard',
      id: nanoid(),
      title: 'Tableau de bord',
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  openHealth: () => {
    const existing = get().tabs.find((t) => t.kind === 'health');
    if (existing) return set({ activeTabId: existing.id });
    const tab: HealthTab = {
      kind: 'health',
      id: nanoid(),
      title: 'Bilan de santé',
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
  },

  requestMockData: (table, schema) => {
    get().openTable(table, schema);
    set({ mockRequest: { table, schema } });
  },
  clearMockRequest: () => set({ mockRequest: null }),

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
  toggleSidebar: (collapsed) =>
    set((s) => ({ sidebarCollapsed: collapsed ?? !s.sidebarCollapsed })),
  bumpSchema: () => set((s) => ({ schemaVersion: s.schemaVersion + 1 })),
  reconnectActive: (capabilities) =>
    set((s) => ({ active: s.active ? { ...s.active, capabilities } : null })),
  setSkipExecConfirm: (skip) => set({ skipExecConfirm: skip }),
    }),
    {
      name: 'fluentdb.workspace',
      // Persist only the workspace layout — the live connection is
      // re-established on startup, and session-only flags stay in memory.
      partialize: (s) => ({
        active: s.active,
        database: s.database,
        schema: s.schema,
        tabs: s.tabs,
        activeTabId: s.activeTabId,
      }),
    },
  ),
);
