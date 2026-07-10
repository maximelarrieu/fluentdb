import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Plug, RefreshCw } from 'lucide-react';
import type { ConnectionInput, DetectedDbContainer } from '@fluentdb/shared';
import { engineLabels } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Badge, EmptyState, Spinner } from '../../components/ui/misc.js';

export function DockerPanel({
  onUse,
}: {
  onUse: (draft: Partial<ConnectionInput>) => void;
}) {
  const [refetchKey, setRefetchKey] = useState(0);
  const status = useQuery({
    queryKey: ['docker-status', refetchKey],
    queryFn: api.dockerStatus,
  });
  const dbs = useQuery({
    queryKey: ['docker-dbs', refetchKey],
    queryFn: api.dockerDatabases,
    enabled: status.data?.available === true,
  });

  if (status.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted p-4">
        <Spinner /> Détection de Docker…
      </div>
    );
  }

  if (!status.data?.available) {
    return (
      <div className="p-4 text-xs text-muted">
        Docker n'est pas détecté sur cette machine. Démarre le démon Docker
        pour repérer automatiquement tes bases conteneurisées.
      </div>
    );
  }

  const containers = dbs.data ?? [];

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted flex items-center gap-1.5">
          <Boxes size={13} /> Bases détectées dans Docker
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setRefetchKey((k) => k + 1)}
        >
          <RefreshCw size={13} />
        </Button>
      </div>

      {dbs.isLoading && <Spinner />}
      {!dbs.isLoading && containers.length === 0 && (
        <p className="text-xs text-muted/70 py-2">
          Aucun conteneur de base de données trouvé.
        </p>
      )}

      {containers.map((c) => (
        <DockerRow key={c.containerId} c={c} onUse={onUse} />
      ))}
    </div>
  );
}

function DockerRow({
  c,
  onUse,
}: {
  c: DetectedDbContainer;
  onUse: (draft: Partial<ConnectionInput>) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel-2 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium truncate">
            {c.containerName}
          </span>
          <Badge tone={c.running ? 'green' : 'default'}>
            {c.running ? 'running' : 'stopped'}
          </Badge>
        </div>
        <div className="text-[11px] text-muted truncate mono">
          {engineLabels[c.engine]} · {c.image}
          {c.hostPort ? ` · :${c.hostPort}` : ' · port non publié'}
        </div>
      </div>
      <Button
        size="sm"
        variant="default"
        disabled={!c.hostPort}
        title={c.hostPort ? '' : 'Aucun port publié sur l’hôte'}
        onClick={() =>
          onUse({
            name: c.suggested.name,
            engine: c.suggested.engine,
            host: c.suggested.host,
            port: c.suggested.port ?? undefined,
            user: c.suggested.user,
            password: c.suggested.password,
            database: c.suggested.database,
            color: 'blue',
          })
        }
      >
        <Plug size={13} /> Utiliser
      </Button>
    </div>
  );
}

export { EmptyState };
