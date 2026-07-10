import { describe, expect, it } from 'vitest';
import type { DdlChange, RowQuery } from '@fluentdb/shared';
import { buildPostgresDdl } from '../src/drivers/postgres/ddl.js';
import { buildMysqlDdl } from '../src/drivers/mysql/ddl.js';
import { buildSqliteDdl } from '../src/drivers/sqlite/ddl.js';
import { postgresDialect } from '../src/drivers/postgres/dialect.js';
import { mysqlDialect } from '../src/drivers/mysql/dialect.js';
import { sqliteDialect } from '../src/drivers/sqlite/dialect.js';
import { buildMutations, buildSelectPage } from '../src/drivers/sqlBuilder.js';
import { splitSqlStatements } from '../src/drivers/sqlSplit.js';

const createTable: DdlChange = {
  kind: 'createTable',
  table: 'users',
  columns: [
    {
      name: 'id',
      dataType: 'INTEGER',
      nullable: false,
      defaultValue: null,
      isPrimaryKey: true,
      isAutoIncrement: true,
    },
    {
      name: 'email',
      dataType: 'TEXT',
      nullable: false,
      defaultValue: null,
      isPrimaryKey: false,
      isAutoIncrement: false,
    },
  ],
};

describe('DDL builders per dialect', () => {
  it('sqlite createTable uses inline INTEGER PRIMARY KEY AUTOINCREMENT', () => {
    const { statements } = buildSqliteDdl(createTable);
    expect(statements[0]).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(statements[0]).toContain('"email" TEXT NOT NULL');
  });

  it('postgres createTable uses identity + PK constraint', () => {
    const { statements } = buildPostgresDdl(createTable);
    expect(statements[0]).toContain('GENERATED ALWAYS AS IDENTITY');
    expect(statements[0]).toContain('PRIMARY KEY ("id")');
  });

  it('mysql createTable uses AUTO_INCREMENT + PK constraint', () => {
    const { statements } = buildMysqlDdl(createTable);
    expect(statements[0]).toContain('`id` INTEGER NOT NULL AUTO_INCREMENT');
    expect(statements[0]).toContain('PRIMARY KEY (`id`)');
  });

  it('postgres alterColumn emits one statement per delta', () => {
    const { statements } = buildPostgresDdl({
      kind: 'alterColumn',
      table: 'users',
      schema: 'public',
      column: 'email',
      dataType: 'varchar(500)',
      nullable: true,
      defaultValue: null,
      newName: 'email_address',
    });
    expect(statements).toEqual([
      'ALTER TABLE "public"."users" ALTER COLUMN "email" TYPE varchar(500) USING "email"::varchar(500)',
      'ALTER TABLE "public"."users" ALTER COLUMN "email" DROP NOT NULL',
      'ALTER TABLE "public"."users" ALTER COLUMN "email" DROP DEFAULT',
      'ALTER TABLE "public"."users" RENAME COLUMN "email" TO "email_address"',
    ]);
  });

  it('sqlite refuses type changes but allows renames', () => {
    expect(() =>
      buildSqliteDdl({
        kind: 'alterColumn',
        table: 'users',
        column: 'email',
        dataType: 'BLOB',
      }),
    ).toThrow(/renaming/i);
    const { statements } = buildSqliteDdl({
      kind: 'alterColumn',
      table: 'users',
      column: 'email',
      newName: 'mail',
    });
    expect(statements[0]).toBe(
      'ALTER TABLE "users" RENAME COLUMN "email" TO "mail"',
    );
  });

  it('quotes embedded quotes in identifiers', () => {
    const { statements } = buildSqliteDdl({
      kind: 'dropTable',
      table: 'weird"name',
    });
    expect(statements[0]).toBe('DROP TABLE "weird""name"');
  });
});

describe('sqlBuilder', () => {
  const known = new Set(['id', 'name', 'year']);
  const q: RowQuery = {
    page: 2,
    pageSize: 50,
    sorts: [{ column: 'year', dir: 'desc' }],
    filters: [{ column: 'name', op: 'contains', value: '50%_off' }],
  };

  it('builds a postgres page query with $n placeholders', () => {
    const built = buildSelectPage(
      postgresDialect,
      { name: 'albums', schema: 'public' },
      q,
      known,
    );
    expect(built.sql).toBe(
      'SELECT * FROM "public"."albums" WHERE "name" LIKE $1 ESCAPE \'!\' ORDER BY "year" DESC LIMIT $2 OFFSET $3',
    );
    expect(built.params).toEqual(['%50!%!_off%', 50, 100]);
  });

  it('builds a mysql page query with ? placeholders and backticks', () => {
    const built = buildSelectPage(mysqlDialect, { name: 'albums' }, q, known);
    expect(built.sql).toBe(
      "SELECT * FROM `albums` WHERE `name` LIKE ? ESCAPE '!' ORDER BY `year` DESC LIMIT ? OFFSET ?",
    );
  });

  it('requires the full primary key for updates', () => {
    expect(() =>
      buildMutations(
        sqliteDialect,
        { name: 'albums' },
        {
          inserts: [],
          updates: [{ key: { name: 'x' }, changes: { year: 2000 } }],
          deletes: [],
        },
        known,
        ['id'],
      ),
    ).toThrow(/primary-key/);
  });

  it('builds parameterized mutations', () => {
    const stmts = buildMutations(
      postgresDialect,
      { name: 'albums' },
      {
        inserts: [{ name: 'A', year: 2020 }],
        updates: [{ key: { id: 5 }, changes: { name: 'B' } }],
        deletes: [{ key: { id: 9 } }],
      },
      known,
      ['id'],
    );
    expect(stmts.inserts[0]).toEqual({
      sql: 'INSERT INTO "albums" ("name", "year") VALUES ($1, $2)',
      params: ['A', 2020],
    });
    expect(stmts.updates[0]).toEqual({
      sql: 'UPDATE "albums" SET "name" = $1 WHERE "id" = $2',
      params: ['B', 5],
    });
    expect(stmts.deletes[0]).toEqual({
      sql: 'DELETE FROM "albums" WHERE "id" = $1',
      params: [9],
    });
  });
});

describe('splitSqlStatements', () => {
  it('splits on semicolons outside strings and comments', () => {
    const parts = splitSqlStatements(
      `SELECT 'a;b'; -- comment; with semicolon\nSELECT 2; /* block; */ SELECT 3`,
    );
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(`SELECT 'a;b'`);
  });

  it('handles dollar-quoted bodies', () => {
    const parts = splitSqlStatements(
      `CREATE FUNCTION f() RETURNS int AS $$ SELECT 1; $$ LANGUAGE sql; SELECT 2`,
    );
    expect(parts).toHaveLength(2);
  });

  it('handles doubled quotes', () => {
    const parts = splitSqlStatements(`SELECT 'it''s; fine'; SELECT 2`);
    expect(parts).toHaveLength(2);
  });
});
