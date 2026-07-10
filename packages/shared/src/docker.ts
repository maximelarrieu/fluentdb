import type { EngineKind } from './connections.js';

export interface DockerStatus {
  available: boolean;
  detail?: string;
}

export interface DetectedDbContainer {
  containerId: string;
  containerName: string;
  image: string;
  engine: EngineKind;
  running: boolean;
  /** First published host port matching the engine's default port, if any */
  hostPort: number | null;
  /** Prefilled connection draft built from image + env heuristics */
  suggested: {
    name: string;
    engine: EngineKind;
    host: string;
    port: number | null;
    user?: string;
    password?: string;
    database?: string;
  };
}
