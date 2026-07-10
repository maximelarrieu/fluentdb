import React from 'react';
import { cn } from '../../lib/cn.js';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 w-full rounded-md bg-bg border border-border px-2.5 text-[13px]',
      'placeholder:text-muted/60 outline-none',
      'focus:border-accent focus:ring-1 focus:ring-accent/40',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-8 w-full rounded-md bg-bg border border-border px-2 text-[13px]',
      'outline-none focus:border-accent focus:ring-1 focus:ring-accent/40',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted/70">{hint}</span>}
    </label>
  );
}
