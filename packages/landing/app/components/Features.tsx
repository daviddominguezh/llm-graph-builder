import type { Feature } from './features-data';
import { FEATURES } from './features-data';

function LargeFeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <div className="group rounded-xl border border-border bg-background p-8 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <Icon className="h-7 w-7 text-primary transition-transform group-hover:scale-110" />
      <h3 className="mt-5 font-heading text-lg font-semibold">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
    </div>
  );
}

function SmallFeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <div className="group rounded-xl border border-border bg-background p-6 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <Icon className="h-5 w-5 text-primary transition-transform group-hover:scale-110" />
      <h3 className="mt-3 font-heading text-base font-semibold">{feature.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
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
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl">
          How We&#39;re Different
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          We don&#39;t sell to people who build agents for themselves. We sell to people who build agents to
          sell to other people.
        </p>

        <FeaturesGrid />
      </div>
    </section>
  );
}
