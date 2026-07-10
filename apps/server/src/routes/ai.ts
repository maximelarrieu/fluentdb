import type { FastifyInstance } from 'fastify';
import { aiChatRequestSchema, type AiStreamEvent } from '@fluentdb/shared';
import { buildSystemPrompt } from '../ai/prompts.js';
import { buildSchemaDigest } from '../ai/schemaContext.js';
import { extractSqlBlocks } from '../ai/types.js';
import type { AppContext } from '../context.js';

function sse(event: AiStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function registerAiRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/ai/status', async () => ({
    configured: ctx.ai !== null,
    provider: ctx.ai?.id ?? null,
    model: ctx.ai?.model ?? null,
  }));

  app.post('/api/ai/chat', async (req, reply) => {
    const body = aiChatRequestSchema.parse(req.body);
    if (!ctx.ai) {
      return reply.code(503).send({
        error:
          'No AI provider configured — set GEMINI_API_KEY and restart the server',
      });
    }

    // Schema context: structure only (never row data), from the live driver.
    let schemaDigest: string | null = null;
    let dialectInfo: string | null = null;
    if (body.connectionId && ctx.manager.isConnected(body.connectionId)) {
      try {
        const driver = await ctx.manager.getDriver(
          body.connectionId,
          body.database,
        );
        dialectInfo = `${driver.dialect.name} (${await driver.serverVersion()})`;
        schemaDigest = await buildSchemaDigest(
          driver,
          body.context?.selectedTables ?? [],
        );
      } catch {
        // schema context is best-effort; the chat still works without it
      }
    }

    const system = buildSystemPrompt(body, schemaDigest, dialectInfo);

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    let fullText = '';
    try {
      for await (const chunk of ctx.ai.chatStream({
        system,
        messages: body.messages,
      })) {
        fullText += chunk.delta;
        reply.raw.write(sse({ type: 'text', delta: chunk.delta }));
      }
      for (const sql of extractSqlBlocks(fullText)) {
        reply.raw.write(sse({ type: 'sql_suggestion', sql }));
      }
      reply.raw.write(sse({ type: 'done' }));
    } catch (err) {
      reply.raw.write(sse({ type: 'error', message: (err as Error).message }));
    } finally {
      reply.raw.end();
    }
  });
}
