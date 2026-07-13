import { useState } from 'react';
import { LayoutGrid, Gauge } from 'lucide-react';
import { BoardView } from './BoardView.js';
import { DashboardView } from '../tasks/DashboardView.js';

type Pane = 'widgets' | 'tasks';

/**
 * Single "Tableau de bord" entry hosting both dashboards behind one segmented
 * switch — custom SQL widgets and the scheduled-task monitoring overview — so
 * there's one dashboard concept in the nav instead of two competing ones.
 */
export function DashboardHub() {
  const [pane, setPane] = useState<Pane>('widgets');
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-3 h-10 border-b border-border bg-panel shrink-0">
        <Seg
          active={pane === 'widgets'}
          onClick={() => setPane('widgets')}
          icon={<LayoutGrid size={14} />}
          label="Widgets"
        />
        <Seg
          active={pane === 'tasks'}
          onClick={() => setPane('tasks')}
          icon={<Gauge size={14} />}
          label="Monitoring des tâches"
        />
      </div>
      <div className="flex-1 min-h-0">
        {pane === 'widgets' ? <BoardView /> : <DashboardView />}
      </div>
    </div>
  );
}

function Seg({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] transition-colors ${
        active
          ? 'bg-accent/12 text-accent'
          : 'text-muted hover:text-text hover:bg-panel-2'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
