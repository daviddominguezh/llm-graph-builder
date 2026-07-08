'use client';

import { useEffect } from 'react';

import { FoldedSilkCanvas } from '../components/FoldedSilkCanvas';
import { DEFAULT_WAVE_PARAMS } from '../lib/waveControlsConfig';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// Scratch page for the true-3D wave orbit in isolation: writes `--wave-rot`
// (0→1) — driving the WebGL orbit — from raw scroll over 3 viewports.
// `data-test-page` hides the nav + film grain.
function useWaveOrbitTest() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.testPage = 'true';
    let raf = 0;
    const update = () => {
      raf = 0;
      const rot = clamp01(window.scrollY / ((window.innerHeight || 1) * 3));
      root.style.setProperty('--wave-rot', rot.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      root.removeAttribute('data-test-page');
      root.style.removeProperty('--wave-rot');
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

export default function TestPage() {
  useWaveOrbitTest();
  return (
    <main className="bg-black">
      <FoldedSilkCanvas
        variant="solid"
        params={DEFAULT_WAVE_PARAMS}
        perspectiveOrbit
        className="hero-wave-animation__canvas pointer-events-none fixed inset-0 z-[1]"
      />
      {/* Tall scroll track so there's room to scrub the orbit through 0→1. */}
      <div aria-hidden="true" className="h-[400vh]" />
    </main>
  );
}
