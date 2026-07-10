import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exportRequestSchema } from '@fluentdb/shared';
import { toCsv, toJson } from '../services/exporter.js';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });
const EXPORT_MAX_ROWS = 100_000;

export function registerExportRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.post('/api/connections/:id/export', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = exportRequestSchema.parse(req.body);
    const driver = await ctx.manager.getDriver(id, body.database);

    const resultSets = await driver.runQuery(body.sql, {
      queryId: `export-${Date.now()}`,
      maxRows: EXPORT_MAX_ROWS,
    });
    const first = resultSets.find((r) => r.columns.length > 0);
    if (!first) {
      return reply.code(400).send({ error: 'Query returned no result set' });
    }

    const fileName = (body.fileName ?? 'export').replace(/[^\w.-]/g, '_');
    if (body.format === 'csv') {
      reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="${fileName}.csv"`,
        );
      return toCsv(first);
    }
    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="${fileName}.json"`,
      );
    return toJson(first);
  });
}
