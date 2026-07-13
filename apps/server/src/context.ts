import type { ConnectionsStore } from './store/connectionsStore.js';
import type { HistoryStore } from './store/historyStore.js';
import type { TasksStore } from './store/tasksStore.js';
import type { AiContextStore } from './store/aiContextStore.js';
import type { DashboardStore } from './store/dashboardStore.js';
import type { ConnectionManager } from './services/connectionManager.js';
import type { QueryRunner } from './services/queryRunner.js';
import type { Scheduler } from './services/scheduler.js';
import type { DockerClient } from './docker/dockerClient.js';
import type { AiProvider } from './ai/types.js';

export interface AppContext {
  store: ConnectionsStore;
  history: HistoryStore;
  tasks: TasksStore;
  aiContext: AiContextStore;
  dashboards: DashboardStore;
  manager: ConnectionManager;
  runner: QueryRunner;
  scheduler: Scheduler;
  docker: DockerClient;
  ai: AiProvider | null;
}
