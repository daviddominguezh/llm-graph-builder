'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

function Menubar({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex h-9 items-center space-x-1 rounded-md border bg-background p-1 shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
}

function MenubarMenu({ children }: { children: React.ReactNode }) {
  return <div className="relative">{children}</div>;
}

function MenubarTrigger({ className, children, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      className={cn(
        'flex cursor-pointer select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function MenubarContent({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'absolute top-full left-0 z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Menubar, MenubarMenu, MenubarTrigger, MenubarContent };
