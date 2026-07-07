import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { BentoCard } from './BentoCard';
import { ScrollFadeSection } from './ScrollFadeSection';
import { SectionHeading } from './SectionHeading';

const CARD_BORDER = 'border border-white/8';

// Chat-agent mockup inside a browser-window frame matching the reference's
// browser-graphic CSS: translucent #f8fafd window, 6px radius, soft 15/35
// shadow; top bar is a grid with a single left-aligned translucent URL pill
// (no colored traffic-light dots — the reference has none). Fills the card's
// leftover height and bleeds off the bottom, clipped.
function ChatMockup() {
  return (
    <div className="relative mt-8 min-h-0 flex-1 overflow-hidden p-1">
      <Image
        src="/reference/payment-bento-background.jpg"
        alt=""
        width={860}
        height={712}
        className="absolute inset-0 h-full w-full object-cover opacity-15"
      />
      <div className="browser-graphic__window relative flex h-full flex-col overflow-hidden rounded-md bg-white/5 shadow-[0_15px_35px_rgba(23,23,23,0.08)]">
        <div className="browser-graphic__window-top-bar grid grid-cols-[1fr] items-center px-5 py-0.5">
          <span className="browser-graphic__url-box justify-self-start rounded-2xl bg-white/10 px-2 py-0.5 text-[11px] text-white/50">
            acme-travel.openflow.app
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-white/[0.03] p-5">
          <ChatMockupBody />
        </div>
      </div>
    </div>
  );
}

function ChatMockupBody() {
  return (
    <div className="relative">
      <div className="flex items-center gap-2 border-b border-dashed border-neutral-800 pb-3">
        <span className="h-2 w-2 rounded-full bg-[#2ec46e]" />
        <span className="text-xs font-medium text-white/60">agent · acme-travel · WhatsApp</span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="max-w-[75%] rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70 shadow-sm">
          Hi! I need to move my flight to Friday.
        </div>
        <div className="ml-auto max-w-[75%] rounded-lg bg-[#533afd] px-3 py-2 text-xs text-white shadow-sm">
          Sure — you&apos;re confirmed on the 10:40 AM to Denver this Friday. Anything else?
        </div>
        <div className="max-w-[75%] rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70 shadow-sm">
          That was fast. Thanks!
        </div>
      </div>
    </div>
  );
}

