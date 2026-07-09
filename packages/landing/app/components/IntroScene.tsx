'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLenis } from 'lenis/react';
import { useEffect, useRef, type ReactNode } from 'react';

const REVEAL_TARGETS = [
  '[data-intro="title"]',
  '[data-intro="title2"]',
  '[data-intro="subtitle"]',
  '[data-intro="description"]',
  '[data-intro="ctas"]',
  '[data-intro="logobar"]',
];

// The scrubbed master timeline, pinned to the scene. Positions are timeline-time
// (0→~1), mapped across the pin's scroll distance by ScrollTrigger. Beats mirror
// the brief: opening → black, wave in, title, subtitle, wave rotates (WebGL
// orbit via `--wave-rot`), description, then CTAs + logo bar before we release.
function buildIntroTimeline(scene: HTMLElement) {
  const root = document.documentElement;
  root.dataset.opening = 'true';
  gsap.set('.hero-wave-animation__canvas', { opacity: 0 });
  gsap.set(REVEAL_TARGETS, { opacity: 0 });
  gsap.set('.marquee-logo', { filter: 'grayscale(100%)', opacity: 0.7 });
  gsap.set(root, { '--wave-rot': 0 });

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: scene,
      start: 'top top',
      // Total scroll the pinned intro spans (viewport-relative). Larger = the
      // same beats take more scrolling, so the whole sequence feels slower/smoother.
      end: '+=800%',
      scrub: 1,
      pin: true,
      onUpdate: (self) => {
        root.dataset.opening = self.progress < 0.08 ? 'true' : 'false';
      },
    },
  });

  tl.to('[data-intro="opening"]', { opacity: 0, duration: 0.15 }, 0)
    .to('.hero-wave-animation__canvas', { opacity: 1, duration: 0.4 }, 0.15)
    // Title crossfades to title2 before the subtitle appears: title in, out,
    // then title2 in.
    .to('[data-intro="title"]', { opacity: 1, duration: 0.1 }, 0.2)
    .to('[data-intro="title"]', { opacity: 0, duration: 0.1 }, 0.38)
    .to('[data-intro="title2"]', { opacity: 1, duration: 0.1 }, 0.5)
    .to('[data-intro="subtitle"]', { opacity: 1, duration: 0.1 }, 0.64)
    // Wave rotates in place (WebGL orbit); starts the moment the wave begins to
    // fade in (0.15) and keeps turning all the way to the end, so it's still
    // rotating through the description + CTAs reveals rather than stopping early.
    .to(root, { '--wave-rot': 1, duration: 0.85 }, 0.15)
    .to('[data-intro="description"]', { opacity: 1, duration: 0.12 }, 0.78)
    .to('[data-intro="logobar"]', { opacity: 1, duration: 0.1 }, 0.82)
    .to('[data-intro="ctas"]', { opacity: 1, duration: 0.1 }, 0.86)
    // Once the marquee is in scene, the noir logos slowly bloom to full color
    // (like hover, but color only — no scale) before the intro ends.
    .to('.marquee-logo', { filter: 'grayscale(0%)', opacity: 1, duration: 0.16 }, 0.84);
}

// Pins the intro (opening overlay + hero) and scrubs the reveal choreography as
// the user scrolls, then releases into the next section. `children` = the hero
// and the opening overlay (server-rendered, passed through).
export function IntroScene({ children }: { children: ReactNode }) {
  const sceneRef = useRef<HTMLDivElement>(null);

  // Drive ScrollTrigger from Lenis' smooth scroll so pin + scrub stay in sync.
  useLenis(() => ScrollTrigger.update());

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const scene = sceneRef.current;
    if (!scene) return;
    const ctx = gsap.context(() => buildIntroTimeline(scene), scene);
    return () => {
      ctx.revert();
      document.documentElement.removeAttribute('data-opening');
      document.documentElement.style.removeProperty('--wave-rot');
    };
  }, []);

  return (
    <div ref={sceneRef} className="relative">
      {children}
    </div>
  );
}
