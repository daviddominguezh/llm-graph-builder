'use client';

import { useEffect, useRef } from 'react';
import { createFoldedSilk, type FoldedSilkVariant } from '../lib/foldedSilk';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type FoldedSilkBandProps = {
  // Offsets the animation clock so multiple instances don't move in lockstep.
  timeOffset?: number;
  // 'solid' opaque surface (default) or 'fibrous' translucent thread strands.
  variant?: FoldedSilkVariant;
};

export function FoldedSilkBand({ timeOffset = 0, variant = 'solid' }: FoldedSilkBandProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const silk = createFoldedSilk(container, timeOffset, variant);
    const reduced = prefersReducedMotion();

    if (reduced) {
      silk.renderStill();
    } else {
      silk.start();
    }

    const observer = new ResizeObserver(() => {
      silk.resize();
      if (reduced) silk.renderStill();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      silk.dispose();
    };
  }, [timeOffset, variant]);

  return (
    <section aria-hidden="true" className="relative h-[720px] w-full overflow-hidden bg-white">
      <div ref={containerRef} className="absolute inset-0" />
    </section>
  );
}
