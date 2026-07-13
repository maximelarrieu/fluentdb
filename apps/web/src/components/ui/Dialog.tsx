import React from 'react';
import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40" />
        <RD.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[520px] max-w-[92vw] max-h-[88vh] overflow-auto',
            'rounded-xl border border-border bg-panel shadow-2xl',
            className,
          )}
        >
          <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-border-soft">
            <div>
              <RD.Title className="text-sm font-semibold">{title}</RD.Title>
              {description && (
                <RD.Description className="text-xs text-muted mt-0.5">
                  {description}
                </RD.Description>
              )}
            </div>
            <RD.Close
              className="text-muted hover:text-text p-1 -mr-1"
              aria-label="Fermer"
            >
              <X size={16} aria-hidden="true" />
            </RD.Close>
          </div>
          <div className="p-5">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
