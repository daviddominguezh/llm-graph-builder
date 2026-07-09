import openflowLogo from '@/app/openflowLogoWhite.png';
import Image from 'next/image';
import Link from 'next/link';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

type FooterLink = { label: string; href: string; external?: boolean };

type FooterColumn = { title: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Compare', href: '#comparison' },
      { label: 'GitHub', href: GITHUB_URL, external: true },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Documentation', href: GITHUB_URL, external: true },
      { label: 'API reference', href: GITHUB_URL, external: true },
      { label: 'Changelog', href: GITHUB_URL, external: true },
    ],
  },
  {
    title: 'Stack',
    links: [
      { label: 'Next.js 16 · React 19', href: GITHUB_URL, external: true },
      { label: 'Vercel AI SDK', href: GITHUB_URL, external: true },
      { label: 'Supabase · Docker', href: GITHUB_URL, external: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'MIT License', href: GITHUB_URL, external: true },
    ],
  },
];

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (link.external === true) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-[#666] transition-colors hover:text-white"
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className="text-sm text-[#666] transition-colors hover:text-white">
      {link.label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-dashed border-neutral-800 bg-[#000] px-10 py-16">
      <div className="mx-auto max-w-[1232px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:[&>div]:border-l lg:[&>div]:border-dashed lg:[&>div]:border-[#061b31]/10 lg:[&>div]:pl-8 lg:[&>div:first-child]:border-l-0 lg:[&>div:first-child]:pl-0">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold text-white">{column.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Luminosity gradient: the white wordmark starts dim at the top and
            brightens to full toward the bottom via an alpha mask. */}
        <div className="relative mt-14 mix-blend-screen">
          <Image
            src={openflowLogo}
            alt="OpenFlow"
            className="h-auto w-full "
            style={{
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.3))',
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.3))',
            }}
          />
        </div>

        <div className="mt-14 flex items-center justify-between border-t border-dashed border-neutral-800 pt-6">
          <span className="text-xs text-[#666]">© 2026 OpenFlow</span>
          <span className="text-xs text-[#666]">Open Source · MIT Licensed</span>
        </div>
      </div>
    </footer>
  );
}
