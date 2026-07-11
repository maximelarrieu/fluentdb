import fs from 'node:fs';
import path from 'node:path';

/**
 * Load a `.env` file into `process.env` without a dependency on dotenv.
 *
 * Variables already present in the real environment win — the file only fills
 * in what is missing. The lookup walks up from the working directory so it
 * finds the repo-root `.env` whether the server is started from the root
 * (`npm start`) or from a workspace directory (`npm run dev -w apps/server`,
 * whose cwd is `apps/server`).
 *
 * Returns the path of the file that was loaded, or `null` if none was found.
 */
export function loadDotEnv(startDir = process.cwd()): string | null {
  const file = findEnvFile(startDir);
  if (!file) return null;

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;

    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }

  return file;
}

/** Nearest `.env` at or above `startDir`, or `null`. */
function findEnvFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
