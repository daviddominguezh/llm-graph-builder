'use client';

import { useEffect, useRef, useState } from 'react';
import { createFoldedSilk, type FoldedSilk, type FoldedSilkVariant } from '../lib/foldedSilk';
import { applyWaveParams, type WaveParams } from '../lib/waveControlsConfig';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type FoldedSilkCanvasProps = {
  className: string;
  // Offsets the animation clock so multiple instances don't move in lockstep.
  timeOffset?: number;
  // 'solid' opaque silk on white (default) or 'fibrous' line strands on navy.
  variant?: FoldedSilkVariant;
  // Live parameter overrides from the tuning panel.
  params?: WaveParams;
};

export function FoldedSilkCanvas({ className, timeOffset = 0, variant = 'solid', params }: FoldedSilkCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const silkRef = useRef<FoldedSilk | null>(null);
  const reducedRef = useRef(false);
  // Starts hidden; flips true once the silk paints its first frame so the
  // canvas fades in instead of popping in whenever WebGL finishes warming up.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const silk = createFoldedSilk(container, timeOffset, variant, () => setReady(true));
    silkRef.current = silk;
    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;

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
      silkRef.current = null;
    };
  }, [timeOffset, variant]);

  // Live-apply parameter changes to the existing instance (no re-creation).
  useEffect(() => {
    const silk = silkRef.current;
    if (!silk || !params) return;
    applyWaveParams(silk, params);
    if (reducedRef.current) silk.renderStill();
  }, [params]);

  return (
    <div
      ref={containerRef}
      className={`${className} transition-opacity duration-1000 ease-out ${ready ? 'opacity-100' : 'opacity-0'}`}
      aria-hidden="true"
    />
  );
}
