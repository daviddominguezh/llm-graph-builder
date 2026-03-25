'use client';

import { ColorPanels } from '@paper-design/shaders-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const DARK_COLORS = ['#7C3AED', '#5B21B6', '#8B5CF6', '#A78BFA', '#6D28D9'];
const LIGHT_COLORS = ['#C4B5FD', '#A78BFA', '#DDD6FE', '#8B5CF6', '#EDE9FE'];
const DARK_BACK = '#0A0118';
const LIGHT_BACK = '#F5F0FF';
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

function DarkShader({ speed }: { speed: number }) {
  return (
    <ColorPanels
      style={{ width: '100%', height: '100%' }}
      colors={DARK_COLORS}
      colorBack={DARK_BACK}
      speed={speed}
      density={2.5}
      blur={0.2}
      fadeIn={0.8}
      fadeOut={0.4}
      gradient={0.6}
      edges
      length={1.5}
      scale={0.2}
      angle1={0.1}
      angle2={-0.1}
    />
  );
}

function LightShader({ speed }: { speed: number }) {
  return (
    <ColorPanels
      style={{ width: '100%', height: '100%' }}
      colors={LIGHT_COLORS}
      colorBack={LIGHT_BACK}
      speed={speed}
      density={2.5}
      blur={0.3}
      fadeIn={0.9}
      fadeOut={0.5}
      gradient={0.7}
      edges
      length={1.5}
      scale={0.2}
      angle1={0.1}
      angle2={-0.1}
    />
  );
}

export function ShaderBackground() {
  const { resolvedTheme } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const speed = prefersReducedMotion ? 0 : 1.2;
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="h-full w-full" aria-hidden="true">
      {isDark ? <DarkShader speed={speed} /> : <LightShader speed={speed} />}
    </div>
  );
}
