import type { FastifyInstance } from 'fastify';
import { detectDatabaseContainers } from '../docker/detect.js';
import type { AppContext } from '../context.js';

export function registerDockerRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/docker/status', async () => {
    const available = await ctx.docker.ping();
    return {
      available,
      detail: available ? undefined : 'Docker socket not reachable',
    };
  });

  app.get('/api/docker/databases', async (_req, reply) => {
    if (!(await ctx.docker.ping())) {
      return reply
        .code(503)
        .send({ error: 'Docker is not available on this machine' });
    }
    return detectDatabaseContainers(ctx.docker);
  });
}
