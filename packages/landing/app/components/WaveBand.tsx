'use client';

import { useEffect, useRef } from 'react';
import { createSilkRibbon } from '../lib/silkRibbon';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WaveBand() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ribbon = createSilkRibbon(container);
    const reduced = prefersReducedMotion();

    if (reduced) {
      ribbon.renderStill();
    } else {
      ribbon.start();
    }

    const observer = new ResizeObserver(() => {
      ribbon.resize();
      if (reduced) ribbon.renderStill();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      ribbon.dispose();
    };
  }, []);

  return (
    <section aria-hidden="true" className="relative h-[640px] w-full overflow-hidden bg-white">
      <div ref={containerRef} className="absolute inset-0" />
    </section>
  );
}
