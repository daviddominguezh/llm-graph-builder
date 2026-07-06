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
        className="text-sm text-[#425466] transition-colors hover:text-[#061b31]"
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className="text-sm text-[#425466] transition-colors hover:text-[#061b31]">
      {link.label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-dashed border-neutral-800 bg-white px-10 py-16">
      <div className="mx-auto max-w-[1232px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:[&>div]:border-l lg:[&>div]:border-dashed lg:[&>div]:border-[#061b31]/10 lg:[&>div]:pl-8 lg:[&>div:first-child]:border-l-0 lg:[&>div:first-child]:pl-0">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold text-[#061b31]">{column.title}</h3>
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

        <div className="mt-14 flex items-center justify-between border-t border-dashed border-neutral-800 pt-6">
          <span className="text-sm text-[#425466]">© 2026 OpenFlow</span>
          <span className="text-sm text-[#425466]">Open Source · MIT Licensed</span>
        </div>
      </div>
    </footer>
  );
}
