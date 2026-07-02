import { FoldedSilkCanvas } from './FoldedSilkCanvas';
import { TrafficCounter } from './TrafficCounter';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

// Customer wordmarks in the logo bar under the hero, styled to read as the
// brands' marks.
const LOGO_BAR = [
  { name: '▲ Vercel', className: 'text-xl font-semibold tracking-tight text-[#061b31]' },
  { name: 'Uber', className: 'text-xl font-medium tracking-tight text-[#061b31]' },
  { name: 'ANTHROP\\C', className: 'text-base font-semibold tracking-[0.08em] text-[#061b31]' },
  { name: 'lightspeed', className: 'text-xl font-bold tracking-tight text-[#e4573d]' },
  { name: 'Linear', className: 'text-xl font-medium tracking-tight text-[#061b31]/85' },
  { name: 'runway', className: 'text-xl font-semibold tracking-tight text-[#061b31]' },
  { name: '⚡ Supabase', className: 'text-lg font-semibold tracking-tight text-[#061b31]/90' },
] as const;

function ArrowIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function HeroCtas() {
  return (
    <div className="mt-[66px] flex flex-wrap items-center gap-4">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 items-center gap-2 rounded-[4px] bg-[#533afd] px-6 text-base text-white transition-colors hover:bg-[#4430d4]"
      >
        Get started
        <ArrowIcon />
      </a>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 items-center gap-2 rounded-[4px] border border-[#b9b9f9] bg-white/65 px-6 text-base text-[#533afd] transition-colors hover:bg-white"
      >
        <GitHubIcon />
        View on GitHub
      </a>
    </div>
  );
}

function LogoBar() {
  return (
    <div className="relative border-t border-[#0a2540]/10">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-10 py-8">
        {LOGO_BAR.map((logo) => (
          <span key={logo.name} className={logo.className}>
            {logo.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* The wave lives only in the upper hero area — the logo bar below
          stays clear of it. The absolute navbar overlays its top. */}
      <div className="relative">
        <FoldedSilkCanvas className="absolute inset-0" />

        <div className="relative mx-auto w-full max-w-[994px] px-6 pt-[147px] pb-14 lg:px-0">
          <p className="text-base text-black">
            Share of customer conversations running on OpenFlow: <TrafficCounter />
          </p>

          <h1 className="mt-[18px] max-w-[961px] text-[34px] leading-[1.15] font-light tracking-[-0.02em] sm:text-[44px]">
            <em className="font-normal not-italic text-[#061b31]">
              Agent infrastructure to power your SaaS.
            </em>{' '}
            {/* Yellow + difference blend: white backdrop turns it blue-violet
                and the silk shows through the glyphs as inverted color. */}
            <span className="text-[#ddd600] mix-blend-difference">
              Build an AI agent, connect WhatsApp, Slack, or a chatbot, and give every customer their own
              isolated instance, from your first tenant to your last.
            </span>
          </h1>

          <HeroCtas />
        </div>
      </div>

      <LogoBar />
    </section>
  );
}
