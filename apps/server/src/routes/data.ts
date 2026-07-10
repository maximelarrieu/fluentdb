import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rowChangesSchema, rowQuerySchema } from '@fluentdb/shared';
import type { AppContext } from '../context.js';

const tableParams = z.object({ id: z.string(), table: z.string() });
const scope = z.object({
  database: z.string().optional(),
  schema: z.string().optional(),
});

export function registerDataRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.post('/api/connections/:id/tables/:table/rows/query', async (req) => {
    const { id, table } = tableParams.parse(req.params);
    const body = scope.and(rowQuerySchema).parse(req.body);
    const driver = await ctx.manager.getDriver(id, body.database);
    return driver.selectRows({ name: table, schema: body.schema }, body);
  });

  app.post('/api/connections/:id/tables/:table/rows/mutate', async (req) => {
    const { id, table } = tableParams.parse(req.params);
    const body = scope
      .extend({ changes: rowChangesSchema })
      .parse(req.body);
    const config = ctx.manager.getConfig(id);
    if (config?.isReadOnly) {
      throw Object.assign(new Error('Connection is marked read-only'), {
        statusCode: 403,
      });
    }
    const driver = await ctx.manager.getDriver(id, body.database);
    return driver.mutateRows({ name: table, schema: body.schema }, body.changes);
  });
}
