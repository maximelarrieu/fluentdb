import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDotEnv } from '../src/env.js';
import { makeTempDir } from './helpers.js';

const TOUCHED = [
  'FLUENTDB_TEST_FOO',
  'FLUENTDB_TEST_QUOTED',
  'FLUENTDB_TEST_EXISTING',
  'FLUENTDB_TEST_HASH',
];

afterEach(() => {
  for (const key of TOUCHED) delete process.env[key];
});

describe('loadDotEnv', () => {
  it('loads KEY=VALUE lines, strips quotes and ignores comments', () => {
    const dir = makeTempDir('env');
    fs.writeFileSync(
      path.join(dir, '.env'),
      [
        '# a comment',
        'FLUENTDB_TEST_FOO=bar',
        'FLUENTDB_TEST_QUOTED="hello world"',
        'FLUENTDB_TEST_HASH=a#b',
        '',
      ].join('\n'),
    );

    const loaded = loadDotEnv(dir);

    expect(loaded).toBe(path.join(dir, '.env'));
    expect(process.env.FLUENTDB_TEST_FOO).toBe('bar');
    expect(process.env.FLUENTDB_TEST_QUOTED).toBe('hello world');
    expect(process.env.FLUENTDB_TEST_HASH).toBe('a#b');
  });

  it('never overrides a variable already set in the environment', () => {
    const dir = makeTempDir('env');
    fs.writeFileSync(path.join(dir, '.env'), 'FLUENTDB_TEST_EXISTING=fromfile\n');
    process.env.FLUENTDB_TEST_EXISTING = 'real';

    loadDotEnv(dir);

    expect(process.env.FLUENTDB_TEST_EXISTING).toBe('real');
  });

  it('walks up to find the nearest .env and returns null when absent', () => {
    const root = makeTempDir('env');
    fs.writeFileSync(path.join(root, '.env'), 'FLUENTDB_TEST_FOO=up\n');
    const nested = path.join(root, 'apps', 'server');
    fs.mkdirSync(nested, { recursive: true });

    expect(loadDotEnv(nested)).toBe(path.join(root, '.env'));
    expect(process.env.FLUENTDB_TEST_FOO).toBe('up');

    // A directory with no .env above it (the OS temp dir has none of ours).
    const orphan = makeTempDir('env-empty');
    expect(loadDotEnv(path.join(orphan, 'nope'))).toBeNull();
  });
});
