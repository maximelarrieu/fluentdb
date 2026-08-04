import { usePanels, clampPanel, type PanelKey } from '../../stores/panels.js';

interface Props {
  /** Which persisted panel this handle resizes. */
  panel: PanelKey;
  /**
   * Which edge of the panel the handle sits on. `right` for left-anchored
   * panels (dragging right grows them); `left` for the right-anchored panel
   * (dragging left grows it).
   */
  side: 'left' | 'right';
}

/**
 * A thin vertical splitter placed on the edge of a side panel. Drag to resize;
 * double-click resets to the default width. The width is persisted per panel.
 */
export function ResizeHandle({ panel, side }: Props) {
  const setSize = usePanels((s) => s.setSize);
  const reset = usePanels((s) => s.reset);

  const start = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = usePanels.getState().sizes[panel];
    const dir = side === 'right' ? 1 : -1;
    const onMove = (ev: MouseEvent) => {
      setSize(panel, clampPanel(panel, startW + dir * (ev.clientX - startX)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionner le panneau"
      title="Glisser pour redimensionner · double-clic pour réinitialiser"
      onMouseDown={start}
      onDoubleClick={() => reset(panel)}
      className={`absolute top-0 ${
        side === 'right' ? '-right-0.5' : '-left-0.5'
      } z-20 h-full w-1 cursor-col-resize hover:bg-accent/50 active:bg-accent transition-colors`}
    />
  );
}
