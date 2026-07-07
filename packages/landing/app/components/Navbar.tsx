import { fetchGitHubStars } from '@/app/lib/github';
import logoFull from '@/app/openflowLightWhite.png';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

function GitHubIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// GitHub's classic star-badge widget: [octocat Star | count].
function GitHubStarButton({ stars }: { stars: number | null }) {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mix-blend-plus-lighter text-white inline-flex h-7.5 items-stretch overflow-hidden rounded-lg border border-[#d0d7de] bg-transparent hover:bg-white hover:text-black hover:mix-blend-normal text-sm font-semibold font-bold"
    >
      <span className="flex items-center gap-2 border-r border-neutral-300 px-3 transition-colors">
        <GitHubIcon />
        Star
      </span>
      <span className="text-xs flex items-center px-3 tabular-nums">
        {stars === null ? '—' : stars.toLocaleString('en-US')}
      </span>
    </a>
  );
}

// Knockout text: with `lighten`, the white pill stays white (max with white
// wins) while the black glyphs resolve to the backdrop — the wave shows
// through the letters as if they were transparent. Works because neither the
// nav nor its ancestors create a stacking context that would isolate the
// blend from the hero canvas.
function JoinWaitlistButton() {
  const t = useTranslations();
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-7.5 items-center rounded-lg bg-white hover:bg-white/90 px-3 text-sm font-medium text-black mix-blend-lighten font-bold"
    >
      {t('landing.hero.cta')}
    </a>
  );
}

export async function Navbar() {
  const stars = await fetchGitHubStars();

  return (
    <nav className="absolute top-0 w-full bg-transparent border-b border-dashed border-neutral-800">
      <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-6">
        <div className="flex items-center gap-12">
          <a href="#" className="flex items-center">
            <Image src={logoFull} alt="OpenFlow" height={24} priority />
          </a>
        </div>

        <div className="flex items-center gap-3">
          <JoinWaitlistButton />
          <GitHubStarButton stars={stars} />
        </div>
      </div>
    </nav>
  );
}
