'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

// Ported 1:1 from Retool's homepage "Build powerful apps from anywhere"
// (module StoryScroll-module__cKtwEa, JS module 168170 in 0jjjie1x9wbhu.js).
// The mechanism, verified in their source: NO scroll-jacking, snapping, or rAF
// scroll loop. The right column is a normally-scrolling stack of media; the
// left legend column is `sticky` and cross-fades to whichever media is at the
// viewport centre. "Centred" is detected with an IntersectionObserver whose
// rootMargin collapses the root to the middle line (`-50% 0px -50% 0px`, their
// framer-motion `useInView({margin})`). Non-active media dim via opacity; the
// legend cross-fades opacity + a ±15rem (240px) slide over 500ms.

type StoryCard = {
  eyebrow: string;
  messageKey: string; // item key under landing.families (title/description/cta)
  image: string;
  accent: string; // colors the eyebrow + CTA label for this card
};

// controlRoom items in catalog order (see messages/KEY_USAGE.md).
const CARDS: StoryCard[] = [
  {
    eyebrow: 'Observability',
    messageKey: 'controlRoom.items.observability',
    image: '/reference/ConnectBentoBackground2.webp',
    accent: '#f06bb3',
  },
  {
    eyebrow: 'Live inbox',
    messageKey: 'controlRoom.items.conversationsDashboard',
    image: '/reference/payment-bento-background.jpg',
    accent: '#f0a94a',
  },
  {
    eyebrow: 'Evals',
    messageKey: 'controlRoom.items.evals',
    image: '/reference/platform-graphic-background_2x.png',
    accent: '#4aa8ff',
  },
];

function Legend({ card }: { card: StoryCard }) {
  const t = useTranslations('landing.families');
  return (
    <>
      <p className="text-sm font-medium tracking-tight" style={{ color: card.accent }}>
        {card.eyebrow}
      </p>
      <h3 className="mt-4 max-w-[440px] text-[40px] leading-[1.05] font-light tracking-[-0.02em] text-white">
        {t(`${card.messageKey}.title`)}
      </h3>
      <p className="mt-4 max-w-[420px] text-base leading-relaxed text-white/55">
        {t(`${card.messageKey}.description`)}
      </p>
      <a
        href="#"
        className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
        style={{ color: card.accent }}
      >
        {t(`${card.messageKey}.cta`)}
      </a>
    </>
  );
}

// Active card = whichever media is crossing the viewport centre line — exactly
// Retool's `useInView({margin: "-50% 0px -50% 0px"})`.
function useCenteredItem(rootRef: React.RefObject<HTMLDivElement | null>, count: number): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-story-item]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.storyItem));
        }
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef, count]);
  return active;
}

// Desktop: sticky legend column (cross-fade) + natively-scrolling media stack.
function DesktopStory() {
  const rootRef = useRef<HTMLDivElement>(null);
  const active = useCenteredItem(rootRef, CARDS.length);

  return (
    <div
      ref={rootRef}
      className="mx-auto hidden w-full max-w-[1280px] grid-cols-[2fr_3fr] pt-27.5 pb-30 gap-16 pl-10 lg:grid"
    >
      <div>
        <div className="sticky top-0 flex h-screen items-center">
          <div className="relative h-[80vh] w-full">
            {CARDS.map((card, i) => (
              <div
                key={card.eyebrow}
                className="absolute inset-0 flex flex-col justify-center"
                style={{
                  opacity: i === active ? 1 : 0,
                  transform: `translateY(${i === active ? 0 : i < active ? -240 : 240}px)`,
                  transition: 'opacity 500ms ease-in-out, transform 500ms ease-in-out',
                  pointerEvents: i === active ? undefined : 'none',
                }}
              >
                <Legend card={card} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        {CARDS.map((card, i) => (
          <div
            key={card.eyebrow}
            data-story-item={i}
            className={`relative h-screen w-full overflow-hidden rounded-[28px] transition-opacity duration-500 ${i === active ? 'opacity-100' : 'opacity-30'}`}
          >
            <Image src={card.image} alt="" fill sizes="620px" className="object-cover" />
          </div>
        ))}
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
