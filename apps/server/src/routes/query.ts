import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  explainRequestSchema,
  queryPlanRequestSchema,
  queryRequestSchema,
  type StatementPlan,
} from '@fluentdb/shared';
import {
  analyzeScript,
  classifyStatement,
  affectedCountQuery,
} from '../sql/analyze.js';
import { splitSqlStatements } from '../drivers/sqlSplit.js';
import { detectDatabaseContainers } from '../docker/detect.js';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });
const queryIdParams = z.object({ queryId: z.string() });
const healthQuery = z.object({ database: z.string().optional() });

const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * Find the local Docker container (if any) whose published port matches a
 * connection's host:port — so we can offer to restart the DB server in-app.
 */
async function findDbContainer(ctx: AppContext, connectionId: string) {
  const config = ctx.manager.getConfig(connectionId);
  const host = config?.host ?? '127.0.0.1';
  const port = config?.port ?? undefined;
  const isLocal = LOCAL_HOSTS.has(host.toLowerCase());
  const dockerAvailable = isLocal ? await ctx.docker.ping() : false;
  let container: { id: string; name: string; running: boolean } | undefined;
  if (dockerAvailable && port != null) {
    const found = (await detectDatabaseContainers(ctx.docker).catch(() => [])).find(
      (c) => c.hostPort === port && c.engine === config?.engine,
    );
    if (found)
      container = {
        id: found.containerId,
        name: found.containerName,
        running: found.running,
      };
  }
  return { host, port: port ?? 0, isLocal, dockerAvailable, container };
}

