import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { DdlChange } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';

/**
 * Preview-then-apply: shows the exact SQL the server generated for a
 * DdlChange and only runs it when the user confirms.
 */
export function DdlDialog({
  change,
  onClose,
  onApplied,
}: {
  change: DdlChange;
  table: string;
  schema?: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { active, database } = useWorkspace();
  const toast = useToast();
  const connId = active!.id;

  const preview = useQuery({
    queryKey: ['ddl-preview', connId, database, JSON.stringify(change)],
    queryFn: () => api.ddlPreview(connId, change, database),
  });

  const apply = useMutation({
    mutationFn: () => api.ddlApply(connId, preview.data!.statements, database),
    onSuccess: () => {
      toast.push('success', 'Modification appliquée');
      onApplied();
    },
    onError: (e: ApiError) => toast.push('error', e.message),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Aperçu de la modification"
      description="Vérifie le SQL avant de l'appliquer"
    >
      <div className="flex flex-col gap-3">
        {preview.isLoading && <Spinner />}
        {preview.isError && (
          <p className="text-red text-[13px]">
            {(preview.error as ApiError).message}
          </p>
        )}
        {preview.data && (
          <>
            <pre className="rounded-lg bg-bg border border-border p-3 text-[12px] mono text-green whitespace-pre-wrap overflow-auto max-h-64">
              {preview.data.statements.join(';\n\n')};
            </pre>
            {preview.data.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-[12px] text-amber bg-amber/10 rounded-md px-2.5 py-2"
              >
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                {w}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2 border-t border-border-soft">
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={() => apply.mutate()}
                disabled={apply.isPending}
              >
                {apply.isPending && <Spinner className="text-white" />}
                Appliquer
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
