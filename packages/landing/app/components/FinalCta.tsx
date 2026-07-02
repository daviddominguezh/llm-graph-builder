import { SectionHeading } from './SectionHeading';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

function ArrowIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FinalCta() {
  return (
    <section className="bg-[#f6f9fc] px-10 py-24">
      <div className="mx-auto max-w-[1240px]">
        <SectionHeading
          lead="Ready to build your agent-powered SaaS?"
          rest="MIT licensed. Multi-tenant from day one. No license restrictions, no enterprise upsell."
        />

        <div className="mt-10 flex flex-wrap items-center gap-4">
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
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
