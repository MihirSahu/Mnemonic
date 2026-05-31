import * as React from 'react';
import { cn } from '@/src/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-32 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

