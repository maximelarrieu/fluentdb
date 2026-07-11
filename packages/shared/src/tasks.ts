import { z } from 'zod';
import type { CellValue, QueryColumn } from './query.js';

export const taskScheduleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('daily'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal('interval'),
    everyMinutes: z.number().int().min(1).max(60 * 24 * 7),
  }),
]);
export type TaskSchedule = z.infer<typeof taskScheduleSchema>;

export const alertOps = ['gt', 'gte', 'lt', 'lte'] as const;
export type AlertOp = (typeof alertOps)[number];
export const alertOpSymbol: Record<AlertOp, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

/**
 * User-defined threshold on a numeric column of the task's result. A run
 * "breaches" when any row satisfies `value <op> threshold`.
 */
export const taskAlertSchema = z.object({
  column: z.string().min(1),
  op: z.enum(alertOps),
  threshold: z.number(),
});
export type TaskAlert = z.infer<typeof taskAlertSchema>;

export const scheduledTaskInputSchema = z.object({
  name: z.string().min(1).max(120),
  connectionId: z.string().min(1),
  database: z.string().nullable().optional(),
  sql: z.string().min(1),
  schedule: taskScheduleSchema,
  enabled: z.boolean().default(true),
  alert: taskAlertSchema.nullable().optional(),
});
export type ScheduledTaskInput = z.infer<typeof scheduledTaskInputSchema>;

export type TaskRunStatus = 'ok' | 'error';

export interface ScheduledTask {
  id: string;
  name: string;
  connectionId: string;
  connectionName: string;
  database: string | null;
  sql: string;
  schedule: TaskSchedule;
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: TaskRunStatus | null;
  lastRowCount: number | null;
  lastError: string | null;
  lastSnapshotId: number | null;
  alert: TaskAlert | null;
  /** Breach summary of the latest run, or null when it didn't breach. */
  lastAlert: string | null;
}

export interface TaskSnapshot {
  id: number;
  taskId: string;
  ranAt: string;
  status: TaskRunStatus;
  durationMs: number;
  rowCount: number;
  columns: QueryColumn[];
  rows: CellValue[][];
  truncated: boolean;
  error: string | null;
  /** Threshold breach summary for this run, or null. */
  alert: string | null;
}
