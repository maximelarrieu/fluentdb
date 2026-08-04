import { describe, expect, it } from 'vitest';
import type { TableStructure } from '@fluentdb/shared';
import { synthesizeCreateTable } from '../src/services/ddlGen.js';

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

const structure: TableStructure = {
  table: { name: 'orders', schema: 'public', kind: 'table' },
  columns: [
    {
      name: 'id',
      dataType: 'integer',
      nullable: false,
      defaultValue: "nextval('orders_id_seq'::regclass)",
      isPrimaryKey: true,
      isAutoIncrement: true,
      ordinal: 1,
    },
    {
      name: 'customer_id',
      dataType: 'integer',
      nullable: true,
      defaultValue: null,
      isPrimaryKey: false,
      isAutoIncrement: false,
      ordinal: 2,
    },
  ],
  primaryKey: ['id'],
  indexes: [
    { name: 'orders_pkey', columns: ['id'], unique: true, primary: true },
    { name: 'idx_orders_cust', columns: ['customer_id'], unique: false, primary: false },
  ],
  foreignKeys: [
    {
      name: 'orders_customer_id_fkey',
      columns: ['customer_id'],
      referencedTable: 'customers',
      referencedSchema: 'public',
      referencedColumns: ['id'],
    },
  ],
};

describe('synthesizeCreateTable', () => {
  const ddl = synthesizeCreateTable(structure, q);

  it('emits a qualified CREATE TABLE with column types, defaults and PK', () => {
    expect(ddl).toContain('CREATE TABLE "public"."orders" (');
    expect(ddl).toContain(
      `"id" integer NOT NULL DEFAULT nextval('orders_id_seq'::regclass)`,
    );
    expect(ddl).toContain('"customer_id" integer,');
    expect(ddl).toContain('PRIMARY KEY ("id")');
  });

  it('emits foreign keys as ALTER statements', () => {
    expect(ddl).toContain(
      'ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_customer_id_fkey" ' +
        'FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");',
    );
  });

  it('emits secondary indexes but skips the primary-key index', () => {
    expect(ddl).toContain(
      'CREATE INDEX "idx_orders_cust" ON "public"."orders" ("customer_id");',
    );
    expect(ddl).not.toContain('orders_pkey');
  });
});
