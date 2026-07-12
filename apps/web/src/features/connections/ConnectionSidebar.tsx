import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  Database,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Circle,
  PanelLeftClose,
  PanelLeftOpen,
  Copy,
  FileCode2,
  Sun,
  Moon,
} from 'lucide-react';
import {
  engineLabels,
  type ConnectionInput,
  type ConnectionSummary,
} from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import {
  ContextMenu,
  CtxItem,
  CtxSeparator,
  CtxLabel,
} from '../../components/ui/ContextMenu.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';
import { useTheme } from '../../stores/theme.js';
import { ConnectionForm } from './ConnectionForm.js';
import { DockerPanel } from './DockerPanel.js';

const COLOR_HEX: Record<string, string> = {
  gray: '#8b93a7',
  blue: '#6d8bff',
  green: '#3fb884',
  amber: '#f0b429',
  red: '#f2555a',
  purple: '#a78bfa',
};

export function ConnectionSidebar() {
  const toast = useToast();
  const qc = useQueryClient();
  const { active, setActive, openQuery, sidebarCollapsed, toggleSidebar } =
    useWorkspace();
  const { theme, toggle: toggleTheme } = useTheme();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectionSummary | null>(null);
  const [initial, setInitial] = useState<Partial<ConnectionInput> | undefined>();

  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: api.listConnections,
  });

  const connect = useMutation({
    mutationFn: (c: ConnectionSummary) => api.connect(c.id),
    onSuccess: (r, c) => {
      setActive({
        id: c.id,
        name: c.name,
        engine: c.engine,
        capabilities: r.capabilities,
        database: c.database || undefined,
      });
      qc.invalidateQueries({ queryKey: ['connections'] });
      toast.push('success', `Connecté à ${c.name}`);
    },
    onError: (e: ApiError) => toast.push('error', e.message),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnect(id),
    onSuccess: (_r, id) => {
      if (active?.id === id) setActive(null);
      qc.invalidateQueries({ queryKey: ['connections'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: (_r, id) => {
      if (active?.id === id) setActive(null);
      qc.invalidateQueries({ queryKey: ['connections'] });
      toast.push('info', 'Connexion supprimée');
    },
  });

  const openNew = (draft?: Partial<ConnectionInput>) => {
    setEditing(null);
    setInitial(draft);
    setFormOpen(true);
  };

  // Collapsed: a thin rail keeping just the expand button reachable.
  if (sidebarCollapsed) {
    return (
      <div className="w-9 shrink-0 flex flex-col items-center border-r border-border bg-panel h-full pt-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => toggleSidebar(false)}
          title="Afficher les connexions"
          aria-label="Afficher le panneau des connexions"
        >
          <PanelLeftOpen size={16} aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 flex flex-col border-r border-border bg-panel h-full">
      <div className="flex items-center justify-between px-3 h-11 border-b border-border">
        <span className="text-[13px] font-semibold flex items-center gap-2">
          <Database size={15} className="text-accent" /> FluentDB
        </span>
        <div className="flex items-center">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
            aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          >
            {theme === 'dark' ? (
              <Sun size={15} aria-hidden="true" />
            ) : (
              <Moon size={15} aria-hidden="true" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => openNew()}
            title="Nouvelle connexion"
            aria-label="Nouvelle connexion"
          >
            <Plus size={16} aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => toggleSidebar(true)}
            title="Masquer le panneau"
            aria-label="Masquer le panneau des connexions"
          >
            <PanelLeftClose size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-2 py-2 flex flex-col gap-0.5">
          {connections.isLoading && <Spinner className="m-3" />}
          {connections.data?.length === 0 && (
            <p className="text-xs text-muted px-2 py-3">
              Aucune connexion. Crée-en une ou utilise la détection Docker
              ci-dessous.
            </p>
          )}
          {connections.data?.map((c) => (
            <ContextMenu
              key={c.id}
              menu={
                <>
                  <CtxLabel>{c.name}</CtxLabel>
                  {c.connected ? (
                    <CtxItem
                      icon={<PowerOff size={14} />}
                      onSelect={() => disconnect.mutate(c.id)}
                    >
                      Déconnecter
                    </CtxItem>
                  ) : (
                    <CtxItem
                      icon={<Power size={14} />}
                      onSelect={() => connect.mutate(c)}
                    >
                      Connecter
                    </CtxItem>
                  )}
                  {active?.id === c.id && (
                    <CtxItem
                      icon={<FileCode2 size={14} />}
                      onSelect={() => openQuery()}
                    >
                      Nouvelle requête
                    </CtxItem>
                  )}
                  <CtxSeparator />
                  <CtxItem
                    icon={<Copy size={14} />}
                    onSelect={() => {
                      void navigator.clipboard?.writeText(c.name);
                      toast.push('info', 'Nom copié');
                    }}
                  >
                    Copier le nom
                  </CtxItem>
                  <CtxItem
                    icon={<Pencil size={14} />}
                    onSelect={() => {
                      setEditing(c);
                      setInitial(undefined);
                      setFormOpen(true);
                    }}
                  >
                    Modifier
                  </CtxItem>
                  <CtxSeparator />
                  <CtxItem
                    danger
                    icon={<Trash2 size={14} />}
                    onSelect={() => remove.mutate(c.id)}
                  >
                    Supprimer
                  </CtxItem>
                </>
              }
            >
            <div
              className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer ${
                active?.id === c.id ? 'bg-panel-2' : 'hover:bg-panel-2/60'
              }`}
              onClick={() =>
                active?.id === c.id ? undefined : connect.mutate(c)
              }
            >
              <Circle
                size={8}
                fill={c.connected ? '#3fb884' : 'transparent'}
                className={c.connected ? 'text-green' : 'text-border'}
              />
              <span
                className="h-4 w-1 rounded-full shrink-0"
                style={{ background: COLOR_HEX[c.color ?? 'gray'] }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] truncate leading-tight">
                  {c.name}
                </div>
                <div className="text-[10px] text-muted truncate">
                  {engineLabels[c.engine]}
                </div>
              </div>

              <Dropdown.Root>
                <Dropdown.Trigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="opacity-0 group-hover:opacity-100 text-muted hover:text-text p-0.5">
                    <MoreVertical size={14} />
                  </button>
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 min-w-[170px] rounded-lg border border-border bg-panel-2 p-1 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.connected ? (
                      <MenuItem
                        onSelect={() => disconnect.mutate(c.id)}
                        icon={<PowerOff size={13} />}
                      >
                        Déconnecter
                      </MenuItem>
                    ) : (
                      <MenuItem
                        onSelect={() => connect.mutate(c)}
                        icon={<Power size={13} />}
                      >
                        Connecter
                      </MenuItem>
                    )}
                    <MenuItem
                      onSelect={() => {
                        setEditing(c);
                        setInitial(undefined);
                        setFormOpen(true);
                      }}
                      icon={<Pencil size={13} />}
                    >
                      Modifier
                    </MenuItem>
                    <MenuItem
                      danger
                      onSelect={() => remove.mutate(c.id)}
                      icon={<Trash2 size={13} />}
                    >
                      Supprimer
                    </MenuItem>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            </div>
            </ContextMenu>
          ))}
        </div>

        <div className="border-t border-border-soft mt-2">
          <DockerPanel onUse={openNew} />
        </div>
      </div>

      {formOpen && (
        <ConnectionForm
          open={formOpen}
          onOpenChange={setFormOpen}
          editing={editing}
          initial={initial}
        />
      )}
    </div>
  );
}

function MenuItem({
  children,
  icon,
  onSelect,
  danger,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <Dropdown.Item
      onSelect={onSelect}
      className={`flex items-center gap-2 rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none ${
        danger
          ? 'text-red data-[highlighted]:bg-red/10'
          : 'data-[highlighted]:bg-panel'
      }`}
    >
      {icon}
      {children}
    </Dropdown.Item>
  );
}
