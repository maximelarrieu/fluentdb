import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  exportRequestSchema,
  type CellValue,
  type QueryColumn,
} from '@fluentdb/shared';
import { csvEscape } from '../services/exporter.js';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });

export function registerExportRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  /**
   * Stream a query's rows to a CSV/JSON download via a server-side cursor,
   * without buffering the whole result set in memory.
   */
  app.post('/api/connections/:id/export', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = exportRequestSchema.parse(req.body);
    const driver = await ctx.manager.getDriver(id, body.database);

    const fileName = (body.fileName ?? 'export').replace(/[^\w.-]/g, '_');
    const isCsv = body.format === 'csv';
    reply.raw.writeHead(200, {
      'content-type': isCsv
        ? 'text/csv; charset=utf-8'
        : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}.${isCsv ? 'csv' : 'json'}"`,
    });

    let columns: QueryColumn[] = [];
    let first = true;
    if (!isCsv) reply.raw.write('[');

    try {
      await driver.streamQuery(body.sql, {
        columns: (cols) => {
          columns = cols;
          if (isCsv) {
            reply.raw.write(
              cols.map((c) => csvEscape(c.name)).join(',') + '\r\n',
            );
          }
        },
        row: (values) => {
          if (isCsv) {
            reply.raw.write(values.map(csvEscape).join(',') + '\r\n');
          } else {
            const obj: Record<string, CellValue> = {};
            columns.forEach((c, i) => {
              obj[c.name] = values[i] ?? null;
            });
            reply.raw.write((first ? '\n' : ',\n') + JSON.stringify(obj));
            first = false;
          }
        },
      });
      if (!isCsv) reply.raw.write('\n]\n');
      reply.raw.end();
    } catch (err) {
      // Headers are already sent — surface the error inline, then close.
      reply.raw.write(
        isCsv ? `\r\n# ERREUR: ${(err as Error).message}\r\n` : `\n]\n`,
      );
      reply.raw.end();
    }
  });
}
