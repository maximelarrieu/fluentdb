/**
 * Split a SQL script into individual statements, respecting single/double
 * quotes, backticks, line comments, block comments and Postgres
 * dollar-quoted strings. Used by drivers that can only execute one
 * statement at a time (SQLite) and by DDL apply.
 */
export function splitSqlStatements(script: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  const n = script.length;

  while (i < n) {
    const ch = script[i]!;
    const next = script[i + 1];

    // line comment
    if (ch === '-' && next === '-') {
      const end = script.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      current += script.slice(i, stop);
      i = stop;
      continue;
    }
    // block comment
    if (ch === '/' && next === '*') {
      const end = script.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      current += script.slice(i, stop);
      i = stop;
      continue;
    }
    // quoted regions
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (script[j] === ch) {
          // doubled quote escape ('' / "")
          if (script[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        // backslash escape inside single quotes (MySQL)
        if (ch === "'" && script[j] === '\\') {
          j += 2;
          continue;
        }
        j += 1;
      }
      const stop = Math.min(j + 1, n);
      current += script.slice(i, stop);
      i = stop;
      continue;
    }
    // dollar-quoted string ($$ ... $$ or $tag$ ... $tag$)
    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(script.slice(i));
      if (m) {
        const tag = m[0];
        const end = script.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        current += script.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}
