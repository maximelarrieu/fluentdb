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

/** Resolve the Docker endpoint from DOCKER_HOST or the default socket. */
export function resolveDockerEndpoint(env = process.env): DockerEndpoint {
  const dockerHost = env.DOCKER_HOST;
  if (dockerHost) {
    if (dockerHost.startsWith('unix://')) {
      return { socketPath: dockerHost.slice('unix://'.length) };
    }
    if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://')) {
      const url = new URL(dockerHost.replace('tcp://', 'http://'));
      return { host: url.hostname, port: Number(url.port || 2375) };
    }
  }
  return { socketPath: '/var/run/docker.sock' };
}

/**
 * Minimal Docker Engine API client — exactly the two endpoints the
 * detection feature needs, over undici (unix socket or tcp).
 */
export class DockerClient {
  private readonly endpoint: DockerEndpoint;

  constructor(endpoint?: DockerEndpoint) {
    this.endpoint = endpoint ?? resolveDockerEndpoint();
  }

  private makeClient(): Client {
    if (this.endpoint.socketPath) {
      return new Client('http://localhost', {
        socketPath: this.endpoint.socketPath,
      });
    }
    return new Client(`http://${this.endpoint.host}:${this.endpoint.port}`);
  }

  private async getText(path: string): Promise<string> {
    const client = this.makeClient();
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
    try {
      // `/_ping` answers plain-text "OK", not JSON
      await this.getText('/_ping');
      return true;
    } catch {
      return false;
    }
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
