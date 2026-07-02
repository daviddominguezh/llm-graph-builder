import Image from 'next/image';

import { SectionHeading } from './SectionHeading';

const CARD_SHADOW = 'shadow-[0_6px_12px_-2px_rgba(50,50,93,0.12),0_3px_7px_-3px_rgba(0,0,0,0.06)]';

// Customer-story rows with the reference's accordion media slots.
const MINI_CASES = [
  {
    title: 'URBN consolidates multi-brand agents on OpenFlow.',
    image: '/reference/enterprise-accordion-urbn.png',
  },
  {
    title: 'A grocery-delivery leader powers support with OpenFlow.',
    image: '/reference/enterprise-accordion-instacart.png',
  },
  {
    title: 'A global newsroom improves reader conversations with OpenFlow.',
    image: '/reference/enterprise-accordion-lemonde.png',
  },
] as const;

// Customer carousel tiles, one per reference slot.
const CAROUSEL = [
  { name: 'ElevenLabs', image: '/reference/Eleven_Labs.png' },
  { name: 'Gamma', image: '/reference/Gamma.png' },
  { name: 'Runway', image: '/reference/Runway.png' },
  { name: 'Supabase', image: '/reference/Supabase.png' },
  { name: 'Browserbase', image: '/reference/browserbase.png' },
  { name: 'Decagon', image: '/reference/decagon.png' },
  { name: 'Linear', image: '/reference/linear.png' },
  { name: 'Lovable', image: '/reference/lovable.png' },
] as const;

function FeaturedCase() {
  return (
    <div className={`overflow-hidden rounded-lg bg-white ${CARD_SHADOW}`}>
      <Image
        src="/reference/enterprise-accordion-hertz.png"
        alt=""
        width={296}
        height={128}
        className="h-auto w-full"
      />
      <div className="p-8">
        <h3 className="text-lg font-medium text-[#061b31]">
          A global fleet unifies customer conversations with OpenFlow.
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[#425466]">
          One agent graph, hundreds of locations — each with its own WhatsApp number, history, and usage
          billing.
        </p>
        <span className="mt-4 inline-block text-sm font-medium text-[#533afd]">Read the story ›</span>
      </div>
    </div>
  );
}

function CustomerCarousel() {
  return (
    <div className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
      {CAROUSEL.map((customer) => (
        <div key={customer.name} className={`overflow-hidden rounded-lg ${CARD_SHADOW}`}>
          <Image src={customer.image} alt={customer.name} width={432} height={421} className="h-auto w-full" />
        </div>
      ))}
    </div>
  );
}

function StartupBlock() {
  return (
    <div className="mt-20 grid items-center gap-10 border-t border-[#061b31]/8 pt-16 lg:grid-cols-2">
      <div>
        <h3 className="max-w-[480px] text-xl font-medium leading-snug text-[#061b31]">
          Build a foundation for your startup that enables faster growth.
        </h3>
        <p className="mt-3 max-w-[480px] text-sm leading-relaxed text-[#425466]">
          Launch your agent product in days: tenants, channels, memory, and billing come wired together
          from the first commit.
        </p>
        <span className="mt-4 inline-block text-sm font-medium text-[#533afd]">Start building ›</span>
      </div>
      <Image
        src="/reference/card_startups.png"
        alt=""
        width={585}
        height={236}
        className="h-auto w-full rounded-lg"
      />
    </div>
  );
}

function PlatformBlock() {
  return (
    <div className="mt-16 grid items-center gap-10 border-t border-[#061b31]/8 pt-16 lg:grid-cols-2">
      <Image
        src="/reference/platform-graphic-background_2x.png"
        alt=""
        width={296}
        height={128}
        className="h-auto w-full rounded-lg"
      />
      <div>
        <h3 className="max-w-[480px] text-xl font-medium leading-snug text-[#061b31]">
          Make your SaaS platform a complete agent operating system.
        </h3>
        <p className="mt-3 max-w-[480px] text-sm leading-relaxed text-[#425466]">
          Embed OpenFlow under your own brand: your customers configure agents inside your product while
          you keep the margin.
        </p>
        <span className="mt-4 inline-block text-sm font-medium text-[#533afd]">Explore platforms ›</span>
      </div>
    </div>
  );
}

export function CaseStudies() {
  return (
    <section className="bg-[#f6f9fc] px-10 py-24">
      <div className="mx-auto max-w-[1080px]">
        <SectionHeading
          lead="We power agent businesses of all sizes."
          rest="Transform your company with agent infrastructure that grows from your first client to your thousandth."
        />

        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <FeaturedCase />
          <ul className="space-y-6">
            {MINI_CASES.map((item) => (
              <li key={item.title} className="flex items-center gap-5 border-b border-[#061b31]/8 pb-6">
                <Image
                  src={item.image}
                  alt=""
                  width={296}
                  height={128}
                  className="w-[120px] shrink-0 rounded-md"
                />
                <div>
                  <h3 className="text-base font-medium text-[#061b31]">{item.title}</h3>
                  <span className="mt-1 inline-block text-sm font-medium text-[#533afd]">Learn more ›</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <CustomerCarousel />
        <StartupBlock />
        <PlatformBlock />
      </div>
    </section>
  );
}
