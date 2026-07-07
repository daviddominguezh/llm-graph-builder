import { useTranslations } from 'next-intl';

import { RadialBurstCanvas } from './RadialBurstCanvas';
import { SectionHeading } from './SectionHeading';

const SCALE_POINTS = [
  { value: '135+', label: 'countries with active agent deployments' },
  { value: '99.999%', label: 'historical uptime for OpenFlow services' },
  { value: '47', label: 'languages your agents speak out of the box' },
] as const;

export function GlobalScale() {
  const t = useTranslations('landing.families.engine');
  return (
    <section className="stats-section__globe-host bg-[#070707] px-10 py-20">
      <div className="mx-auto grid max-w-[1232px] items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading dark lead={t('title')} rest={t('intro')} />
          <dl className="mt-12 space-y-8">
            {SCALE_POINTS.map((point) => (
              <div key={point.label} className="border-l-2 border-white/20 pl-5">
                <dt className="text-2xl font-light tracking-tight text-white">{point.value}</dt>
                <dd className="mt-1 text-sm text-white/55">{point.label}</dd>
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
