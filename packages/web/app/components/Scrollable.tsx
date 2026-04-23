'use client';

import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from 'overlayscrollbars-react';
import type { CSSProperties, ReactNode, Ref } from 'react';

export type ScrollableRef = OverlayScrollbarsComponentRef;

interface ScrollableProps {
  ref?: Ref<ScrollableRef>;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Scroll container with the always-visible `os-theme-closer` overlay scrollbar.
 * Use instead of `<div className="overflow-y-auto">` whenever the container
 * renders dynamic direct children (lists that reorder/remove, conditional
 * mounts). The global `GlobalScrollbarOverlay` hijack moves children into an
 * internal viewport, which conflicts with React reconciliation on those
 * hosts (see root CLAUDE.md → "Scroll containers"). This component integrates
 * OverlayScrollbars the React-safe way.
 */
export function Scrollable({ ref, children, className, style }: ScrollableProps) {
  return (
    <OverlayScrollbarsComponent
      ref={ref}
      className={className}
      style={style}
      options={{ scrollbars: { theme: 'os-theme-closer', autoHide: 'never' } }}
      defer
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}
