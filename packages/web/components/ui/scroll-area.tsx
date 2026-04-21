'use client';

import { cn } from '@/lib/utils';
import { OverlayScrollbarsComponent, type OverlayScrollbarsComponentProps } from 'overlayscrollbars-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type ScrollAreaElement = 'div' | 'section' | 'article' | 'main' | 'aside';

type ScrollAreaProps = {
  children?: ReactNode;
  className?: string;
  element?: ScrollAreaElement;
  options?: OverlayScrollbarsComponentProps['options'];
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

export function ScrollArea({
  children,
  className,
  element = 'div',
  options,
  ...rest
}: ScrollAreaProps) {
  return (
    <OverlayScrollbarsComponent
      element={element}
      className={cn('os-theme-closer', className)}
      options={{
        scrollbars: { autoHide: 'never', theme: 'os-theme-closer' },
        ...options,
      }}
      defer
      {...rest}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}
