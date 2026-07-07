import { useTranslations } from 'next-intl';

import { FoldedSilkCanvas } from './FoldedSilkCanvas';
import { IntegrationDiagram } from './IntegrationDiagram';

// Dark stats band: dim line-silk flowing behind a two-tone heading and three
// giant gradient statements. The first two draw from unused catalog item keys
// (tracked in messages/KEY_USAGE.md); the third stays a literal metric.
type StatEntry = { gradient: string } & ({ messageKey: string } | { value: string; label: string });

const STATS: StatEntry[] = [
  {
    messageKey: 'engine.items.webhookTriggers',
    gradient: 'from-[#f5b78a] via-[#f06bb3] to-[#a06ff0]',
  },
  {
    messageKey: 'toolbox.items.httpRequests',
    gradient: 'from-[#f06bb3] via-[#c46df0] to-[#8b7bf7]',
  },
  {
    value: '150 k+',
    label: 'conversations per minute',
    gradient: 'from-[#8b7bf7] via-[#7a8bf7] to-[#6aa8f7]',
  },
];

function Stat({ entry }: { entry: StatEntry }) {
  const t = useTranslations('landing.families');
  const keyed = 'messageKey' in entry;
  return (
    <div>
      <div
        className={`bg-gradient-to-r ${entry.gradient} bg-clip-text text-[40px] font-light leading-[1.05] tracking-[-0.02em] text-transparent`}
      >
        {keyed ? t(`${entry.messageKey}.title`) : entry.value}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white">
        {keyed ? t(`${entry.messageKey}.description`) : entry.label}
      </p>
    </div>
  );
}

// Item keys under landing.families — assignments tracked in messages/KEY_USAGE.md.
const INTEGRATION_PATHS = [
  'waysToUse.items.noCodeLowCodeApi',
  'waysToUse.items.claudeCodeMcp',
  'studio.items.versionControl',
] as const;

function ConnectBlock() {
  const t = useTranslations('landing.families.toolbox');
  return (
    <div className="border-b border-dashed border-neutral-800 pb-16">
      <h2 className="max-w-2xl text-2xl leading-snug tracking-[-0.01em]">
        <em className="font-normal not-italic text-white">{t('title')}</em>{' '}
        <span className="text-[#7d90b8]">{t('intro')}</span>
      </h2>
      <div className="mt-10">
        <IntegrationDiagram />
      </div>
    </div>
  );
}

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
  const t = useTranslations('landing.families.controlRoom');
  return (
    <section className="stats-section relative overflow-hidden bg-[#070707]">
      <FoldedSilkCanvas className="developers-wave-animation__canvas absolute inset-0" timeOffset={90000} variant="fibrous" />

      {/* Film grain now comes from the site-wide <FilmGrain /> in the layout. */}

      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[1280px] -translate-x-1/2 border-x border-dashed border-neutral-800 lg:block" />

      <div className="relative mx-auto w-full max-w-[1232px] px-0 pt-24 pb-24">
        <ConnectBlock />

        <h2 className="mt-20 max-w-2xl text-2xl leading-snug tracking-[-0.01em]">
          <em className="font-normal not-italic text-white">{t('title')}</em>{' '}
          <span className="text-[#7d90b8]">{t('intro')}</span>
        </h2>

        <div className="mt-[360px] grid gap-x-4 gap-y-12 sm:grid-cols-3">
          {STATS.map((entry) => (
            <Stat key={'messageKey' in entry ? entry.messageKey : entry.value} entry={entry} />
          ))}
        </div>

        <IntegrationPaths />
      </div>
    </section>
  );
}
