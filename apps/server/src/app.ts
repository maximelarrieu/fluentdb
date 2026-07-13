import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ensureDataDir } from './config.js';
import { SecretBox } from './security/secrets.js';
import { registerHostGuard } from './security/hostGuard.js';
import { ConnectionsStore } from './store/connectionsStore.js';
import { HistoryStore } from './store/historyStore.js';
import { AiContextStore } from './store/aiContextStore.js';
import { DashboardStore } from './store/dashboardStore.js';
import { ConnectionManager } from './services/connectionManager.js';
import { QueryRunner } from './services/queryRunner.js';
import { TasksStore } from './store/tasksStore.js';
import { Scheduler } from './services/scheduler.js';
import { DockerClient } from './docker/dockerClient.js';
import { geminiFromEnv } from './ai/providers/gemini.js';
import type { AiProvider } from './ai/types.js';
import type { AppContext } from './context.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerSchemaRoutes } from './routes/schema.js';
import { registerDataRoutes } from './routes/data.js';
import { registerQueryRoutes } from './routes/query.js';
import { registerDdlRoutes } from './routes/ddl.js';
import { registerExportRoutes } from './routes/export.js';
import { registerDockerRoutes } from './routes/docker.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerErdRoutes } from './routes/erd.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerWidgetRoutes } from './routes/widgets.js';

export interface BuildAppOptions {
  dataDir: string;
  logger?: boolean;
  aiProvider?: AiProvider | null;
  dockerClient?: DockerClient;
}

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
}

export function buildApp(opts: BuildAppOptions): BuiltApp {
  ensureDataDir(opts.dataDir);

  const secrets = new SecretBox(opts.dataDir);
  const store = new ConnectionsStore(opts.dataDir, secrets);
  const history = new HistoryStore(opts.dataDir);
  const aiContext = new AiContextStore(opts.dataDir);
  const dashboards = new DashboardStore(opts.dataDir);
  const manager = new ConnectionManager(store);
  const runner = new QueryRunner(history);
  const tasks = new TasksStore(opts.dataDir);
  const docker = opts.dockerClient ?? new DockerClient();
  const ai = opts.aiProvider !== undefined ? opts.aiProvider : geminiFromEnv();

  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 10 * 1024 * 1024,
  });

  const scheduler = new Scheduler(tasks, manager, (m) =>
    app.log.warn(`[scheduler] ${m}`),
  );

  const ctx: AppContext = {
    store,
    history,
    tasks,
    aiContext,
    dashboards,
    manager,
    runner,
    scheduler,
    docker,
    ai,
  };

  registerHostGuard(app);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid request',
        detail: err.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      });
    }
    const statusCode =
      typeof (err as { statusCode?: number }).statusCode === 'number' &&
      (err as { statusCode: number }).statusCode >= 400
        ? (err as { statusCode: number }).statusCode
        : 500;
    return reply.code(statusCode).send({ error: (err as Error).message });
  });

  app.get('/api/health', async () => ({ ok: true, name: 'fluentdb' }));

  registerConnectionRoutes(app, ctx);
  registerSchemaRoutes(app, ctx);
  registerDataRoutes(app, ctx);
  registerQueryRoutes(app, ctx);
  registerDdlRoutes(app, ctx);
  registerExportRoutes(app, ctx);
  registerDockerRoutes(app, ctx);
  registerAiRoutes(app, ctx);
  registerErdRoutes(app, ctx);
  registerTaskRoutes(app, ctx);
  registerWidgetRoutes(app, ctx);

  app.addHook('onClose', async () => {
    scheduler.stop();
    await manager.disconnectAll();
    history.close();
    aiContext.close();
    dashboards.close();
    tasks.close();
  });

  return { app, ctx };
}
