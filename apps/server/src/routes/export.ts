import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  exportRequestSchema,
  tableExportRequestSchema,
  type QueryColumn,
} from '@fluentdb/shared';
import {
  createExportWriter,
  exportContentType,
  exportExtension,
} from '../services/exporter.js';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });
const tableParams = z.object({ id: z.string(), table: z.string() });

export function registerExportRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  /**
   * Stream a query's rows to a CSV / JSON / Markdown / SQL download via a
   * server-side cursor, without buffering the whole result set in memory.
   */
  app.post('/api/connections/:id/export', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = exportRequestSchema.parse(req.body);
    const driver = await ctx.manager.getDriver(id, body.database);

    const fileName = (body.fileName ?? 'export').replace(/[^\w.-]/g, '_');
    const ext = exportExtension[body.format];
    reply.raw.writeHead(200, {
      'content-type': exportContentType[body.format],
      'content-disposition': `attachment; filename="${fileName}.${ext}"`,
    });

    const writer = createExportWriter(
      body.format,
      (chunk) => reply.raw.write(chunk),
      { tableName: body.tableName ?? body.fileName },
    );

    try {
      await driver.streamQuery(body.sql, {
        columns: (cols) => writer.columns(cols),
        row: (values) => writer.row(values),
      });
      writer.end();
      reply.raw.end();
    } catch (err) {
      // Headers are already sent — surface the error inline, then close.
      reply.raw.write(`\n-- ERREUR: ${(err as Error).message}\n`);
      reply.raw.end();
    }
  });

  /**
   * Export a table's rows honoring the grid's current filters/sort. The SELECT
   * is rebuilt server-side (parameterized, injection-proof) by paging through
   * `selectRows`, so no raw SQL crosses the wire.
   */
  app.post('/api/connections/:id/tables/:table/export', async (req, reply) => {
    const { id, table } = tableParams.parse(req.params);
    const body = tableExportRequestSchema.parse(req.body);
    const driver = await ctx.manager.getDriver(id, body.database);
    const ref = { name: table, schema: body.schema };

    const fileName = (body.fileName ?? table).replace(/[^\w.-]/g, '_');
    const ext = exportExtension[body.format];
    reply.raw.writeHead(200, {
      'content-type': exportContentType[body.format],
      'content-disposition': `attachment; filename="${fileName}.${ext}"`,
    });

    const writer = createExportWriter(
      body.format,
      (chunk) => reply.raw.write(chunk),
      { tableName: table },
    );

    const PAGE = 1000;
    // Safety cap so a runaway export can't stream unbounded rows.
    const MAX_ROWS = 500_000;
    let page = 0;
    let sentColumns = false;
    let total = 0;
    try {
      for (;;) {
        const res = await driver.selectRows(ref, {
          page,
          pageSize: PAGE,
          sorts: body.sorts,
          filters: body.filters,
        });
        if (!sentColumns) {
          writer.columns(res.columns as QueryColumn[]);
          sentColumns = true;
        }
        for (const row of res.rows) {
          writer.row(row);
          total += 1;
        }
        if (res.rows.length < PAGE || total >= MAX_ROWS) break;
        page += 1;
      }
      writer.end();
      if (total >= MAX_ROWS && body.format !== 'json') {
        reply.raw.write(`\n-- export limité à ${MAX_ROWS} lignes\n`);
      }
      reply.raw.end();
    } catch (err) {
      reply.raw.write(`\n-- ERREUR: ${(err as Error).message}\n`);
      reply.raw.end();
    }
  });
}
