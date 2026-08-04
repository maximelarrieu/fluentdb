import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/** A SQL code block with a corner "Copier" button (clipboard). */
export function CopyableSql({
  sql,
  className = '',
}: {
  sql: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  return (
    <div className="relative">
      <button
        onClick={copy}
        aria-label="Copier le SQL"
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-[11px] text-muted hover:text-text hover:border-accent/50"
      >
        {copied ? (
          <>
            <Check size={12} className="text-green" /> Copié
          </>
        ) : (
          <>
            <Copy size={12} /> Copier
          </>
        )}
      </button>
      <pre
        className={`text-[12px] mono whitespace-pre-wrap bg-panel-2 rounded-lg p-3 pr-16 overflow-auto max-h-[60vh] ${className}`}
      >
        {sql}
      </pre>
    </div>
  );
}
