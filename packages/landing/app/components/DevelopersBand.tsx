import Image from 'next/image';

import { FoldedSilkCanvas } from './FoldedSilkCanvas';

// Dark stats band: dim line-silk flowing behind a two-tone heading and three
// giant gradient stats, mirroring the reference's developers section.
const STATS = [
  {
    value: '500 M+',
    label: 'agent messages per day',
    gradient: 'from-[#f5b78a] via-[#f06bb3] to-[#a06ff0]',
  },
  {
    value: '10 k+',
    label: 'API requests per second',
    gradient: 'from-[#f06bb3] via-[#c46df0] to-[#8b7bf7]',
  },
  {
    value: '150 k+',
    label: 'conversations per minute',
    gradient: 'from-[#8b7bf7] via-[#7a8bf7] to-[#6aa8f7]',
  },
] as const;

function Stat({ value, label, gradient }: (typeof STATS)[number]) {
  return (
    <div>
      <div
        className={`bg-gradient-to-r ${gradient} bg-clip-text text-[56px] font-light leading-none tracking-[-0.02em] text-transparent`}
      >
        {value}
      </div>
      <p className="mt-4 text-sm text-white">{label}</p>
    </div>
  );
}

const INTEGRATIONS = ['Salesforce', 'HubSpot', 'Zendesk', 'Slack', 'Twilio', 'Shopify', 'Notion', 'Stripe'] as const;

const INTEGRATION_PATHS = [
  {
    title: 'No-code',
    description: 'Design agent graphs visually and launch tenants without writing a line.',
  },
  {
    title: 'Low-code',
    description: 'Start from templates and drop into code only where your business logic lives.',
  },
  {
    title: 'API-first',
    description: 'Provision tenants, channels, and billing programmatically with typed SDKs.',
  },
] as const;

function ConnectBlock() {
  return (
    <div className="border-b border-white/8 pb-16">
      <h2 className="max-w-2xl text-2xl leading-snug tracking-[-0.01em]">
        <em className="font-normal not-italic text-white">Connect with existing systems.</em>{' '}
        <span className="text-[#7d90b8]">
          Your agents plug into the tools your customers already run on.
        </span>
      </h2>
      <div className="relative mt-10 overflow-hidden rounded-lg">
        <Image
          src="/reference/ConnectBentoBackground.jpg"
          alt=""
          width={1242}
          height={454}
          className="h-auto w-full"
        />
        <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-3 px-8">
          {INTEGRATIONS.map((name) => (
            <span
              key={name}
              className="rounded-full border border-white/20 bg-[#0e1a38]/60 px-4 py-1.5 text-sm text-white backdrop-blur-sm"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationPaths() {
  return (
    <div className="mt-20 border-t border-white/8 pt-16">
      <h2 className="max-w-2xl text-2xl leading-snug tracking-[-0.01em]">
        <em className="font-normal not-italic text-white">Choose an integration path.</em>{' '}
        <span className="text-[#7d90b8]">
          With rich documentation and built-in debugging tools, you can get started quickly with the best
          option for your business.
        </span>
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {INTEGRATION_PATHS.map((path) => (
          <div key={path.title} className="rounded-lg border border-white/10 bg-white/4 p-6">
            <h3 className="text-base font-medium text-white">{path.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#7d90b8]">{path.description}</p>
            <span className="mt-3 inline-block text-sm font-medium text-[#8b9df7]">Learn more ›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DevelopersBand() {
  return (
    <section className="relative overflow-hidden bg-[#0e1a38]">
      <FoldedSilkCanvas className="absolute inset-0" timeOffset={90000} variant="fibrous" />

      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[1240px] -translate-x-1/2 border-x border-white/8 lg:block" />

      <div className="relative mx-auto w-full max-w-[1080px] px-0 pt-24 pb-24">
        <ConnectBlock />

        <h2 className="mt-20 max-w-2xl text-2xl leading-snug tracking-[-0.01em]">
          <em className="font-normal not-italic text-white">Scale with confidence.</em>{' '}
          <span className="text-[#7d90b8]">
            Handle thousands of conversations per second with consistent speed and reliability, even during
            peak traffic periods.
          </span>
        </h2>

        <div className="mt-[360px] grid gap-x-10 gap-y-12 sm:grid-cols-3">
          {STATS.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
        </div>

        <IntegrationPaths />
      </div>
    </section>
  );
}
