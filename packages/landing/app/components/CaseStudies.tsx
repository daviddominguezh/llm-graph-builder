import Image from 'next/image';

import { LogoShuffle, type ShuffleItem } from './LogoShuffle';
import { SectionHeading } from './SectionHeading';

// Customer logos + quotes feeding the Enterprise card's shuffle stack.
const SHUFFLE_ITEMS: ShuffleItem[] = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    role: 'Voice AI',
    quote: 'One agent graph now handles support across every surface, with billing per workspace.',
    image: '/reference/Eleven_Labs.png',
  },
  {
    id: 'gamma',
    name: 'Gamma',
    role: 'Presentations',
    quote: 'We spun up isolated tenants for each customer in a single call — no infra work.',
    image: '/reference/Gamma.png',
  },
  {
    id: 'runway',
    name: 'Runway',
    role: 'Generative video',
    quote: 'Channels, memory, and metering came wired together from the first commit.',
    image: '/reference/Runway.png',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    role: 'Developer platform',
    quote: 'Our customers configure agents inside our product while we keep the margin.',
    image: '/reference/Supabase.png',
  },
  {
    id: 'linear',
    name: 'Linear',
    role: 'Product tooling',
    quote: 'Thousands of conversations a minute, consistent latency, zero babysitting.',
    image: '/reference/linear.png',
  },
];

type DeckCardData = {
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  cta: string;
  accent: string;
  visual: string; // 'shuffle' or an image path
};

const CARDS: DeckCardData[] = [
  {
    eyebrow: 'Enterprise',
    title: 'A global fleet unifies customer conversations with',
    highlight: 'OpenFlow.',
    description: 'One agent graph, hundreds of locations — each with its own channels, history, and usage billing.',
    cta: 'Read the story',
    accent: '#7c72ff',
    visual: 'shuffle',
  },
  {
    eyebrow: 'Startups',
    title: 'Build a foundation for your startup that enables',
    highlight: 'faster growth.',
    description: 'Launch your agent product in days: tenants, channels, memory, and billing wired together from commit one.',
    cta: 'Start building',
    accent: '#4aa8ff',
    visual: '/reference/card_startups.png',
  },
  {
    eyebrow: 'Platforms',
    title: 'Make your SaaS a complete agent',
    highlight: 'operating system.',
    description: 'Embed OpenFlow under your brand: customers configure agents inside your product while you keep the margin.',
    cta: 'Explore platforms',
    accent: '#3ddc97',
    visual: '/reference/platform-graphic-background_2x.png',
  },
  {
    eyebrow: 'Developers',
    title: 'Ship agents with typed SDKs and a',
    highlight: 'single API call.',
    description: 'Provision isolated tenants with channels, memory, and billing programmatically — no glue code required.',
    cta: 'Read the docs',
    accent: '#f0a94a',
    visual: '/reference/bento-terminal.png',
  },
  {
    eyebrow: 'Agencies',
    title: 'Resell agent infrastructure under',
    highlight: 'your own brand.',
    description: 'White-label the whole runtime, meter every conversation, and turn agent traffic into recurring revenue.',
    cta: 'Become a partner',
    accent: '#f06bb3',
    visual: '/reference/ConnectBentoBackground2.webp',
  },
];

function SegmentPills({ label, accent }: { label: string; accent: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-black"
        style={{ backgroundColor: accent }}
      >
        {label}
      </span>
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="h-1.5 w-1.5 rounded-full bg-white/15" />
      ))}
    </div>
  );
}

function CardVisual({ card }: { card: DeckCardData }) {
  if (card.visual === 'shuffle') return <LogoShuffle items={SHUFFLE_ITEMS} />;
  return (
    <div className="relative aspect-[4/3] w-full max-w-[26rem] overflow-hidden rounded-2xl border border-white/8">
      <Image src={card.visual} alt="" fill sizes="26rem" className="object-cover" />
    </div>
  );
}

// One deck card. On desktop it pins (`lg:sticky lg:top-24`) and overlaps the
// next by 3rem (`lg:-mb-12`), so cards slide up and stack — Clay's mechanism.
// On mobile it falls back to normal flow (their `< lg` override).
function DeckCard({ card, index, isLast }: { card: DeckCardData; index: number; isLast: boolean }) {
  return (
    <div
      className={`relative lg:sticky lg:top-24 ${isLast ? '' : 'lg:-mb-12'}`}
      style={{ zIndex: index + 1 }}
    >
      <div
        className={`relative overflow-hidden border border-white/8 bg-[#0e0e10] px-8 pt-12 pb-14 rounded-t-[2.5rem] lg:min-h-[34rem] lg:px-14 lg:pb-20 ${isLast ? 'rounded-b-[2.5rem]' : ''}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ background: card.accent }}
        />
        <div className="relative grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SegmentPills label={card.eyebrow} accent={card.accent} />
            <h3 className="mt-6 max-w-[26rem] text-[34px] leading-[1.08] font-light tracking-[-0.02em] text-white">
              {card.title} <span style={{ color: card.accent }}>{card.highlight}</span>
            </h3>
            <p className="mt-4 max-w-[26rem] text-sm leading-relaxed text-white/55">{card.description}</p>
            <span className="mt-6 inline-block text-sm font-medium" style={{ color: card.accent }}>
              {card.cta} ›
            </span>
          </div>
          <div className="flex justify-center lg:justify-end">
            <CardVisual card={card} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CaseStudies() {
  return (
    <section className="bg-[#070707] px-10 py-24">
      <div className="mx-auto max-w-[1232px]">
        <SectionHeading
          dark
          lead="We power agent businesses of all sizes."
          rest="Transform your company with agent infrastructure that grows from your first client to your thousandth."
        />

        <div className="mt-14 flex flex-col gap-6 lg:gap-0">
          {CARDS.map((card, index) => (
            <DeckCard key={card.eyebrow} card={card} index={index} isLast={index === CARDS.length - 1} />
          ))}
        </div>
      </div>
    </section>
  );
}
