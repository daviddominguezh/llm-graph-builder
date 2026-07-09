import { useTranslations } from 'next-intl';

// The opening splash — the intro's first frame. Rendered as an overlay inside
// the pinned IntroScene (on top of the hero); GSAP fades its opacity to 0 as the
// user begins to scroll, revealing the hero beneath. No scroll logic of its own.
export function Opening() {
  const t = useTranslations('landing.opening');

  const sizesMobile = 'h-[calc(100%-calc(72px+var(--spacing)*3))] w-[calc(100%-var(--spacing)*6)]';
  const sizesDesktop = 'lg:h-[calc(100%-calc(72px+var(--spacing)*7))] lg:w-[calc(100%-var(--spacing)*14)]';
  const sizes = `${sizesMobile} ${sizesDesktop}`;

  return (
    <div data-intro="opening" className="absolute inset-0 z-[20] flex justify-center bg-white">
      <div className={`mt-[72px] flex ${sizes} items-center justify-center rounded-3xl bg-black`}>
        <h1 className="max-w-6xl text-center tracking-[-.01em] text-white text-[32px] lg:text-[56px] lg:text-[4rem] leading-[1.05] font-normal">
          {t('title')}
        </h1>
      </div>
    </div>
  );
}
