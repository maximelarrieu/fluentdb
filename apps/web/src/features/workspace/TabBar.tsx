import { Table2, FileCode2, Columns3, X, Plus } from 'lucide-react';
import { useWorkspace, type Tab } from '../../stores/workspace.js';
import { cn } from '../../lib/cn.js';

const icons: Record<Tab['kind'], React.ReactNode> = {
  table: <Table2 size={13} className="text-accent" />,
  query: <FileCode2 size={13} className="text-green" />,
  structure: <Columns3 size={13} className="text-amber" />,
};

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, openQuery } =
    useWorkspace();

  return (
    <div className="flex items-stretch h-9 bg-panel border-b border-border overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            'group flex items-center gap-2 px-3 border-r border-border-soft cursor-pointer whitespace-nowrap',
            tab.id === activeTabId
              ? 'bg-bg text-text'
              : 'text-muted hover:text-text hover:bg-panel-2/50',
          )}
        >
          {icons[tab.kind]}
          <span className="text-[13px] max-w-[180px] truncate">
            {tab.title}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="text-muted/50 hover:text-text opacity-0 group-hover:opacity-100"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={() => openQuery()}
        className="flex items-center px-2.5 text-muted hover:text-text"
        title="Nouvel onglet SQL"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
