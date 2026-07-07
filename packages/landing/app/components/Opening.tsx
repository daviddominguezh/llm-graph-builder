import { useTranslations } from 'next-intl';

// Full-viewport opening splash shown before the hero: just the headline,
// centered on black. The `\n` in the catalog string breaks the two lines
// (headings are `white-space: pre-wrap` site-wide, see globals.css).
export function Opening() {
  const t = useTranslations('landing.opening');
  return (
    <section className="flex min-h-screen h-screen bg-[#070707] flex justify-center">
      <div className="rounded-3xl mt-[72px] w-[calc(100%-var(--spacing)*14)] h-[calc(100%-calc(72px+var(--spacing)*7))] bg-black flex items-center justify-center">
        <h1 className="max-w-[960px] text-center text-[40px] leading-[1.12] font-medium tracking-[-0.02em] text-white sm:text-[56px]">
          {t('title')}
        </h1>
      </div>
    </section>
  );
}
