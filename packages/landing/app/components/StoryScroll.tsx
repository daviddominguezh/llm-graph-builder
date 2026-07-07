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

// Scroll-driven {progress 0..1, active index}. Only computes on lg+ screens.
function useStoryProgress(trackRef: React.RefObject<HTMLDivElement | null>, count: number) {
  const [state, setState] = useState({ progress: 0, active: 0 });
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!window.matchMedia('(min-width: 1024px)').matches) return;
      const rect = track.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const progress = scrollable <= 0 ? 0 : clamp(-rect.top / scrollable, 0, 1);
      const offset = progress * (count - 1);
      setState({ progress, active: Math.min(count - 1, Math.floor(offset + 0.3)) });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
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
  const { progress, active } = useStoryProgress(trackRef, CARDS.length);
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
