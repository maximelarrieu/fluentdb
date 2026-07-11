import {
  Table2,
  FileCode2,
  Columns3,
  Workflow,
  Clock,
  LayoutDashboard,
  HeartPulse,
  X,
  Plus,
} from 'lucide-react';
import { useWorkspace, type Tab } from '../../stores/workspace.js';
import { useUnseenTaskCount } from '../tasks/notifications.js';
import { cn } from '../../lib/cn.js';

const icons: Record<Tab['kind'], React.ReactNode> = {
  table: <Table2 size={13} className="text-accent" />,
  query: <FileCode2 size={13} className="text-green" />,
  structure: <Columns3 size={13} className="text-amber" />,
  erd: <Workflow size={13} className="text-purple-400" />,
  tasks: <Clock size={13} className="text-accent" />,
  dashboard: <LayoutDashboard size={13} className="text-accent" />,
  health: <HeartPulse size={13} className="text-accent" />,
};

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, openQuery } =
    useWorkspace();
  const unseenTasks = useUnseenTaskCount();

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
          {tab.kind === 'tasks' && unseenTasks > 0 && (
            <span className="min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] flex items-center justify-center">
              {unseenTasks}
            </span>
          )}
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
