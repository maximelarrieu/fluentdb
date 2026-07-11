import fastifyStatic from '@fastify/static';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { loadDotEnv } from './env.js';

// Load `.env` before anything reads process.env (config, AI provider, secrets).
const envFile = loadDotEnv();

const config = loadConfig();
const { app, ctx } = buildApp({ dataDir: config.dataDir, logger: true });

// In production the server serves the built web UI (same origin, no CORS).
if (config.webDistDir) {
  await app.register(fastifyStatic, {
    root: config.webDistDir,
    prefix: '/',
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
  const url = `http://127.0.0.1:${config.port}`;
  app.log.info(`FluentDB ready on ${url}`);
  if (envFile) {
    app.log.info(`Loaded environment from ${envFile}`);
  }
  // Start firing scheduled tasks (only in the real server, never in tests).
  ctx.scheduler.start();
  if (!config.webDistDir) {
    app.log.info(
      'Web UI not built — run `npm run dev:web` and open http://localhost:5173',
    );
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
