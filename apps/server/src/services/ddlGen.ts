import type { TableStructure } from '@fluentdb/shared';

/**
 * Synthesize a readable `CREATE TABLE` script from an introspected structure,
 * for engines without a native "show create" (PostgreSQL). Columns keep their
 * reported type/null/default; the primary key is inlined; foreign keys and
 * secondary indexes are emitted as separate statements so the output is easy
 * to read and to lift into a migration.
 */
export function synthesizeCreateTable(
  s: TableStructure,
  q: (id: string) => string,
): string {
  const name = s.table.schema
    ? `${q(s.table.schema)}.${q(s.table.name)}`
    : q(s.table.name);

  const defs = s.columns.map((c) => {
    let d = `${q(c.name)} ${c.dataType}`;
    if (!c.nullable) d += ' NOT NULL';
    if (c.defaultValue != null && c.defaultValue !== '') {
      d += ` DEFAULT ${c.defaultValue}`;
    }
    return d;
  });
  if (s.primaryKey.length > 0) {
    defs.push(`PRIMARY KEY (${s.primaryKey.map(q).join(', ')})`);
  }

  const out = [
    `CREATE TABLE ${name} (\n${defs.map((d) => `  ${d}`).join(',\n')}\n);`,
  ];

  for (const fk of s.foreignKeys) {
    const ref = fk.referencedSchema
      ? `${q(fk.referencedSchema)}.${q(fk.referencedTable)}`
      : q(fk.referencedTable);
    out.push(
      `ALTER TABLE ${name} ADD CONSTRAINT ${q(fk.name)} ` +
        `FOREIGN KEY (${fk.columns.map(q).join(', ')}) ` +
        `REFERENCES ${ref} (${fk.referencedColumns.map(q).join(', ')});`,
    );
  }

  for (const ix of s.indexes) {
    if (ix.primary) continue;
    out.push(
      `CREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX ${q(ix.name)} ` +
        `ON ${name} (${ix.columns.map(q).join(', ')});`,
    );
  }

  return out.join('\n\n');
}
