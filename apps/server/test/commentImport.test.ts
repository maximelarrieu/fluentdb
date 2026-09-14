import { describe, expect, it } from 'vitest';
import type { Driver } from '../src/drivers/types.js';
import { buildCommentImport } from '../src/services/commentImport.js';

function pgMock(): Driver {
  return {
    engine: 'postgres',
    listTables: async () => [
      { name: 'users', schema: 'public', kind: 'table' as const },
      { name: 'aliments', schema: 'public', kind: 'table' as const },
    ],
    getTableStructure: async (ref: { name: string }) => ({
      table: { name: ref.name, schema: 'public', kind: 'table' as const },
      columns: (ref.name === 'users' ? ['ID', 'login'] : ['ID', 'Nom']).map(
        (n, i) => ({
          name: n,
          dataType: 'text',
          nullable: true,
          defaultValue: null,
          isPrimaryKey: false,
          isAutoIncrement: false,
          comment: null,
          ordinal: i,
        }),
      ),
      primaryKey: [],
      indexes: [],
      foreignKeys: [],
    }),
    commentStatement: (ref, kind, column, comment) => {
      const t = ref.schema ? `"${ref.schema}"."${ref.name}"` : `"${ref.name}"`;
      const lit = `'${comment.replace(/'/g, "''")}'`;
      return column
        ? `COMMENT ON COLUMN ${t}."${column}" IS ${lit}`
        : `COMMENT ON TABLE ${t} IS ${lit}`;
    },
  } as unknown as Driver;
}

const descriptions = {
  tables: [
    {
      name: 'users',
      description: 'Comptes utilisateurs',
      columns: [
        { name: 'ID', description: 'Identifiant' },
        { name: 'login', description: "Nom d'utilisateur" },
        { name: 'ghost', description: 'colonne absente' },
      ],
    },
    { name: 'aliments', description: 'Catalogue', columns: [{ name: 'Nom', description: 'Nom' }] },
    { name: 'inexistante', description: 'table absente' },
  ],
};

describe('buildCommentImport (postgres)', () => {
  it('matches by exact name and builds COMMENT ON statements', async () => {
    const plan = await buildCommentImport(pgMock(), descriptions, 'public');
    expect(plan.tableComments).toBe(2); // users, aliments
    expect(plan.columnComments).toBe(3); // users.ID, users.login, aliments.Nom
    expect(plan.missingTables).toEqual(['inexistante']);
    expect(plan.missingColumns).toEqual(['users.ghost']);
    expect(plan.unsupported).toBe(0);
    expect(plan.statements).toContain(
      'COMMENT ON TABLE "public"."users" IS \'Comptes utilisateurs\'',
    );
    expect(plan.statements).toContain(
      'COMMENT ON COLUMN "public"."aliments"."Nom" IS \'Nom\'',
    );
  });

  it('reports column comments as unsupported on MySQL', async () => {
    const mysql = { ...pgMock(), engine: 'mysql' } as unknown as Driver;
    (mysql as unknown as { commentStatement: Driver['commentStatement'] }).commentStatement =
      (ref, _kind, column, comment) =>
        column ? null : `ALTER TABLE \`${ref.name}\` COMMENT = '${comment}'`;
    const plan = await buildCommentImport(mysql, descriptions, undefined);
    expect(plan.tableComments).toBe(2);
    expect(plan.columnComments).toBe(0);
    expect(plan.unsupported).toBe(3);
    expect(plan.engineNote).toMatch(/MySQL/);
  });
});
