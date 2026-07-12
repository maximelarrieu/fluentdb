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
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });
const queryIdParams = z.object({ queryId: z.string() });
const healthQuery = z.object({ database: z.string().optional() });

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
