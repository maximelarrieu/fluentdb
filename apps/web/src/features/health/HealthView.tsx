import { useQuery } from '@tanstack/react-query';
import {
  HeartPulse,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Info,
  FileCode2,
} from 'lucide-react';
import {
  healthCategoryLabels,
  type HealthCategory,
  type HealthFinding,
  type HealthSeverity,
} from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner, EmptyState } from '../../components/ui/misc.js';
import { useWorkspace } from '../../stores/workspace.js';

const SEVERITY_ORDER: Record<HealthSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
  ok: 3,
};

function SeverityIcon({ s }: { s: HealthSeverity }) {
  if (s === 'critical') return <ShieldAlert size={15} className="text-red shrink-0" />;
  if (s === 'warn') return <AlertTriangle size={15} className="text-amber shrink-0" />;
  if (s === 'ok') return <CheckCircle2 size={15} className="text-green shrink-0" />;
  return <Info size={15} className="text-accent shrink-0" />;
}

const CATEGORY_ORDER: HealthCategory[] = [
  'performance',
  'indexes',
  'maintenance',
  'schema',
  'connections',
];

function FindingCard({ f }: { f: HealthFinding }) {
  const { active, database, openQuery } = useWorkspace();
  const border =
    f.severity === 'critical'
      ? 'border-red/40'
      : f.severity === 'warn'
        ? 'border-amber/40'
        : 'border-border';
  return (
    <div className={`rounded-xl border ${border} bg-panel p-3 flex flex-col gap-2`}>
      <div className="flex items-start gap-2">
        <SeverityIcon s={f.severity} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{f.title}</div>
          <p className="text-[12px] text-muted mt-0.5">{f.detail}</p>
        </div>
      </div>

      {f.table && f.table.rows.length > 0 && (
        <div className="overflow-auto rounded-lg border border-border-soft max-h-56">
          <table className="w-full text-[12px] border-collapse">
            <thead className="bg-panel-2 sticky top-0">
              <tr>
                {f.table.columns.map((c) => (
                  <th key={c} className="text-left font-medium px-2 py-1 border-b border-border mono whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f.table.rows.map((row, i) => (
                <tr key={i} className="border-b border-border-soft/40">
                  {row.map((v, j) => (
                    <td key={j} className={`px-2 py-1 mono whitespace-nowrap ${v == null ? 'text-muted/50 italic' : ''}`}>
                      {v == null ? 'NULL' : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {f.remediationSql && (
        <div className="flex items-start gap-2">
          <pre className="flex-1 text-[11px] mono whitespace-pre-wrap bg-panel-2 rounded-lg p-2 overflow-auto max-h-32">
            {f.remediationSql}
          </pre>
          {active && (
            <Button
              size="sm"
              variant="ghost"
              title="Ouvrir dans un éditeur SQL"
              onClick={() => openQuery(f.remediationSql!)}
            >
              <FileCode2 size={13} /> Éditeur
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function HealthView() {
  const { active, database } = useWorkspace();
  const report = useQuery({
    queryKey: ['health', active?.id, database],
    queryFn: () => api.health(active!.id, database),
    enabled: !!active,
  });

  if (!active) {
    return <EmptyState title="Aucune connexion active" />;
  }

  const findings = report.data?.findings ?? [];
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: findings
      .filter((f) => f.category === cat)
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
  })).filter((g) => g.items.length > 0);

  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
  };

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-3 px-4 h-11 border-b border-border sticky top-0 bg-bg z-10">
        <HeartPulse size={15} className="text-accent" />
        <span className="text-[13px] font-semibold">Bilan de santé</span>
        {!report.isLoading && (
          <span className="text-[11px] text-muted">
            {counts.critical > 0 && (
              <span className="text-red">{counts.critical} critique(s) · </span>
            )}
            {counts.warn > 0 && (
              <span className="text-amber">{counts.warn} à surveiller · </span>
            )}
            {findings.length} constat(s)
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => report.refetch()}
          disabled={report.isFetching}
        >
          {report.isFetching ? <Spinner /> : <RefreshCw size={13} />} Actualiser
        </Button>
      </div>

      {report.isLoading ? (
        <Spinner className="m-4" />
      ) : report.isError ? (
        <div className="p-4 text-sm text-red">
          {(report.error as Error).message}
        </div>
      ) : findings.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={40} strokeWidth={1.2} className="text-green" />}
          title="Rien à signaler"
          hint="Aucun problème détecté par les vérifications disponibles pour ce moteur."
        />
      ) : (
        <div className="p-4 flex flex-col gap-5">
          {grouped.map((g) => (
            <div key={g.cat}>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-2">
                {healthCategoryLabels[g.cat]}
              </div>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
                {g.items.map((f) => (
                  <FindingCard key={f.id} f={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
