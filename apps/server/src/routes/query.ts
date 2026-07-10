import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  explainRequestSchema,
  queryPlanRequestSchema,
  queryRequestSchema,
  type StatementPlan,
} from '@fluentdb/shared';
import { analyzeScript, classifyStatement } from '../sql/analyze.js';
import { splitSqlStatements } from '../drivers/sqlSplit.js';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });
const queryIdParams = z.object({ queryId: z.string() });

export function registerQueryRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
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
      analyses.map(async (a) => {
        let estimatedRows: number | null = null;
        if (a.kind === 'write' && driver.capabilities.estimateRows) {
          estimatedRows = await driver.estimateRows(a.sql).catch(() => null);
        }
        return {
          sql: a.sql,
          kind: a.kind,
          operation: a.operation,
          warnings: a.warnings,
          estimatedRows,
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
