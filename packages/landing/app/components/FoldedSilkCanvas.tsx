'use client';

import { useEffect, useRef } from 'react';
import { createFoldedSilk, type FoldedSilkVariant } from '../lib/foldedSilk';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type FoldedSilkCanvasProps = {
  className: string;
  // Offsets the animation clock so multiple instances don't move in lockstep.
  timeOffset?: number;
  // 'solid' opaque silk on white (default) or 'fibrous' line strands on navy.
  variant?: FoldedSilkVariant;
};

export function FoldedSilkCanvas({ className, timeOffset = 0, variant = 'solid' }: FoldedSilkCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const silk = createFoldedSilk(container, timeOffset, variant);
    const reduced = prefersReducedMotion();

    if (reduced) {
      silk.renderStill();
    }

    const observer = new ResizeObserver(() => {
      silk.resize();
      if (reduced) silk.renderStill();
    });
    observer.observe(container);

    // Pause off-viewport, like the reference's controller.
    const intersection = new IntersectionObserver(
      (entries) => {
        if (reduced) return;
        if (entries.some((entry) => entry.isIntersecting)) {
          silk.start();
        } else {
          silk.pause();
        }
      },
      { threshold: 0, rootMargin: '20px 0px' }
    );
    intersection.observe(container);

    return () => {
      observer.disconnect();
      intersection.disconnect();
      silk.dispose();
    };
  }, [timeOffset, variant]);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
