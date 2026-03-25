'use client';

import { useTheme } from 'next-themes';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { DARK_CONFIG, LIGHT_CONFIG } from './gradient/config';
import { createGradient } from './gradient/create-gradient';

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
  return useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, getReducedMotionServerSnapshot);
}

export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const base = isDark ? DARK_CONFIG : LIGHT_CONFIG;
    const config = prefersReducedMotion ? { ...base, speed: 0 } : base;
    const handle = createGradient(canvas, config);
    return () => handle.destroy();
  }, [isDark, prefersReducedMotion]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
