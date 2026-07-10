import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import {
  PASSWORD_UNCHANGED,
  type ConnectionConfig,
  type ConnectionInput,
} from '@fluentdb/shared';
import type { SecretBox } from '../security/secrets.js';

/**
 * Persisted, encrypted store of saved connections.
 * The whole JSON document is AES-256-GCM encrypted on disk.
 */
export class ConnectionsStore {
  private readonly filePath: string;
  private readonly secrets: SecretBox;
  private items: ConnectionConfig[] = [];

  constructor(dataDir: string, secrets: SecretBox) {
    this.filePath = path.join(dataDir, 'connections.json.enc');
    this.secrets = secrets;
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    const payload = fs.readFileSync(this.filePath, 'utf8');
    this.items = JSON.parse(this.secrets.decrypt(payload));
  }

  private persist(): void {
    const payload = this.secrets.encrypt(JSON.stringify(this.items));
    fs.writeFileSync(this.filePath, payload, { mode: 0o600 });
  }

  list(): ConnectionConfig[] {
    return [...this.items];
  }

  get(id: string): ConnectionConfig | undefined {
    return this.items.find((c) => c.id === id);
  }

  create(input: ConnectionInput): ConnectionConfig {
    const now = new Date().toISOString();
    const config: ConnectionConfig = {
      ...input,
      id: nanoid(10),
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(config);
    this.persist();
    return config;
  }

  update(id: string, input: ConnectionInput): ConnectionConfig | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const password =
      input.password === PASSWORD_UNCHANGED ? existing.password : input.password;
    const updated: ConnectionConfig = {
      ...existing,
      ...input,
      password,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.items = this.items.map((c) => (c.id === id ? updated : c));
    this.persist();
    return updated;
  }

  delete(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((c) => c.id !== id);
    if (this.items.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }
}
