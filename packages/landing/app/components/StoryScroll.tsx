'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

// Scroll-story like Retool's "Build powerful apps from anywhere" (retool.com):
//  - Desktop: a tall track (h = cards×100vh) with a `sticky` inner column that
//    pins; the left legend cross-fades (active opacity-100 translate-y-0 /
//    inactive opacity-0 translate-y-[240px], transition opacity+transform), and
//    the right full-height image stack translates continuously with scroll,
//    dimming every non-active panel. The active index flips when the next image
//    is ~30% from the top (floor(offset + 0.3)) — mirroring their computed CSS.
//  - Mobile (< lg): the whole thing collapses to a plain vertical stack, since
//    Retool gates every one of those behaviours behind `lg:`.

type StoryCard = {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  image: string;
};

const CARDS: StoryCard[] = [
  {
    eyebrow: 'Agent builder',
    title: 'Build powerful agents from anywhere.',
    description:
      'Describe what you want and ship a production-ready agent with security and governance built in.',
    cta: 'Learn about the builder',
    image: '/reference/ConnectBentoBackground2.webp',
  },
  {
    eyebrow: 'MCP & tools',
    title: 'Connect every tool your customers run on.',
    description:
      'Wire in MCP servers, internal tools, and channels so your agents act where the work already happens.',
    cta: 'Explore integrations',
    image: '/reference/payment-bento-background.jpg',
  },
  {
    eyebrow: 'Multi-tenant',
    title: 'Isolated instances for every client.',
    description:
      'Provision a dedicated tenant per customer — its own channels, memory, and billing — in a single call.',
    cta: 'See the platform',
    image: '/reference/platform-graphic-background_2x.png',
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type SnapState = { progress: number; active: number };
type SnapCtx = {
  track: HTMLElement;
  count: number;
  setState: (state: SnapState) => void;
  indexRef: { current: number };
  animatingRef: { current: boolean };
  cooldownRef: { current: number };
  wheelRef: { current: number };
};

const THRESHOLD = 0.3; // bias for which card reads as "active" (legend/dim)
const SNAP_MS = 650; // our fixed advance duration — the ONLY scroll speed here
const WHEEL_STEP = 26; // accumulated wheel delta needed to advance one card
const COOLDOWN_MS = 150;

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function isDesktop(): boolean {
  return window.matchMedia('(min-width: 1024px)').matches;
}

// Pinned = the sticky column fully covers the viewport (section owns the scroll).
function isEngaged(track: HTMLElement): boolean {
  const rect = track.getBoundingClientRect();
  return rect.top <= 0 && rect.bottom >= window.innerHeight;
}

function anchorY(track: HTMLElement, count: number, i: number): number {
  const rect = track.getBoundingClientRect();
  const slot = (rect.height - window.innerHeight) / Math.max(1, count - 1);
  return rect.top + window.scrollY + i * slot;
}

// Animate the page to a card's anchor at our fixed rate, overriding the global
// `scroll-behavior: smooth` so our per-frame scrollTo is the only animation.
function snapTo(ctx: SnapCtx, target: number): void {
  ctx.animatingRef.current = true;
  ctx.indexRef.current = target;
  ctx.wheelRef.current = 0;
  const html = document.documentElement;
  const prevBehavior = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  const startY = window.scrollY;
  const endY = anchorY(ctx.track, ctx.count, target);
  const t0 = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / SNAP_MS);
    window.scrollTo(0, startY + (endY - startY) * easeInOutCubic(p));
    if (p < 1) {
      requestAnimationFrame(step);
      return;
    }
    html.style.scrollBehavior = prevBehavior;
    ctx.animatingRef.current = false;
    ctx.cooldownRef.current = performance.now() + COOLDOWN_MS;
  };
  requestAnimationFrame(step);
}

// Visuals only: image translate + which legend is active, read from scroll.
function onFrame(ctx: SnapCtx): void {
  const rect = ctx.track.getBoundingClientRect();
  const scrollable = rect.height - window.innerHeight;
  const progress = scrollable <= 0 ? 0 : clamp(-rect.top / scrollable, 0, 1);
  const offset = progress * (ctx.count - 1);
  ctx.setState({ progress, active: Math.min(ctx.count - 1, Math.floor(offset + THRESHOLD)) });
  if (!isEngaged(ctx.track)) ctx.indexRef.current = Math.round(offset);
}

// Would advancing in `dir` leave the section? (then native scroll should carry
// the page out instead of us capturing the wheel).
function atEdge(ctx: SnapCtx, dir: number): boolean {
  return (dir > 0 && ctx.indexRef.current >= ctx.count - 1) || (dir < 0 && ctx.indexRef.current <= 0);
}

