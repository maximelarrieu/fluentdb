import React from 'react';
import { cn } from '../../lib/cn.js';

type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-strong text-white hover:bg-accent border border-transparent',
  default:
    'bg-panel-2 text-text hover:bg-[#222735] border border-border',
  subtle: 'bg-transparent text-text hover:bg-panel-2 border border-transparent',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-panel-2 border border-transparent',
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
