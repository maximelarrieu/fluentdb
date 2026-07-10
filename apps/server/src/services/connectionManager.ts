import type { ConnectCapabilities, ConnectionConfig } from '@fluentdb/shared';
import { createDriver } from '../drivers/registry.js';
import { DriverError, type Driver } from '../drivers/types.js';
import type { ConnectionsStore } from '../store/connectionsStore.js';

interface LiveConnection {
  config: ConnectionConfig;
  /** database name -> driver; '' = the connection's default database */
  drivers: Map<string, Driver>;
}

/**
 * Holds live driver pools per (connection, database).
 * PG/MySQL pools are database-scoped, so switching database in the UI
 * lazily opens a sibling driver on the same connection config.
 */
export class ConnectionManager {
  private readonly live = new Map<string, LiveConnection>();

  constructor(private readonly store: ConnectionsStore) {}

  isConnected(id: string): boolean {
    return this.live.has(id);
  }

  async connect(id: string): Promise<ConnectCapabilities> {
    const config = this.store.get(id);
    if (!config) throw new DriverError('Connection not found', 404);

    await this.disconnect(id).catch(() => {});
    const driver = createDriver(config);
    await driver.connect();
    try {
      await driver.ping();
    } catch (err) {
      await driver.disconnect().catch(() => {});
      throw err;
    }
    this.live.set(id, { config, drivers: new Map([['', driver]]) });
    const version = await driver.serverVersion();
    return {
      multipleDatabases: driver.capabilities.multipleDatabases,
      schemas: driver.capabilities.schemas,
      cancelQuery: driver.capabilities.cancelQuery,
      transactionalDdl: driver.capabilities.transactionalDdl,
      alterColumn: driver.capabilities.alterColumn,
      estimateRows: driver.capabilities.estimateRows,
      serverVersion: version,
    };
  }

  async testConfig(config: ConnectionConfig): Promise<string> {
    const driver = createDriver(config);
    try {
      await driver.connect();
      await driver.ping();
      return await driver.serverVersion();
    } finally {
      await driver.disconnect().catch(() => {});
    }
  }

  async getDriver(id: string, database?: string): Promise<Driver> {
    const conn = this.live.get(id);
    if (!conn) throw new DriverError('Not connected — connect first', 409);
    const key =
      database && database !== conn.config.database && database !== ''
        ? database
        : '';
    const existing = conn.drivers.get(key);
    if (existing) return existing;
    const driver = createDriver(conn.config, key || undefined);
    await driver.connect();
    conn.drivers.set(key, driver);
    return driver;
  }

  getConfig(id: string): ConnectionConfig | undefined {
    return this.live.get(id)?.config ?? this.store.get(id);
  }

  async disconnect(id: string): Promise<void> {
    const conn = this.live.get(id);
    if (!conn) return;
    this.live.delete(id);
    await Promise.allSettled(
      [...conn.drivers.values()].map((d) => d.disconnect()),
    );
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled([...this.live.keys()].map((id) => this.disconnect(id)));
  }
}
