import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PanelKey = 'connections' | 'tree' | 'assistant';

/** Default widths (px) and the allowed drag range for each side panel. */
export const PANEL_DEFAULTS: Record<PanelKey, number> = {
  connections: 256,
  tree: 240,
  assistant: 384,
};

export const PANEL_LIMITS: Record<PanelKey, [number, number]> = {
  connections: [180, 480],
  tree: [180, 560],
  assistant: [300, 680],
};

export function clampPanel(key: PanelKey, px: number): number {
  const [min, max] = PANEL_LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(px)));
}

interface PanelState {
  sizes: Record<PanelKey, number>;
  setSize: (key: PanelKey, px: number) => void;
  reset: (key: PanelKey) => void;
}

export const usePanels = create<PanelState>()(
  persist(
    (set) => ({
      sizes: { ...PANEL_DEFAULTS },
      setSize: (key, px) =>
        set((s) => ({ sizes: { ...s.sizes, [key]: clampPanel(key, px) } })),
      reset: (key) =>
        set((s) => ({ sizes: { ...s.sizes, [key]: PANEL_DEFAULTS[key] } })),
    }),
    { name: 'fluentdb.panels' },
  ),
);
