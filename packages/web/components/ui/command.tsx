'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

function Command({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex h-full w-full flex-col overflow-hidden rounded-md', className)} {...props}>
      {children}
    </div>
  );
}

function CommandList({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)} {...props}>
      {children}
    </div>
  );
}

function CommandItem({
  className,
  children,
  onSelect,
  ...props
}: React.ComponentProps<'div'> & { onSelect?: () => void }) {
  return (
    <div
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
        className
      )}
      onClick={onSelect}
      role="option"
      aria-selected={false}
      {...props}
    >
      {children}
    </div>
  );
}

function CommandEmpty({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('py-6 text-center text-sm', className)} {...props}>
      {children}
    </div>
  );
}

function CommandInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Command, CommandList, CommandItem, CommandEmpty, CommandInput };
