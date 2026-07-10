import type { ConnectionConfig, EngineKind } from '@fluentdb/shared';
import type { Driver, DriverFactory } from './types.js';
import { SqliteDriver } from './sqlite/driver.js';
import { PostgresDriver } from './postgres/driver.js';
import { MysqlDriver } from './mysql/driver.js';

const factories: Record<EngineKind, DriverFactory> = {
  sqlite: (config) => new SqliteDriver(config),
  postgres: (config, database) => new PostgresDriver(config, database),
  mysql: (config, database) => new MysqlDriver(config, database),
};

export function createDriver(
  config: ConnectionConfig,
  database?: string,
): Driver {
  return factories[config.engine](config, database);
}
