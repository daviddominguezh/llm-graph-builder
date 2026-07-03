import Image from 'next/image';

import { BentoCard } from './BentoCard';
import { ParticleFieldCanvas } from './ParticleFieldCanvas';
import { SectionHeading } from './SectionHeading';

const CARD_SHADOW = 'shadow-[0_6px_12px_-2px_rgba(50,50,93,0.12),0_3px_7px_-3px_rgba(0,0,0,0.06)]';

// Chat-agent mockup inside a browser-window frame (the reference's
// browser-graphic, 630x580 ratio), over its bento backdrop.
function ChatMockup() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-t-lg p-6 lg:aspect-[630/580]">
      <Image
        src="/reference/payment-bento-background.jpg"
        alt=""
        width={860}
        height={712}
        className="absolute inset-0 h-full w-full object-cover opacity-60"
      />
      <div className="browser-graphic__window relative flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-[0_10px_24px_-8px_rgba(50,50,93,0.25)]">
        <div className="flex items-center gap-2 border-b border-[#061b31]/8 bg-[#f6f9fc] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e4573d]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f5b62e]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2ec46e]/70" />
          <span className="ml-3 flex-1 rounded-md bg-white px-3 py-1 text-center text-[11px] text-[#425466]">
            acme-travel.openflow.app
          </span>
        </div>
        <div className="p-5">
          <ChatMockupBody />
        </div>
      </div>
    </div>
  );
}

