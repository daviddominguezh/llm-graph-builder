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
    description: 'Building custom agents for multiple clients.',
    icon: BriefcaseBusiness,
  },
  {
    title: 'SaaS Founders',
    description: 'Adding AI agents as a core product feature.',
    icon: Lightbulb,
  },
  {
    title: 'Consultancies',
    description: 'Deploying tailored AI solutions per customer.',
    icon: Users,
  },
  {
    title: 'Teams',
    description: 'Ship agent-powered products fast, without building multi-tenant infrastructure from scratch.',
    icon: Code,
  },
];

function AudienceCardItem({ audience }: { audience: AudienceCard }) {
  const Icon = audience.icon;

  return (
    <div className="rounded-xl border border-border bg-background p-6 text-center">
      <Icon className="mx-auto h-6 w-6 text-primary" />
      <h3 className="mt-4 font-heading text-base font-semibold">{audience.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{audience.description}</p>
    </div>
  );
}

export function Audience() {
  return (
    <section className="px-6 py-20">
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
