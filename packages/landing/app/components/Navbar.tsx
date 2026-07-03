import icon from '@/app/icon.png';
import logoBlack from '@/app/openflowLogoBlack.png';
import Image from 'next/image';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Compare', href: '#comparison' },
] as const;

function ArrowIcon() {
  return (
    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavLinks() {
  return (
    <div className="hidden items-center gap-7 sm:flex">
      {NAV_LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="flex items-center gap-1 text-sm text-[#061b31] transition-opacity hover:opacity-60"
        >
          {link.label}
          <svg className="h-2.5 w-2.5 opacity-60" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      ))}
    </div>
  );
}

// Knockout text: with `lighten`, the white pill stays white (max with white
// wins) while the black glyphs resolve to the backdrop — the wave shows
// through the letters as if they were transparent. Works because neither the
// nav nor its ancestors create a stacking context that would isolate the
// blend from the hero canvas.
function SignInButton() {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-10 items-center rounded-[4px] bg-white px-5 text-sm font-medium text-black mix-blend-lighten"
    >
      Sign in with GitHub
    </a>
  );
}

export function Navbar() {
  return (
    <nav className="absolute top-0 w-full bg-transparent">
      <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-6">
        <div className="flex items-center gap-12">
          <a href="#" className="flex items-center gap-2">
            <Image className="mb-0.5" src={icon} alt="OpenFlow" height={26} priority />
            <Image src={logoBlack} alt="OpenFlow" height={20} priority />
          </a>
          <NavLinks />
        </div>

        <div className="flex items-center gap-3">
          <SignInButton />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-[4px] bg-[#533afd] px-5 text-sm font-medium text-white transition-colors hover:bg-[#4430d4]"
          >
            Get started
            <ArrowIcon />
          </a>
        </div>
      </div>
    </nav>
  );
}
