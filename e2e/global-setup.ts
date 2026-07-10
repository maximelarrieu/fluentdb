import { spawn, type ChildProcess } from 'node:child_process';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let server: ChildProcess | undefined;

async function waitForHealth(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error('server never came up');
    await new Promise((r) => setTimeout(r, 300));
  }
}

export default async function globalSetup() {
  const port = process.env.FLUENTDB_E2E_PORT ?? '4989';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentdb-e2e-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const demo = path.join(dir, 'demo.db');
  const db = new Database(demo);
  db.exec(`
    CREATE TABLE artists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, country TEXT);
    CREATE TABLE albums (id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id), title TEXT NOT NULL, year INTEGER);
    INSERT INTO artists (name, country) VALUES ('Daft Punk','FR'),('Radiohead','UK'),('Justice','FR');
    INSERT INTO albums (artist_id, title, year) VALUES
      (1,'Discovery',2001),(2,'OK Computer',1997),(3,'Cross',2007);
  `);
  db.close();

  process.env.FLUENTDB_E2E_DEMO_DB = demo;

  server = spawn('node', ['apps/server/dist/index.js'], {
    env: { ...process.env, FLUENTDB_PORT: port, FLUENTDB_DATA_DIR: dataDir },
    stdio: 'inherit',
  });

  await waitForHealth(`http://127.0.0.1:${port}`);

  return async () => {
    server?.kill('SIGTERM');
    fs.rmSync(dir, { recursive: true, force: true });
  };
}
