import { describe, expect, it } from 'vitest';
import type { Driver } from '../src/drivers/types.js';
import { buildSchemaDigest } from '../src/ai/schemaContext.js';

function mockDriver(): Driver {
  return {
    listTables: async () => [
      { name: 'customers', schema: 'public', kind: 'table' as const },
    ],
    getTableStructure: async (ref: { name: string; schema?: string }) => ({
      table: {
        name: ref.name,
        schema: ref.schema,
        kind: 'table' as const,
        comment: 'Clients de la démo',
      },
      columns: [
        {
          name: 'id',
          dataType: 'integer',
          nullable: false,
          defaultValue: null,
          isPrimaryKey: true,
          isAutoIncrement: true,
          comment: null,
          ordinal: 0,
        },
        {
          name: 'country',
          dataType: 'text',
          nullable: true,
          defaultValue: null,
          isPrimaryKey: false,
          isAutoIncrement: false,
          comment: 'Code pays ISO-2',
          ordinal: 1,
        },
      ],
      primaryKey: ['id'],
      indexes: [],
      foreignKeys: [],
    }),
  } as unknown as Driver;
}

describe('buildSchemaDigest', () => {
  it('includes table and column comments so the model gets the business meaning', async () => {
    const digest = await buildSchemaDigest(mockDriver());
    expect(digest).toContain('public.customers');
    expect(digest).toContain('country text ("Code pays ISO-2")');
    expect(digest).toContain('— Clients de la démo');
  });
});
