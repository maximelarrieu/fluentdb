import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  webDistDir: string | null;
}

export function loadConfig(): ServerConfig {
  const port = Number(process.env.FLUENTDB_PORT ?? 4983);
  const unsafeListen = process.env.FLUENTDB_UNSAFE_LISTEN === '1';
  const dataDir =
    process.env.FLUENTDB_DATA_DIR ?? path.join(os.homedir(), '.fluentdb');

  const webDist = path.resolve(
    import.meta.dirname ?? process.cwd(),
    '../../web/dist',
  );

  return {
    port,
    // Local tool: never expose on the network unless explicitly forced.
    host: unsafeListen ? '0.0.0.0' : '127.0.0.1',
    dataDir,
    webDistDir: fs.existsSync(path.join(webDist, 'index.html')) ? webDist : null,
  };
}

export function ensureDataDir(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
}
