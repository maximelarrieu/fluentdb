/** One server session / connection as shown in the activity monitor. */
export interface DbSession {
  /** Backend PID (PostgreSQL) or thread id (MySQL), as a string. */
  id: string;
  user: string | null;
  database: string | null;
  /** Session/command state (e.g. active, idle, Query, Sleep). */
  state: string | null;
  /** Wait event, when the engine exposes one (PostgreSQL). */
  waitEvent: string | null;
  /** Time in the current query/state, milliseconds. */
  durationMs: number | null;
  /** Current SQL, truncated. */
  query: string | null;
  /** True for FluentDB's own backend (never offered for killing). */
  current: boolean;
}
