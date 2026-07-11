export type HealthSeverity = 'ok' | 'info' | 'warn' | 'critical';

export type HealthCategory =
  | 'performance'
  | 'indexes'
  | 'maintenance'
  | 'schema'
  | 'connections';

export interface HealthFinding {
  /** Stable id of the check that produced this finding. */
  id: string;
  category: HealthCategory;
  severity: HealthSeverity;
  title: string;
  /** One or two sentences of human-facing explanation. */
  detail: string;
  /** Optional remediation SQL the user can review and run (never auto-run). */
  remediationSql?: string | null;
  /** Optional small supporting table (e.g. the offending rows). */
  table?: { columns: string[]; rows: (string | number | null)[][] } | null;
}

export interface HealthReport {
  engine: string;
  generatedAt: string;
  findings: HealthFinding[];
}

export const healthCategoryLabels: Record<HealthCategory, string> = {
  performance: 'Performance',
  indexes: 'Index',
  maintenance: 'Maintenance',
  schema: 'Schéma',
  connections: 'Connexions',
};
