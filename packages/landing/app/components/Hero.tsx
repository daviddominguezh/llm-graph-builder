import openflowLogo from '@/app/openflowLogoWhite.png';
import logoBrowserbase from '@/public/cloudicons/logo_browserbase.png';
import logoCloudflare from '@/public/cloudicons/logo_cloudflare.png';
import logoFly from '@/public/cloudicons/logo_fly.png';
import logoGithub from '@/public/cloudicons/logo_github.png';
import logoGoogle from '@/public/cloudicons/logo_google.png';
import logoOpenrouter from '@/public/cloudicons/logo_openrouter.png';
import logoReactflow from '@/public/cloudicons/logo_reactflow.png';
import logoRedis from '@/public/cloudicons/logo_redis.webp';
import logoSupabase from '@/public/cloudicons/logo_supabase.png';
import logoTavily from '@/public/cloudicons/logo_tavily.png';
import logoUpstash from '@/public/cloudicons/logo_upstash.png';
import logoVercel from '@/public/cloudicons/logo_vercel.png';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { HeroWave } from './HeroWave';

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

// Per-brand height overrides to balance differing optical weights; brands not
// listed fall back to DEFAULT_LOGO_HEIGHT.
const DEFAULT_LOGO_HEIGHT = 'h-[23px]';
const LOGO_HEIGHT_OVERRIDES: Record<string, string> = {
  Vercel: 'h-[18px]',
  OpenRouter: 'h-[20px]',
  Browserbase: 'h-[28px]',
};

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
  const t = useTranslations('landing.hero');
  return (
    <div data-intro="ctas" className="my-[90px] flex flex-wrap items-center gap-4 opacity-0">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 px-10 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base text-black font-bold transition-colors hover:bg-white/90"
      >
        {t('cta')}
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
      {LOGO_BAR.map((logo) => (
        <span key={logo.name} className="flex h-[72px] shrink-0 items-center px-11">
          <Image
            src={logo.src}
            alt={logo.name}
            className={`marquee-logo ${LOGO_HEIGHT_OVERRIDES[logo.name] ?? DEFAULT_LOGO_HEIGHT} w-auto object-contain opacity-70 grayscale transition-transform duration-300 ease-out hover:scale-110 hover:opacity-100 hover:grayscale-0`}
          />
        </span>
      ))}
    </div>
  );
}

// Continuously scrolling logo carousel: the track holds the tile set twice
// and slides half its width per cycle for a seamless loop.
function LogoBar() {
  return (
    <div data-intro="logobar" className="border-y border-dashed border-neutral-800 opacity-0">
      <div className="mx-auto max-w-[1280px] overflow-hidden py-0">
        <div className="logo-marquee relative flex w-max">
          <LogoTiles />
          <LogoTiles hidden />
        </div>
      </div>
    </div>
  );
}

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
  const t = useTranslations('landing.hero');

  const titleStyle = 'h-fit col-start-1 row-start-1 font-normal not-italic text-white opacity-0';
  const descriptionStyle = 'text-[34px] leading-[1.15] font-extralight text-white/60';

  const [t1_1, t1_2] = t('title').split('\n');

  return (
    <div className={`${HEADING_BASE} relative z-[2] mt-[32px] mix-blend-plus-lighter flex flex-col gap-4`}>
      {/* title + title2 share one grid cell so they overlap exactly — the
          crossfade (see IntroScene) swaps them in place, not stacked. */}
      <div className="h-fit grid">
        <h1 data-intro="title" className={`${titleStyle} leading-[1.25]`}>
          <span className={`${descriptionStyle} font-light`}>{t1_1}</span>
          {'\n'}
          <span>{t1_2}</span>
        </h1>
        <h1 data-intro="title2" className={`${titleStyle} leading-[1] self-end`}>
          {t('title2')}
        </h1>
      </div>
      <h2 className={`mt-0 pt-0 h-fit ${descriptionStyle}`}>
        <span data-intro="subtitle" className="opacity-0">
          {t('subtitle')}
          {' '}
          <Image src={openflowLogo} alt="OpenFlow" className="h-[32px] w-auto inline" />
        </span>{': '}
        <span data-intro="description" className="opacity-0">
          {t('description')}
        </span>
      </h2>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero-wave-animation relative isolate min-h-screen overflow-hidden bg-[#070707]">
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
      <HeroWave
        className="hero-wave-animation__canvas pointer-events-none absolute inset-0 z-[1] opacity-0"
        perspectiveOrbit
      />

      {/* Content column stays z-auto (no stacking context) so the heading's
          two copies resolve around the wave. CTAs get z-2 to sit above it. */}
      <div className="relative mx-auto w-full max-w-[994px] px-6 pt-[155px] pb-0 lg:px-0 h-[calc(100vh-72px)]">
        <HeroHeading />
        <div className="relative z-[2]">
          <HeroCtas />
        </div>
      </div>

      <LogoBar />
    </section>
  );
}
