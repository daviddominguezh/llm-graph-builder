import { BriefcaseBusiness, Code, Lightbulb, Users } from 'lucide-react';
import type { ComponentType } from 'react';

import { SectionHeading } from './SectionHeading';

const CARD_BORDER = 'border border-[#e5edf5]';

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
    <div className={`rounded-md bg-white p-6 ${CARD_BORDER}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#533afd]/8">
        <Icon className="h-5 w-5 text-[#533afd]" />
      </div>
      <h3 className="mt-4 text-base font-medium text-[#061b31]">{audience.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#425466]">{audience.description}</p>
    </div>
  );
}

export function Audience() {
  return (
    <section className="bg-[#f6f9fc] px-10 py-24">
      <div className="mx-auto max-w-[1240px]">
        <SectionHeading
          lead="Powering agent businesses of every size."
          rest="From solo agencies shipping their first client to platforms running thousands of tenants."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((audience) => (
            <AudienceCardItem key={audience.title} audience={audience} />
          ))}
        </div>
      </div>
    </section>
  );
}
