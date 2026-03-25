'use client';

import { useTheme } from 'next-themes';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { VantaEffect } from 'vanta/dist/vanta.rings.min';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(callback: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
}

const DARK_PALETTE = { backgroundColor: 0x0a0a12, color: 0xa960ee } as const;
const LIGHT_PALETTE = { backgroundColor: 0xf0f0f5, color: 0x7c3aed } as const;

async function initRings(el: HTMLElement, isDark: boolean): Promise<VantaEffect> {
  const [THREE, { default: RINGS }] = await Promise.all([
    import('three'),
    import('vanta/dist/vanta.rings.min'),
  ]);

  return RINGS({
    el,
    THREE,
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    scale: 1,
    scaleMobile: 1,
    ...(isDark ? DARK_PALETTE : LIGHT_PALETTE),
  });
}

export function ShaderBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const el = containerRef.current;
    if (!el || prefersReducedMotion) return undefined;

    let destroyed = false;
    let effect: VantaEffect | null = null;

    initRings(el, isDark)
      .then((e) => {
        if (destroyed) {
          e.destroy();
          return;
        }
        effect = e;
      })
      .catch(() => undefined);

    return () => {
      destroyed = true;
      effect?.destroy();
    };
  }, [isDark, prefersReducedMotion]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
