'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(from: Rgb, to: Rgb, t: number): string {
  const c = (i: number) => Math.round(from[i]! + (to[i]! - from[i]!) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

type ScrollFadeSectionProps = {
  from: string;
  to: string;
  className?: string;
  children: ReactNode;
};

// Section whose background scroll-fades from `from` to `to`: fully `from`
// while it sits below the fold, reaching `to` by the time its top edge
// crosses the middle of the viewport.
export function ScrollFadeSection({ from, to, className, children }: ScrollFadeSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top;
      // Stay fully `from` (white) until the top edge is 80% down the
      // viewport, then fade, reaching `to` when it hits the middle.
      const start = vh * 0.8;
      const end = vh * 0.5;
      const p = (start - top) / (start - end);
      setProgress(Math.min(1, Math.max(0, p)));
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [from, to]);

  return (
    <section ref={ref} className={className} style={{ backgroundColor: mix(hexToRgb(from), hexToRgb(to), progress) }}>
      {children}
    </section>
  );
}
