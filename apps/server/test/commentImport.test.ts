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
    commentStatement: (
      ref: { name: string; schema?: string },
      _kind: unknown,
      column: string | null,
      comment: string,
    ) => {
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

  it('builds MODIFY COLUMN statements for column comments on MySQL', async () => {
    const mysql = { ...pgMock(), engine: 'mysql' } as unknown as Driver;
    const m = mysql as unknown as {
      commentStatement: Driver['commentStatement'];
      columnCommentStatements: Driver['columnCommentStatements'];
    };
    // Table comments: standalone ALTER (column=null).
    m.commentStatement = (ref, _kind, column, comment) =>
      column ? null : `ALTER TABLE \`${ref.name}\` COMMENT = '${comment}'`;
    // Column comments: batched, using a live definition (mocked here).
    m.columnCommentStatements = async (ref, comments) => ({
      statements: comments.map(
        (c) =>
          `ALTER TABLE \`${ref.name}\` MODIFY COLUMN \`${c.column}\` int(11) NOT NULL COMMENT '${c.comment}'`,
      ),
      skipped: [],
    });
    const plan = await buildCommentImport(mysql, descriptions, undefined);
    expect(plan.tableComments).toBe(2); // users, aliments
    expect(plan.columnComments).toBe(3); // users.ID, users.login, aliments.Nom
    expect(plan.missingColumns).toEqual(['users.ghost']);
    expect(plan.unsupported).toBe(0);
    expect(plan.engineNote).toBeUndefined();
    expect(plan.statements).toContain(
      "ALTER TABLE `aliments` MODIFY COLUMN `Nom` int(11) NOT NULL COMMENT 'Nom'",
    );
  });

  it('counts generated columns skipped by MySQL as unsupported', async () => {
    const mysql = { ...pgMock(), engine: 'mysql' } as unknown as Driver;
    const m = mysql as unknown as {
      commentStatement: Driver['commentStatement'];
      columnCommentStatements: Driver['columnCommentStatements'];
    };
    m.commentStatement = (_ref, _kind, column) => (column ? null : 'ALTER TABLE t COMMENT = ...');
    // Simulate every requested column being a generated column (skipped).
    m.columnCommentStatements = async (_ref, comments) => ({
      statements: [],
      skipped: comments.map((c) => c.column),
    });
    const plan = await buildCommentImport(mysql, descriptions, undefined);
    expect(plan.columnComments).toBe(0);
    expect(plan.unsupported).toBe(3);
    expect(plan.engineNote).toMatch(/générée/);
  });
});