function ChatMockupBody() {
  return (
    <div className="relative">
      <div className="flex items-center gap-2 border-b border-[#061b31]/8 pb-3">
        <span className="h-2 w-2 rounded-full bg-[#2ec46e]" />
        <span className="text-xs font-medium text-[#425466]">agent · acme-travel · WhatsApp</span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="max-w-[75%] rounded-lg bg-white px-3 py-2 text-xs text-[#425466] shadow-sm">
          Hi! I need to move my flight to Friday.
        </div>
        <div className="ml-auto max-w-[75%] rounded-lg bg-[#533afd] px-3 py-2 text-xs text-white shadow-sm">
          Sure — you&apos;re confirmed on the 10:40 AM to Denver this Friday. Anything else?
        </div>
        <div className="max-w-[75%] rounded-lg bg-white px-3 py-2 text-xs text-[#425466] shadow-sm">
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
      <div className={`rounded-lg bg-white p-5 ${CARD_SHADOW}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#533afd]/10 text-sm font-semibold text-[#533afd]">
            P
          </div>
          <div>
            <p className="text-sm font-semibold text-[#061b31]">Plan Pro</p>
            <p className="text-xs text-[#425466]">Monthly billing</p>
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold text-[#061b31]">Tokens</p>
        <p className="text-xs text-[#425466]">USD 0.01 per 1,000 units</p>
        <p className="mt-3 text-xs text-[#425466]">◔ Usage meter</p>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#061b31]/6">
          <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#533afd] via-[#a05df0] to-[#f06bb3]" />
        </div>
      </div>
      <div className={`rounded-lg bg-white p-5 ${CARD_SHADOW}`}>
        <p className="text-xs text-[#425466]">Tokens used in the last 30 days</p>
        <p className="mt-1 text-sm font-semibold text-[#061b31]">1,757,267,878</p>
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
      {['WhatsApp', 'Slack', 'Web chat', 'Email', 'Voice'].map((channel) => (
        <span
          key={channel}
          className="rounded-full border border-[#061b31]/10 bg-[#f6f9fc] px-3 py-1 text-xs font-medium text-[#425466]"
        >
          {channel}
        </span>
      ))}
    </div>
  );
}

function RevenueSparkline() {
  const bars = [30, 45, 38, 58, 50, 72, 66, 88];
  return (
    <div className="mt-6 flex h-14 items-end gap-1.5">
      {bars.map((height, i) => (
        <div
          key={i}
          className="w-4 rounded-sm bg-gradient-to-t from-[#533afd]/60 to-[#f06bb3]/60"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

// Agent-recommended product cards, on the reference's agentic-commerce
// layout with its product imagery.
const PRODUCTS = [
  { name: 'Deluxe shirt', variant: 'Blue: medium', price: 'USD 26.00', image: '/reference/shirt-blue.png' },
  {
    name: 'Essential hoodie',
    variant: 'Navy: medium',
    price: 'USD 48.00',
    image: '/reference/hoodie-navy.png',
  },
] as const;

function ProductCards() {
  return (
    <div className="agentic-commerce-graphic__products mx-auto mt-6 grid max-w-[276px] grid-cols-2 gap-3">
      {PRODUCTS.map((product) => (
        <div key={product.name} className={`rounded-lg bg-white p-3 ${CARD_SHADOW}`}>
          <div className="flex items-center justify-center rounded-md bg-[#eef2f7] p-3">
            <Image src={product.image} alt="" width={160} height={160} className="h-auto w-full max-w-[96px]" />
          </div>
          <p className="mt-2 text-xs font-semibold text-[#061b31]">{product.name}</p>
          <p className="text-[11px] text-[#7a8bb0]">{product.variant}</p>
          <p className="mt-1 text-xs font-semibold text-[#061b31]">{product.price}</p>
          <p className="text-[11px] text-[#425466]">Cartsy</p>
        </div>
      ))}
    </div>
  );
}

function CodeSnippet() {
  return (
    <pre className="mt-6 overflow-x-auto rounded-lg bg-[#0e1a38] p-5 text-xs leading-relaxed text-[#9fb5d9]">
      {`const tenant = await openflow.tenants.create({
  name: 'acme-travel',
  channels: ['whatsapp'],
  agentGraph: travelAgent,
});`}
    </pre>
  );
}

export function SolutionsBento() {
  return (
    <section className="modular-solutions bg-[#f6f9fc] px-10 py-24">
      <div className="mx-auto max-w-[1232px]">
        <SectionHeading
          lead="Flexible solutions for every agent business."
          rest="Grow your company with a complete set of agent and monetization tools designed to work individually or together."
        />

        {/* Reference proportions scaled from its 1232 rail to our 1080:
            big card 2/3 x ~600, tall side cards 1/3 x ~605, wide full-rail
            card ~400 tall. */}
        <div className="mt-14 grid gap-2 lg:grid-cols-[828fr_409fr]">
          <BentoCard
            title="Deploy agents across every channel, in every tenant"
            className="lg:aspect-[828/686]"
          >
            <ChatMockup />
          </BentoCard>
          <BentoCard title="Enable any billing model" className="lg:aspect-[409/690]">
            <BillingMockup />
          </BentoCard>
        </div>

        <div className="mt-2 grid gap-2 lg:grid-cols-3">
          <BentoCard
            title="Monetize agent commerce"
            description="Charge per plan, per seat, or per token — pricing that follows your agents."
            className="lg:aspect-[409/690]"
          >
            <ParticleFieldCanvas mode="scatter" />
            <div className="relative">
              <ProductCards />
            </div>
          </BentoCard>
          <BentoCard
            title="Create per-tenant channels"
            description="Every customer gets their own numbers, workspaces, and identities."
            className="lg:aspect-[409/690]"
          >
            <ChannelChips />
          </BentoCard>
          <BentoCard
            title="Access usage-based revenue"
            description="Meter every conversation and turn agent traffic into recurring revenue."
            className="lg:aspect-[409/690]"
          >
            <ParticleFieldCanvas mode="globe" />
            <div className="relative">
              <RevenueSparkline />
            </div>
          </BentoCard>
        </div>

        <div className="mt-2">
          <BentoCard
            title="Integrate agents into your platform"
            description="A single API call provisions an isolated tenant with channels, memory, and billing."
            className="lg:aspect-[1245/456]"
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
                className="mt-6 hidden w-[240px] shrink-0 rounded-lg lg:block"
              />
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
