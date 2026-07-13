import type {
  AiChatRequest,
  MonitorProposal,
  MockRowsPreview,
  AutocompleteCatalog,
  ConnectCapabilities,
  ConnectionInput,
  ConnectionSummary,
  DatabaseInfo,
  DdlChange,
  DdlPreview,
  DetectedDbContainer,
  DockerStatus,
  DbSession,
  DbRole,
  LockWait,
  ErdSchema,
  HealthReport,
  TableSize,
  HistoryEntry,
  MutationResult,
  PageResult,
  QueryPlan,
  QueryPlanResponse,
  QueryRequest,
  QueryResponse,
  RowChanges,
  RowQuery,
  SchemaInfo,
  ScheduledTask,
  ScheduledTaskInput,
  SearchHit,
  TableInfo,
  RoutineInfo,
  TriggerInfo,
  DashboardWidget,
  WidgetInput,
  AiWidgetProposal,
  TableStructure,
  TaskSnapshot,
} from '@fluentdb/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText;
    let detail: string | undefined;
    try {
      const payload = await res.json();
      message = payload.error ?? message;
      detail = payload.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const scope = (database?: string, schema?: string): string => {
  const params = new URLSearchParams();
  if (database) params.set('database', database);
  if (schema) params.set('schema', schema);
  const s = params.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // connections
  listConnections: () =>
    request<ConnectionSummary[]>('GET', '/api/connections'),
  createConnection: (input: ConnectionInput) =>
    request<ConnectionSummary>('POST', '/api/connections', input),
  updateConnection: (id: string, input: ConnectionInput) =>
    request<ConnectionSummary>('PUT', `/api/connections/${id}`, input),
  deleteConnection: (id: string) =>
    request<{ ok: true }>('DELETE', `/api/connections/${id}`),
  testConnection: (input: ConnectionInput & { id?: string }) =>
    request<{ ok: true; serverVersion: string }>(
      'POST',
      '/api/connections/test',
      input,
    ),
  connect: (id: string) =>
    request<{ ok: true; capabilities: ConnectCapabilities }>(
      'POST',
      `/api/connections/${id}/connect`,
    ),
  disconnect: (id: string) =>
    request<{ ok: true }>('POST', `/api/connections/${id}/disconnect`),

  // schema
  databases: (id: string) =>
    request<DatabaseInfo[]>('GET', `/api/connections/${id}/databases`),
  schemas: (id: string, database?: string) =>
    request<SchemaInfo[]>(
      'GET',
      `/api/connections/${id}/schemas${scope(database)}`,
    ),
  tables: (id: string, database?: string, schema?: string) =>
    request<TableInfo[]>(
      'GET',
      `/api/connections/${id}/tables${scope(database, schema)}`,
    ),
  routines: (id: string, database?: string, schema?: string) =>
    request<RoutineInfo[]>(
      'GET',
      `/api/connections/${id}/routines${scope(database, schema)}`,
    ),
  triggers: (id: string, database?: string, schema?: string) =>
    request<TriggerInfo[]>(
      'GET',
      `/api/connections/${id}/triggers${scope(database, schema)}`,
    ),
  structure: (id: string, table: string, database?: string, schema?: string) =>
    request<TableStructure>(
      'GET',
      `/api/connections/${id}/tables/${encodeURIComponent(table)}/structure${scope(database, schema)}`,
    ),
  viewDefinition: (
    id: string,
    table: string,
    database?: string,
    schema?: string,
  ) =>
    request<{ definition: string | null }>(
      'GET',
      `/api/connections/${id}/tables/${encodeURIComponent(table)}/definition${scope(database, schema)}`,
    ),
  refreshMatview: (
    id: string,
    name: string,
    database?: string,
    schema?: string,
  ) =>
    request<{ concurrent: boolean }>(
      'POST',
      `/api/connections/${id}/matview/refresh`,
      { name, database, schema },
    ),
  autocomplete: (id: string, database?: string) =>
    request<{
      catalog: AutocompleteCatalog;
      dialect: 'postgres' | 'mysql' | 'sqlite';
      typeNames: string[];
    }>('GET', `/api/connections/${id}/autocomplete${scope(database)}`),
  search: (id: string, q: string, database?: string) => {
    const params = new URLSearchParams({ q });
    if (database) params.set('database', database);
    return request<SearchHit[]>(
      'GET',
      `/api/connections/${id}/search?${params.toString()}`,
    );
  },

  // data
  rows: (
    id: string,
    table: string,
    q: RowQuery & { database?: string; schema?: string },
  ) =>
    request<PageResult>(
      'POST',
      `/api/connections/${id}/tables/${encodeURIComponent(table)}/rows/query`,
      q,
    ),
  mutate: (
    id: string,
    table: string,
    changes: RowChanges,
    database?: string,
    schema?: string,
  ) =>
    request<MutationResult>(
      'POST',
      `/api/connections/${id}/tables/${encodeURIComponent(table)}/rows/mutate`,
      { changes, database, schema },
    ),

  // query
  query: (id: string, req: QueryRequest) =>
    request<QueryResponse>('POST', `/api/connections/${id}/query`, req),
  queryPlan: (id: string, sql: string, database?: string) =>
    request<QueryPlanResponse>('POST', `/api/connections/${id}/query/plan`, {
      sql,
      database,
    }),
  explain: (
    id: string,
    sql: string,
    opts: { database?: string; analyze?: boolean } = {},
  ) =>
    request<QueryPlan>('POST', `/api/connections/${id}/query/explain`, {
      sql,
      database: opts.database,
      analyze: opts.analyze,
    }),
  cancelQuery: (queryId: string) =>
    request<{ cancelled: boolean }>('POST', `/api/queries/${queryId}/cancel`),
  history: (connectionId?: string, search?: string) => {
    const params = new URLSearchParams();
    if (connectionId) params.set('connectionId', connectionId);
    if (search) params.set('search', search);
    return request<HistoryEntry[]>('GET', `/api/history?${params.toString()}`);
  },
  deleteHistory: (historyId: number) =>
    request<{ ok: true }>('DELETE', `/api/history/${historyId}`),

  // ddl
  ddlPreview: (id: string, change: DdlChange, database?: string) =>
    request<DdlPreview>('POST', `/api/connections/${id}/ddl/preview`, {
      change,
      database,
    }),
  ddlApply: (id: string, statements: string[], database?: string) =>
    request<{ ok: true }>('POST', `/api/connections/${id}/ddl/apply`, {
      statements,
      database,
    }),

  // erd
  erd: (id: string, database?: string, schema?: string) =>
    request<ErdSchema>('GET', `/api/connections/${id}/erd${scope(database, schema)}`),

  // health
  sizes: (id: string, database?: string) =>
    request<TableSize[]>(
      'GET',
      `/api/connections/${id}/sizes${database ? `?database=${encodeURIComponent(database)}` : ''}`,
    ),
  health: (id: string, database?: string) =>
    request<HealthReport>(
      'GET',
      `/api/connections/${id}/health${database ? `?database=${encodeURIComponent(database)}` : ''}`,
    ),
  roles: (id: string, database?: string) =>
    request<DbRole[]>(
      'GET',
      `/api/connections/${id}/roles${database ? `?database=${encodeURIComponent(database)}` : ''}`,
    ),

  // activity monitor
  activity: (id: string, database?: string) =>
    request<DbSession[]>(
      'GET',
      `/api/connections/${id}/activity${database ? `?database=${encodeURIComponent(database)}` : ''}`,
    ),
  locks: (id: string, database?: string) =>
    request<LockWait[]>(
      'GET',
      `/api/connections/${id}/locks${database ? `?database=${encodeURIComponent(database)}` : ''}`,
    ),
  killSession: (
    id: string,
    pid: string,
    body: { terminate: boolean; database?: string },
  ) =>
    request<{ killed: boolean }>(
      'POST',
      `/api/connections/${id}/activity/${encodeURIComponent(pid)}/kill`,
      body,
    ),

  // scheduled tasks
  tasks: () => request<ScheduledTask[]>('GET', '/api/tasks'),
  createTask: (input: ScheduledTaskInput) =>
    request<ScheduledTask>('POST', '/api/tasks', input),
  updateTask: (id: string, patch: Partial<ScheduledTaskInput>) =>
    request<ScheduledTask>('PUT', `/api/tasks/${id}`, patch),
  deleteTask: (id: string) =>
    request<{ ok: true }>('DELETE', `/api/tasks/${id}`),
  runTask: (id: string) =>
    request<TaskSnapshot>('POST', `/api/tasks/${id}/run`),
  taskSnapshots: (id: string) =>
    request<TaskSnapshot[]>('GET', `/api/tasks/${id}/snapshots`),

  // docker
  dockerStatus: () => request<DockerStatus>('GET', '/api/docker/status'),
  dockerDatabases: () =>
    request<DetectedDbContainer[]>('GET', '/api/docker/databases'),

  // ai
  aiStatus: () =>
    request<{ configured: boolean; provider: string | null; model: string | null }>(
      'GET',
      '/api/ai/status',
    ),
  getAiContext: (id: string, database?: string) =>
    request<{ content: string }>(
      'GET',
      `/api/connections/${id}/ai-context${database ? `?database=${encodeURIComponent(database)}` : ''}`,
    ),
  setAiContext: (id: string, content: string, database?: string) =>
    request<{ ok: boolean; content: string }>(
      'PUT',
      `/api/connections/${id}/ai-context`,
      { content, database },
    ),
  aiContextPrompt: (id: string, database?: string) =>
    request<{ prompt: string }>(
      'GET',
      `/api/connections/${id}/ai-context/prompt${database ? `?database=${encodeURIComponent(database)}` : ''}`,
    ),
  aiMonitor: (body: {
    connectionId: string;
    database?: string;
    description: string;
  }) => request<MonitorProposal>('POST', '/api/ai/monitor', body),
  aiMock: (body: {
    connectionId: string;
    database?: string;
    schema?: string;
    table: string;
    count: number;
  }) => request<MockRowsPreview>('POST', '/api/ai/mock', body),
  aiWidget: (body: {
    connectionId: string;
    database?: string;
    description: string;
  }) => request<AiWidgetProposal>('POST', '/api/ai/widget', body),

  // dashboard widgets
  widgets: (id: string, database?: string) =>
    request<DashboardWidget[]>(
      'GET',
      `/api/connections/${id}/widgets${database ? `?database=${encodeURIComponent(database)}` : ''}`,
    ),
  createWidget: (id: string, input: WidgetInput, database?: string) =>
    request<DashboardWidget>(
      'POST',
      `/api/connections/${id}/widgets${database ? `?database=${encodeURIComponent(database)}` : ''}`,
      input,
    ),
  updateWidget: (id: string, widgetId: string, patch: Partial<WidgetInput>) =>
    request<DashboardWidget>(
      'PATCH',
      `/api/connections/${id}/widgets/${widgetId}`,
      patch,
    ),
  deleteWidget: (id: string, widgetId: string) =>
    request<{ ok: boolean }>(
      'DELETE',
      `/api/connections/${id}/widgets/${widgetId}`,
    ),
  reorderWidgets: (id: string, ids: string[]) =>
    request<{ ok: boolean }>(
      'POST',
      `/api/connections/${id}/widgets/reorder`,
      { ids },
    ),
  setWidgetLayout: (
    id: string,
    items: { id: string; x: number; y: number; w: number; h: number }[],
  ) =>
    request<{ ok: boolean }>(
      'POST',
      `/api/connections/${id}/widgets/layout`,
      { items },
    ),

  exportUrl: (id: string) => `/api/connections/${id}/export`,

  chat: (req: AiChatRequest, signal: AbortSignal) =>
    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    }),
};
