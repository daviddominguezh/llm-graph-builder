import type { Feature } from './features-data';
import { FEATURES } from './features-data';
import { SectionHeading } from './SectionHeading';

const CARD_BORDER = 'border border-[#e5edf5]';

function LargeFeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <div className={`rounded-md bg-white p-8 ${CARD_BORDER}`}>
      <Icon className="h-7 w-7 text-[#533afd]" />
      <h3 className="mt-5 text-lg font-medium text-[#061b31]">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#425466]">{feature.description}</p>
    </div>
  );
}

function SmallFeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <div className={`rounded-md bg-white p-6 ${CARD_BORDER}`}>
      <Icon className="h-5 w-5 text-[#533afd]" />
      <h3 className="mt-3 text-base font-medium text-[#061b31]">{feature.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[#425466]">{feature.description}</p>
    </div>
  );
}

function FeaturesGrid() {
  const heroFeatures = FEATURES.slice(0, 2);
  const otherFeatures = FEATURES.slice(2);

  return (
    <div className="mt-14 space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        {heroFeatures.map((f) => (
          <LargeFeatureCard key={f.title} feature={f} />
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {otherFeatures.map((f) => (
          <SmallFeatureCard key={f.title} feature={f} />
        ))}
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="bg-[#f6f9fc] px-10 py-24">
      <div className="mx-auto max-w-[1240px]">
        <SectionHeading
          lead="Flexible building blocks for every agent business."
          rest="We don't sell to people who build agents for themselves — we sell to people who build agents to sell to other people."
        />
        <FeaturesGrid />
      </div>
    </section>
  );
}
