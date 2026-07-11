import { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { QueryPlanResponse, StatementKind } from '@fluentdb/shared';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/misc.js';
import { formatNumber } from '../../lib/format.js';

const KIND_LABEL: Record<StatementKind, string> = {
  read: 'lecture',
  write: 'écriture',
  ddl: 'structure',
  other: 'autre',
};
const KIND_TONE: Record<StatementKind, 'default' | 'accent' | 'amber' | 'red'> = {
  read: 'default',
  write: 'amber',
  ddl: 'red',
  other: 'default',
};

/**
 * Safe-by-design gate: shows exactly what a write/DDL script will do
 * (per-statement type, estimated affected rows, danger warnings) and
 * requires an explicit confirmation before anything is executed.
 */
export function ConfirmExecutionDialog({
  plan,
  onConfirm,
  onCancel,
  onSkipSession,
}: {
  plan: QueryPlanResponse;
  onConfirm: () => void;
  onCancel: () => void;
  onSkipSession: (skip: boolean) => void;
}) {
  const [skip, setSkip] = useState(false);
  const hasWarnings = plan.statements.some((s) => s.warnings.length > 0);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onCancel()}
      title="Confirmer l'exécution"
      description="Cette requête modifie des données ou la structure. Vérifie avant de lancer."
      className="w-[560px]"
    >
      <div className="flex flex-col gap-3">
        {hasWarnings && (
          <div className="flex items-start gap-2 rounded-md bg-red/10 border border-red/30 px-3 py-2 text-[13px] text-red">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>
              Opération potentiellement dangereuse — relis les avertissements
              ci-dessous.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2 max-h-[46vh] overflow-auto">
          {plan.statements.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-panel-2 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border-soft">
                <Badge tone={KIND_TONE[s.kind]}>{KIND_LABEL[s.kind]}</Badge>
                <span className="text-xs text-muted mono">{s.operation}</span>
                {s.estimatedRows != null && (
                  <span
                    className={`ml-auto text-xs ${
                      s.exactRows ? 'text-text' : 'text-muted'
                    }`}
                  >
                    {s.exactRows
                      ? `${formatNumber(s.estimatedRows)} ligne(s) concernée(s)`
                      : `≈ ${formatNumber(s.estimatedRows)} ligne(s) estimée(s)`}
                  </span>
                )}
              </div>
              <pre className="px-2.5 py-2 text-[12px] mono whitespace-pre-wrap overflow-auto max-h-32">
                {s.sql}
              </pre>
              {s.warnings.map((w, j) => (
                <div
                  key={j}
                  className="flex items-start gap-2 px-2.5 py-1.5 text-[12px] text-amber bg-amber/10 border-t border-amber/20"
                >
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  {w}
                </div>
              ))}
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
          />
          Ne plus me demander pour cette session
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-soft">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            variant={hasWarnings ? 'danger' : 'primary'}
            onClick={() => {
              if (skip) onSkipSession(true);
              onConfirm();
            }}
          >
            Exécuter quand même
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
