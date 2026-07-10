import http from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DockerClient } from '../src/docker/dockerClient.js';
import {
  detectDatabaseContainers,
  engineForImage,
} from '../src/docker/detect.js';
import { makeTempDir } from './helpers.js';

const CONTAINERS = [
  {
    Id: 'abc123',
    Names: ['/my-postgres'],
    Image: 'postgres:16-alpine',
    State: 'running',
    Ports: [{ PrivatePort: 5432, PublicPort: 55432, Type: 'tcp' }],
  },
  {
    Id: 'def456',
    Names: ['/shop-mysql'],
    Image: 'mysql:8',
    State: 'exited',
    Ports: [],
  },
  {
    Id: 'zzz999',
    Names: ['/web'],
    Image: 'nginx:latest',
    State: 'running',
    Ports: [],
  },
];

const DETAILS: Record<string, object> = {
  abc123: {
    Id: 'abc123',
    Name: '/my-postgres',
    Config: {
      Image: 'postgres:16-alpine',
      Env: ['POSTGRES_PASSWORD=s3cret', 'POSTGRES_DB=shop', 'PATH=/usr/bin'],
    },
    State: { Running: true },
    NetworkSettings: {
      Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55432' }] },
    },
  },
  def456: {
    Id: 'def456',
    Name: '/shop-mysql',
    Config: {
      Image: 'mysql:8',
      Env: ['MYSQL_ROOT_PASSWORD=rootpw', 'MYSQL_DATABASE=shop'],
    },
    State: { Running: false },
    NetworkSettings: { Ports: null },
  },
};

describe('docker detection (fake unix-socket daemon)', () => {
  let server: http.Server;
  let socketPath: string;

  beforeAll(async () => {
    socketPath = path.join(makeTempDir('sock'), 'docker.sock');
    server = http.createServer((req, res) => {
      const url = req.url ?? '';
      if (url === '/_ping') {
        res.writeHead(200).end('OK');
      } else if (url.startsWith('/containers/json')) {
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(CONTAINERS));
      } else if (/^\/containers\/[^/]+\/json$/.test(url)) {
        const id = url.split('/')[2]!;
        const detail = DETAILS[id];
        if (detail) {
          res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(JSON.stringify(detail));
        } else {
          res.writeHead(404).end('{"message":"no such container"}');
        }
      } else {
        res.writeHead(404).end('{}');
      }
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('classifies images', () => {
    expect(engineForImage('postgres:16')).toBe('postgres');
    expect(engineForImage('bitnami/mariadb:11')).toBe('mysql');
    expect(engineForImage('redis:7')).toBeNull();
  });

  it('pings the daemon', async () => {
    const client = new DockerClient({ socketPath });
    expect(await client.ping()).toBe(true);
  });

  it('reports unreachable daemons gracefully', async () => {
    const client = new DockerClient({ socketPath: '/nonexistent.sock' });
    expect(await client.ping()).toBe(false);
  });

  it('detects database containers with credentials and ports', async () => {
    const client = new DockerClient({ socketPath });
    const detected = await detectDatabaseContainers(client);
    expect(detected).toHaveLength(2);

    const pg = detected.find((d) => d.engine === 'postgres')!;
    expect(pg.containerName).toBe('my-postgres');
    expect(pg.running).toBe(true);
    expect(pg.hostPort).toBe(55432);
    expect(pg.suggested).toMatchObject({
      engine: 'postgres',
      host: '127.0.0.1',
      port: 55432,
      user: 'postgres',
      password: 's3cret',
      database: 'shop',
    });

    const my = detected.find((d) => d.engine === 'mysql')!;
    expect(my.running).toBe(false);
    expect(my.suggested).toMatchObject({
      user: 'root',
      password: 'rootpw',
      database: 'shop',
    });
  });
});
