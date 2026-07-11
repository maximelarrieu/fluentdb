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

/**
 * Ordered list of Docker endpoints to probe.
 *
 * `DOCKER_HOST` wins and pins a single endpoint. Otherwise we try the common
 * socket locations in turn — the classic system socket, then the ones Docker
 * Desktop (macOS/Windows) and rootless Docker (Linux) use — so detection works
 * without the user setting `DOCKER_HOST` by hand.
 */
export function candidateDockerEndpoints(env = process.env): DockerEndpoint[] {
  const dockerHost = env.DOCKER_HOST;
  if (dockerHost) {
    if (dockerHost.startsWith('unix://')) {
      return [{ socketPath: dockerHost.slice('unix://'.length) }];
    }
    if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://')) {
      const url = new URL(dockerHost.replace('tcp://', 'http://'));
      return [{ host: url.hostname, port: Number(url.port || 2375) }];
    }
    // Unknown scheme — treat the value as a raw socket path.
    return [{ socketPath: dockerHost }];
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
  );
  return candidates;
}

/**
 * Minimal Docker Engine API client — exactly the two endpoints the
 * detection feature needs, over undici (unix socket or tcp).
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
