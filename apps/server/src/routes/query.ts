import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { queryRequestSchema } from '@fluentdb/shared';
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
    const driver = await ctx.manager.getDriver(id, body.database);
    return ctx.runner.run(driver, body.sql, {
      maxRows: body.maxRows,
      connectionId: id,
      connectionName: config?.name ?? id,
      database: body.database ?? config?.database ?? null,
      queryId: body.queryId,
    });
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
