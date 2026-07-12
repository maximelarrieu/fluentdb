import React from 'react';
import { cn } from '../../lib/cn.js';

type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'icon';

/*
 * Quiet by design. The primary action reads as primary through a soft bronze
 * tint + accent text, not a saturated block — so a screen can carry several
 * actions without any of them shouting. `default`/`subtle`/`ghost` stay
 * neutral; the accent only appears where it earns attention.
 */
const variants: Record<Variant, string> = {
  primary:
    'bg-accent/12 text-accent hover:bg-accent/20 border border-accent/25',
  default:
    'bg-panel-2 text-text hover:bg-border/60 border border-border',
  subtle: 'bg-transparent text-text hover:bg-panel-2 border border-transparent',
  ghost:
    'bg-transparent text-muted hover:text-text hover:bg-panel-2 border border-transparent',
  danger: 'bg-transparent text-red hover:bg-red/10 border border-transparent',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
  icon: 'h-7 w-7 justify-center',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-md font-medium transition-colors select-none',
        'disabled:opacity-40 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
