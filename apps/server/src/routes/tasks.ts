import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  scheduledTaskInputSchema,
  taskAlertSchema,
  taskScheduleSchema,
} from '@fluentdb/shared';
import { analyzeScript } from '../sql/analyze.js';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });

function assertReadOnly(sql: string): void {
  const offending = analyzeScript(sql).find((s) => s.kind !== 'read');
  if (offending) {
    throw Object.assign(
      new Error(
        `Seules les requêtes de lecture peuvent être planifiées (${offending.operation} refusé).`,
      ),
      { statusCode: 400 },
    );
  }
}

export function registerTaskRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/tasks', async () => ctx.tasks.list());

  app.post('/api/tasks', async (req, reply) => {
    const body = scheduledTaskInputSchema.parse(req.body);
    assertReadOnly(body.sql);
    const config = ctx.manager.getConfig(body.connectionId);
    if (!config) {
      throw Object.assign(new Error('Unknown connection'), { statusCode: 404 });
    }
    const nextRunAt = body.enabled
      ? ctx.scheduler.computeNextRun(body.schedule, new Date())
      : null;
    const task = ctx.tasks.create(body, config.name, nextRunAt);
    return reply.code(201).send(task);
  });

  app.put('/api/tasks/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const patch = z
      .object({
        name: z.string().min(1).max(120).optional(),
        database: z.string().nullable().optional(),
        sql: z.string().min(1).optional(),
        schedule: taskScheduleSchema.optional(),
        enabled: z.boolean().optional(),
        alert: taskAlertSchema.nullable().optional(),
      })
      .parse(req.body);
    const cur = ctx.tasks.get(id);
    if (!cur) throw Object.assign(new Error('Not found'), { statusCode: 404 });
    if (patch.sql) assertReadOnly(patch.sql);

    const schedule = patch.schedule ?? cur.schedule;
    const enabled = patch.enabled ?? cur.enabled;
    // Recompute the next fire time when the timing or enabled state changes.
    const nextRunAt = !enabled
      ? null
      : patch.schedule || patch.enabled
        ? ctx.scheduler.computeNextRun(schedule, new Date())
        : cur.nextRunAt;
    return ctx.tasks.update(id, patch, nextRunAt);
  });

  app.delete('/api/tasks/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    ctx.tasks.delete(id);
    return { ok: true };
  });

  app.post('/api/tasks/:id/run', async (req) => {
    const { id } = idParams.parse(req.params);
    const task = ctx.tasks.get(id);
    if (!task) throw Object.assign(new Error('Not found'), { statusCode: 404 });
    return ctx.scheduler.runTask(task);
  });

  app.get('/api/tasks/:id/snapshots', async (req) => {
    const { id } = idParams.parse(req.params);
    return ctx.tasks.listSnapshots(id);
  });

  app.get('/api/tasks/:taskId/snapshots/:snapId', async (req) => {
    const { snapId } = z
      .object({ taskId: z.string(), snapId: z.coerce.number() })
      .parse(req.params);
    const snap = ctx.tasks.getSnapshot(snapId);
    if (!snap) throw Object.assign(new Error('Not found'), { statusCode: 404 });
    return snap;
  });
}
