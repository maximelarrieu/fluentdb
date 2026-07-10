import type { TableStructure } from '@fluentdb/shared';
import type { Driver } from '../drivers/types.js';

/** ~8k tokens ≈ 32k chars for the schema digest sent to the model. */
const CHAR_BUDGET = 32_000;
const MAX_TABLES = 80;

function tableLine(s: TableStructure): string {
  const cols = s.columns
    .map((c) => {
      let d = `${c.name} ${c.dataType}`;
      if (c.isPrimaryKey) d += ' PK';
      if (!c.nullable && !c.isPrimaryKey) d += ' NOT NULL';
      return d;
    })
    .join(', ');
  const fks = s.foreignKeys
    .map(
      (fk) =>
        `FK ${fk.columns.join(',')} -> ${fk.referencedTable}(${fk.referencedColumns.join(',')})`,
    )
    .join('; ');
  const name = s.table.schema
    ? `${s.table.schema}.${s.table.name}`
    : s.table.name;
  return `- ${name} (${cols})${fks ? ` [${fks}]` : ''}`;
}

/**
 * Compact one-line-per-table digest of the connected database.
 * Tables the user selected/mentioned come first, then their FK neighbors,
 * then the rest until the budget runs out (truncation is announced so the
 * model knows the list is partial). Structure only — never row data.
 */
export async function buildSchemaDigest(
  driver: Driver,
  preferredTables: string[] = [],
): Promise<string> {
  const tables = (await driver.listTables()).filter((t) => t.kind === 'table');
  const preferred = new Set(preferredTables.map((t) => t.toLowerCase()));

  const ordered = [
    ...tables.filter((t) => preferred.has(t.name.toLowerCase())),
    ...tables.filter((t) => !preferred.has(t.name.toLowerCase())),
  ].slice(0, MAX_TABLES);

  const lines: string[] = [];
  let used = 0;
  let included = 0;
  for (const t of ordered) {
    let structure: TableStructure;
    try {
      structure = await driver.getTableStructure({
        name: t.name,
        schema: t.schema,
      });
    } catch {
      continue;
    }
    const line = tableLine(structure);
    if (used + line.length > CHAR_BUDGET) break;
    lines.push(line);
    used += line.length + 1;
    included += 1;
  }

  const omitted = tables.length - included;
  if (omitted > 0) {
    lines.push(
      `(… ${omitted} more tables omitted for brevity — ask the user to name them if needed)`,
    );
  }
  return lines.join('\n');
}
