import { useQuery } from '@tanstack/react-query';
import { api, type ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { CopyableSql } from '../../components/ui/CopyableSql.js';
import { Spinner } from '../../components/ui/misc.js';
import { useWorkspace } from '../../stores/workspace.js';

/** Shows the generated CREATE TABLE script for a base table, with copy. */
export function TableDdlDialog({
  table,
  schema,
  onClose,
}: {
  table: string;
  schema?: string;
  onClose: () => void;
}) {
  const { active, database } = useWorkspace();
  const connId = active!.id;

  const ddl = useQuery({
    queryKey: ['table-ddl', connId, database, schema, table],
    queryFn: () => api.tableDdl(connId, table, database, schema),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`CREATE — ${table}`}
      description="Script de structure généré (à copier dans une migration)"
      className="w-[720px]"
    >
      {ddl.isLoading && <Spinner />}
      {ddl.isError && (
        <p className="text-xs text-red">{(ddl.error as ApiError).message}</p>
      )}
      {ddl.data &&
        (ddl.data.ddl ? (
          <CopyableSql sql={ddl.data.ddl} />
        ) : (
          <p className="text-[13px] text-muted">
            Aucun script disponible pour cet objet.
          </p>
        ))}
    </Dialog>
  );
}
