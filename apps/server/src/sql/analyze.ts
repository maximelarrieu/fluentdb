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

/**
 * Index of the first top-level occurrence of `keyword` (upper-cased), i.e.
 * outside string/identifier literals AND at parenthesis depth 0. Returns -1
 * when absent. Used to find a statement's own WHERE/FROM/JOIN, ignoring any
 * inside subqueries or string constants.
 */
function topLevelKeywordIndex(sql: string, keyword: string): number {
  const upper = sql.toUpperCase();
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let depth = 0;
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
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (
      depth === 0 &&
      upper.startsWith(keyword, i) &&
      isBoundary(sql[i - 1]) &&
      isBoundary(sql[i + keyword.length])
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Derive a read-only `SELECT count(*)` that counts exactly the rows a simple
 * UPDATE/DELETE would touch — same target table and same WHERE. Returns null
 * for anything non-trivial (joins, multi-table UPDATE…FROM, USING, no clear
 * single target) so we never show a misleading count. The result is safe to
 * run: it only ever reads.
 */
export function affectedCountQuery(sql: string): string | null {
  const operation = leadingKeyword(sql);
  if (operation !== 'DELETE' && operation !== 'UPDATE') return null;

  // Multi-table forms can't be counted from a single target — bail.
  if (topLevelKeywordIndex(sql, 'JOIN') >= 0) return null;
  if (operation === 'DELETE' && topLevelKeywordIndex(sql, 'USING') >= 0) {
    return null;
  }
  if (operation === 'UPDATE' && topLevelKeywordIndex(sql, 'FROM') >= 0) {
    return null;
  }

  const target =
    operation === 'DELETE'
      ? /^\s*DELETE\s+FROM\s+("[^"]+"|`[^`]+`|[\w.]+)/i.exec(sql)?.[1]
      : /^\s*UPDATE\s+("[^"]+"|`[^`]+`|[\w.]+)\s+SET\s/i.exec(sql)?.[1];
  if (!target) return null;

  const whereIdx = topLevelKeywordIndex(sql, 'WHERE');
  let where = whereIdx >= 0 ? sql.slice(whereIdx).trim() : '';
  where = where.replace(/;\s*$/, '').trim();

  return `SELECT count(*) AS affected FROM ${target}${where ? ` ${where}` : ''}`;
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
