import { CircleHelp } from 'lucide-react';

import { SectionHeading } from './SectionHeading';

const PAIN_POINTS = [
  'How do I give each customer their own WhatsApp number?',
  'How do I isolate conversation history per tenant?',
  'How do I track usage and costs per customer?',
  'How do I manage different channels for different clients?',
] as const;

function PainPointList() {
  return (
    <ul className="mt-10 grid gap-x-10 gap-y-5 sm:grid-cols-2">
      {PAIN_POINTS.map((point) => (
        <li key={point} className="flex items-start gap-3">
          <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-[#533afd]" />
          <span className="text-base leading-relaxed text-[#425466]">{point}</span>
        </li>
      ))}
    </ul>
  );
}

export function Problem() {
  return (
    <section className="bg-white px-10 py-24">
      <div className="mx-auto max-w-[1240px]">
        <SectionHeading
          lead="Every no-code agent builder assumes you are the end user."
          rest="The moment you try to resell an agent to your own customers, you hit a wall — and end up building months of SaaS infrastructure from scratch."
        />
        <PainPointList />
      </div>
    </section>
  );
}
