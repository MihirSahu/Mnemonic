import * as React from 'react';
import { cn } from '@/src/lib/utils';

export const Badge = ({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'secondary' | 'outline' | 'destructive' }) => {
  const variants = {
    default: 'bg-cyan-800 text-white',
    secondary: 'bg-slate-200 text-slate-800',
    outline: 'border border-slate-300 bg-white text-slate-700',
    destructive: 'bg-red-100 text-red-800'
  };
  return (
    <span
      className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', variants[variant], className)}
      {...props}
    />
  );
};

