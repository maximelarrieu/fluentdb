import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, RefreshCw, KeyRound, Search } from 'lucide-react';
import type { DbRole } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Spinner, EmptyState, Badge } from '../../components/ui/misc.js';
import { Button } from '../../components/ui/Button.js';
import { useWorkspace } from '../../stores/workspace.js';

export function RolesView() {
  const { active, database } = useWorkspace();
  const [filter, setFilter] = useState('');

  const roles = useQuery({
    queryKey: ['roles', active?.id, database],
    queryFn: () => api.roles(active!.id, database),
    enabled: !!active,
  });

  const rows = useMemo(() => {
    const all = roles.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => r.name.toLowerCase().includes(q));
  }, [roles.data, filter]);

  if (!active) return <EmptyState title="Aucune connexion active" />;

  const loginCount = (roles.data ?? []).filter((r) => r.canLogin).length;

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-3 px-4 h-11 border-b border-border sticky top-0 bg-bg z-10">
        <Users size={15} className="text-accent" />
        <span className="text-[13px] font-semibold">Rôles &amp; privilèges</span>
        <span className="text-[11px] text-muted">
          {(roles.data ?? []).length} rôle(s)
          {loginCount > 0 && ` · ${loginCount} avec login`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer…"
              className="h-7 pl-6 pr-2 text-[12px] rounded-md bg-panel-2 border border-border w-40 focus:outline-none focus:border-accent"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => roles.refetch()}
            disabled={roles.isFetching}
          >
            {roles.isFetching ? <Spinner /> : <RefreshCw size={13} />} Actualiser
          </Button>
        </div>
      </div>

      {roles.isLoading ? (
        <Spinner className="m-4" />
      ) : roles.isError ? (
        <div className="p-4 text-sm text-red">
          {(roles.error as Error).message}
        </div>
      ) : (roles.data ?? []).length === 0 ? (
        <EmptyState
          icon={<KeyRound size={40} strokeWidth={1.2} />}
          title="Aucun rôle"
          hint="Ce moteur n'expose pas de système de rôles/privilèges."
        />
      ) : rows.length === 0 ? (
        <EmptyState title="Aucun rôle ne correspond au filtre" />
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead className="bg-panel-2 border-b border-border">
              <tr className="text-left text-muted">
                <th className="px-3 py-1.5 font-medium">Rôle</th>
                <th className="px-3 py-1.5 font-medium">Login</th>
                <th className="px-3 py-1.5 font-medium">Attributs / privilèges</th>
                <th className="px-3 py-1.5 font-medium">Membre de</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: DbRole) => (
                <tr
                  key={r.name}
                  className="border-b border-border-soft/40 hover:bg-panel-2/40 align-top"
                >
                  <td className="px-3 py-1.5 mono font-medium">{r.name}</td>
                  <td className="px-3 py-1.5">
                    {r.canLogin ? (
                      <span className="text-green">oui</span>
                    ) : (
                      <span className="text-muted">non</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.attributes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.attributes.map((a) => (
                          <Badge key={a}>{a}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.memberOf.length > 0 ? (
                      <span className="mono text-muted">
                        {r.memberOf.join(', ')}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
