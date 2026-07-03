import Image from 'next/image';

import { SectionHeading } from './SectionHeading';

const CARD_SHADOW = 'shadow-[0_6px_12px_-2px_rgba(50,50,93,0.12),0_3px_7px_-3px_rgba(0,0,0,0.06)]';

// Thumbnails from the reference, placed on the equivalent story slots.
const NEWS = [
  {
    title: 'Agents on OpenFlow handled 1.9 B conversations in 2025.',
    image: '/reference/annual-letter-mobile.png',
  },
  {
    title: 'New tools for taking agents beyond chat: voice and email.',
    image: '/reference/the-happenings-payment-processing-mobile.png',
  },
  {
    title: 'Make your agents discoverable through AI platforms.',
    image: '/reference/the-happenings-agentic-mobile.png',
  },
  {
    title: 'How leading agencies unify tenant experiences.',
    image: '/reference/the-happenings-payment-retailers-mobile.png',
  },
  {
    title: 'Tenants with 150k+ users have their best days on OpenFlow.',
    image: '/reference/the-happenings-bfcm-mobile.png',
  },
  {
    title: 'The vertical SaaS agent benchmark report.',
    image: '/reference/the-happenings-tidemark-mobile.png',
  },
  {
    title: 'A conversation on agent infrastructure with our founders.',
    image: '/reference/the-happenings-cheeky-pint-mobile.png',
  },
  {
    title: 'Crypto-native billing lands for agent platforms.',
    image: '/reference/the-happenings-crypto-mobile.png',
  },
] as const;

function BookOfTheWeek() {
  return (
    <div className="book-of-the-week mt-16 grid items-center gap-10 border-t border-[#061b31]/8 pt-14 lg:grid-cols-[220px_1fr]">
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

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {NEWS.map((item) => (
            <article key={item.title} className={`the-happenings-card overflow-hidden rounded-lg bg-white ${CARD_SHADOW}`}>
              <Image src={item.image} alt="" width={336} height={350} className="h-auto w-full" />
              <div className="p-5">
                <h3 className="text-sm font-medium leading-snug text-[#061b31]">{item.title}</h3>
                <span className="mt-2 inline-block text-sm font-medium text-[#533afd]">Read more ›</span>
              </div>
            </article>
          ))}
        </div>

        <BookOfTheWeek />
      </div>
    </section>
  );
}
