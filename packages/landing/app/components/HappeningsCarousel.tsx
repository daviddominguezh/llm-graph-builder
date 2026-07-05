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

// Port of the reference's squeezy-carousel (SqueezyImagesCanvas, chunk
// 96748.7e2aef2ff10580c3.js). A horizontal carousel SCROLL: selecting column t
// scrolls the strip left by t columns — the clicked card glides to column 0
// and expands, cards before it slide off the left, new cards slide in from the
// right. Implemented as a "deck": a keyed list of cards with a base column;
// selecting decrements the base column (all cards slide left) and appends
// fresh cards on the right; off-screen cards are pruned. No teleport, so rapid
// clicks just redirect the in-flight CSS transitions. Duration 1s, easeOutExpo.
const HEIGHT = 460;
const SMALL_GAP = 8;
const LARGE_GAP = 16;
const SMALL_W = 8;
const HOVER_OFFSET = 3;
const DUR_MS = 1000;
const MAX_COL = 9; // keep cards populated out to this column on the right
const MIN_COL = -3; // prune cards left of this
// easeOutExpo (`1 - 2^(-10t)`) sampled as a CSS linear() curve.
const EASE =
  'linear(0, 0.293 5%, 0.5 10%, 0.646 15%, 0.75 20%, 0.823 25%, 0.875 30%, 0.912 35%, 0.938 40%, 0.969 50%, 0.984 60%, 0.992 70%, 0.996 80%, 0.998 90%, 1)';

const BASE_FR = [-0.06, 0.61, 0.3, 0.15];
const SQUEEZED_FR = [-0.12, 0.59, 0.28, 0.13];
const STRETCHED_FR = [0, 0.71, 0.4, 0.25];

function fractions(hovered: number): number[] {
  if (hovered < 0 || hovered > 3) return BASE_FR;
  return BASE_FR.map((_, c) => (c === hovered ? STRETCHED_FR[c]! : SQUEEZED_FR[c]!));
}

const COL0_BASE = (HEIGHT * 16) / 9;
// Image window = the widest col-0 can ever be (stretched fraction 0), so the
// image always fills the expanded card and its rounded corners stay clipped.
const IMAGE_W = Math.ceil(COL0_BASE) + 4;

function colWidth(c: number, containerW: number, hovered: number): number {
  const medium = containerW - COL0_BASE - (3 * SMALL_GAP + 3 * LARGE_GAP) - 3 * SMALL_W;
  if (c < 0 || c > 3) return SMALL_W + (c > 3 && c === hovered ? HOVER_OFFSET : 0);
  const fr = fractions(hovered);
  return c === 0 ? COL0_BASE + medium * fr[0]! : medium * fr[c]!;
}

function layout(containerW: number, hovered: number, lo: number, hi: number) {
  const width: Record<number, number> = {};
  const x: Record<number, number> = {};
  for (let c = lo; c <= hi; c++) width[c] = colWidth(c, containerW, hovered);
  x[lo] = 0;
  for (let c = lo + 1; c <= hi; c++) x[c] = x[c - 1]! + width[c - 1]! + (c < 4 ? LARGE_GAP : SMALL_GAP);
  const shift = x[0] ?? 0;
  for (let c = lo; c <= hi; c++) x[c] = x[c]! - shift;
  return { width, x };
}

type Card = { key: number; itemIndex: number };
type Deck = { cards: Card[]; baseCol: number; nextKey: number };

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
  const [deck, setDeck] = useState<Deck>(() => {
    const cards: Card[] = [];
    let k = 0;
    for (let c = MIN_COL; c <= MAX_COL; c++) cards.push({ key: k++, itemIndex: ((c % n) + n) % n });
    return { cards, baseCol: MIN_COL, nextKey: k };
  });
  const [hovered, setHovered] = useState(-1);
  const [containerWidth, setContainerWidth] = useState(1232);
  const rowRef = useRef<HTMLDivElement>(null);
  const pruneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const schedulePrune = () => {
    clearTimeout(pruneTimer.current);
    pruneTimer.current = setTimeout(() => {
      setDeck(({ cards, baseCol, nextKey }) => {
        let lo = 0;
        while (lo < cards.length && baseCol + lo < MIN_COL) lo++;
        let hi = cards.length;
        while (hi > lo && baseCol + (hi - 1) > MAX_COL + 2) hi--;
        if (lo === 0 && hi === cards.length) return { cards, baseCol, nextKey };
        return { cards: cards.slice(lo, hi), baseCol: baseCol + lo, nextKey };
      });
    }, DUR_MS + 150);
  };

  // Scroll the strip by `by` columns (positive = forward). Appends/prepends
  // cards so the visible window stays populated; never teleports.
  const scrollBy = (by: number) => {
    if (by === 0) return;
    setHovered(-1);
    setDeck(({ cards, baseCol, nextKey }) => {
      const next = [...cards];
      let base = baseCol - by;
      let k = nextKey;
      while (base + next.length - 1 < MAX_COL) {
        const last = next[next.length - 1]!.itemIndex;
        next.push({ key: k++, itemIndex: (last + 1) % n });
      }
      while (base > MIN_COL) {
        const first = next[0]!.itemIndex;
        next.unshift({ key: k++, itemIndex: (first - 1 + n) % n });
        base -= 1;
      }
      return { cards: next, baseCol: base, nextKey: k };
    });
    schedulePrune();
  };

  const { cards, baseCol } = deck;
  const { width, x } = layout(containerWidth, hovered, baseCol - 1, baseCol + cards.length + 1);
  const activeItem = cards.find((_, idx) => baseCol + idx === 0)?.itemIndex ?? 0;
  const transition = `left ${DUR_MS}ms ${EASE}, width ${DUR_MS}ms ${EASE}`;

  return (
    <div className="squeezy-carousel mt-14">
      <div
        ref={rowRef}
        onMouseLeave={() => setHovered(-1)}
        className="squeezy-carousel__canvas relative h-[460px] overflow-hidden"
      >
        {cards.map((card, idx) => {
          const c = baseCol + idx;
          const item = items[card.itemIndex]!;
          const expanded = c === 0;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => scrollBy(c)}
              onMouseEnter={() => c >= 0 && c <= 3 && setHovered(c)}
              aria-label={item.title}
              style={{ left: `${x[c] ?? 0}px`, width: `${width[c] ?? SMALL_W}px`, transition }}
              className="absolute top-0 h-full cursor-pointer overflow-hidden rounded-md"
            >
              <span className="absolute top-0 left-1/2 h-full -translate-x-1/2" style={{ width: `${IMAGE_W}px` }}>
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
          {items.map((item, i) => (
            <p
              key={item.id}
              aria-hidden={i !== activeItem}
              className={`squeezy-carousel__item-details max-w-[720px] text-lg leading-snug transition-opacity duration-[120ms] ease-out ${i === activeItem ? 'opacity-100' : 'pointer-events-none absolute inset-0 opacity-0'}`}
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
          {items[activeItem]?.cta ?? 'Read more'} ›
        </a>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <NavButton dir="left" onClick={() => scrollBy(-1)} label="Previous story" />
        <NavButton dir="right" onClick={() => scrollBy(1)} label="Next story" />
      </div>
    </div>
  );
}
