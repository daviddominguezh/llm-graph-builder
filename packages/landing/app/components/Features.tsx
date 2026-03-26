import type { Feature } from './features-data';
import { FEATURES } from './features-data';

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <div className="rounded-xl border border-border bg-background p-6 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Icon className="h-6 w-6 text-primary" />
      <h3 className="mt-4 font-heading text-base font-semibold">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
    </div>
  );
}

function FeaturesGrid() {
  return (
    <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((feature) => (
        <FeatureCard key={feature.title} feature={feature} />
      ))}
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          How We&#39;re Different
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
          We don&#39;t sell to people who build agents for themselves. We sell to people who build agents to
          sell to other people.
        </p>

        <FeaturesGrid />
      </div>
    </section>
  );
}
