import { describe, expect, it } from 'vitest';
import {
  isGeneratedColumn,
  parseCreateTableColumns,
  splitColumnConstraints,
  stripTrailingComment,
} from '../src/drivers/mysql/columnDefs.js';

// Representative MariaDB `SHOW CREATE TABLE` output covering the shapes seen in
// the user's real schema: int PK, varchar, tinyint(1) default, text with
// CHARACTER SET/COLLATE, timestamp default expression, inline CHECK, an already
// commented column, a generated column, and a backtick-in-name column.
const DDL = `CREATE TABLE \`aliments\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`Nom\` varchar(255) DEFAULT NULL,
  \`actif\` tinyint(1) DEFAULT 1,
  \`description\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  \`created_at\` timestamp NULL DEFAULT current_timestamp(),
  \`glucides\` tinyint(4) NOT NULL CHECK (\`glucides\` between 0 and 100),
  \`labelled\` int(11) NOT NULL COMMENT 'ancien commentaire',
  \`total\` int(11) GENERATED ALWAYS AS (\`glucides\` + 1) VIRTUAL,
  \`weird\`\`name\` int(11) DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_nom\` (\`Nom\`),
  KEY \`idx_actif\` (\`actif\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

describe('parseCreateTableColumns', () => {
  const defs = parseCreateTableColumns(DDL);

  it('extracts every column and no key/constraint lines', () => {
    expect([...defs.keys()]).toEqual([
      'id',
      'Nom',
      'actif',
      'description',
      'created_at',
      'glucides',
      'labelled',
      'total',
      'weird`name',
    ]);
  });

  it('keeps the canonical definition verbatim (no trailing comma)', () => {
    expect(defs.get('id')).toBe('int(11) NOT NULL AUTO_INCREMENT');
    expect(defs.get('Nom')).toBe('varchar(255) DEFAULT NULL');
    expect(defs.get('actif')).toBe('tinyint(1) DEFAULT 1');
    expect(defs.get('description')).toBe(
      'text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL',
    );
    expect(defs.get('created_at')).toBe('timestamp NULL DEFAULT current_timestamp()');
    expect(defs.get('glucides')).toBe(
      'tinyint(4) NOT NULL CHECK (`glucides` between 0 and 100)',
    );
  });

  it('unescapes doubled backticks in column names', () => {
    expect(defs.get('weird`name')).toBe('int(11) DEFAULT NULL');
  });
});

describe('isGeneratedColumn', () => {
  const defs = parseCreateTableColumns(DDL);
  it('flags generated columns and nothing else', () => {
    expect(isGeneratedColumn(defs.get('total')!)).toBe(true);
    expect(isGeneratedColumn(defs.get('id')!)).toBe(false);
    expect(isGeneratedColumn(defs.get('glucides')!)).toBe(false);
    expect(isGeneratedColumn('int(11) AS (a + b) STORED')).toBe(true);
  });
});

describe('stripTrailingComment', () => {
  const defs = parseCreateTableColumns(DDL);
  it('removes an existing COMMENT so a fresh one can be appended', () => {
    expect(stripTrailingComment(defs.get('labelled')!)).toBe('int(11) NOT NULL');
  });
  it('leaves definitions without a comment untouched', () => {
    expect(stripTrailingComment('varchar(255) DEFAULT NULL')).toBe(
      'varchar(255) DEFAULT NULL',
    );
  });
  it('handles escaped quotes inside the comment literal', () => {
    expect(stripTrailingComment("int(11) COMMENT 'l\\'ancien'")).toBe('int(11)');
    expect(stripTrailingComment("int(11) COMMENT 'a''b'")).toBe('int(11)');
  });
});

describe('splitColumnConstraints', () => {
  it('splits off a trailing inline CHECK constraint', () => {
    expect(
      splitColumnConstraints('tinyint(4) NOT NULL CHECK (`glucides` between 0 and 100)'),
    ).toEqual({
      head: 'tinyint(4) NOT NULL',
      tail: 'CHECK (`glucides` between 0 and 100)',
    });
  });

  it('leaves definitions without trailing constraints untouched', () => {
    expect(splitColumnConstraints('varchar(255) DEFAULT NULL')).toEqual({
      head: 'varchar(255) DEFAULT NULL',
      tail: '',
    });
  });

  it('is not fooled by the word CHECK inside a string default', () => {
    expect(splitColumnConstraints("varchar(50) DEFAULT 'CHECK (x)'")).toEqual({
      head: "varchar(50) DEFAULT 'CHECK (x)'",
      tail: '',
    });
  });

  it('is not fooled by CHECK inside a parenthesised expression', () => {
    expect(splitColumnConstraints('int(11) DEFAULT (1 + 1)')).toEqual({
      head: 'int(11) DEFAULT (1 + 1)',
      tail: '',
    });
  });

  it('places a comment before the CHECK when rebuilt', () => {
    const { head, tail } = splitColumnConstraints(
      "tinyint(4) NOT NULL CHECK (`g` between 0 and 100)",
    );
    const rebuilt = [stripTrailingComment(head), "COMMENT 'x'", tail]
      .filter((p) => p)
      .join(' ');
    expect(rebuilt).toBe("tinyint(4) NOT NULL COMMENT 'x' CHECK (`g` between 0 and 100)");
  });
});
