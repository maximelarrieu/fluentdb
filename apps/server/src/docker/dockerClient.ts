import os from 'node:os';
import path from 'node:path';
import { Client } from 'undici';

export interface DockerPort {
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
}

export interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Ports: DockerPort[];
}

export interface DockerContainerDetail {
  Id: string;
  Name: string;
  Config: { Image: string; Env: string[] | null };
  State: { Running: boolean };
  NetworkSettings: {
    Ports: Record<string, { HostIp: string; HostPort: string }[] | null> | null;
  };
}

export interface DockerEndpoint {
  socketPath?: string;
  host?: string;
  port?: number;
}

/** Windows named pipe exposed by Docker Desktop. */
const WINDOWS_DOCKER_PIPE = '\\\\.\\pipe\\docker_engine';

/**
 * Ordered list of Docker endpoints to probe.
 *
 * `DOCKER_HOST` wins and pins a single endpoint. Otherwise we try the common
 * locations in turn so detection works without the user setting `DOCKER_HOST`
 * by hand: on Windows the Docker Desktop named pipe; elsewhere the classic
 * system socket then the paths used by Docker Desktop, rootless Docker, Colima,
 * OrbStack and Rancher Desktop.
 */
export function candidateDockerEndpoints(
  env = process.env,
  platform: NodeJS.Platform = process.platform,
): DockerEndpoint[] {
  const dockerHost = env.DOCKER_HOST;
  if (dockerHost) {
    if (dockerHost.startsWith('npipe://')) {
      // npipe:////./pipe/docker_engine -> \\.\pipe\docker_engine
      return [
        { socketPath: dockerHost.slice('npipe://'.length).replace(/\//g, '\\') },
      ];
    }
    if (dockerHost.startsWith('unix://')) {
      return [{ socketPath: dockerHost.slice('unix://'.length) }];
    }
    if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://')) {
      const url = new URL(dockerHost.replace('tcp://', 'http://'));
      return [{ host: url.hostname, port: Number(url.port || 2375) }];
    }
    // Unknown scheme — treat the value as a raw socket path / pipe.
    return [{ socketPath: dockerHost }];
  }

  // Windows Docker Desktop speaks over a named pipe, never a Unix socket.
  if (platform === 'win32') {
    return [{ socketPath: WINDOWS_DOCKER_PIPE }];
  }

  const home = env.HOME || env.USERPROFILE || os.homedir();
  const candidates: DockerEndpoint[] = [{ socketPath: '/var/run/docker.sock' }];
  if (env.XDG_RUNTIME_DIR) {
    candidates.push({
      socketPath: path.join(env.XDG_RUNTIME_DIR, 'docker.sock'),
    });
  }
  candidates.push(
    { socketPath: path.join(home, '.docker', 'run', 'docker.sock') },
    { socketPath: path.join(home, '.docker', 'desktop', 'docker.sock') },
    // Common Docker Desktop alternatives on macOS/Linux.
    { socketPath: path.join(home, '.colima', 'default', 'docker.sock') },
    { socketPath: path.join(home, '.orbstack', 'run', 'docker.sock') },
    { socketPath: path.join(home, '.rd', 'docker.sock') },
  );
  return candidates;
}

/**
 * Minimal Docker Engine API client — exactly the two endpoints the
 * detection feature needs, over undici (unix socket, Windows named pipe or tcp).
 */
export class DockerClient {
  private readonly candidates: DockerEndpoint[];
  private resolved: DockerEndpoint | null = null;

  constructor(endpoint?: DockerEndpoint | DockerEndpoint[]) {
    this.candidates = endpoint
      ? Array.isArray(endpoint)
        ? endpoint
        : [endpoint]
      : candidateDockerEndpoints();
  }

  private makeClient(endpoint: DockerEndpoint): Client {
    if (endpoint.socketPath) {
      return new Client('http://localhost', {
        socketPath: endpoint.socketPath,
      });
    }
    return new Client(`http://${endpoint.host}:${endpoint.port}`);
  }

  /** First candidate whose `/_ping` succeeds, memoized for later calls. */
  private async resolve(): Promise<DockerEndpoint | null> {
    if (this.resolved) return this.resolved;
    for (const candidate of this.candidates) {
      const client = this.makeClient(candidate);
      try {
        const res = await client.request({
          method: 'GET',
          path: '/_ping',
          headersTimeout: 3000,
          bodyTimeout: 5000,
        });
        await res.body.text();
        if (res.statusCode < 400) {
          this.resolved = candidate;
          return candidate;
        }
      } catch {
        // try the next candidate
      } finally {
        await client.close().catch(() => {});
      }
    }
    return null;
  }

  private async getText(path: string): Promise<string> {
    const endpoint = await this.resolve();
    if (!endpoint) throw new Error('Docker socket not reachable');
    const client = this.makeClient(endpoint);
    try {
      const res = await client.request({
        method: 'GET',
        path,
        headersTimeout: 3000,
        bodyTimeout: 5000,
      });
      const body = await res.body.text();
      if (res.statusCode >= 400) {
        throw new Error(`Docker API ${res.statusCode}: ${body.slice(0, 300)}`);
      }
      return body;
    } finally {
      await client.close().catch(() => {});
    }
  }

  private async get<T>(path: string): Promise<T> {
    return JSON.parse(await this.getText(path)) as T;
  }

  async ping(): Promise<boolean> {
    return (await this.resolve()) !== null;
  }

  async listContainers(all = true): Promise<DockerContainer[]> {
    return this.get<DockerContainer[]>(
      `/containers/json?all=${all ? 'true' : 'false'}`,
    );
  }

  async inspectContainer(id: string): Promise<DockerContainerDetail> {
    return this.get<DockerContainerDetail>(
      `/containers/${encodeURIComponent(id)}/json`,
    );
  }
}
