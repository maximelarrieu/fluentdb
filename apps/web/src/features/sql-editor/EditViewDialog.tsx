import { useQuery } from '@tanstack/react-query';
import type { TableInfo } from '@fluentdb/shared';
import { api, type ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Spinner } from '../../components/ui/misc.js';
import { useWorkspace } from '../../stores/workspace.js';
import { SaveAsViewDialog } from './SaveAsViewDialog.js';

type Dialect = 'postgres' | 'mysql' | 'sqlite';

/**
 * Edit an existing view: fetches its current definition, then opens the same
 * form as creation, pre-filled (name locked, SQL body + description editable).
 */
export function EditViewDialog({
  view,
  onClose,
}: {
  view: TableInfo;
  onClose: () => void;
}) {
  const { active, database } = useWorkspace();
  const connId = active!.id;
  const dialect = active!.engine as Dialect;

  const def = useQuery({
    queryKey: ['definition', connId, database, view.schema, view.name],
    queryFn: () => api.viewDefinition(connId, view.name, database, view.schema),
  });

  if (def.isLoading || def.isError || !def.data) {
    return (
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title="Modifier la vue"
        description="Chargement de la définition…"
        className="w-[620px]"
      >
        {def.isError ? (
          <p className="text-[13px] text-red">
            {(def.error as ApiError).message}
          </p>
        ) : (
          <Spinner />
        )}
      </Dialog>
    );
  }

  return (
    <SaveAsViewDialog
      mode="edit"
      sql={def.data.definition ?? ''}
      initialName={view.name}
      initialDescription={view.comment ?? ''}
      viewSchema={view.schema}
      materialized={view.kind === 'matview'}
      canMaterialized={active!.capabilities.materializedViews}
      dialect={dialect}
      onClose={onClose}
    />
  );
}
