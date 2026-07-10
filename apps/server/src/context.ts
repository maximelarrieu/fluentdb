import type { ConnectionsStore } from './store/connectionsStore.js';
import type { HistoryStore } from './store/historyStore.js';
import type { ConnectionManager } from './services/connectionManager.js';
import type { QueryRunner } from './services/queryRunner.js';
import type { DockerClient } from './docker/dockerClient.js';
import type { AiProvider } from './ai/types.js';

export interface AppContext {
  store: ConnectionsStore;
  history: HistoryStore;
  manager: ConnectionManager;
  runner: QueryRunner;
  docker: DockerClient;
  ai: AiProvider | null;
}
