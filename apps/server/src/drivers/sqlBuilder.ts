import type {
  CellValue,
  FilterSpec,
  RowChanges,
  RowQuery,
  TableRef,
} from '@fluentdb/shared';
import { DriverError, type Dialect } from './types.js';

export interface BuiltQuery {
  sql: string;
  params: CellValue[];
}

export function qualifiedName(dialect: Dialect, ref: TableRef): string {
  const table = dialect.quoteIdent(ref.name);
  return ref.schema ? `${dialect.quoteIdent(ref.schema)}.${table}` : table;
}

/**
 * Ensures every referenced column exists in the introspected structure.
 * Combined with quoteIdent this makes grid-driven SQL injection-proof:
 * identifiers are validated + quoted, values are always bound parameters.
 */
export function assertKnownColumns(
  columns: Iterable<string>,
  known: Set<string>,
): void {
  for (const c of columns) {
    if (!known.has(c)) {
      throw new DriverError(`Unknown column: ${c}`);
    }
  }
}

function buildFilterClause(
  dialect: Dialect,
  filters: FilterSpec[],
  params: CellValue[],
): string {
  if (filters.length === 0) return '';
  const parts: string[] = [];
  for (const f of filters) {
    const col = dialect.quoteIdent(f.column);
    switch (f.op) {
      case 'is_null':
        parts.push(`${col} IS NULL`);
        break;
      case 'not_null':
        parts.push(`${col} IS NOT NULL`);
        break;
      case 'contains':
        params.push(`%${escapeLike(f.value ?? '')}%`);
        parts.push(`${col} LIKE ${dialect.placeholder(params.length)} ESCAPE '!'`);
        break;
      case 'starts_with':
        params.push(`${escapeLike(f.value ?? '')}%`);
        parts.push(`${col} LIKE ${dialect.placeholder(params.length)} ESCAPE '!'`);
        break;
      default: {
        const op = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[
          f.op
        ];
        params.push(f.value ?? '');
        parts.push(`${col} ${op} ${dialect.placeholder(params.length)}`);
      }
    }
  }
  return ` WHERE ${parts.join(' AND ')}`;
}

// '!' as LIKE escape char: portable across pg/mysql/sqlite string literals
// (backslash is an escape inside MySQL literals but not standard SQL ones).
function escapeLike(value: string): string {
  return value.replace(/[%_!]/g, (m) => `!${m}`);
}

export function buildSelectPage(
  dialect: Dialect,
  ref: TableRef,
  q: RowQuery,
  knownColumns: Set<string>,
): BuiltQuery {
  assertKnownColumns(
    [...q.sorts.map((s) => s.column), ...q.filters.map((f) => f.column)],
    knownColumns,
  );
  const params: CellValue[] = [];
  let sql = `SELECT * FROM ${qualifiedName(dialect, ref)}`;
  sql += buildFilterClause(dialect, q.filters, params);
  if (q.sorts.length > 0) {
    const order = q.sorts
      .map(
        (s) =>
          `${dialect.quoteIdent(s.column)} ${s.dir === 'desc' ? 'DESC' : 'ASC'}`,
      )
      .join(', ');
    sql += ` ORDER BY ${order}`;
  }
  params.push(q.pageSize, q.page * q.pageSize);
  sql += ` LIMIT ${dialect.placeholder(params.length - 1)} OFFSET ${dialect.placeholder(params.length)}`;
  return { sql, params };
}

export function buildCount(
  dialect: Dialect,
  ref: TableRef,
  filters: FilterSpec[],
  knownColumns: Set<string>,
): BuiltQuery {
  assertKnownColumns(
    filters.map((f) => f.column),
    knownColumns,
  );
  const params: CellValue[] = [];
  let sql = `SELECT COUNT(*) AS n FROM ${qualifiedName(dialect, ref)}`;
  sql += buildFilterClause(dialect, filters, params);
  return { sql, params };
}

export interface MutationStatements {
  inserts: BuiltQuery[];
  updates: BuiltQuery[];
  deletes: BuiltQuery[];
}

export function buildMutations(
  dialect: Dialect,
  ref: TableRef,
  changes: RowChanges,
  knownColumns: Set<string>,
  pkColumns: string[],
): MutationStatements {
  if (
    (changes.updates.length > 0 || changes.deletes.length > 0) &&
    pkColumns.length === 0
  ) {
    throw new DriverError(
      'Table has no primary key — updates and deletes are disabled for safety',
    );
  }
  const table = qualifiedName(dialect, ref);
  const pkSet = new Set(pkColumns);

  const whereByKey = (
    key: Record<string, CellValue>,
    params: CellValue[],
  ): string => {
    const keys = Object.keys(key);
    assertKnownColumns(keys, knownColumns);
    for (const k of keys) {
      if (!pkSet.has(k)) {
        throw new DriverError(
          `Row key must only reference primary-key columns (got ${k})`,
        );
      }
    }
    if (keys.length !== pkColumns.length) {
      throw new DriverError('Row key must cover the full primary key');
    }
    return keys
      .map((k) => {
        const v = key[k] ?? null;
        if (v === null) return `${dialect.quoteIdent(k)} IS NULL`;
        params.push(v);
        return `${dialect.quoteIdent(k)} = ${dialect.placeholder(params.length)}`;
      })
      .join(' AND ');
  };

  const inserts = changes.inserts.map((row) => {
    const cols = Object.keys(row);
    assertKnownColumns(cols, knownColumns);
    if (cols.length === 0) throw new DriverError('Empty insert row');
    const params: CellValue[] = cols.map((c) => row[c] ?? null);
    const sql = `INSERT INTO ${table} (${cols
      .map((c) => dialect.quoteIdent(c))
      .join(', ')}) VALUES (${cols
      .map((_, i) => dialect.placeholder(i + 1))
      .join(', ')})`;
    return { sql, params };
  });

  const updates = changes.updates.map(({ key, changes: values }) => {
    const cols = Object.keys(values);
    assertKnownColumns(cols, knownColumns);
    if (cols.length === 0) throw new DriverError('Empty update');
    const params: CellValue[] = [];
    const sets = cols
      .map((c) => {
        params.push(values[c] ?? null);
        return `${dialect.quoteIdent(c)} = ${dialect.placeholder(params.length)}`;
      })
      .join(', ');
    const where = whereByKey(key, params);
    return { sql: `UPDATE ${table} SET ${sets} WHERE ${where}`, params };
  });

  const deletes = changes.deletes.map(({ key }) => {
    const params: CellValue[] = [];
    const where = whereByKey(key, params);
    return { sql: `DELETE FROM ${table} WHERE ${where}`, params };
  });

  return { inserts, updates, deletes };
}
