import type { ErdSchema } from '@fluentdb/shared';

/** Quote a DBML identifier only when it isn't a plain word. */
function dbmlIdent(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name}"`;
}

function qualify(schema: string | undefined, table: string, column: string): string {
  const t = schema
    ? `${dbmlIdent(schema)}.${dbmlIdent(table)}`
    : dbmlIdent(table);
  return `${t}.${dbmlIdent(column)}`;
}

/**
 * Generate DBML (dbdiagram.io format) from an ERD schema. Pure function —
 * portable, shareable, re-importable into dbdiagram.io.
 */
export function toDbml(schema: ErdSchema): string {
  const blocks: string[] = [];

  // dbdiagram.io models physical tables and FKs — skip views/matviews and the
  // lineage edges, keeping the export valid and re-importable.
  const tables = schema.tables.filter(
    (t) => t.kind !== 'view' && t.kind !== 'matview',
  );
  const relations = schema.relations.filter((r) => r.kind !== 'lineage');

  for (const table of tables) {
    const name = table.schema
      ? `${dbmlIdent(table.schema)}.${dbmlIdent(table.name)}`
      : dbmlIdent(table.name);
    const lines = table.columns.map((c) => {
      const attrs: string[] = [];
      if (c.isPrimaryKey) attrs.push('pk');
      if (!c.nullable && !c.isPrimaryKey) attrs.push('not null');
      const suffix = attrs.length ? ` [${attrs.join(', ')}]` : '';
      return `  ${dbmlIdent(c.name)} ${c.dataType}${suffix}`;
    });
    blocks.push(`Table ${name} {\n${lines.join('\n')}\n}`);
  }

  for (const rel of relations) {
    // one Ref per column pair (handles composite foreign keys)
    for (let i = 0; i < rel.from.columns.length; i++) {
      const fromCol = rel.from.columns[i]!;
      const toCol = rel.to.columns[i] ?? rel.to.columns[0] ?? '';
      blocks.push(
        `Ref: ${qualify(rel.from.schema, rel.from.table, fromCol)} > ${qualify(
          rel.to.schema,
          rel.to.table,
          toCol,
        )}`,
      );
    }
  }

  return blocks.join('\n\n') + '\n';
}
