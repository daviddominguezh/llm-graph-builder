import { type HappeningItem, HappeningsCarousel } from './HappeningsCarousel';
import { SectionHeading } from './SectionHeading';

// OpenFlow story slots reusing the reference's imagery.
const NEWS: HappeningItem[] = [
  {
    id: 'annual',
    title: 'Agents on OpenFlow handled 1.9 B conversations in 2025.',
    description:
      'Our annual letter breaks down a record year for agent traffic and what it signals for the businesses building on OpenFlow.',
    image: '/reference/annual-letter-mobile.png',
  },
  {
    id: 'channels',
    title: 'New tools for taking agents beyond chat: voice and email.',
    description:
      'Every tenant can now run the same agent across voice and email, with unified history and per-channel billing.',
    image: '/reference/the-happenings-payment-processing-mobile.png',
  },
  {
    id: 'agentic',
    title: 'Make your agents discoverable through AI platforms.',
    description: 'Publish an agent once and let it show up wherever your customers already ask questions.',
    image: '/reference/the-happenings-agentic-mobile.png',
  },
  {
    id: 'agencies',
    title: 'How leading agencies unify tenant experiences.',
    description:
      'See how agencies configure isolated instances per client and ship them in minutes instead of months.',
    image: '/reference/the-happenings-payment-retailers-mobile.png',
  },
  {
    id: 'bfcm',
    title: 'Tenants with 150k+ users have their best days on OpenFlow.',
    description:
      'Through peak traffic, agents kept answering at consistent speed while uptime held at 99.999%.',
    image: '/reference/the-happenings-bfcm-mobile.png',
  },
  {
    id: 'tidemark',
    title: 'The vertical SaaS agent benchmark report.',
    description:
      'What drives agent adoption in vertical SaaS: product breadth, embedded billing, and AI woven into the core.',
    image: '/reference/the-happenings-tidemark-mobile.png',
  },
  {
    id: 'founders',
    title: 'A conversation on agent infrastructure with our founders.',
    description:
      'A candid look at why multi-tenant agent infrastructure is the platform the next wave of SaaS is built on.',
    image: '/reference/the-happenings-cheeky-pint-mobile.png',
  },
  {
    id: 'crypto',
    title: 'Crypto-native billing lands for agent platforms.',
    description:
      'Meter agent usage and settle in stablecoins or traditional rails — the choice is per tenant.',
    image: '/reference/the-happenings-crypto-mobile.png',
  },
];

export function Happenings() {
  return (
    <section className="the-happenings bg-[#0d0d0d] px-10 py-24">
      <div className="mx-auto max-w-[1232px]">
        <SectionHeading
          dark
          lead="What's happening?"
          rest="Product updates, milestones, and stories from the OpenFlow ecosystem."
        />

        <HappeningsCarousel items={NEWS} />
      </div>
    </section>
  );
}