// Metered billing mockup: plan card with a usage meter and 30-day chart.
function BillingMockup() {
  const bars = [18, 26, 22, 34, 30, 42, 38, 52, 46, 60, 55, 70];
  return (
    <div className="mt-8 space-y-4">
      <div className={`rounded-md bg-white/5 p-5 ${CARD_BORDER}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#533afd]/10 text-sm font-semibold text-[#533afd]">
            P
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Plan Pro</p>
            <p className="text-xs text-white/55">Monthly billing</p>
          </div>
        </div>
        {/* Audited off billing-plan-graphic: label 12px/400, meter track
            14px tall / 4px radius / #f8fafd, fill 3px radius. */}
        <p className="mt-4 text-xs font-normal text-white">Tokens</p>
        <p className="text-xs text-white/55">USD 0.01 per 1,000 units</p>
        <p className="mt-3 text-xs text-white/55">◔ Usage meter</p>
        <div className="billing-plan-graphic__usage-bar mt-1.5 h-[14px] overflow-hidden rounded bg-white/10">
          <div className="h-full w-[45%] rounded-[3px] bg-gradient-to-r from-[#533afd] via-[#a05df0] to-[#f06bb3]" />
        </div>
      </div>
      <div className={`rounded-md bg-white/5 p-5 ${CARD_BORDER}`}>
        <p className="text-xs text-white/55">Tokens used in the last 30 days</p>
        <p className="mt-1 text-sm font-semibold text-white">1,757,267,878</p>
        <div className="mt-3 flex h-16 items-end gap-1.5">
          {bars.map((height, i) => (
            <div key={i} className="w-3 rounded-sm bg-[#7a73f0]/70" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChannelChips() {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {['WhatsApp', 'Instagram', 'Telegram', 'Slack', 'Web chat', 'Teams'].map((channel) => (
        <span
          key={channel}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70"
        >
          {channel}
        </span>
      ))}
    </div>
  );
}

function CodeSnippet() {
  return (
    <pre className="mt-6 overflow-x-auto rounded-lg bg-[#0e1a38] p-5 text-xs leading-relaxed text-[#9fb5d9]">
      {`<script src="https://openflow.app/embed.js"
  data-tenant="acme-travel"
  data-agent="support" async></script>`}
    </pre>
  );
}

function BrandCard() {
  const t = useTranslations('landing.whatIsOpenflow');
  return (
    <BentoCard className="block w-full lg:aspect-[27/10]">
      {/* Only this card: the background image grows with the frame on hover
          (same 0.8s ease as the card's expand). */}
      <Image
        src="/reference/ConnectBentoBackground2.webp"
        alt=""
        fill
        sizes="1232px"
        className="absolute inset-0 -z-10 object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.165,0.84,0.44,1)] group-hover:scale-[1.05] [object-position:50%_25%]"
      />
      <div className="relative flex flex-1 flex-col justify-between">
        <div className="self-start text-lg font-semibold tracking-tight text-white">OpenFlow</div>
        <div className="flex flex-col gap-4">
          <h2 className="max-w-[659px] text-[48px] leading-[1.03] font-light tracking-[-0.02em] text-white">
            {t('title')}
          </h2>
          <p className="max-w-[520px] text-base leading-relaxed text-white/70">{t('description')}</p>
          <a
            href="#"
            className="inline-flex h-12 w-fit items-center rounded-[4px] bg-white px-6 text-base font-normal text-[#533afd] transition-colors duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] hover:text-[#3a1fd0]"
          >
            {t('cta')}
          </a>
        </div>
      </div>
    </BentoCard>
  );
}

// Key order mirrors messages/en.json exactly (see messages/KEY_USAGE.md):
// whatIsOpenflow (brand card) → foundation header → the four foundation items
// in catalog order: multiTenancy, multiChannel, deployToYourWebsite,
// expensesControlPerTenant.
export function SolutionsBento() {
  const t = useTranslations('landing.families.foundation');
  return (
    <div className="w-full bg-[#070707]">
      <ScrollFadeSection from="#070707" to="#101010" className="modular-solutions px-10 pt-25 pb-30">
        <div className="mx-auto max-w-[1232px]">
          <BrandCard />
          <div className="mt-24">
            <SectionHeading dark lead={t('title')} rest={t('intro')} />
          </div>
          <div className="mt-14 flex flex-wrap gap-4">
            <BentoCard
              title={t('items.multiTenancy.title')}
              description={t('items.multiTenancy.description')}
              className="grow basis-[calc(66.666%-8px)] lg:aspect-[816/600]"
            >
              <ChatMockup />
            </BentoCard>
            <BentoCard
              title={t('items.multiChannel.title')}
              description={t('items.multiChannel.description')}
              className="grow basis-[calc(33.333%-8px)] lg:max-w-[400px]"
            >
              <ChannelChips />
            </BentoCard>
            <BentoCard
              title={t('items.deployToYourWebsite.title')}
              description={t('items.deployToYourWebsite.description')}
              className="grow basis-[calc(66.666%-8px)]"
            >
              <div className="flex items-start gap-8">
                <div className="min-w-0 flex-1">
                  <CodeSnippet />
                </div>
                <Image
                  src="/reference/bento-terminal.png"
                  alt=""
                  width={308}
                  height={525}
                  className="mt-6 hidden w-[200px] shrink-0 rounded-lg lg:block"
                />
              </div>
            </BentoCard>
            <BentoCard
              title={t('items.expensesControlPerTenant.title')}
              description={t('items.expensesControlPerTenant.description')}
              className="grow basis-[calc(33.333%-8px)] lg:max-w-[400px]"
            >
              <BillingMockup />
            </BentoCard>
          </div>
        </div>
      </ScrollFadeSection>
    </div>
  );
}
