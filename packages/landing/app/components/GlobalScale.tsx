import { useTranslations } from 'next-intl';

import { RadialBurstCanvas } from './RadialBurstCanvas';
import { SectionHeading } from './SectionHeading';

// revenue items in catalog order — the capture → qualify → book → close
// funnel (see messages/KEY_USAGE.md). Each gets its own accent (deck palette),
// used for the left border.
const SCALE_POINTS = [
  { key: 'revenue.items.formIntegration', accent: '#4aa8ff' },
  { key: 'revenue.items.leadScoring', accent: '#7c72ff' },
  { key: 'revenue.items.bookingSystem', accent: '#f0a94a' },
  { key: 'revenue.items.payments', accent: '#f06bb3' },
] as const;

export function GlobalScale() {
  const t = useTranslations('landing.families');
  return (
    <section className="stats-section__globe-host bg-[#070707] px-10 pt-25 pb-20">
      <div className="mx-auto grid max-w-[1232px] items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading dark lead={t('revenue.title')} rest={t('revenue.intro')} />
          <dl className="mt-12 space-y-8">
            {SCALE_POINTS.map(({ key, accent }) => (
              <div key={key} className="border-l-[1px] pl-5" style={{ borderColor: accent }}>
                <dt className="text-2xl font-light tracking-tight text-white">{t(`${key}.title`)}</dt>
                <dd className="mt-1 text-sm text-white/55">{t(`${key}.description`)}</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* Interactive line-burst radiating from the bottom centre; tips are
            repelled by the cursor. Replaces the CSS globe. */}
        <RadialBurstCanvas className="h-[560px] w-full" />
      </div>
    </section>
  );
}
