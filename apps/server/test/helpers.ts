import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp, type BuiltApp } from '../src/app.js';
import type { AiProvider, AiChatOptions, AiTextChunk } from '../src/ai/types.js';

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fluentdb-${prefix}-`));
}

/** Seeded SQLite fixture used across the API tests. */
export function makeSqliteFixture(dir: string): string {
  const file = path.join(dir, 'fixture.db');
  const db = new Database(file);
  db.exec(`
    CREATE TABLE artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      country TEXT
    );
    CREATE TABLE albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL REFERENCES artists(id),
      title TEXT NOT NULL,
      year INTEGER,
      rating REAL
    );
    CREATE INDEX idx_albums_year ON albums(year);
    CREATE TABLE no_pk (a TEXT, b TEXT);
    CREATE VIEW recent_albums AS SELECT * FROM albums WHERE year >= 2000;
    INSERT INTO artists (name, country) VALUES
      ('Daft Punk', 'FR'), ('Radiohead', 'UK'), ('Justice', 'FR');
    INSERT INTO albums (artist_id, title, year, rating) VALUES
      (1, 'Discovery', 2001, 4.8),
      (1, 'Random Access Memories', 2013, 4.6),
      (2, 'OK Computer', 1997, 4.9),
      (2, 'Kid A', 2000, 4.7),
      (3, 'Cross', 2007, 4.4);
    INSERT INTO no_pk (a, b) VALUES ('x', 'y');
  `);
  db.close();
  return file;
}

export class FakeAiProvider implements AiProvider {
  readonly id = 'fake';
  readonly model = 'fake-1';
  constructor(private readonly chunks: string[]) {}

  async *chatStream(_opts: AiChatOptions): AsyncIterable<AiTextChunk> {
    for (const delta of this.chunks) {
      yield { type: 'text', delta };
    }
  }
}

export interface TestApp {
  app: FastifyInstance;
  built: BuiltApp;
  dataDir: string;
  fixtureFile: string;
}

export async function makeTestApp(opts?: {
  ai?: AiProvider | null;
}): Promise<TestApp> {
  const dataDir = makeTempDir('data');
  const fixtureFile = makeSqliteFixture(dataDir);
  const built = buildApp({
    dataDir,
    aiProvider: opts?.ai ?? null,
  });
  await built.app.ready();
  return { app: built.app, built, dataDir, fixtureFile };
}

/** Create a SQLite connection via the API and connect it. Returns its id. */
export async function createAndConnect(t: TestApp): Promise<string> {
  const createRes = await t.app.inject({
    method: 'POST',
    url: '/api/connections',
    payload: { name: 'fixture', engine: 'sqlite', file: t.fixtureFile },
  });
  if (createRes.statusCode !== 201) {
    throw new Error(`create failed: ${createRes.payload}`);
  }
  const { id } = createRes.json() as { id: string };
  const connectRes = await t.app.inject({
    method: 'POST',
    url: `/api/connections/${id}/connect`,
  });
  if (connectRes.statusCode !== 200) {
    throw new Error(`connect failed: ${connectRes.payload}`);
  }
  return id;
}

export async function closeTestApp(t: TestApp): Promise<void> {
  await t.app.close();
  fs.rmSync(t.dataDir, { recursive: true, force: true });
}
