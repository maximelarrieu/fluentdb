import type { FastifyInstance } from 'fastify';
import {
  aiChatRequestSchema,
  type AiChatRequest,
  type AiStreamEvent,
} from '@fluentdb/shared';
import { buildSystemPrompt } from '../ai/prompts.js';
import { buildSchemaDigest } from '../ai/schemaContext.js';
import { extractSqlBlocks } from '../ai/types.js';
import type { Driver } from '../drivers/types.js';
import type { AppContext } from '../context.js';

function sse(event: AiStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

type ExplainTarget = NonNullable<NonNullable<AiChatRequest['context']>['object']>;

/**
 * Compact, structure-only description of one object for the explain_object
 * mode: columns + foreign keys, plus the definition and lineage sources for
 * views / materialized views. Never includes row data.
 */
async function buildObjectDetail(
  driver: Driver,
  target: ExplainTarget,
): Promise<string> {
  const ref = { name: target.name, schema: target.schema };
  const qualified = target.schema ? `${target.schema}.${target.name}` : target.name;
  const kindLabel =
    target.kind === 'matview' ? 'materialized view' : target.kind;
  const parts: string[] = [`${kindLabel} "${qualified}"`];

  try {
    const s = await driver.getTableStructure(ref);
    parts.push(
      'Columns: ' +
        s.columns
          .map(
            (c) =>
              `${c.name} ${c.dataType}${c.isPrimaryKey ? ' PK' : ''}${
                !c.nullable && !c.isPrimaryKey ? ' NOT NULL' : ''
              }`,
          )
          .join(', '),
    );
    if (s.foreignKeys.length) {
      parts.push(
        'Foreign keys: ' +
          s.foreignKeys
            .map(
              (fk) =>
                `${fk.columns.join(',')} -> ${fk.referencedTable}(${fk.referencedColumns.join(',')})`,
            )
            .join('; '),
      );
    }
  } catch {
    // structure is best-effort
  }

  if (target.kind !== 'table' && driver.getViewDefinition) {
    const def = await driver.getViewDefinition(ref).catch(() => null);
    if (def) parts.push(`Definition:\n${def}`);
  }
  if (target.kind !== 'table' && driver.listViewDependencies) {
    const deps = await driver.listViewDependencies(target.schema).catch(() => []);
    const sources = [
      ...new Set(
        deps
          .filter((d) => d.dependent.name === target.name)
          .map((d) => d.source.name),
      ),
    ];
    if (sources.length) parts.push(`Reads from: ${sources.join(', ')}`);
  }

  return parts.join('\n');
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
    let objectDetail: string | null = null;
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
        const target = body.context?.object;
        if (body.mode === 'explain_object' && target) {
          objectDetail = await buildObjectDetail(driver, target);
        }
      } catch {
        // schema context is best-effort; the chat still works without it
      }
    }

    const system = buildSystemPrompt(body, schemaDigest, dialectInfo, objectDetail);

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
