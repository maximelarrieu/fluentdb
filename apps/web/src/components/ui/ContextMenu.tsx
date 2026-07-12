import * as CM from '@radix-ui/react-context-menu';
import type { ReactNode } from 'react';

/**
 * Right-click context menu, styled to match the app's dropdowns. Wrap any
 * element as the trigger; pass the menu body (CtxItem / CtxSeparator / CtxLabel)
 * as `menu`.
 */
export function ContextMenu({
  children,
  menu,
}: {
  children: ReactNode;
  menu: ReactNode;
}) {
  return (
    <CM.Root>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content
          className="z-50 min-w-[210px] rounded-lg border border-border bg-panel-2 p-1 shadow-xl"
          collisionPadding={8}
        >
          {menu}
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}

export function CtxItem({
  children,
  icon,
  onSelect,
  danger,
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <CM.Item
      onSelect={onSelect}
      disabled={disabled}
      className={`flex items-center gap-2 rounded px-2 py-1.5 text-[13px] cursor-pointer outline-none data-[disabled]:opacity-40 data-[disabled]:cursor-default ${
        danger
          ? 'text-red data-[highlighted]:bg-red/10'
          : 'data-[highlighted]:bg-panel'
      }`}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="truncate">{children}</span>
    </CM.Item>
  );
}

export function CtxSeparator() {
  return <CM.Separator className="my-1 h-px bg-border-soft" />;
}

export function CtxLabel({ children }: { children: ReactNode }) {
  return (
    <CM.Label className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted truncate">
      {children}
    </CM.Label>
  );
}
