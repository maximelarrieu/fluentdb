import { Database, FileCode2, Sparkles } from 'lucide-react';
import { ToastProvider } from './components/ui/Toast.js';
import { Button } from './components/ui/Button.js';
import { EmptyState } from './components/ui/misc.js';
import { useWorkspace } from './stores/workspace.js';
import { ConnectionSidebar } from './features/connections/ConnectionSidebar.js';
import { SchemaTree } from './features/schema-tree/SchemaTree.js';
import { TabBar } from './features/workspace/TabBar.js';
import { TableView } from './features/data-grid/TableView.js';
import { QueryEditor } from './features/sql-editor/QueryEditor.js';
import { StructureView } from './features/structure/StructureView.js';
import { ErdView } from './features/erd/ErdView.js';
import { AssistantPanel } from './features/ai/AssistantPanel.js';
import { CommandPalette } from './features/search/CommandPalette.js';
import { TasksView } from './features/tasks/TasksView.js';
import { DashboardView } from './features/tasks/DashboardView.js';
import { TaskNotifier } from './features/tasks/TaskNotifier.js';

export function App() {
  return (
    <ToastProvider>
      <div className="h-full flex overflow-hidden">
        <ConnectionSidebar />
        <Workspace />
        <AssistantPanel />
        <CommandPalette />
        <TaskNotifier />
      </div>
    </ToastProvider>
  );
}

function Workspace() {
  const { active, tabs, activeTabId, openQuery, toggleAi } = useWorkspace();

  if (!active) {
    return (
      <div className="flex-1 flex flex-col">
        <EmptyState
          icon={<Database size={44} strokeWidth={1.2} />}
          title="Bienvenue dans FluentDB"
          hint="Sélectionne ou crée une connexion dans la barre latérale pour explorer tes bases de données. FluentDB détecte aussi automatiquement les bases lancées dans Docker."
        />
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex-1 flex min-w-0">
      <SchemaTree />
      <div className="flex-1 flex flex-col min-w-0">
        {tabs.length > 0 && <TabBar />}
        <div className="flex-1 min-h-0">
          {!activeTab ? (
            <EmptyState
              title={`Connecté à ${active.name}`}
              hint="Ouvre une table dans l'arbre, ou lance une requête SQL."
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => openQuery()}>
                    <FileCode2 size={14} /> Nouvelle requête
                  </Button>
                  <Button variant="default" onClick={() => toggleAi(true)}>
                    <Sparkles size={14} /> Assistant IA
                  </Button>
                </div>
              }
            />
          ) : activeTab.kind === 'table' ? (
            <TableView
              key={activeTab.id}
              table={activeTab.table}
              schema={activeTab.schema}
            />
          ) : activeTab.kind === 'structure' ? (
            <StructureView
              key={activeTab.id}
              table={activeTab.table}
              schema={activeTab.schema}
            />
          ) : activeTab.kind === 'erd' ? (
            <ErdView key={activeTab.id} />
          ) : activeTab.kind === 'tasks' ? (
            <TasksView key={activeTab.id} />
          ) : activeTab.kind === 'dashboard' ? (
            <DashboardView key={activeTab.id} />
          ) : (
            <QueryEditor
              key={activeTab.id}
              tabId={activeTab.id}
              sql={activeTab.sql}
            />
          )}
        </div>
      </div>
    </div>
  );
}
