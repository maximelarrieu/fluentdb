import { describe, expect, it } from 'vitest';
import { analyzeScript, classifyStatement } from '../src/sql/analyze.js';

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
