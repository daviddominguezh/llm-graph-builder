import { BriefcaseBusiness, Code, Lightbulb, Users } from 'lucide-react';
import type { ComponentType } from 'react';

interface AudienceCard {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const AUDIENCES: AudienceCard[] = [
  {
    title: 'AI Agencies',
    description: 'Ten clients, ten different AI setups. Each with isolated channels, history, and billing.',
    icon: BriefcaseBusiness,
  },
  {
    title: 'SaaS Founders',
    description: 'AI agents are your product. You need multi-tenant infrastructure yesterday.',
    icon: Lightbulb,
  },
  {
    title: 'Consultancies',
    description: 'Custom AI solutions per customer. Configure once, deploy in minutes.',
    icon: Users,
  },
  {
    title: 'Teams',
    description: 'Ship AI-powered features fast. Skip the months of infrastructure plumbing.',
    icon: Code,
  },
];

function AudienceCardItem({ audience }: { audience: AudienceCard }) {
  const Icon = audience.icon;

  return (
    <div className="rounded-xl border border-border bg-background p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/8">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="mt-4 font-heading text-base font-semibold">{audience.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{audience.description}</p>
    </div>
  );
}

export function Audience() {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Who Is This For
        </h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((audience) => (
            <AudienceCardItem key={audience.title} audience={audience} />
          ))}
        </div>
      </div>
    </section>
  );
}
