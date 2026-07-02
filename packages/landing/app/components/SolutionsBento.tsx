import Image from 'next/image';

import { BentoCard } from './BentoCard';
import { SectionHeading } from './SectionHeading';

const CARD_SHADOW = 'shadow-[0_6px_12px_-2px_rgba(50,50,93,0.12),0_3px_7px_-3px_rgba(0,0,0,0.06)]';

// Chat-agent mockup: a tenant's WhatsApp-style conversation with the agent,
// sitting over the reference's bento backdrop.
function ChatMockup() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-t-lg border border-b-0 border-[#061b31]/8 p-5">
      <Image
        src="/reference/payment-bento-background.jpg"
        alt=""
        width={860}
        height={712}
        className="absolute inset-0 h-full w-full object-cover opacity-60"
      />
      <ChatMockupBody />
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

function PriceRows() {
  return (
    <div className="mt-6 space-y-2">
      {[
        ['Starter agent', '$49/mo'],
        ['Pro agent', '$199/mo'],
        ['Usage overage', '$0.01/1k'],
      ].map(([label, price]) => (
        <div key={label} className="flex justify-between rounded-md bg-[#f6f9fc] px-3 py-2 text-xs">
          <span className="text-[#425466]">{label}</span>
          <span className="font-semibold text-[#061b31]">{price}</span>
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
    <section className="bg-[#f6f9fc] px-10 py-24">
      <div className="mx-auto max-w-[1080px]">
        <SectionHeading
          lead="Flexible solutions for every agent business."
          rest="Grow your company with a complete set of agent and monetization tools designed to work individually or together."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <BentoCard title="Deploy agents across every channel, in every tenant">
            <ChatMockup />
          </BentoCard>
          <BentoCard title="Enable any billing model">
            <BillingMockup />
          </BentoCard>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <BentoCard
            title="Monetize agent commerce"
            description="Charge per plan, per seat, or per token — pricing that follows your agents."
          >
            <PriceRows />
          </BentoCard>
          <BentoCard
            title="Create per-tenant channels"
            description="Every customer gets their own numbers, workspaces, and identities."
          >
            <ChannelChips />
          </BentoCard>
          <BentoCard
            title="Access usage-based revenue"
            description="Meter every conversation and turn agent traffic into recurring revenue."
          >
            <RevenueSparkline />
          </BentoCard>
        </div>

        <div className="mt-6">
          <BentoCard
            title="Integrate agents into your platform"
            description="A single API call provisions an isolated tenant with channels, memory, and billing."
          >
            <CodeSnippet />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
