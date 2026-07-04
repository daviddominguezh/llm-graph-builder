'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export type HappeningItem = {
  id: string;
  title: string;
  description: string;
  cta: string;
  image: string;
};

// Squeeze accordion modelled on the reference's squeezy-carousel. Cards stay
// in fixed positions (no reorder). Clicking a card expands it IN PLACE while
// the previously expanded card shrinks in place — the slivers left of the
// active card sit at the minimum width, the slivers to its right decay
// geometrically, and every width sums to the container so all stay visible.
// The squeeze animates purely via a flex-basis transition; sibling positions
// shift smoothly through flex reflow. The caption below crossfades.
const GAP = 16;
const SLIVER_BASE = 200;
const SLIVER_RATIO = 0.5;
const SLIVER_MIN = 18;
const HOVER_BONUS = 40; // a hovered sliver widens by this much (the "peek")
const DUR = '0.6s';
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

// Width for every card given the active (and optionally hovered) index; the
// active card absorbs the remainder so the row always fills the container.
function computeWidths(containerWidth: number, n: number, active: number, hovered: number): number[] {
  const available = Math.max(0, containerWidth - (n - 1) * GAP);
  const widths = new Array<number>(n).fill(0);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (i === active) continue;
    let w = i < active ? SLIVER_MIN : Math.max(SLIVER_MIN, Math.round(SLIVER_BASE * SLIVER_RATIO ** (i - active - 1)));
    if (i === hovered) w += HOVER_BONUS;
    widths[i] = w;
    sum += w;
  }
  widths[active] = Math.max(SLIVER_MIN, available - sum);
  return widths;
}

function Arrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavButton({ dir, onClick, label }: { dir: 'left' | 'right'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-md bg-[#eef1fb] text-[#533afd] transition-colors hover:bg-[#e2e6f8]"
    >
      <Arrow dir={dir} />
    </button>
  );
}

export function HappeningsCarousel({ items }: { items: readonly HappeningItem[] }) {
  const n = items.length;
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(-1);
  const [containerWidth, setContainerWidth] = useState(1232);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const widths = computeWidths(containerWidth, n, active, hovered);
  // Fixed image window width (the expanded size) — the card clips it, so the
  // image never rescales as the card squeezes; a sliver shows its centre strip.
  const imageWidth = computeWidths(containerWidth, n, 0, -1)[0] as number;

  return (
    <div className="squeezy-carousel mt-14">
      <div
        ref={rowRef}
        onMouseLeave={() => setHovered(-1)}
        className="squeezy-carousel__canvas flex h-[460px] gap-4 overflow-hidden"
      >
        {items.map((item, i) => {
          const expanded = i === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(i)}
              onMouseEnter={() => setHovered(i)}
              aria-label={item.title}
              style={{ flexBasis: `${widths[i]}px`, transition: `flex-basis ${DUR} ${EASE}` }}
              className="relative h-full min-w-0 shrink-0 grow-0 cursor-pointer overflow-hidden rounded-xl"
            >
              {/* Fixed-size, centred image window: card clips it, no rescale. */}
              <span className="absolute top-0 left-1/2 h-full -translate-x-1/2" style={{ width: `${imageWidth}px` }}>
                <Image src={item.image} alt="" fill sizes="840px" className="object-cover" />
                <span
                  className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-6 text-left text-lg font-medium whitespace-nowrap text-white transition-opacity duration-200 ${expanded ? 'opacity-100 delay-200' : 'opacity-0'}`}
                >
                  {item.title}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 grid grid-cols-[1fr_auto] items-start gap-8">
        <div className="squeezy-carousel__items-details-container relative min-h-[96px]">
          {items.map((item, i) => (
            <p
              key={item.id}
              aria-hidden={i !== active}
              className={`squeezy-carousel__item-details max-w-[720px] text-lg leading-snug transition-opacity duration-[120ms] ease-out ${i === active ? 'opacity-100' : 'pointer-events-none absolute inset-0 opacity-0'}`}
            >
              <span className="font-medium text-[#061b31]">{item.title} </span>
              <span className="text-[#5b7290]">{item.description}</span>
            </p>
          ))}
        </div>
        <a
          href="#"
          className="shrink-0 rounded-md px-5 py-3 text-sm font-medium text-[#533afd] transition-colors hover:bg-[#eef1fb]"
        >
          {items[active]?.cta ?? 'Read more'} ›
        </a>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <NavButton dir="left" onClick={() => setActive((a) => (a - 1 + n) % n)} label="Previous story" />
        <NavButton dir="right" onClick={() => setActive((a) => (a + 1) % n)} label="Next story" />
      </div>
    </div>
  );
}
