'use client';

import { cn } from '@/lib/utils';

/**
 * Small red indicator dot for the top-right corner of a host element. The host
 * must be positioned (e.g. `relative`). Render only when an error state is
 * active; callers gate on their own boolean. Pass `className` to override the
 * default offsets for a tighter or looser placement.
 */
export function ErrorDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive', className)}
    />
  );
}
