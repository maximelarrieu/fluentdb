import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ddlChangeSchema } from '@fluentdb/shared';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });

export function registerDdlRoutes(app: FastifyInstance, ctx: AppContext): void {
  // Preview only generates SQL — nothing is executed. The user reviews the
  // statements in the UI, then explicitly applies them.
  app.post('/api/connections/:id/ddl/preview', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .object({ database: z.string().optional(), change: ddlChangeSchema })
      .parse(req.body);
    const driver = await ctx.manager.getDriver(id, body.database);
    return driver.buildDdl(body.change);
  });

  app.post('/api/connections/:id/ddl/apply', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .object({
        database: z.string().optional(),
        statements: z.array(z.string().min(1)).min(1),
      })
      .parse(req.body);
    const config = ctx.manager.getConfig(id);
    if (config?.isReadOnly) {
      throw Object.assign(new Error('Connection is marked read-only'), {
        statusCode: 403,
      });
    }
    const driver = await ctx.manager.getDriver(id, body.database);
    await driver.applyDdl(body.statements);
    return { ok: true };
  });

  // Refresh rebuilds a materialized view's stored data — a write, so it is
  // blocked on read-only connections just like DDL.
  app.post('/api/connections/:id/matview/refresh', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .object({
        database: z.string().optional(),
        schema: z.string().optional(),
        name: z.string().min(1),
      })
      .parse(req.body);
    const config = ctx.manager.getConfig(id);
    if (config?.isReadOnly) {
      throw Object.assign(new Error('Connection is marked read-only'), {
        statusCode: 403,
      });
    }
    const driver = await ctx.manager.getDriver(id, body.database);
    if (!driver.refreshMaterializedView) {
      throw Object.assign(
        new Error('Materialized views are not supported by this engine'),
        { statusCode: 400 },
      );
    }
    return driver.refreshMaterializedView({
      name: body.name,
      schema: body.schema,
    });
  });
}
