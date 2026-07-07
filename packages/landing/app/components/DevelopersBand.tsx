import { useTranslations } from 'next-intl';

import { FoldedSilkCanvas } from './FoldedSilkCanvas';

// Closing band over the line-silk. Renders the last three catalog families in
// file order (see messages/KEY_USAGE.md): knowledge (program cards) → engine
// (gradient statements) → waysToUse (path cards), so the page ends on the
// pay-as-you-go pricing bookend.

// Port of Stripe's homepage program cards (`startups-program-card`): a flex
// card, radius 6px, overflow hidden — content column with an INLINE emphasized
// title + regular description in one paragraph and an arrow link below; the
// right column is an angled gradient graphic flush to the card edge, clipped
// by the card. Dark-adapted to our surface tokens.
const PROGRAM_CARDS = [
  { messageKey: 'knowledge.items.multimodalRag', variant: 'wedge' },
  { messageKey: 'knowledge.items.kvStores', variant: 'peaks' },
  { messageKey: 'knowledge.items.userMemory', variant: 'prism' },
] as const;

type ProgramVariant = (typeof PROGRAM_CARDS)[number]['variant'];

function ProgramGraphic({ variant }: { variant: ProgramVariant }) {
  if (variant === 'wedge') {
    return (
      <div aria-hidden="true" className="relative w-[30%] shrink-0">
        <div className="absolute inset-0 bg-gradient-to-tr from-[#7011cf] to-[#ff45e6] [clip-path:polygon(28%_100%,100%_0,100%_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#a960ee] to-[#ff45e6] opacity-60 [clip-path:polygon(0_100%,100%_38%,100%_100%)]" />
      </div>
    );
  }
  if (variant === 'peaks') {
    return (
      <div aria-hidden="true" className="relative w-[30%] shrink-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#ffb254] to-[#f76b1c] [clip-path:polygon(38%_0,76%_100%,0_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#ffd254] to-[#fda52d] opacity-80 [clip-path:polygon(72%_18%,100%_100%,44%_100%)]" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="relative w-[30%] shrink-0">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#0ea5e9] to-[#67e8f9] [clip-path:polygon(100%_18%,100%_100%,10%_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-tr from-[#2dd4bf] to-[#a5f3fc] opacity-70 [clip-path:polygon(55%_100%,100%_45%,100%_100%)]" />
    </div>
  );
}

function ProgramCards() {
  const t = useTranslations('landing.families');
  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-3">
      {PROGRAM_CARDS.map((card) => (
        <div
          key={card.messageKey}
          className="relative flex min-h-[190px] overflow-hidden rounded-lg border border-white/10 bg-white/4 lg:aspect-[400/294]"
        >
          <div className="flex flex-col justify-between px-5 py-6">
            <p className="text-sm leading-relaxed">
              <strong className="font-semibold text-white">{t(`${card.messageKey}.title`)}.</strong>{' '}
              <span className="text-[#7d90b8]">{t(`${card.messageKey}.description`)}</span>
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-[#8b9df7]">
              {t(`${card.messageKey}.cta`)} ›
            </span>
          </div>
          <ProgramGraphic variant={card.variant} />
        </div>
      ))}
    </div>
  );
}

// engine items in catalog order: duration → time-triggered → event-triggered.
const STATS = [
  {
    messageKey: 'engine.items.longRunningAgents',
    gradient: 'from-[#f5b78a] via-[#f06bb3] to-[#a06ff0]',
  },
  {
    messageKey: 'engine.items.scheduledExecution',
    gradient: 'from-[#f06bb3] via-[#c46df0] to-[#8b7bf7]',
  },
  {
    messageKey: 'engine.items.webhookTriggers',
    gradient: 'from-[#8b7bf7] via-[#7a8bf7] to-[#6aa8f7]',
  },
] as const;

function Stat({ entry }: { entry: (typeof STATS)[number] }) {
  const t = useTranslations('landing.families');
  return (
    <div>
      <div
        className={`bg-gradient-to-r ${entry.gradient} bg-clip-text text-[40px] font-light leading-[1.05] tracking-[-0.02em] text-transparent`}
      >
        {t(`${entry.messageKey}.title`)}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white">{t(`${entry.messageKey}.description`)}</p>
    </div>
  );
}

// waysToUse items in catalog order — the page-closing block, ending on
// pay-as-you-go pricing (the cloud bookend back to the hero).
const INTEGRATION_PATHS = [
  'waysToUse.items.noCodeLowCodeApi',
  'waysToUse.items.claudeCodeMcp',
  'waysToUse.items.payAsYouGoPricing',
] as const;

function IntegrationPaths() {
  const t = useTranslations('landing.families');
  return (
    <div className="mt-20 border-t border-dashed border-neutral-800 pt-16">
      <h2 className="max-w-2xl text-2xl leading-snug tracking-[-0.01em]">
        <em className="font-normal not-italic text-white">{t('waysToUse.title')}</em>{' '}
        <span className="text-[#7d90b8]">{t('waysToUse.intro')}</span>
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {INTEGRATION_PATHS.map((key) => (
          <div key={key} className="rounded-lg border border-white/10 bg-white/4 p-6 lg:aspect-[400/294]">
            <h3 className="text-base font-medium text-white">{t(`${key}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#7d90b8]">{t(`${key}.description`)}</p>
            <span className="mt-3 inline-block text-sm font-medium text-[#8b9df7]">{t(`${key}.cta`)} ›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DevelopersBand() {
  const t = useTranslations('landing.families');
  return (
    <section className="stats-section relative overflow-hidden bg-[#070707]">
      <FoldedSilkCanvas className="developers-wave-animation__canvas absolute inset-0" timeOffset={90000} variant="fibrous" />

      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[1280px] -translate-x-1/2 border-x border-dashed border-neutral-800 lg:block" />

      <div className="relative mx-auto w-full max-w-[1232px] px-0 pt-24 pb-24">
        <div className="border-b border-dashed border-neutral-800 pb-16">
          <h2 className="max-w-2xl text-2xl leading-snug tracking-[-0.01em]">
            <em className="font-normal not-italic text-white">{t('knowledge.title')}</em>{' '}
            <span className="text-[#7d90b8]">{t('knowledge.intro')}</span>
          </h2>
          <ProgramCards />
        </div>

        <h2 className="mt-20 max-w-2xl text-2xl leading-snug tracking-[-0.01em]">
          <em className="font-normal not-italic text-white">{t('engine.title')}</em>{' '}
          <span className="text-[#7d90b8]">{t('engine.intro')}</span>
        </h2>

        <div className="mt-[360px] grid gap-x-4 gap-y-12 sm:grid-cols-3">
          {STATS.map((entry) => (
            <Stat key={entry.messageKey} entry={entry} />
          ))}
        </div>

        <IntegrationPaths />
      </div>
    </section>
  );
}
