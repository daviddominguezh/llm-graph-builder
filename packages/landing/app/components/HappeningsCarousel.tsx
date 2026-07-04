'use client';

import Image from 'next/image';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type HappeningItem = {
  id: string;
  title: string;
  description: string;
  cta: string;
  image: string;
};

// Squeeze carousel modelled on the reference's squeezy-carousel. The active
// card is the leftmost (expanded); the rest decay geometrically to the right,
// all summing to the container width so every card stays visible. Selecting a
// card rotates it to the front and wraps the cards that were before it to the
// end (cyclic: #n-1 becomes #m). Only cards moving toward the START animate
// (slide + squeeze); the ones wrapping to the end snap. Hovering a sliver
// widens it. The image sits in a fixed-size window the card clips, so it never
// rescales as the card squeezes. The caption crossfades.
const GAP = 16;
const SLIVER_BASE = 200;
const SLIVER_RATIO = 0.5;
const SLIVER_MIN = 18;
const HOVER_BONUS = 40;
const DUR = '0.6s';
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

// Widths by display position (0 = active/expanded); the active card absorbs
// the remainder so the row fills the container exactly.
function computeWidths(containerWidth: number, n: number, hoveredPos: number): number[] {
  const available = Math.max(0, containerWidth - (n - 1) * GAP);
  const widths = new Array<number>(n).fill(0);
  let sum = 0;
  for (let pos = 1; pos < n; pos++) {
    let w = Math.max(SLIVER_MIN, Math.round(SLIVER_BASE * SLIVER_RATIO ** (pos - 1)));
    if (pos === hoveredPos) w += HOVER_BONUS;
    widths[pos] = w;
    sum += w;
  }
  widths[0] = Math.max(SLIVER_MIN, available - sum);
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
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));
  const [hoveredPos, setHoveredPos] = useState(-1);
  const [containerWidth, setContainerWidth] = useState(1232);
  const rowRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const flipFrom = useRef<Map<number, { left: number; width: number }> | null>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const widths = computeWidths(containerWidth, n, hoveredPos);
  const imageWidth = computeWidths(containerWidth, n, -1)[0] as number;

  // Rotate `at` to the front, capturing pre-move rects so the layout effect
  // can FLIP the toward-the-start movement.
  const reorder = (at: number) => {
    if (at === 0) return;
    const rects = new Map<number, { left: number; width: number }>();
    cardRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      rects.set(id, { left: r.left, width: r.width });
    });
    flipFrom.current = rects;
    setHoveredPos(-1);
    setOrder((o) => o.slice(at).concat(o.slice(0, at)));
  };

  // FLIP on reorder: cards moving toward the start slide + squeeze; cards
  // wrapping to the end snap. Batched two-pass (measure all natural targets,
  // then invert → one reflow → play) so writing one card's width doesn't
  // corrupt the next card's measurement.
  useLayoutEffect(() => {
    const from = flipFrom.current;
    if (!from) return;
    flipFrom.current = null;
    const els = Array.from(cardRefs.current.entries()).filter(([id]) => from.has(id));
    els.forEach(([, el]) => {
      el.style.transition = 'none';
      el.style.transform = '';
    });
    const targets = new Map<number, { left: number; width: number }>();
    els.forEach(([id, el]) => {
      const r = el.getBoundingClientRect();
      targets.set(id, { left: r.left, width: r.width });
    });
    const movers: Array<[HTMLElement, number]> = [];
    els.forEach(([id, el]) => {
      const prev = from.get(id);
      const tgt = targets.get(id);
      if (!prev || !tgt) return;
      if (prev.left - tgt.left > 0.5) {
        el.style.transform = `translateX(${prev.left - tgt.left}px)`;
        el.style.flexBasis = `${prev.width}px`;
        movers.push([el, tgt.width]);
      }
    });
    if (movers.length > 0) void document.body.offsetWidth;
    movers.forEach(([el, width]) => {
      el.style.transition = `transform ${DUR} ${EASE}, flex-basis ${DUR} ${EASE}`;
      el.style.transform = 'translateX(0)';
      el.style.flexBasis = `${width}px`;
    });
  }, [order]);

  const activeId = order[0] as number;

  return (
    <div className="squeezy-carousel mt-14">
      <div
        ref={rowRef}
        onMouseLeave={() => setHoveredPos(-1)}
        className="squeezy-carousel__canvas flex h-[460px] gap-4 overflow-hidden"
      >
        {order.map((id, pos) => {
          const item = items[id];
          if (!item) return null;
          const expanded = pos === 0;
          return (
            <button
              key={id}
              ref={(el) => {
                if (el) cardRefs.current.set(id, el);
                else cardRefs.current.delete(id);
              }}
              type="button"
              onClick={() => reorder(pos)}
              onMouseEnter={() => setHoveredPos(pos)}
              aria-label={item.title}
              style={{ flexBasis: `${widths[pos]}px`, transition: `flex-basis ${DUR} ${EASE}` }}
              className="relative h-full min-w-0 shrink-0 grow-0 cursor-pointer overflow-hidden rounded-xl"
            >
              <span className="absolute top-0 left-1/2 h-full -translate-x-1/2" style={{ width: `${imageWidth}px` }}>
                <Image src={item.image} alt="" fill sizes="840px" unoptimized className="object-cover" />
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
          {items.map((item, id) => (
            <p
              key={item.id}
              aria-hidden={id !== activeId}
              className={`squeezy-carousel__item-details max-w-[720px] text-lg leading-snug transition-opacity duration-[120ms] ease-out ${id === activeId ? 'opacity-100' : 'pointer-events-none absolute inset-0 opacity-0'}`}
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
          {items[activeId]?.cta ?? 'Read more'} ›
        </a>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <NavButton dir="left" onClick={() => reorder(n - 1)} label="Previous story" />
        <NavButton dir="right" onClick={() => reorder(1)} label="Next story" />
      </div>
    </div>
  );
}
