import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CommentImportResult, SchemaDescriptions } from '@fluentdb/shared';
import { api, ApiError } from '../../api/client.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { CopyableSql } from '../../components/ui/CopyableSql.js';
import { Spinner } from '../../components/ui/misc.js';
import { useToast } from '../../components/ui/Toast.js';
import { useWorkspace } from '../../stores/workspace.js';

/** Loose parse of the uploaded JSON into the descriptions payload. */
function parseDescriptions(text: string): SchemaDescriptions {
  const raw = JSON.parse(text) as { tables?: unknown };
  if (!raw || !Array.isArray(raw.tables)) {
    throw new Error('JSON invalide : un objet avec un tableau « tables » est attendu.');
  }
  return { tables: raw.tables as SchemaDescriptions['tables'] };
}

export function ImportDescriptionsDialog({ onClose }: { onClose: () => void }) {
  const { active, database, schema, bumpSchema } = useWorkspace();
  const toast = useToast();
  const connId = active!.id;
  const fileRef = useRef<HTMLInputElement>(null);
  const [descriptions, setDescriptions] = useState<SchemaDescriptions | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CommentImportResult | null>(null);

  const loadFile = async (file: File) => {
    setParseError(null);
    setPreview(null);
    try {
      const text = await file.text();
      const parsed = parseDescriptions(text);
      setDescriptions(parsed);
      setFileName(file.name);
      previewMut.mutate(parsed);
    } catch (e) {
      setDescriptions(null);
      setParseError((e as Error).message);
    }
  };

  const previewMut = useMutation({
    mutationFn: (d: SchemaDescriptions) =>
      api.importComments(connId, { descriptions: d, database, schema, apply: false }),
    onSuccess: (r) => setPreview(r),
    onError: (e: ApiError) => setParseError(e.message),
  });

  const applyMut = useMutation({
    mutationFn: () =>
      api.importComments(connId, {
        descriptions: descriptions!,
        database,
        schema,
        apply: true,
      }),
    onSuccess: (r) => {
      toast.push(
        'success',
        `${r.tableComments} commentaire(s) de table et ${r.columnComments} de colonne appliqué(s)`,
      );
      bumpSchema();
      onClose();
    },
    onError: (e: ApiError) => toast.push('error', e.message),
  });

  const nbToWrite = preview
    ? preview.tableComments + preview.columnComments
    : 0;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Importer des descriptions"
      description="Écrit les descriptions d'un fichier JSON dans les commentaires des tables et colonnes correspondantes."
      className="w-[680px]"
    >
      <div className="flex flex-col gap-4">
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
            }}
          />
          <Button variant="default" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Choisir un fichier JSON…
          </Button>
          {fileName && (
            <span className="ml-2 text-[12px] text-muted">{fileName}</span>
          )}
          <p className="text-[11px] text-muted/70 mt-1.5">
            Format attendu : {'{'} "tables": [{'{'} "name", "description",
            "columns": [{'{'} "name", "description" {'}'}] {'}'}] {'}'}. La
            correspondance se fait par nom exact.
          </p>
        </div>

        {parseError && (
          <div className="flex items-start gap-2 text-[12px] text-red bg-red/10 rounded-md px-2.5 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            {parseError}
          </div>
        )}

        {previewMut.isPending && <Spinner />}

        {preview && (
          <>
            <div className="rounded-lg border border-border bg-panel p-3 text-[12px] flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green" />
                <span>
                  <strong>{preview.tableComments}</strong> table(s) et{' '}
                  <strong>{preview.columnComments}</strong> colonne(s) à commenter.
                </span>
              </div>
              {(preview.missingTables.length > 0 ||
                preview.missingColumns.length > 0) && (
                <div className="text-muted">
                  Ignoré (introuvable dans le schéma) :{' '}
                  {preview.missingTables.length} table(s),{' '}
                  {preview.missingColumns.length} colonne(s).
                </div>
              )}
              {preview.engineNote && (
                <div className="flex items-start gap-2 text-amber">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  {preview.engineNote}
                </div>
              )}
            </div>

            {preview.statements.length > 0 && (
              <div>
                <span className="text-xs text-muted">
                  SQL généré ({preview.statements.length} instruction(s))
                </span>
                <div className="mt-1">
                  <CopyableSql
                    sql={preview.statements
                      .map((s) => `${s};`)
                      .join('\n')}
                  />
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border-soft">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!preview || nbToWrite === 0 || applyMut.isPending}
            onClick={() => applyMut.mutate()}
          >
            {applyMut.isPending && <Spinner className="text-current" />}
            Appliquer{nbToWrite > 0 ? ` (${nbToWrite})` : ''}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
