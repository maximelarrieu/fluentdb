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

/** One "session A is blocked by session B" edge for the lock/blocking view. */
export interface LockWait {
  blockedPid: string;
  blockedUser: string | null;
  blockedQuery: string | null;
  blockingPid: string;
  blockingUser: string | null;
  blockingQuery: string | null;
  /** How long the blocked session has been waiting, milliseconds. */
  waitedMs: number | null;
}
