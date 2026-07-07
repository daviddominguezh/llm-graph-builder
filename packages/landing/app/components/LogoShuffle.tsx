'use client';

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Faithful port of Clay's `data-module="company"` call-out (app.js `I6`/`T`):
// a stack of overlapped logo chips that auto-shuffles every 3s — the back chip
// arcs to the front (shrink, swing past the slot, settle) while the rest slide
// one slot back; the front mark is bright, the others dimmed; a matching quote
// cross-fades. Clicking a chip brings it to the front. Constants mirror Clay's.
const EXPO = 'cubic-bezier(0.87, 0, 0.13, 1)'; // their expo.inOut
const DURATION = 800; // kJ = 0.8s
const INTERVAL = 3000; // ZB = 3s between shuffles
const DIM = 0.4; // UB — dimmed (non-front) opacity

export type ShuffleItem = { id: string; name: string; role: string; quote: string; image: string };

function slideKeyframes(dx: number, dy: number): Keyframe[] {
  return [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }];
}

// Back chip → front: shrink, swing forward past the slot, settle (Clay's target
// timeline — scale to 0.8, ~0.25·width overshoot, expo.inOut).
function arcKeyframes(dx: number, dy: number, w: number): Keyframe[] {
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 0 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.5}px) scale(0.8)`, offset: 0.35 },
    { transform: `translate(${-w * 0.12}px, ${dy * 0.08}px) scale(0.9)`, offset: 0.75 },
    { transform: 'translate(0px, 0px) scale(1)', offset: 1 },
  ];
}

function runFlip(
  order: string[],
  chips: Map<string, HTMLElement>,
  firsts: Map<string, DOMRect>,
  incomingId: string | null
): Promise<unknown> {
  const running: Animation[] = [];
  for (const id of order) {
    const el = chips.get(id);
    const first = firsts.get(id);
    if (!el || !first) continue;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (!dx && !dy) continue;
    const frames = id === incomingId ? arcKeyframes(dx, dy, last.width) : slideKeyframes(dx, dy);
    running.push(el.animate(frames, { duration: DURATION, easing: EXPO }));
  }
  return Promise.all(running.map((a) => a.finished.catch(() => undefined)));
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

type ShuffleApi = {
  order: string[];
  frontId: string;
  setChipRef: (id: string, el: HTMLElement | null) => void;
  onChip: (id: string) => void;
};

function useLogoShuffle(items: ShuffleItem[], reduced: boolean): ShuffleApi {
  const [order, setOrder] = useState<string[]>(() => items.map((item) => item.id));
  const chips = useRef(new Map<string, HTMLElement>());
  const firsts = useRef(new Map<string, DOMRect>());
  const orderRef = useRef(order);
  const incoming = useRef<string | null>(null);
  const animating = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const advance = useCallback((target?: string) => {
    if (animating.current) return;
    clearTimeout(timer.current);
    const current = orderRef.current;
    const next = target ?? current[current.length - 1];
    if (next === undefined || current[0] === next) return;
    const measured = new Map<string, DOMRect>();
    current.forEach((id) => {
      const el = chips.current.get(id);
      if (el) measured.set(id, el.getBoundingClientRect());
    });
    firsts.current = measured;
    incoming.current = next;
    setOrder([next, ...current.filter((id) => id !== next)]);
  }, []);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    if (!reduced) timer.current = setTimeout(() => advance(), INTERVAL);
  }, [reduced, advance]);

  useLayoutEffect(() => {
    if (firsts.current.size === 0) return;
    const captured = firsts.current;
    firsts.current = new Map();
    if (reduced) return;
    animating.current = true;
    runFlip(order, chips.current, captured, incoming.current).then(() => {
      animating.current = false;
      schedule();
    });
  }, [order, reduced, schedule]);

  useEffect(() => {
    schedule();
    return () => clearTimeout(timer.current);
  }, [schedule]);

  const setChipRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) chips.current.set(id, el);
    else chips.current.delete(id);
  }, []);

  return { order, frontId: order[0] ?? '', setChipRef, onChip: advance };
}

export function LogoShuffle({ items }: { items: ShuffleItem[] }) {
  const reduced = usePrefersReducedMotion();
  const { order, frontId, setChipRef, onChip } = useLogoShuffle(items, reduced);

  return (
    <div className="flex flex-col items-start">
      <div className="flex items-center pl-1">
        {order.map((id, index) => {
          const item = items.find((entry) => entry.id === id);
          if (!item) return null;
          return (
            <button
              key={id}
              ref={(el) => setChipRef(id, el)}
              type="button"
              onClick={() => onChip(id)}
              aria-label={item.name}
              style={{ zIndex: order.length - index, opacity: index === 0 ? 1 : DIM }}
              className="relative -mr-3 cursor-pointer transition-opacity duration-[800ms] ease-[cubic-bezier(0.87,0,0.13,1)]"
            >
              <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white ring-4 ring-[#0e0e10]">
                <Image src={item.image} alt="" width={40} height={40} className="h-8 w-8 object-contain" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="relative mt-8 h-[104px] w-full max-w-[26rem]">
        {items.map((item) => (
          <blockquote
            key={item.id}
            aria-hidden={item.id !== frontId}
            style={{
              opacity: item.id === frontId ? 1 : 0,
              transform: `scale(${item.id === frontId ? 1 : 0.98})`,
              transition: 'opacity 400ms ease, transform 400ms ease',
            }}
            className="absolute inset-0"
          >
            <p className="text-sm leading-relaxed text-white/80">“{item.quote}”</p>
            <footer className="mt-3 text-xs text-white/50">
              {item.name} · {item.role}
            </footer>
          </blockquote>
        ))}
      </div>
    </div>
  );
}
