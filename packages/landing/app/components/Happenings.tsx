import { useTranslations } from 'next-intl';

import { type HappeningItem, HappeningsCarousel } from './HappeningsCarousel';
import { SectionHeading } from './SectionHeading';

// The toolbox family in catalog order: the standard → the catalog → the
// capabilities, common to specialized (see messages/KEY_USAGE.md). The
// connector diagram lives here too — it visualizes exactly this family.
const NEWS_SLOTS = [
  {
    id: 'connect-any-mcp',
    messageKey: 'toolbox.items.connectAnyMcp',
    image: '/reference/annual-letter-mobile.png',
  },
  {
    id: 'mcp-catalog',
    messageKey: 'toolbox.items.outOfTheBoxMcps',
    image: '/reference/the-happenings-payment-processing-mobile.png',
  },
  {
    id: 'web-search',
    messageKey: 'toolbox.items.webSearch',
    image: '/reference/the-happenings-agentic-mobile.png',
  },
  {
    id: 'http-requests',
    messageKey: 'toolbox.items.httpRequests',
    image: '/reference/the-happenings-payment-retailers-mobile.png',
  },
  {
    id: 'external-sql',
    messageKey: 'toolbox.items.externalSql',
    image: '/reference/the-happenings-bfcm-mobile.png',
  },
  {
    id: 'browser-automation',
    messageKey: 'toolbox.items.browserAutomation',
    image: '/reference/the-happenings-tidemark-mobile.png',
  },
  {
    id: 'code-sandboxes',
    messageKey: 'toolbox.items.codeSandboxes',
    image: '/reference/the-happenings-crypto-mobile.png',
  },
] as const;

export function Happenings() {
  const t = useTranslations('landing.families');
  const items: HappeningItem[] = [
    // First card: the integration map itself (scaled to fit inside the card).
    {
      id: 'integration-map',
      title: t('toolbox.diagram.title'),
      description: t('toolbox.diagram.description'),
      image: '',
      diagram: true,
    },
    ...NEWS_SLOTS.map((slot) => ({
      id: slot.id,
      title: t(`${slot.messageKey}.title`),
      description: t(`${slot.messageKey}.description`),
      image: slot.image,
    })),
  ];
  return (
    <section className="the-happenings bg-[#0d0d0d] px-4 lg:px-10 pt-25 pb-20">
      <div className="mx-auto max-w-[1232px]">
        <SectionHeading dark lead={t('toolbox.title')} rest={t('toolbox.intro')} />
        <div className="mt-14">
          <HappeningsCarousel items={items} />
        </div>
      </div>
    </section>
  );
}