export function registerQueryRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  /** Live server sessions (activity monitor). */
  app.get('/api/connections/:id/activity', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = healthQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    return driver.activeSessions();
  });

  /** Sessions blocked by another session (lock waits). */
  app.get('/api/connections/:id/locks', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = healthQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    return driver.blockingLocks();
  });

  /** Cancel a running query or terminate a session. */
  app.post('/api/connections/:id/activity/:pid/kill', async (req) => {
    const { id, pid } = z
      .object({ id: z.string(), pid: z.string() })
      .parse(req.params);
    const { database, terminate } = z
      .object({ database: z.string().optional(), terminate: z.boolean().default(false) })
      .parse(req.body ?? {});
    const driver = await ctx.manager.getDriver(id, database);
    const killed = await driver.killSession(pid, { terminate });
    return { killed };
  });

  /** Largest tables by disk usage (storage explorer). */
  app.get('/api/connections/:id/sizes', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = healthQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    return driver.tableSizes();
  });

  /** Database roles/users and their attributes (roles & privileges view). */
  app.get('/api/connections/:id/roles', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = healthQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    return driver.roles();
  });

  /** Per-statement performance stats (pg_stat_statements explorer). */
  app.get('/api/connections/:id/query-stats', async (req) => {
    const { id } = idParams.parse(req.params);
    const q = z
      .object({
        database: z.string().optional(),
        sort: z
          .enum(['total', 'mean', 'calls', 'rows', 'stddev'])
          .default('total'),
        limit: z.coerce.number().int().min(1).max(500).default(50),
        search: z.string().optional(),
        hideSystem: z
          .enum(['true', 'false'])
          .default('true')
          .transform((v) => v === 'true'),
      })
      .parse(req.query);
    const driver = await ctx.manager.getDriver(id, q.database);
    if (!driver.queryStats) {
      return {
        available: false,
        reason: "Ce moteur n'expose pas de statistiques de requêtes.",
        rows: [],
      };
    }
    return driver.queryStats({
      sort: q.sort,
      limit: q.limit,
      search: q.search,
      hideSystem: q.hideSystem,
    });
  });

  /** Reset the accumulated statement statistics. */
  app.post('/api/connections/:id/query-stats/reset', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = healthQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    if (!driver.resetQueryStats) {
      throw Object.assign(new Error('Non supporté par ce moteur'), {
        statusCode: 400,
      });
    }
    await driver.resetQueryStats();
    return { ok: true };
  });

  /** Configure shared_preload_libraries for the stats extension (needs restart). */
  app.post('/api/connections/:id/query-stats/enable-preload', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = healthQuery.parse(req.query);
    const config = ctx.manager.getConfig(id);
    if (config?.isReadOnly) {
      throw Object.assign(new Error('Connection is marked read-only'), {
        statusCode: 403,
      });
    }
    const driver = await ctx.manager.getDriver(id, database);
    if (!driver.enablePreloadForStats) {
      throw Object.assign(new Error('Non supporté par ce moteur'), {
        statusCode: 400,
      });
    }
    await driver.enablePreloadForStats();
    return { ok: true };
  });

  /** How to restart the connected DB server (Docker container detection). */
  app.get('/api/connections/:id/restart-info', async (req) => {
    const { id } = idParams.parse(req.params);
    return findDbContainer(ctx, id);
  });

  /** Restart the DB server's Docker container, when one was detected. */
  app.post('/api/connections/:id/restart-container', async (req) => {
    const { id } = idParams.parse(req.params);
    const info = await findDbContainer(ctx, id);
    if (!info.container) {
      throw Object.assign(
        new Error('Aucun conteneur Docker correspondant à cette connexion'),
        { statusCode: 400 },
      );
    }
    await ctx.docker.restartContainer(info.container.id);
    return { restarted: true, name: info.container.name };
  });

  /** Read-only diagnostic report over the engine's catalogs / stat views. */
  app.get('/api/connections/:id/health', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = healthQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    const findings = await driver.healthChecks();
    return {
      engine: driver.engine,
      generatedAt: new Date().toISOString(),
      findings,
    };
  });

  app.post('/api/connections/:id/query', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = queryRequestSchema.parse(req.body);
    const config = ctx.manager.getConfig(id);

    // Read-only connections never execute writes or DDL, even from the free
    // SQL editor — the safe-by-design guardrail, enforced server-side.
    if (config?.isReadOnly) {
      const offending = analyzeScript(body.sql).find(
        (s) => s.kind === 'write' || s.kind === 'ddl',
      );
      if (offending) {
        throw Object.assign(
          new Error(
            `Connection is read-only — ${offending.operation} is not allowed`,
          ),
          { statusCode: 403 },
        );
      }
    }

    const driver = await ctx.manager.getDriver(id, body.database);
    return ctx.runner.run(driver, body.sql, {
      maxRows: body.maxRows,
      connectionId: id,
      connectionName: config?.name ?? id,
      database: body.database ?? config?.database ?? null,
      queryId: body.queryId,
    });
  });

  /**
   * Analyze a script without executing it: classify each statement, flag
   * dangerous patterns and estimate affected rows for writes (dry-run
   * EXPLAIN). Powers the confirmation dialog before risky executions.
   */
  app.post('/api/connections/:id/query/plan', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = queryPlanRequestSchema.parse(req.body);
    const driver = await ctx.manager.getDriver(id, body.database);

    const analyses = analyzeScript(body.sql);
    const statements: StatementPlan[] = await Promise.all(
      analyses.map(async (a, i) => {
        let estimatedRows: number | null = null;
        let exactRows = false;
        if (a.kind === 'write') {
          // Prefer an EXACT count via a read-only SELECT count(*) over the
          // statement's own target + WHERE (works on every engine, SQLite
          // included). Fall back to the planner estimate when we can't derive
          // a safe count query.
          const countSql = affectedCountQuery(a.sql);
          if (countSql) {
            try {
              const sets = await driver.runQuery(countSql, {
                queryId: `plan-count-${id}-${i}-${Date.now()}`,
                maxRows: 1,
              });
              const value = sets.find((s) => s.rows.length > 0)?.rows[0]?.[0];
              const n = typeof value === 'number' ? value : Number(value);
              if (Number.isFinite(n)) {
                estimatedRows = n;
                exactRows = true;
              }
            } catch {
              // fall through to the planner estimate
            }
          }
          if (!exactRows && driver.capabilities.estimateRows) {
            estimatedRows = await driver.estimateRows(a.sql).catch(() => null);
          }
        }
        return {
          sql: a.sql,
          kind: a.kind,
          operation: a.operation,
          warnings: a.warnings,
          estimatedRows,
          exactRows,
        };
      }),
    );

    return {
      statements,
      requiresConfirmation: statements.some(
        (s) => s.kind === 'write' || s.kind === 'ddl',
      ),
    };
  });

  /**
   * Return a normalized execution-plan tree for the first statement.
   * `analyze` runs the query for real metrics — only honored for reads, so a
   * write is never executed by the plan viewer.
   */
  app.post('/api/connections/:id/query/explain', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = explainRequestSchema.parse(req.body);
    const driver = await ctx.manager.getDriver(id, body.database);

    const statement = splitSqlStatements(body.sql)[0] ?? body.sql;
    const isRead = classifyStatement(statement).kind === 'read';
    const analyze =
      body.analyze === true &&
      isRead &&
      driver.capabilities.explainAnalyze;

    return driver.explain(statement, { analyze });
  });

  app.post('/api/queries/:queryId/cancel', async (req) => {
    const { queryId } = queryIdParams.parse(req.params);
    const cancelled = await ctx.runner.cancel(queryId);
    return { cancelled };
  });

  app.get('/api/history', async (req) => {
    const q = z
      .object({
        connectionId: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(req.query);
    return ctx.history.list(q.connectionId, q.search);
  });

  app.delete('/api/history/:historyId', async (req) => {
    const { historyId } = z
      .object({ historyId: z.coerce.number() })
      .parse(req.params);
    ctx.history.delete(historyId);
    return { ok: true };
  });

  app.delete('/api/history', async (req) => {
    const q = z.object({ connectionId: z.string().optional() }).parse(req.query);
    ctx.history.clear(q.connectionId);
    return { ok: true };
  });
}
