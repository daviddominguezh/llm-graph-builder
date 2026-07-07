import { useTranslations } from 'next-intl';

import { type HappeningItem, HappeningsCarousel } from './HappeningsCarousel';
import { SectionHeading } from './SectionHeading';

// News slots reusing the reference's imagery, with copy from unused feature
// keys (announcement-flavored: shipped features + roadmap items). Item keys
// live under landing.families — assignments tracked in messages/KEY_USAGE.md.
const NEWS_SLOTS = [
  { id: 'web-search', messageKey: 'toolbox.items.webSearch', image: '/reference/annual-letter-mobile.png' },
  {
    id: 'any-llm',
    messageKey: 'studio.items.anyLlmProvider',
    image: '/reference/the-happenings-payment-processing-mobile.png',
  },
  {
    id: 'mcp-catalog',
    messageKey: 'toolbox.items.outOfTheBoxMcps',
    image: '/reference/the-happenings-agentic-mobile.png',
  },
  {
    id: 'skills',
    messageKey: 'studio.items.agentSkills',
    image: '/reference/the-happenings-payment-retailers-mobile.png',
  },
  {
    id: 'user-memory',
    messageKey: 'knowledge.items.userMemory',
    image: '/reference/the-happenings-bfcm-mobile.png',
  },
  {
    id: 'browser-automation',
    messageKey: 'toolbox.items.browserAutomation',
    image: '/reference/the-happenings-tidemark-mobile.png',
  },
  {
    id: 'booking',
    messageKey: 'revenue.items.bookingSystem',
    image: '/reference/the-happenings-cheeky-pint-mobile.png',
  },
  {
    id: 'long-running',
    messageKey: 'engine.items.longRunningAgents',
    image: '/reference/the-happenings-crypto-mobile.png',
  },
] as const;

export function Happenings() {
  const t = useTranslations('landing.families');
  const items: HappeningItem[] = NEWS_SLOTS.map((slot) => ({
    id: slot.id,
    title: t(`${slot.messageKey}.title`),
    description: t(`${slot.messageKey}.description`),
    image: slot.image,
  }));
  return (
    <section className="the-happenings bg-[#0d0d0d] px-10 py-24">
      <div className="mx-auto max-w-[1232px]">
        <SectionHeading dark lead={t('studio.title')} rest={t('studio.intro')} />

        <HappeningsCarousel items={items} />
      </div>
    </section>
  );
}
