'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// Opening splash + scroll-driven hand-off to the hero. A 100vh spacer gives the
// intro its scroll distance; a fixed black "stage" sits on top of the hero and
// the window scroll position (0 → 1 over one viewport) scrubs the whole thing:
//   • p 0 → 0.5  — the rounded card shrinks and its content fades to black
//   • p 0.55 → 1 — the black stage fades out, revealing the hero beneath
// On first paint the `.intro-curtain` (moved here from the hero) eases the whole
// thing up from black. All motion is attached to scroll, not time.
export function Opening() {
  const t = useTranslations('landing.opening');
  const [p, setP] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setP(clamp01(window.scrollY / (window.innerHeight || 1)));
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
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const cardScale = 1 - clamp01(p / 0.6) * 0.22; // 1 → 0.78 (shrinks)
  const cardOpacity = 1 - clamp01(p / 0.5); // 1 → 0 (fades to black)
  const stageOpacity = 1 - clamp01((p - 0.55) / 0.45); // 1 → 0 (reveals hero)

  return (
    <>
      {/* Scroll track: gives the pinned transition its scroll distance. */}
      <div aria-hidden="true" className="h-screen" />

      {/* Fixed black stage over the hero; scroll scrubs the whole intro. */}
      <div
        className="fixed inset-0 z-[45] flex justify-center bg-[#070707]"
        style={{ opacity: stageOpacity, visibility: p >= 1 ? 'hidden' : 'visible', pointerEvents: 'none' }}
      >
        <div
          className="mt-[72px] flex h-[calc(100%-calc(72px+var(--spacing)*7))] w-[calc(100%-var(--spacing)*14)] items-center justify-center rounded-3xl bg-black"
          style={{ transform: `scale(${cardScale})`, opacity: cardOpacity }}
        >
          <h1 className="max-w-[960px] text-center text-[40px] leading-[1.12] font-medium tracking-[-0.02em] text-white sm:text-[56px]">
            {t('title')}
          </h1>
        </div>

        {/* Load-time curtain: eases out on first paint so the opening emerges
            from black (moved here from the hero). */}
        <div aria-hidden="true" className="intro-curtain pointer-events-none absolute inset-0 bg-[#070707] opacity-0" />
      </div>
    </>
  );
}
