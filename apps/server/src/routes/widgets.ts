import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  widgetInputSchema,
  widgetPatchSchema,
  widgetLayoutSchema,
} from '@fluentdb/shared';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });
const widgetParams = z.object({ id: z.string(), widgetId: z.string() });
const scopeQuery = z.object({ database: z.string().optional() });

export function registerWidgetRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/connections/:id/widgets', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = scopeQuery.parse(req.query);
    return ctx.dashboards.list(id, database);
  });

  app.post('/api/connections/:id/widgets', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = scopeQuery.parse(req.query);
    const input = widgetInputSchema.parse(req.body);
    return ctx.dashboards.create(id, database ?? null, input);
  });

  app.patch('/api/connections/:id/widgets/:widgetId', async (req, reply) => {
    const { widgetId } = widgetParams.parse(req.params);
    const patch = widgetPatchSchema.parse(req.body);
    const updated = ctx.dashboards.update(widgetId, patch);
    if (!updated) return reply.code(404).send({ error: 'Widget not found' });
    return updated;
  });

  app.delete('/api/connections/:id/widgets/:widgetId', async (req) => {
    const { widgetId } = widgetParams.parse(req.params);
    ctx.dashboards.delete(widgetId);
    return { ok: true };
  });

  app.post('/api/connections/:id/widgets/reorder', async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body ?? {});
    ctx.dashboards.reorder(ids);
    return { ok: true };
  });

  app.post('/api/connections/:id/widgets/layout', async (req) => {
    const { items } = widgetLayoutSchema.parse(req.body ?? {});
    ctx.dashboards.setLayout(items);
    return { ok: true };
  });
}
