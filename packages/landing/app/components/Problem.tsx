import { CircleHelp } from 'lucide-react';

const PAIN_POINTS = [
  'How do I give each customer their own WhatsApp number?',
  'How do I isolate conversation history per tenant?',
  'How do I track usage and costs per customer?',
  'How do I manage different channels for different clients?',
] as const;

function PainPointList() {
  return (
    <ul className="mt-8 space-y-4">
      {PAIN_POINTS.map((point) => (
        <li key={point} className="flex items-start gap-3">
          <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/60" />
          <span className="text-base text-muted-foreground">{point}</span>
        </li>
      ))}
    </ul>
  );
}

export function Problem() {
  return (
    <section className="bg-muted px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-heading text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl">
          The Problem
        </h2>

        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Every no-code agent builder assumes{' '}
          <span className="font-semibold text-foreground">you</span> are the end user. The moment you try to
          resell an agent to your own customers, you hit a wall:
        </p>

        <PainPointList />

        <p className="mt-8 text-xl font-semibold text-foreground">
          You end up building months of SaaS infrastructure from scratch.
        </p>
      </div>
    </section>
  );
}
