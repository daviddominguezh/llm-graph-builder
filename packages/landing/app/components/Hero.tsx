import Image from 'next/image';

import logoBrowserbase from '@/public/cloudicons/logo_browserbase.png';
import logoCloudflare from '@/public/cloudicons/logo_cloudflare.png';
import logoFly from '@/public/cloudicons/logo_fly.png';
import logoGithub from '@/public/cloudicons/logo_github.png';
import logoGoogle from '@/public/cloudicons/logo_google.png';
import logoOpenrouter from '@/public/cloudicons/logo_openrouter.svg';
import logoReactflow from '@/public/cloudicons/logo_reactflow.png';
import logoRedis from '@/public/cloudicons/logo_redis.webp';
import logoSupabase from '@/public/cloudicons/logo_supabase.png';
import logoTavily from '@/public/cloudicons/logo_tavily.png';
import logoUpstash from '@/public/cloudicons/logo_upstash.png';
import logoVercel from '@/public/cloudicons/logo_vercel.svg';

import { FoldedSilkCanvas } from './FoldedSilkCanvas';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

// Integration/partner logos in the hero logo bar. Each asset already includes
// the brand's wordmark, so no text label — rendered at a fixed height with
// auto width so varied aspect ratios stay undistorted.
const LOGO_BAR = [
  { name: 'Vercel', src: logoVercel },
  { name: 'Supabase', src: logoSupabase },
  { name: 'GitHub', src: logoGithub },
  { name: 'Cloudflare', src: logoCloudflare },
  { name: 'Google Cloud', src: logoGoogle },
  { name: 'OpenRouter', src: logoOpenrouter },
  { name: 'React Flow', src: logoReactflow },
  { name: 'Tavily', src: logoTavily },
  { name: 'Browserbase', src: logoBrowserbase },
  { name: 'Fly.io', src: logoFly },
  { name: 'Redis', src: logoRedis },
  { name: 'Upstash', src: logoUpstash },
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
    <div className="my-[66px] flex flex-wrap items-center gap-4">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 min-w-[172px] items-center justify-center gap-2 rounded-[4px] bg-[#533afd] px-6 text-base text-white transition-colors hover:bg-[#4430d4]"
      >
        Get started
        <ArrowIcon />
      </a>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 min-w-[247px] items-center justify-center gap-2 rounded-[4px] border border-[#b9b9f9] bg-white/65 px-6 text-base text-[#533afd] transition-colors hover:bg-white"
      >
        <GitHubIcon />
        View on GitHub
      </a>
    </div>
  );
}

function LogoTiles({ hidden }: { hidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden === true ? 'true' : undefined}>
      {LOGO_BAR.map((logo) => (
        <span key={logo.name} className="flex h-[72px] shrink-0 items-center px-9">
          <Image src={logo.src} alt={logo.name} className="h-[23px] w-auto object-contain" />
        </span>
      ))}
    </div>
  );
}

// Continuously scrolling logo carousel: the track holds the tile set twice
// and slides half its width per cycle for a seamless loop.
function LogoBar() {
  return (
    <div className="border-y border-dashed border-[#0a2540]/10">
      <div className="mx-auto max-w-[1280px] overflow-hidden py-0">
        <div className="logo-marquee relative -z-[1] flex w-max">
          <LogoTiles />
          <LogoTiles hidden />
        </div>
      </div>
    </div>
  );
}

const HEADING_LEAD = 'Agent infrastructure to power your SaaS.';
const HEADING_REST =
  ' Build an AI agent, connect WhatsApp, Slack, or a chatbot, and give every customer their own isolated instance, from your first tenant to your last.';
const HEADING_BASE =
  'max-w-[961px] text-[34px] leading-[1.15] font-light tracking-[-0.02em] sm:text-[44px]';

// Reference title color-blend (exact CSS + stacking): TWO stacked copies with
// the wave canvas sandwiched between them by z-index.
//   - background copy (z-0): navy lead + yellow (#ddd600) rest, BELOW the wave
//   - wave canvas (z-1): painted over the background copy
//   - foreground copy (z-2): mix-blend-mode hard-light, #2d2564 lead +
//     rgba(0,14,255,.5) rest, ON TOP — so it hard-lights against the WAVE,
//     which is what makes the glyph color track the silk as it passes.
// The wrapper stays z-auto (no stacking context) so all three resolve in the
// hero's isolated context.
function HeroHeading() {
  return (
    <div className="relative mt-[32px]">
      <div className={`${HEADING_BASE} relative z-0`} aria-hidden="true">
        <em className="font-normal not-italic text-[#061b31]">{HEADING_LEAD}</em>
        <span className="text-[#ddd600]">{HEADING_REST}</span>
      </div>
      <h1 className={`${HEADING_BASE} absolute inset-0 z-[2] mix-blend-hard-light`}>
        <em className="font-normal not-italic text-[#2d2564]">{HEADING_LEAD}</em>
        <span className="text-[rgba(0,14,255,0.5)]">{HEADING_REST}</span>
      </h1>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero-wave-animation relative isolate overflow-hidden bg-white">
      {/* Hero-local guide rails: the section is isolated (for the marquee
          stacking), which paints it atomically above the page-level guides —
          so the rails are re-drawn here, under the silk. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[1280px] -translate-x-1/2 border-x border-dashed border-[#061b31]/6 lg:block"
      />
      {/* Wave at z-1: sits ABOVE the background title copy (z-0) and BELOW the
          foreground copy (z-2), so the hard-light foreground blends against
          the silk. Also passes over the logo bar. */}
      <FoldedSilkCanvas className="hero-wave-animation__canvas absolute inset-0 z-[1]" />

      {/* Content column stays z-auto (no stacking context) so the heading's
          two copies resolve around the wave. CTAs get z-2 to sit above it. */}
      <div className="relative mx-auto w-full max-w-[994px] px-6 pt-[155px] pb-0 lg:px-0">
        <HeroHeading />
        <div className="relative z-[2]">
          <HeroCtas />
        </div>
      </div>

      <LogoBar />
    </section>
  );
}
