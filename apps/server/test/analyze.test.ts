import { describe, expect, it } from 'vitest';
import {
  analyzeScript,
  classifyStatement,
  affectedCountQuery,
} from '../src/sql/analyze.js';

describe('classifyStatement', () => {
  it('classifies reads', () => {
    expect(classifyStatement('SELECT * FROM t').kind).toBe('read');
    expect(classifyStatement('  WITH x AS (SELECT 1) SELECT * FROM x').kind).toBe(
      'read',
    );
    expect(classifyStatement('EXPLAIN SELECT 1').kind).toBe('read');
  });

  it('classifies writes and flags missing WHERE', () => {
    const del = classifyStatement('DELETE FROM users');
    expect(del.kind).toBe('write');
    expect(del.operation).toBe('DELETE');
    expect(del.hasWhere).toBe(false);
    expect(del.warnings[0]).toMatch(/sans clause WHERE/i);

    const upd = classifyStatement('UPDATE users SET active = false WHERE id = 3');
    expect(upd.kind).toBe('write');
    expect(upd.hasWhere).toBe(true);
    expect(upd.warnings).toHaveLength(0);
  });

  it('does not confuse WHERE inside a string literal', () => {
    const s = classifyStatement("UPDATE t SET note = 'no where here'");
    expect(s.hasWhere).toBe(false);
    expect(s.warnings[0]).toMatch(/sans clause WHERE/i);
  });

  it('classifies DDL and flags destructive ops', () => {
    expect(classifyStatement('CREATE TABLE t (id int)').kind).toBe('ddl');
    const drop = classifyStatement('DROP TABLE t');
    expect(drop.kind).toBe('ddl');
    expect(drop.warnings[0]).toMatch(/destructive/i);
    expect(classifyStatement('TRUNCATE t').warnings[0]).toMatch(/destructive/i);
  });

  it('ignores leading comments', () => {
    const s = classifyStatement('-- a comment\n/* block */ INSERT INTO t VALUES (1)');
    expect(s.kind).toBe('write');
    expect(s.operation).toBe('INSERT');
  });

  it('analyzes a multi-statement script', () => {
    const parts = analyzeScript(
      "SELECT 1; UPDATE t SET a=1 WHERE id=2; DROP TABLE old",
    );
    expect(parts.map((p) => p.kind)).toEqual(['read', 'write', 'ddl']);
  });
});

describe('affectedCountQuery', () => {
  it('derives a count for a DELETE with WHERE', () => {
    expect(affectedCountQuery('DELETE FROM users WHERE id = 3')).toBe(
      'SELECT count(*) AS affected FROM users WHERE id = 3',
    );
  });

  it('derives a count for a DELETE without WHERE (whole table)', () => {
    expect(affectedCountQuery('DELETE FROM users')).toBe(
      'SELECT count(*) AS affected FROM users',
    );
  });

  it('derives a count for an UPDATE, keeping only its WHERE', () => {
    expect(
      affectedCountQuery("UPDATE users SET active = false WHERE country = 'FR'"),
    ).toBe("SELECT count(*) AS affected FROM users WHERE country = 'FR'");
  });

  it('keeps a schema-qualified target and strips a trailing semicolon', () => {
    expect(affectedCountQuery('DELETE FROM app.logs WHERE level = 1;')).toBe(
      'SELECT count(*) AS affected FROM app.logs WHERE level = 1',
    );
  });

  it('is not fooled by WHERE inside a string in the SET clause', () => {
    expect(
      affectedCountQuery("UPDATE t SET note = 'x where y' WHERE id = 1"),
    ).toBe('SELECT count(*) AS affected FROM t WHERE id = 1');
  });

  it('bails on multi-table forms and non-writes', () => {
    expect(affectedCountQuery('SELECT * FROM t')).toBeNull();
    expect(
      affectedCountQuery('DELETE FROM a USING b WHERE a.id = b.id'),
    ).toBeNull();
    expect(
      affectedCountQuery('UPDATE a SET x = b.y FROM b WHERE a.id = b.id'),
    ).toBeNull();
    expect(
      affectedCountQuery('DELETE FROM a JOIN b ON a.id = b.id'),
    ).toBeNull();
  });
});