// While pinned, the section owns the wheel: block native scroll and turn wheel
// intent into one controlled card advance at a time (never a fast free scroll).
function onWheel(ctx: SnapCtx, event: WheelEvent): void {
  if (!isDesktop() || !isEngaged(ctx.track)) return;
  if (ctx.animatingRef.current) {
    event.preventDefault();
    return;
  }
  if (atEdge(ctx, Math.sign(event.deltaY))) {
    ctx.wheelRef.current = 0;
    return; // let native scroll leave the section
  }
  event.preventDefault();
  if (performance.now() < ctx.cooldownRef.current) return;
  ctx.wheelRef.current += event.deltaY;
  if (ctx.wheelRef.current >= WHEEL_STEP) snapTo(ctx, ctx.indexRef.current + 1);
  else if (ctx.wheelRef.current <= -WHEEL_STEP) snapTo(ctx, ctx.indexRef.current - 1);
}

function onKey(ctx: SnapCtx, event: KeyboardEvent): void {
  if (!isDesktop() || !isEngaged(ctx.track) || ctx.animatingRef.current) return;
  const dir =
    event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' '
      ? 1
      : event.key === 'ArrowUp' || event.key === 'PageUp'
        ? -1
        : 0;
  if (dir === 0 || atEdge(ctx, dir)) return;
  event.preventDefault();
  if (performance.now() >= ctx.cooldownRef.current) snapTo(ctx, ctx.indexRef.current + dir);
}

function useCardSnap(trackRef: React.RefObject<HTMLDivElement | null>, count: number): SnapState {
  const [state, setState] = useState<SnapState>({ progress: 0, active: 0 });
  const indexRef = useRef(0);
  const animatingRef = useRef(false);
  const cooldownRef = useRef(0);
  const wheelRef = useRef(0);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ctx: SnapCtx = { track, count, setState, indexRef, animatingRef, cooldownRef, wheelRef };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        onFrame(ctx);
      });
    };
    const wheel = (event: WheelEvent) => onWheel(ctx, event);
    const key = (event: KeyboardEvent) => onKey(ctx, event);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    onFrame(ctx);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [trackRef, count]);
  return state;
}

function Legend({ card }: { card: StoryCard }) {
  return (
    <>
      <p className="text-sm font-medium tracking-tight text-white/55">{card.eyebrow}</p>
      <h3 className="mt-4 max-w-[440px] text-[40px] leading-[1.05] font-light tracking-[-0.02em] text-white">
        {card.title}
      </h3>
      <p className="mt-4 max-w-[420px] text-base leading-relaxed text-white/55">{card.description}</p>
      <a href="#" className="mt-6 inline-block text-sm font-medium text-white underline underline-offset-4">
        {card.cta}
      </a>
    </>
  );
}

// Desktop: pinned left legends (cross-fade) + right translating image stack.
function DesktopStory() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { progress, active } = useCardSnap(trackRef, CARDS.length);
  const offset = progress * (CARDS.length - 1); // 0..count-1, continuous
  const shift = (offset / CARDS.length) * 100;

  return (
    <div ref={trackRef} className="relative hidden lg:block" style={{ height: `${CARDS.length * 100}vh` }}>
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[2fr_3fr] items-center gap-16 pl-10">
          <div className="relative h-screen">
            {CARDS.map((card, i) => {
              const isActive = i === active;
              // Incoming legend waits 600ms (the outgoing fade-out) before it
              // fades in; the outgoing leaves immediately (no delay).
              const delay = isActive ? 600 : 0;
              return (
                <div
                  key={card.eyebrow}
                  className={`absolute inset-0 flex flex-col justify-center ${isActive ? '' : 'pointer-events-none'}`}
                  style={{
                    opacity: isActive ? 1 : 0,
                    transform: `translateY(${isActive ? 0 : 40}px)`,
                    transition: `opacity 600ms ease ${delay}ms, transform 600ms ease ${delay}ms`,
                  }}
                >
                  <Legend card={card} />
                </div>
              );
            })}
          </div>
          <div className="relative h-screen overflow-hidden rounded-[28px]">
            <div className="flex flex-col" style={{ transform: `translateY(-${shift}%)` }}>
              {CARDS.map((card, i) => (
                <div key={card.eyebrow} className="relative h-screen w-full shrink-0">
                  <Image src={card.image} alt="" fill sizes="620px" className="object-cover" />
                  {/* Binary dim: a panel is either in focus (0) or darkened
                      (0.6) — no distance-based gradient — fading between the
                      two states so the switch still eases rather than flicks. */}
                  <div
                    className="absolute inset-0 bg-black"
                    style={{ opacity: i === active ? 0 : 0.6, transition: 'opacity 500ms ease' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mobile: plain stacked list — no pin, no cross-fade (matches Retool's < lg).
function MobileStory() {
  return (
    <div className="flex flex-col gap-16 px-6 py-16 lg:hidden">
      {CARDS.map((card) => (
        <div key={card.eyebrow}>
          <Legend card={card} />
          <div className="relative mt-6 h-[62vh] w-full overflow-hidden rounded-[24px]">
            <Image src={card.image} alt="" fill sizes="100vw" className="object-cover" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StoryScroll() {
  return (
    <section className="bg-[#0d0d0d]">
      <DesktopStory />
      <MobileStory />
    </section>
  );
}
