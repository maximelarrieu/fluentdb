import { z } from 'zod';

const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const rowValuesSchema = z.record(z.string(), cellValueSchema);

export const rowChangesSchema = z.object({
  inserts: z.array(rowValuesSchema).default([]),
  updates: z
    .array(
      z.object({
        /** Primary-key values identifying the row */
        key: rowValuesSchema,
        /** Column -> new value */
        changes: rowValuesSchema,
      }),
    )
    .default([]),
  deletes: z.array(z.object({ key: rowValuesSchema })).default([]),
});
export type RowChanges = z.infer<typeof rowChangesSchema>;

export interface MutationResult {
  inserted: number;
  updated: number;
  deleted: number;
}

const newColumnSchema = z.object({
  name: z.string().min(1),
  dataType: z.string().min(1),
  nullable: z.boolean().default(true),
  defaultValue: z.string().nullable().default(null),
  isPrimaryKey: z.boolean().default(false),
  isAutoIncrement: z.boolean().default(false),
});
export type NewColumn = z.infer<typeof newColumnSchema>;

export const ddlChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('createTable'),
    table: z.string().min(1),
    schema: z.string().optional(),
    columns: z.array(newColumnSchema).min(1),
  }),
  z.object({
    kind: z.literal('dropTable'),
    table: z.string().min(1),
    schema: z.string().optional(),
  }),
  z.object({
    kind: z.literal('renameTable'),
    table: z.string().min(1),
    schema: z.string().optional(),
    newName: z.string().min(1),
  }),
  z.object({
    kind: z.literal('addColumn'),
    table: z.string().min(1),
    schema: z.string().optional(),
    column: newColumnSchema,
  }),
  z.object({
    kind: z.literal('alterColumn'),
    table: z.string().min(1),
    schema: z.string().optional(),
    column: z.string().min(1),
    /** undefined = unchanged */
    newName: z.string().optional(),
    dataType: z.string().optional(),
    nullable: z.boolean().optional(),
    /** undefined = unchanged, null = drop default, string = new default expr */
    defaultValue: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('dropColumn'),
    table: z.string().min(1),
    schema: z.string().optional(),
    column: z.string().min(1),
  }),
  z.object({
    kind: z.literal('createIndex'),
    table: z.string().min(1),
    schema: z.string().optional(),
    name: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
    unique: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('dropIndex'),
    table: z.string().min(1),
    schema: z.string().optional(),
    name: z.string().min(1),
  }),
]);
export type DdlChange = z.infer<typeof ddlChangeSchema>;

export interface DdlPreview {
  statements: string[];
  warnings: string[];
}
