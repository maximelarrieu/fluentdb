import { nanoid } from 'nanoid';
import type { QueryResponse } from '@fluentdb/shared';
import type { Driver } from '../drivers/types.js';
import type { HistoryStore } from '../store/historyStore.js';

interface RunningQuery {
  driver: Driver;
}

/**
 * Executes editor queries: assigns queryIds, keeps a registry for
 * cancellation and records every run in the history store.
 */
export class QueryRunner {
  private readonly running = new Map<string, RunningQuery>();

  constructor(private readonly history: HistoryStore) {}

  async run(
    driver: Driver,
    sql: string,
    opts: {
      maxRows: number;
      connectionId: string;
      connectionName: string;
      database: string | null;
    },
  ): Promise<QueryResponse> {
    const queryId = nanoid(12);
    this.running.set(queryId, { driver });
    const started = performance.now();
    try {
      const resultSets = await driver.runQuery(sql, {
        queryId,
        maxRows: opts.maxRows,
      });
      const durationMs = Math.round(performance.now() - started);
      this.history.add({
        connectionId: opts.connectionId,
        connectionName: opts.connectionName,
        database: opts.database,
        sql,
        durationMs,
        rowCount: resultSets.reduce(
          (acc, r) => acc + (r.rowCount || r.affectedRows || 0),
          0,
        ),
        error: null,
      });
      return { queryId, resultSets, durationMs };
    } catch (err) {
      const durationMs = Math.round(performance.now() - started);
      this.history.add({
        connectionId: opts.connectionId,
        connectionName: opts.connectionName,
        database: opts.database,
        sql,
        durationMs,
        rowCount: null,
        error: (err as Error).message,
      });
      throw err;
    } finally {
      this.running.delete(queryId);
    }
  }

  async cancel(queryId: string): Promise<boolean> {
    const entry = this.running.get(queryId);
    if (!entry) return false;
    return entry.driver.cancelQuery(queryId);
  }
}
