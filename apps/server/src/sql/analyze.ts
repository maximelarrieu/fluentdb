import { splitSqlStatements } from '../drivers/sqlSplit.js';

export type StatementKind = 'read' | 'write' | 'ddl' | 'other';

export interface StatementAnalysis {
  sql: string;
  kind: StatementKind;
  operation: string;
  hasWhere: boolean;
  warnings: string[];
}

const WRITE_OPS = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'REPLACE',
  'MERGE',
  'UPSERT',
]);
const DDL_OPS = new Set([
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'RENAME',
  'GRANT',
  'REVOKE',
  'COMMENT',
]);
const READ_OPS = new Set([
  'SELECT',
  'WITH',
  'SHOW',
  'EXPLAIN',
  'DESCRIBE',
  'DESC',
  'PRAGMA',
  'TABLE',
  'VALUES',
]);

/** Strip leading comments/whitespace and return the first keyword, upper-cased. */
function leadingKeyword(sql: string): string {
  let s = sql.trimStart();
  // remove leading line/block comments
  for (;;) {
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      s = nl === -1 ? '' : s.slice(nl + 1).trimStart();
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      s = end === -1 ? '' : s.slice(end + 2).trimStart();
    } else {
      break;
    }
  }
  const m = /^[a-zA-Z]+/.exec(s);
  return m ? m[0].toUpperCase() : '';
}

/**
 * Detects a WHERE clause outside of string/identifier literals. Good enough
 * for guardrails (flagging UPDATE/DELETE without WHERE); not a full parser.
 */
function hasWhereClause(sql: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  const upper = sql.toUpperCase();
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '`') inBacktick = true;
    else if (
      upper.startsWith('WHERE', i) &&
      isBoundary(sql[i - 1]) &&
      isBoundary(sql[i + 5])
    ) {
      return true;
    }
  }
  return false;
}

function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[a-zA-Z0-9_]/.test(ch);
}

export function classifyStatement(sql: string): StatementAnalysis {
  const operation = leadingKeyword(sql);
  let kind: StatementKind = 'other';
  if (WRITE_OPS.has(operation)) kind = 'write';
  else if (DDL_OPS.has(operation)) kind = 'ddl';
  else if (READ_OPS.has(operation)) kind = 'read';

  const hasWhere = hasWhereClause(sql);
  const warnings: string[] = [];

  if ((operation === 'UPDATE' || operation === 'DELETE') && !hasWhere) {
    warnings.push(
      `${operation} sans clause WHERE — toutes les lignes de la table seront affectées`,
    );
  }
  if (operation === 'DROP' || operation === 'TRUNCATE') {
    warnings.push('Opération destructive et irréversible');
  }

  return { sql, kind, operation, hasWhere, warnings };
}

/** Analyze a (possibly multi-statement) SQL script. */
export function analyzeScript(script: string): StatementAnalysis[] {
  return splitSqlStatements(script).map(classifyStatement);
}

/** True if the script contains any statement that writes or changes structure. */
export function scriptHasWriteOrDdl(script: string): boolean {
  return analyzeScript(script).some(
    (s) => s.kind === 'write' || s.kind === 'ddl',
  );
}
