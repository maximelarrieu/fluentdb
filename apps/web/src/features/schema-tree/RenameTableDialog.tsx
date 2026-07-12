import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';

/** Rename a table via the previewed DDL flow (ALTER TABLE … RENAME TO …). */
export function RenameTableDialog({
  table,
  schema,
  onClose,
}: {
  table: string;
  schema?: string;
  onClose: () => void;
}) {
  const { active, database, bumpSchema } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(table);

  const rename = useMutation({
    mutationFn: async () => {
      const change = {
        kind: 'renameTable' as const,
        table,
        schema,
        newName: name.trim(),
      };
      const preview = await api.ddlPreview(active!.id, change, database);
      await api.ddlApply(active!.id, preview.statements, database);
    },
    onSuccess: () => {
      toast.push('success', 'Table renommée');
      qc.invalidateQueries({ queryKey: ['tables', active!.id] });
      bumpSchema();
      onClose();
    },
    onError: (e) =>
      toast.push('error', e instanceof ApiError ? e.message : String(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Renommer « ${table} »`}
      description="La table sera renommée. Les vues ou requêtes qui la référencent devront être mises à jour."
      className="w-[480px]"
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Nouveau nom</span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && rename.mutate()}
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || name.trim() === table || rename.isPending}
            onClick={() => rename.mutate()}
          >
            {rename.isPending && <Spinner className="text-white" />} Renommer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
