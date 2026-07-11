import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ErdRelation, ErdSchema, ErdTable } from '@fluentdb/shared';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });
const scope = z.object({
  database: z.string().optional(),
  schema: z.string().optional(),
});

/** Cap the number of tables introspected for one diagram (N queries each). */
const MAX_TABLES = 200;

export function registerErdRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/connections/:id/erd', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database, schema } = scope.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);

    // Tables plus views and materialized views — the latter become lineage
    // nodes linked to the relations they read from.
    const all = await driver.listTables(schema);
    const truncated = Math.max(0, all.length - MAX_TABLES);
    if (truncated > 0) {
      app.log.warn(
        `ERD: ${all.length} tables, limiting to ${MAX_TABLES} (${truncated} omitted)`,
      );
    }
    const tables = all.slice(0, MAX_TABLES);

    const erdTables: ErdTable[] = [];
    const relations: ErdRelation[] = [];

    for (const t of tables) {
      const structure = await driver.getTableStructure({
        name: t.name,
        schema: t.schema,
      });
      const fkColumns = new Set(
        structure.foreignKeys.flatMap((fk) => fk.columns),
      );
      erdTables.push({
        name: t.name,
        schema: t.schema,
        kind: t.kind,
        columns: structure.columns.map((c) => ({
          name: c.name,
          dataType: c.dataType,
          isPrimaryKey: c.isPrimaryKey,
          isForeignKey: fkColumns.has(c.name),
          nullable: c.nullable,
        })),
      });
      for (const fk of structure.foreignKeys) {
        relations.push({
          name: fk.name,
          kind: 'fk',
          from: { table: t.name, schema: t.schema, columns: fk.columns },
          to: {
            table: fk.referencedTable,
            schema: fk.referencedSchema,
            columns: fk.referencedColumns,
          },
        });
      }
    }

    // Lineage edges: view/matview -> the relations it reads from. Only kept
    // when both endpoints are part of the diagram.
    if (driver.listViewDependencies) {
      const rendered = new Set(
        erdTables.map((t) => `${t.schema ?? ''}.${t.name}`),
      );
      const deps = await driver.listViewDependencies(schema);
      for (const d of deps) {
        const depKey = `${d.dependent.schema ?? ''}.${d.dependent.name}`;
        const srcKey = `${d.source.schema ?? ''}.${d.source.name}`;
        if (!rendered.has(depKey) || !rendered.has(srcKey)) continue;
        relations.push({
          name: `lineage:${depKey}->${srcKey}`,
          kind: 'lineage',
          from: {
            table: d.dependent.name,
            schema: d.dependent.schema,
            columns: [],
          },
          to: { table: d.source.name, schema: d.source.schema, columns: [] },
        });
      }
    }

    const result: ErdSchema = { tables: erdTables, relations };
    if (truncated > 0) result.truncated = truncated;
    return result;
  });
}
