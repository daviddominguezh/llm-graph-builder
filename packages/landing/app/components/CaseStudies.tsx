import { useTranslations } from 'next-intl';
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
  messageKey: string; // item key under landing.families (title/description/cta)
  accent: string;
  visual: string; // 'shuffle' or an image path
};

// The six studio items in catalog order — rising sophistication, ending on
// shipping (see messages/KEY_USAGE.md).
const CARDS: DeckCardData[] = [
  {
    eyebrow: 'Builder',
    messageKey: 'studio.items.agentBuilder',
    accent: '#7c72ff',
    visual: 'shuffle',
  },
  {
    eyebrow: 'Workflows',
    messageKey: 'studio.items.workflowBuilder',
    accent: '#4aa8ff',
    visual: '/reference/card_startups.png',
  },
  {
    eyebrow: 'Orchestration',
    messageKey: 'studio.items.agentOrchestration',
    accent: '#3ddc97',
    visual: '/reference/platform-graphic-background_2x.png',
  },
  {
    eyebrow: 'Models',
    messageKey: 'studio.items.anyLlmProvider',
    accent: '#f0a94a',
    visual: '/reference/bento-terminal.png',
  },
  {
    eyebrow: 'Skills',
    messageKey: 'studio.items.agentSkills',
    accent: '#f06bb3',
    visual: '/reference/ConnectBentoBackground2.webp',
  },
  {
    eyebrow: 'Versions',
    messageKey: 'studio.items.versionControl',
    accent: '#38bdf8',
    visual: '/reference/payment-bento-background.jpg',
  },
];

// Clay's stacked segment pills: one collapsed pill per card, overlapping so
// only slivers show, with THIS card's pill expanded and labelled. Pills before
// the active one peek to the left, after it to the right — a "which of N" cue.
function SegmentPills({
  index,
  total,
  accent,
  label,
}: {
  index: number;
  total: number;
  accent: string;
  label: string;
}) {
  return (
    <div className="flex items-center">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === index;
        return (
          <span
            key={i}
            aria-hidden={!active}
            className="flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold tracking-[0.18em] whitespace-nowrap uppercase"
            style={{
              width: active ? 'auto' : '3.4rem',
              paddingLeft: active ? '0.85rem' : 0,
              paddingRight: active ? '0.85rem' : 0,
              marginRight: i === total - 1 ? 0 : '-2.5rem',
              zIndex: active ? total + 1 : total - i,
              backgroundColor: accent,
              opacity: active ? 1 : 0.28,
              color: active ? '#0b0b0b' : 'transparent',
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

// Visual fills the card's full height (grid `items-stretch`) so there is no
// empty framed area below the content on the top-most card.
function CardVisual({ card }: { card: DeckCardData }) {
  // Visual height drives card height: 502px + 96px card padding + 2px borders = 600px.
  if (card.visual === 'shuffle') {
    return (
      <div className="flex items-center justify-center lg:h-[502px] lg:justify-end">
        <LogoShuffle items={SHUFFLE_ITEMS} />
      </div>
    );
  }
  return (
    <div className="relative h-[17rem] w-full overflow-hidden rounded-2xl border border-white/8 lg:h-[502px]">
      <Image src={card.visual} alt="" fill sizes="30rem" className="object-cover" />
    </div>
  );
}

// One deck card. On desktop it pins (`lg:sticky lg:top-24`) and overlaps the
// next by 3rem (`lg:-mb-12`), so cards slide up and stack — Clay's mechanism.
// On mobile it falls back to normal flow (their `< lg` override).
function DeckCard({
  card,
  index,
  total,
  isLast,
}: {
  card: DeckCardData;
  index: number;
  total: number;
  isLast: boolean;
}) {
  const t = useTranslations('landing.families');
  // Accent-highlight the title's final word (the catalog stores whole titles).
  const words = t(`${card.messageKey}.title`).split(' ');
  let highlight = words.pop() ?? '';
  highlight = `${words.pop() ?? ''} ${highlight}`.trim();
  // Alternate the surface so consecutive cards are distinguishable as they
  // slide over each other; the first card is the darker #0d0d0d.
  const background = index % 2 === 0 ? '#0d0d0d' : '#131313';
  return (
    <div
      className={`relative lg:sticky lg:top-24 ${isLast ? '' : 'lg:-mb-12'}`}
      style={{ zIndex: index + 1 }}
    >
      <div
        className={`relative flex flex-col overflow-hidden border border-white/8 px-4 lg:px-8 py-6 lg:py-12 rounded-[24px] lg:rounded-[0px] lg:rounded-t-[2.5rem] lg:px-14 ${isLast ? 'lg:rounded-b-[2.5rem]' : ''}`}
        style={{ backgroundColor: background }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ background: card.accent }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-0 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ background: card.accent }}
        />
        <div className="relative grid gap-12 lg:grid-cols-2 lg:items-stretch">
          <div className="flex flex-col gap-10">
            <div>
              <SegmentPills index={index} total={total} accent={card.accent} label={card.eyebrow} />
              <h3 className="mt-6 max-w-[26rem] text-[24px] lg:text-[34px] leading-[1.08] font-light tracking-[-0.02em] text-white">
                {words.join(' ')} <span style={{ color: card.accent }}>{highlight}</span>
              </h3>
              <p className="mt-4 max-w-[26rem] text-base leading-relaxed text-white/55">
                {t(`${card.messageKey}.description`)}
              </p>
            </div>
            <span className="inline-block text-base font-medium" style={{ color: card.accent }}>
              {t(`${card.messageKey}.cta`)} ›
            </span>
          </div>
          <CardVisual card={card} />
        </div>
      </div>
    </div>
  );
}

export function CaseStudies() {
  const t = useTranslations('landing.families.studio');
  return (
    <section className="bg-[#070707] px-4 lg:px-10 pt-25 pb-30">
      <div className="mx-auto max-w-[1232px]">
        <SectionHeading dark lead={t('title')} rest={t('intro')} />

        {/* `overflow-clip` (NOT hidden — hidden would create a scroll container
            and break sticky) cuts off the previous cards where they protrude
            below the last one: their -mb-12 sits on the sticky wrappers, and
            sticky constrains the MARGIN box, so their border boxes may rest
            48px below the container bottom. Rounded to match the last card. */}
        <div className="mt-14 flex flex-col gap-4 lg:gap-6 lg:gap-0 lg:overflow-clip lg:rounded-b-[2.5rem]">
          {CARDS.map((card, index) => (
            <DeckCard
              key={card.eyebrow}
              card={card}
              index={index}
              total={CARDS.length}
              isLast={index === CARDS.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
