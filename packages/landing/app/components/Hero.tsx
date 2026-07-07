import logoBrowserbase from '@/public/cloudicons/logo_browserbase.png';
import logoCloudflare from '@/public/cloudicons/logo_cloudflare.png';
import logoFly from '@/public/cloudicons/logo_fly.png';
import logoGithub from '@/public/cloudicons/logo_github.png';
import logoGoogle from '@/public/cloudicons/logo_google.png';
import logoOpenrouter from '@/public/cloudicons/logo_openrouter.png';
import logoReactflow from '@/public/cloudicons/logo_reactflow.png';
import logoRedis from '@/public/cloudicons/logo_redis.png';
import logoSupabase from '@/public/cloudicons/logo_supabase.png';
import logoTavily from '@/public/cloudicons/logo_tavily.png';
import logoUpstash from '@/public/cloudicons/logo_upstash.png';
import logoVercel from '@/public/cloudicons/logo_vercel.png';
import textBrowserbase from '@/public/cloudicons/text_browserbase.png';
import textCloudflare from '@/public/cloudicons/text_cloudflare.png';
import textFly from '@/public/cloudicons/text_fly.png';
import textGithub from '@/public/cloudicons/text_github.png';
import textGoogle from '@/public/cloudicons/text_google.png';
import textOpenrouter from '@/public/cloudicons/text_openrouter.png';
import textReactflow from '@/public/cloudicons/text_reactflow.png';
import textRedis from '@/public/cloudicons/text_redis.png';
import textSupabase from '@/public/cloudicons/text_supabase.png';
import textTavily from '@/public/cloudicons/text_tavily.png';
import textUpstash from '@/public/cloudicons/text_upstash.png';
import textVercel from '@/public/cloudicons/text_vercel.png';
import Image from 'next/image';

import { HeroWave } from './HeroWave';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

// Integration/partner logos in the hero logo bar. Each brand is a lockup of two
// separate assets — the mark (`logo`) and the wordmark (`text`) — rendered at
// the same fixed height with auto width so neither gets distorted.
const LOGO_BAR = [
  { name: 'Vercel', logo: logoVercel, text: textVercel },
  { name: 'Supabase', logo: logoSupabase, text: textSupabase },
  { name: 'GitHub', logo: logoGithub, text: textGithub },
  { name: 'Cloudflare', logo: logoCloudflare, text: textCloudflare },
  { name: 'Google Cloud', logo: logoGoogle, text: textGoogle },
  { name: 'OpenRouter', logo: logoOpenrouter, text: textOpenrouter },
  { name: 'React Flow', logo: logoReactflow, text: textReactflow },
  { name: 'Tavily', logo: logoTavily, text: textTavily },
  { name: 'Browserbase', logo: logoBrowserbase, text: textBrowserbase },
  { name: 'Fly.io', logo: logoFly, text: textFly },
  { name: 'Redis', logo: logoRedis, text: textRedis },
  { name: 'Upstash', logo: logoUpstash, text: textUpstash },
] as const;

function ArrowIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M4 2l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
        className="inline-flex h-11 px-10 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base text-black font-bold transition-colors hover:bg-white/90"
      >
        Get started
        <ArrowIcon />
      </a>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 px-10 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-6 text-base text-white transition-colors hover:bg-white/10 font-bold"
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
      {LOGO_BAR.map((brand) => (
        <span key={brand.name} className="flex h-[72px] shrink-0 items-center gap-2.5 px-9">
          <Image src={brand.logo} alt="" aria-hidden className="h-[23px] w-auto object-contain" />
          <Image src={brand.text} alt={brand.name} className="h-[23px] w-auto object-contain" />
        </span>
      ))}
    </div>
  );
}

// Continuously scrolling logo carousel: the track holds the tile set twice
// and slides half its width per cycle for a seamless loop.
function LogoBar() {
  return (
    <div className="border-y border-dashed border-neutral-800">
      <div className="mx-auto max-w-[1280px] overflow-hidden py-0">
        <div className="logo-marquee relative -z-[1] flex w-max">
          <LogoTiles />
          <LogoTiles hidden />
        </div>
      </div>
    </div>
  );
}

const HEADING_LEAD = 'AI infrastructure to power your SaaS.';
const HEADING_REST =
  ' Build an agent, connect WhatsApp, Slack, or your own website, and give every customer their own isolated instance, from your first tenant to your last.';
const HEADING_BASE = 'max-w-[961px] text-[34px] leading-[1.15] font-light tracking-[-0.02em] sm:text-[44px]';

// The blend must live on the <h1>: its z-[2] makes it a stacking context, so a
// mix-blend on a child would only blend against the h1's own (empty) backdrop,
// not the silk wave (z-1). On the h1, difference blends the rendered glyphs —
// with their per-span colors — against the wave beneath. brightness() is
// applied BEFORE the blend: it lowers the glyph luminance so the inversion
// drives the text noticeably darker over the light/mid-gray wave (contrast)
// while it still reads light over the dark areas.
//  - Lead (white): near-white over dark, darkening toward black on the wave.
//  - Subtitle (light gray): a muted version of the same behaviour.
function HeroHeading() {
  return (
    <h1 className={`${HEADING_BASE} relative z-[2] mt-[32px] mix-blend-plus-lighter`}>
      <em className="font-normal not-italic text-white">{HEADING_LEAD}</em>
      <span className="font-extralight text-white/40">{HEADING_REST}</span>
    </h1>
  );
}

export function Hero() {
  return (
    <section className="hero-wave-animation relative isolate overflow-hidden bg-[#070707]">
      {/* Hero-local guide rails: the section is isolated (for the marquee
          stacking), which paints it atomically above the page-level guides —
          so the rails are re-drawn here, under the silk. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[1280px] -translate-x-1/2 border-x border-dashed border-neutral-800 lg:block"
      />
      {/* Wave at z-1: sits ABOVE the background title copy (z-0) and BELOW the
          foreground copy (z-2), so the hard-light foreground blends against
          the silk. Also passes over the logo bar. */}
      <HeroWave className="hero-wave-animation__canvas absolute inset-0 z-[1]" />

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
