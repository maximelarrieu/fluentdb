import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  aiChatRequestSchema,
  monitorRequestSchema,
  monitorProposalSchema,
  mockGenerateRequestSchema,
  type AiChatRequest,
  type AiStreamEvent,
  type MockRowsPreview,
} from '@fluentdb/shared';
import {
  buildSystemPrompt,
  buildMonitorPrompt,
  buildMockPrompt,
  buildContextExtractionPrompt,
} from '../ai/prompts.js';
import { buildSchemaDigest } from '../ai/schemaContext.js';
import { extractSqlBlocks, extractJson, collectStream } from '../ai/types.js';
import { analyzeScript } from '../sql/analyze.js';
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

  /** Per-(connection, database) business context fed to the assistant. */
  app.get('/api/connections/:id/ai-context', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { database } = z
      .object({ database: z.string().optional() })
      .parse(req.query);
    return { content: ctx.aiContext.get(id, database) };
  });

  app.put('/api/connections/:id/ai-context', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { database, content } = z
      .object({
        database: z.string().optional(),
        content: z.string().max(200_000),
      })
      .parse(req.body ?? {});
    ctx.aiContext.set(id, database ?? null, content);
    return { ok: true, content: content.trim() };
  });

  /**
   * A ready-to-paste prompt (real schema + instructions) the user gives to
   * their own coding agent to generate the business-context document.
   */
  app.get('/api/connections/:id/ai-context/prompt', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { database } = z
      .object({ database: z.string().optional() })
      .parse(req.query);
    if (!ctx.manager.isConnected(id)) {
      return reply
        .code(409)
        .send({ error: 'Connect to the database first to read its schema.' });
    }
    const driver = await ctx.manager.getDriver(id, database);
    const [digest, version] = await Promise.all([
      buildSchemaDigest(driver, []),
      driver.serverVersion().catch(() => ''),
    ]);
    const dialectName = version
      ? `${driver.dialect.name} (${version})`
      : driver.dialect.name;
    const scope = database ?? ctx.manager.getConfig(id)?.name ?? 'base';
    return {
      prompt: buildContextExtractionPrompt(digest, dialectName, scope),
    };
  });

  app.post('/api/ai/monitor', async (req, reply) => {
    const body = monitorRequestSchema.parse(req.body);
    if (!ctx.ai) {
      return reply.code(503).send({
        error:
          'No AI provider configured — set GEMINI_API_KEY and restart the server',
      });
    }

    let schemaDigest: string | null = null;
    let dialectInfo: string | null = null;
    if (ctx.manager.isConnected(body.connectionId)) {
      try {
        const driver = await ctx.manager.getDriver(
          body.connectionId,
          body.database,
        );
        dialectInfo = `${driver.dialect.name} (${await driver.serverVersion()})`;
        schemaDigest = await buildSchemaDigest(driver, []);
      } catch {
        // schema context is best-effort
      }
    }

    const text = await collectStream(
      ctx.ai.chatStream({
        system: buildMonitorPrompt(schemaDigest, dialectInfo),
        messages: [{ role: 'user', content: body.description }],
      }),
    );

    const parsed = monitorProposalSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      return reply.code(422).send({
        error:
          "L'assistant n'a pas pu produire une proposition exploitable. Reformule la demande.",
      });
    }
    // Guardrail: the proposed query must be read-only, like any scheduled task.
    const offending = analyzeScript(parsed.data.sql).find((s) => s.kind !== 'read');
    if (offending) {
      return reply.code(422).send({
        error: `La requête proposée n'est pas en lecture seule (${offending.operation}). Reformule la demande.`,
      });
    }
    return parsed.data;
  });

  app.post('/api/ai/mock', async (req, reply) => {
    const body = mockGenerateRequestSchema.parse(req.body);
    if (!ctx.ai) {
      return reply.code(503).send({
        error:
          'No AI provider configured — set GEMINI_API_KEY and restart the server',
      });
    }
    const driver = await ctx.manager.getDriver(body.connectionId, body.database);
    const structure = await driver.getTableStructure({
      name: body.table,
      schema: body.schema,
    });

    // Columns the DB fills itself (auto-increment keys) are excluded.
    const fillable = structure.columns.filter((c) => !c.isAutoIncrement);
    if (fillable.length === 0) {
      return reply
        .code(422)
        .send({ error: 'Aucune colonne à générer pour cette table.' });
    }
    const fkByColumn = new Map<string, { table: string; column: string }>();
    for (const fk of structure.foreignKeys) {
      fk.columns.forEach((col, i) => {
        const refCol = fk.referencedColumns[i] ?? fk.referencedColumns[0]!;
        fkByColumn.set(col, { table: fk.referencedTable, column: refCol });
      });
    }

    const q = driver.dialect.quoteIdent;
    const columnLines = await Promise.all(
      fillable.map(async (c) => {
        let line = `- ${c.name} (${c.dataType})${c.nullable ? '' : ' NOT NULL'}`;
        const fk = fkByColumn.get(c.name);
        if (fk) {
          let allowed: string[] = [];
          try {
            const sets = await driver.runQuery(
              `SELECT DISTINCT ${q(fk.column)} AS v FROM ${q(fk.table)} LIMIT 20`,
              { queryId: `mock-fk-${body.connectionId}-${c.name}`, maxRows: 20 },
            );
            allowed = (sets.find((s) => s.rows.length > 0)?.rows ?? [])
              .map((r) => r[0])
              .filter((v) => v != null)
              .map((v) => String(v));
          } catch {
            // best-effort — leave allowed empty (model will use null)
          }
          line += ` FK -> ${fk.table}(${fk.column}); allowed: ${
            allowed.length ? allowed.join(', ') : '(none — use null)'
          }`;
        }
        return line;
      }),
    );

    const dialectInfo = `${driver.dialect.name} (${await driver.serverVersion()})`;
    const text = await collectStream(
      ctx.ai.chatStream({
        system: buildMockPrompt(body.table, columnLines, body.count, dialectInfo),
        messages: [{ role: 'user', content: `Génère ${body.count} lignes.` }],
      }),
    );

    const parsed = extractJson(text);
    if (!Array.isArray(parsed)) {
      return reply.code(422).send({
        error: "L'assistant n'a pas pu générer de données exploitables.",
      });
    }

    // Whitelist to fillable columns only; keep primitive cell values.
    const allowedCols = new Set(fillable.map((c) => c.name));
    const rows: MockRowsPreview['rows'] = [];
    for (const raw of parsed.slice(0, body.count)) {
      if (typeof raw !== 'object' || raw === null) continue;
      const row: MockRowsPreview['rows'][number] = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!allowedCols.has(k)) continue;
        if (
          v === null ||
          typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean'
        ) {
          row[k] = v;
        } else {
          row[k] = JSON.stringify(v);
        }
      }
      rows.push(row);
    }
    const preview: MockRowsPreview = {
      columns: fillable.map((c) => c.name),
      rows,
    };
    return preview;
  });

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

    const userContext = body.connectionId
      ? ctx.aiContext.get(body.connectionId, body.database)
      : '';

    const system = buildSystemPrompt(
      body,
      schemaDigest,
      dialectInfo,
      objectDetail,
      userContext,
    );

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
