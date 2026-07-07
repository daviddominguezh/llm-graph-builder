'use client';

import 'lenis/dist/lenis.css';

import { ReactLenis } from 'lenis/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

// Site-wide smooth scroll (Lenis) for the marketing site. `root` mode drives the
// real document scroll — no transform wrapper — so `position: sticky`, our
// StoryScroll IntersectionObserver, and anchor offsets all keep working. Inner
// scrollers opt out with `data-lenis-prevent` (the BentoCard modal, WaveControls).
// Note: `scroll-behavior: smooth` must NOT be set in CSS — it fights Lenis.
export function SmoothScroll({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Under reduced-motion, disable wheel/touch smoothing so scrolling is native.
  const options = useMemo(() => ({ smoothWheel: !reduced, syncTouch: false }), [reduced]);

  return (
    <ReactLenis root options={options}>
      {children}
    </ReactLenis>
  );
}
