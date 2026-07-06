'use client';

import { useEffect, useRef } from 'react';
import { createRadialBurst } from '../lib/radialBurst';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function RadialBurstCanvas({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const burst = createRadialBurst(container);
    const reduced = prefersReducedMotion();
    burst.resize();
    if (reduced) burst.renderStill();

    const observer = new ResizeObserver(() => {
      burst.resize();
      if (reduced) burst.renderStill();
    });
    observer.observe(container);

    // Pause when off-viewport, like the other canvases.
    const intersection = new IntersectionObserver(
      (entries) => {
        if (reduced) return;
        if (entries.some((entry) => entry.isIntersecting)) burst.start();
        else burst.stop();
      },
      { threshold: 0 }
    );
    intersection.observe(container);

    const onMove = (event: MouseEvent) => {
      if (!reduced) burst.setMouse(event.offsetX, event.offsetY);
    };
    const onLeave = () => burst.clearMouse();
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);

    return () => {
      observer.disconnect();
      intersection.disconnect();
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      burst.dispose();
    };
  }, []);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
