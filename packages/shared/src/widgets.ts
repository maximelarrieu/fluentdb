import { z } from 'zod';

export type WidgetViz = 'number' | 'bar' | 'line' | 'pie' | 'table';
export type WidgetSize = 'sm' | 'md' | 'lg';
/** Bar orientation (bar viz only). */
export type WidgetOrientation = 'horizontal' | 'vertical';

/** A dashboard widget: a saved read-only query rendered as a visualization. */
export interface DashboardWidget {
  id: string;
  title: string;
  sql: string;
  viz: WidgetViz;
  size: WidgetSize;
  /** Bar orientation — 'horizontal' by default; ignored by non-bar viz. */
  orientation: WidgetOrientation;
  /** Ordering within the dashboard (ascending). */
  position: number;
}

export const widgetVizSchema = z.enum(['number', 'bar', 'line', 'pie', 'table']);
export const widgetSizeSchema = z.enum(['sm', 'md', 'lg']);
export const widgetOrientationSchema = z.enum(['horizontal', 'vertical']);

export const widgetInputSchema = z.object({
  title: z.string().min(1).max(200),
  sql: z.string().min(1).max(20_000),
  viz: widgetVizSchema,
  size: widgetSizeSchema.default('md'),
  orientation: widgetOrientationSchema.default('horizontal'),
});
export type WidgetInput = z.infer<typeof widgetInputSchema>;

/** Partial update — any subset of the editable fields. */
export const widgetPatchSchema = widgetInputSchema.partial();
export type WidgetPatch = z.infer<typeof widgetPatchSchema>;

// --- AI widget generation (natural language → query + viz) ---

export const aiWidgetRequestSchema = z.object({
  connectionId: z.string(),
  database: z.string().optional(),
  description: z.string().min(1).max(2_000),
});
export type AiWidgetRequest = z.infer<typeof aiWidgetRequestSchema>;

export const aiWidgetProposalSchema = z.object({
  title: z.string(),
  sql: z.string(),
  viz: widgetVizSchema,
});
export type AiWidgetProposal = z.infer<typeof aiWidgetProposalSchema>;
