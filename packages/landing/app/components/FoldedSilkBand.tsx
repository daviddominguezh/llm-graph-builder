'use client';

import { useEffect, useRef } from 'react';
import { createFoldedSilk } from '../lib/foldedSilk';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function FoldedSilkBand() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const silk = createFoldedSilk(container);
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
  }, []);

  return (
    <section aria-hidden="true" className="relative h-[720px] w-full overflow-hidden bg-white">
      <div ref={containerRef} className="absolute inset-0" />
    </section>
  );
}
