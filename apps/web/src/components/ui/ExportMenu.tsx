import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Download, Copy, ChevronDown } from 'lucide-react';
import type { ExportFormat } from '@fluentdb/shared';
import { Button } from './Button.js';
import {
  EXPORT_LABEL,
  exportFormatOrder,
} from '../../lib/exportDownload.js';

const menuContent =
  'z-50 min-w-[200px] rounded-lg border border-border bg-panel-2 p-1 shadow-xl';
const menuItem =
  'flex items-center gap-2 rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[highlighted]:bg-panel';
const menuLabel = 'px-2 py-1 text-[11px] uppercase tracking-wide text-muted/70';

/**
 * "Exporter" dropdown: download the result set in any format, and (optionally)
 * copy the currently-visible rows to the clipboard for pasting elsewhere.
 */
export function ExportMenu({
  onExport,
  onCopy,
  size = 'sm',
  label = 'Exporter',
}: {
  onExport: (format: ExportFormat) => void;
  onCopy?: (kind: 'markdown' | 'tsv') => void;
  size?: 'sm' | 'icon';
  label?: string;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button size={size} variant="ghost">
          <Download size={13} />
          {size !== 'icon' && (
            <>
              {label} <ChevronDown size={12} className="opacity-60" />
            </>
          )}
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={4} className={menuContent}>
          <div className={menuLabel}>Télécharger</div>
          {exportFormatOrder.map((f) => (
            <Dropdown.Item
              key={f}
              onSelect={() => onExport(f)}
              className={menuItem}
            >
              <Download size={13} className="text-muted" /> {EXPORT_LABEL[f]}
            </Dropdown.Item>
          ))}
          {onCopy && (
            <>
              <Dropdown.Separator className="my-1 h-px bg-border" />
              <div className={menuLabel}>Copier (lignes affichées)</div>
              <Dropdown.Item
                onSelect={() => onCopy('markdown')}
                className={menuItem}
              >
                <Copy size={13} className="text-muted" /> Markdown
              </Dropdown.Item>
              <Dropdown.Item
                onSelect={() => onCopy('tsv')}
                className={menuItem}
              >
                <Copy size={13} className="text-muted" /> TSV (tableur)
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
