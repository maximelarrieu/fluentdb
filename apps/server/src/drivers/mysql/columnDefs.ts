/**
 * Extract per-column definitions from a `SHOW CREATE TABLE` statement.
 *
 * MySQL/MariaDB print exactly one column per line, formatted as
 * `  \`name\` <definition>,` — with the canonical definition the server itself
 * would emit (type, NULL/NOT NULL, DEFAULT, AUTO_INCREMENT, CHARACTER SET /
 * COLLATE, ON UPDATE, inline CHECK, existing COMMENT…). Reusing that verbatim
 * to rebuild a `MODIFY COLUMN` is far safer than reconstructing the definition
 * from information_schema fields (which drift in quoting/defaults across
 * versions).
 *
 * Key/constraint lines (PRIMARY KEY, UNIQUE KEY, KEY, CONSTRAINT, FOREIGN KEY)
 * never start with a backtick, so column lines are exactly the backtick-led ones.
 */
export function parseCreateTableColumns(ddl: string): Map<string, string> {
  const defs = new Map<string, string>();
  for (const rawLine of ddl.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('`')) continue;
    // `name` (backticks doubled to escape) followed by the definition.
    const m = /^`((?:[^`]|``)*)`\s+([\s\S]+)$/.exec(line);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const name = m[1].replace(/``/g, '`');
    let def = m[2].trim();
    if (def.endsWith(',')) def = def.slice(0, -1).trim();
    defs.set(name, def);
  }
  return defs;
}

/** A generated/computed column — cannot be redefined safely to add a comment. */
export function isGeneratedColumn(def: string): boolean {
  return /\bGENERATED\s+ALWAYS\b/i.test(def) || /\bAS\s*\(/i.test(def);
}

/** Remove a trailing `COMMENT '…'` clause so a fresh one can be appended. */
export function stripTrailingComment(def: string): string {
  // MySQL escapes quotes inside the literal as \' (default) or ''.
  return def.replace(/\s+COMMENT\s+'(?:\\.|''|[^'\\])*'\s*$/i, '').trim();
}

/**
 * Split a column definition into its main part and any trailing constraint
 * clauses (CHECK / REFERENCES / CONSTRAINT). In MariaDB/MySQL column grammar
 * COMMENT must come *before* these, so a fresh COMMENT has to be inserted
 * between `head` and `tail` rather than appended at the very end.
 *
 * The scan respects string literals, backtick identifiers and parentheses so a
 * `CHECK` word inside a DEFAULT expression or a comment literal is not mistaken
 * for the constraint boundary.
 */
export function splitColumnConstraints(def: string): {
  head: string;
  tail: string;
} {
  const n = def.length;
  let i = 0;
  while (i < n) {
    const ch = def[i];
    if (ch === "'") {
      i += 1;
      while (i < n) {
        if (def[i] === '\\') {
          i += 2;
          continue;
        }
        if (def[i] === "'") {
          if (def[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '`') {
      i += 1;
      while (i < n) {
        if (def[i] === '`') {
          if (def[i + 1] === '`') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '(') {
      // Skip a balanced parenthesised group (types, DEFAULT expressions…).
      let depth = 1;
      i += 1;
      while (i < n && depth > 0) {
        const c = def[i];
        if (c === "'" || c === '`') {
          const quote = c;
          i += 1;
          while (i < n) {
            if (quote === "'" && def[i] === '\\') {
              i += 2;
              continue;
            }
            if (def[i] === quote) {
              if (def[i + 1] === quote) {
                i += 2;
                continue;
              }
              i += 1;
              break;
            }
            i += 1;
          }
          continue;
        }
        if (c === '(') depth += 1;
        else if (c === ')') depth -= 1;
        i += 1;
      }
      continue;
    }
    // At top level (outside strings/identifiers/parens): a constraint keyword
    // starting on a word boundary marks the start of the trailing clauses.
    if (
      (i === 0 || /\s/.test(def[i - 1] ?? '')) &&
      /^(CHECK|REFERENCES|CONSTRAINT)\b/i.test(def.slice(i))
    ) {
      return { head: def.slice(0, i).trim(), tail: def.slice(i).trim() };
    }
    i += 1;
  }
  return { head: def.trim(), tail: '' };
}
