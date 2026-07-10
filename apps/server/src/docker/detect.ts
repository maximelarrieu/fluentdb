import type { DetectedDbContainer, EngineKind } from '@fluentdb/shared';
import { defaultPorts } from '@fluentdb/shared';
import type { DockerClient } from './dockerClient.js';

const IMAGE_PATTERNS: { engine: EngineKind; pattern: RegExp }[] = [
  { engine: 'postgres', pattern: /postgres|pgvector|timescale|supabase\/postgres/i },
  { engine: 'mysql', pattern: /mysql|mariadb|percona/i },
];

export function engineForImage(image: string): EngineKind | null {
  for (const { engine, pattern } of IMAGE_PATTERNS) {
    if (pattern.test(image)) return engine;
  }
  return null;
}

function envMap(env: string[] | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of env ?? []) {
    const idx = entry.indexOf('=');
    if (idx > 0) map.set(entry.slice(0, idx), entry.slice(idx + 1));
  }
  return map;
}

interface CredentialHints {
  user?: string;
  password?: string;
  database?: string;
}

export function credentialsFromEnv(
  engine: EngineKind,
  env: Map<string, string>,
): CredentialHints {
  if (engine === 'postgres') {
    const user = env.get('POSTGRES_USER') ?? 'postgres';
    return {
      user,
      password: env.get('POSTGRES_PASSWORD'),
      database: env.get('POSTGRES_DB') ?? user,
    };
  }
  if (engine === 'mysql') {
    const user = env.get('MYSQL_USER');
    if (user) {
      return {
        user,
        password: env.get('MYSQL_PASSWORD'),
        database: env.get('MYSQL_DATABASE'),
      };
    }
    return {
      user: 'root',
      password:
        env.get('MYSQL_ROOT_PASSWORD') ?? env.get('MARIADB_ROOT_PASSWORD'),
      database: env.get('MYSQL_DATABASE') ?? env.get('MARIADB_DATABASE'),
    };
  }
  return {};
}

export function hostPortFor(
  engine: EngineKind,
  ports: Record<string, { HostIp: string; HostPort: string }[] | null> | null,
): number | null {
  const wanted = defaultPorts[engine];
  if (!wanted || !ports) return null;
  // Prefer the mapping of the engine's default container port.
  const exact = ports[`${wanted}/tcp`];
  if (exact && exact.length > 0) return Number(exact[0]!.HostPort);
  // Otherwise take any published tcp port.
  for (const [key, bindings] of Object.entries(ports)) {
    if (key.endsWith('/tcp') && bindings && bindings.length > 0) {
      return Number(bindings[0]!.HostPort);
    }
  }
  return null;
}

export async function detectDatabaseContainers(
  client: DockerClient,
): Promise<DetectedDbContainer[]> {
  const containers = await client.listContainers(true);
  const detected: DetectedDbContainer[] = [];

  for (const c of containers) {
    const engine = engineForImage(c.Image);
    if (!engine) continue;

    const detail = await client.inspectContainer(c.Id);
    const env = envMap(detail.Config.Env);
    const creds = credentialsFromEnv(engine, env);
    const hostPort = hostPortFor(engine, detail.NetworkSettings.Ports);
    const name = detail.Name.replace(/^\//, '') || c.Id.slice(0, 12);

    detected.push({
      containerId: c.Id,
      containerName: name,
      image: c.Image,
      engine,
      running: detail.State.Running,
      hostPort,
      suggested: {
        name: `${name} (docker)`,
        engine,
        host: '127.0.0.1',
        port: hostPort ?? defaultPorts[engine],
        ...creds,
      },
    });
  }
  return detected;
}
