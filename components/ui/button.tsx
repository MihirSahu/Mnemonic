import * as React from 'react';
import { cn } from '@/src/lib/utils';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
  size?: 'sm' | 'default' | 'icon';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-cyan-800 text-white hover:bg-cyan-900',
      outline: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
      ghost: 'text-slate-700 hover:bg-slate-100',
      destructive: 'bg-red-700 text-white hover:bg-red-800',
      secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300'
    };
    const sizes = {
      sm: 'h-8 px-3 text-sm',
      default: 'h-9 px-4 text-sm',
      icon: 'h-9 w-9'
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

