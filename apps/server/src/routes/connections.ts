import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  connectionInputSchema,
  PASSWORD_UNCHANGED,
  type ConnectionConfig,
  type ConnectionSummary,
} from '@fluentdb/shared';
import type { AppContext } from '../context.js';

function toSummary(
  config: ConnectionConfig,
  connected: boolean,
): ConnectionSummary {
  const { password, ...rest } = config;
  return { ...rest, hasPassword: Boolean(password), connected };
}

const idParams = z.object({ id: z.string() });

export function registerConnectionRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/connections', async () =>
    ctx.store.list().map((c) => toSummary(c, ctx.manager.isConnected(c.id))),
  );

  app.post('/api/connections', async (req, reply) => {
    const input = connectionInputSchema.parse(req.body);
    const created = ctx.store.create(input);
    reply.code(201);
    return toSummary(created, false);
  });

  app.put('/api/connections/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const input = connectionInputSchema.parse(req.body);
    const updated = ctx.store.update(id, input);
    if (!updated) return reply.code(404).send({ error: 'Connection not found' });
    return toSummary(updated, ctx.manager.isConnected(id));
  });

  app.delete('/api/connections/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await ctx.manager.disconnect(id);
    if (!ctx.store.delete(id)) {
      return reply.code(404).send({ error: 'Connection not found' });
    }
    ctx.aiContext.clear(id);
    ctx.dashboards.clear(id);
    return { ok: true };
  });

  /**
   * Test a config without saving it. When editing an existing connection
   * the client sends the PASSWORD_UNCHANGED sentinel + the id so the
   * stored secret is used.
   */
  app.post('/api/connections/test', async (req) => {
    const body = z
      .object({ id: z.string().optional() })
      .and(connectionInputSchema)
      .parse(req.body);
    let password = body.password;
    if (password === PASSWORD_UNCHANGED && body.id) {
      password = ctx.store.get(body.id)?.password;
    }
    const now = new Date().toISOString();
    const version = await ctx.manager.testConfig({
      ...body,
      password,
      id: body.id ?? 'test',
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, serverVersion: version };
  });

  app.post('/api/connections/:id/connect', async (req) => {
    const { id } = idParams.parse(req.params);
    const capabilities = await ctx.manager.connect(id);
    return { ok: true, capabilities };
  });

  app.post('/api/connections/:id/disconnect', async (req) => {
    const { id } = idParams.parse(req.params);
    await ctx.manager.disconnect(id);
    return { ok: true };
  });
}
