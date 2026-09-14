import type { CommentImportResult, SchemaDescriptions } from '@fluentdb/shared';
import type { Driver } from '../drivers/types.js';

export type CommentImportPlan = Omit<CommentImportResult, 'applied'>;

/**
 * Match a JSON description document against the live schema and build the
 * comment statements for the objects that actually exist. Pure planning — never
 * executes; matching is by exact name (as introspected).
 */
export async function buildCommentImport(
  driver: Driver,
  descriptions: SchemaDescriptions,
  schema: string | undefined,
): Promise<CommentImportPlan> {
  const statements: string[] = [];
  let tableComments = 0;
  let columnComments = 0;
  let unsupported = 0;
  const missingTables: string[] = [];
  const missingColumns: string[] = [];

  const actual = await driver.listTables(schema);
  const byName = new Map(actual.map((t) => [t.name, t]));

  for (const td of descriptions.tables) {
    const match = byName.get(td.name);
    if (!match) {
      missingTables.push(td.name);
      continue;
    }
    const ref = { name: match.name, schema: match.schema };

    if (td.description?.trim()) {
      const stmt = driver.commentStatement?.(
        ref,
        match.kind,
        null,
        td.description.trim(),
      );
      if (stmt) {
        statements.push(stmt);
        tableComments += 1;
      } else {
        unsupported += 1;
      }
    }

    const cols = td.columns?.filter((c) => c.description?.trim());
    if (cols && cols.length > 0) {
      let colNames: Set<string>;
      try {
        const s = await driver.getTableStructure(ref);
        colNames = new Set(s.columns.map((c) => c.name));
      } catch {
        colNames = new Set();
      }
      const present: { column: string; comment: string }[] = [];
      for (const cd of cols) {
        if (!colNames.has(cd.name)) {
          missingColumns.push(`${td.name}.${cd.name}`);
          continue;
        }
        present.push({ column: cd.name, comment: cd.description!.trim() });
      }
      if (present.length === 0) {
        // nothing to do
      } else if (driver.columnCommentStatements) {
        // Engines that must redefine the column (MySQL) build the statements
        // in one batch from the live column definitions.
        const res = await driver.columnCommentStatements(ref, present);
        statements.push(...res.statements);
        columnComments += res.statements.length;
        unsupported += res.skipped.length;
      } else if (driver.commentStatement) {
        // Engines with a standalone column-comment statement (PostgreSQL).
        for (const p of present) {
          const stmt = driver.commentStatement(ref, match.kind, p.column, p.comment);
          if (stmt) {
            statements.push(stmt);
            columnComments += 1;
          } else {
            unsupported += 1;
          }
        }
      } else {
        unsupported += present.length;
      }
    }
  }

  let engineNote: string | undefined;
  if (unsupported > 0) {
    engineNote =
      driver.engine === 'mysql'
        ? `${unsupported} colonne(s) ignorée(s) : une colonne générée ne peut pas recevoir de commentaire sans être recalculée.`
        : driver.engine === 'sqlite'
          ? 'SQLite ne gère pas les commentaires : rien à importer.'
          : `${unsupported} commentaire(s) non pris en charge par ce moteur.`;
  }

  return {
    statements,
    tableComments,
    columnComments,
    missingTables,
    missingColumns,
    unsupported,
    engineNote,
  };
}
