import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';

const idParams = z.object({ id: z.string() });
const tableParams = z.object({ id: z.string(), table: z.string() });
const scopeQuery = z.object({
  database: z.string().optional(),
  schema: z.string().optional(),
});

export function registerSchemaRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/connections/:id/databases', async (req) => {
    const { id } = idParams.parse(req.params);
    const driver = await ctx.manager.getDriver(id);
    return driver.listDatabases();
  });

  app.get('/api/connections/:id/schemas', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = scopeQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    return driver.listSchemas();
  });

  app.get('/api/connections/:id/tables', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database, schema } = scopeQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    return driver.listTables(schema);
  });

  app.get('/api/connections/:id/tables/:table/structure', async (req) => {
    const { id, table } = tableParams.parse(req.params);
    const { database, schema } = scopeQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    return driver.getTableStructure({ name: table, schema });
  });

  app.get('/api/connections/:id/tables/:table/definition', async (req) => {
    const { id, table } = tableParams.parse(req.params);
    const { database, schema } = scopeQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    const definition = driver.getViewDefinition
      ? await driver.getViewDefinition({ name: table, schema })
      : null;
    return { definition };
  });

  app.get('/api/connections/:id/search', async (req) => {
    const { id } = idParams.parse(req.params);
    const q = z
      .object({ q: z.string().min(1), database: z.string().optional() })
      .parse(req.query);
    const driver = await ctx.manager.getDriver(id, q.database);
    return driver.searchObjects(q.q);
  });

  app.get('/api/connections/:id/autocomplete', async (req) => {
    const { id } = idParams.parse(req.params);
    const { database } = scopeQuery.parse(req.query);
    const driver = await ctx.manager.getDriver(id, database);
    return {
      catalog: await driver.getAutocompleteCatalog(),
      dialect: driver.dialect.cmDialect,
      typeNames: driver.dialect.typeNames,
    };
  });
}
