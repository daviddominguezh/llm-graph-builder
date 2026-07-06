import Image from 'next/image';

import { HappeningsCarousel, type HappeningItem } from './HappeningsCarousel';
import { SectionHeading } from './SectionHeading';

// OpenFlow story slots reusing the reference's imagery.
const NEWS: HappeningItem[] = [
  {
    id: 'annual',
    title: 'Agents on OpenFlow handled 1.9 B conversations in 2025.',
    description:
      "Our annual letter breaks down a record year for agent traffic and what it signals for the businesses building on OpenFlow.",
    cta: 'Read the letter',
    image: '/reference/annual-letter-mobile.png',
  },
  {
    id: 'channels',
    title: 'New tools for taking agents beyond chat: voice and email.',
    description:
      'Every tenant can now run the same agent across voice and email, with unified history and per-channel billing.',
    cta: 'Explore channels',
    image: '/reference/the-happenings-payment-processing-mobile.png',
  },
  {
    id: 'agentic',
    title: 'Make your agents discoverable through AI platforms.',
    description:
      'Publish an agent once and let it show up wherever your customers already ask questions.',
    cta: 'Learn more',
    image: '/reference/the-happenings-agentic-mobile.png',
  },
  {
    id: 'agencies',
    title: 'How leading agencies unify tenant experiences.',
    description:
      'See how agencies configure isolated instances per client and ship them in minutes instead of months.',
    cta: 'Read the story',
    image: '/reference/the-happenings-payment-retailers-mobile.png',
  },
  {
    id: 'bfcm',
    title: 'Tenants with 150k+ users have their best days on OpenFlow.',
    description:
      'Through peak traffic, agents kept answering at consistent speed while uptime held at 99.999%.',
    cta: 'See the numbers',
    image: '/reference/the-happenings-bfcm-mobile.png',
  },
  {
    id: 'tidemark',
    title: 'The vertical SaaS agent benchmark report.',
    description:
      'What drives agent adoption in vertical SaaS: product breadth, embedded billing, and AI woven into the core.',
    cta: 'Get the data',
    image: '/reference/the-happenings-tidemark-mobile.png',
  },
  {
    id: 'founders',
    title: 'A conversation on agent infrastructure with our founders.',
    description:
      'A candid look at why multi-tenant agent infrastructure is the platform the next wave of SaaS is built on.',
    cta: 'Watch',
    image: '/reference/the-happenings-cheeky-pint-mobile.png',
  },
  {
    id: 'crypto',
    title: 'Crypto-native billing lands for agent platforms.',
    description:
      'Meter agent usage and settle in stablecoins or traditional rails — the choice is per tenant.',
    cta: 'Read more',
    image: '/reference/the-happenings-crypto-mobile.png',
  },
];

function BookOfTheWeek() {
  return (
    <div className="book-of-the-week mt-16 grid items-center gap-10 border-t border-dashed border-neutral-800 pt-14 lg:grid-cols-[220px_1fr]">
      <Image
        src="/reference/Reminiscences_of_a_Stock_Operator.png"
        alt="Book of the week cover"
        width={296}
        height={440}
        className="w-[180px] rounded-md shadow-[0_10px_20px_-6px_rgba(50,50,93,0.3)]"
      />
      <div>
        <p className="text-sm font-semibold text-[#061b31]">Book of the week</p>
        <p className="mt-2 max-w-[520px] text-sm leading-relaxed text-[#425466]">
          Timeless lessons on markets, risk, and conviction — required reading for anyone building the
          infrastructure other businesses run on.
        </p>
        <span className="mt-3 inline-block text-sm font-medium text-[#533afd]">Borrow it ›</span>
      </div>
    </div>
  );
}

export function Happenings() {
  return (
    <section className="the-happenings bg-white px-10 py-24">
      <div className="mx-auto max-w-[1232px]">
        <SectionHeading
          lead="What's happening?"
          rest="Product updates, milestones, and stories from the OpenFlow ecosystem."
        />

        <HappeningsCarousel items={NEWS} />

        <BookOfTheWeek />
      </div>
    </section>
  );
}
