import { useTranslations } from 'next-intl';

export function MouseIcon() {
  return (
    <svg
      width="24"
      height="36"
      viewBox="0 0 24 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-white"
    >
      <rect x="1" y="1" width="22" height="34" rx="11" stroke="currentColor" strokeWidth="1.5" />
      <line
        x1="12"
        y1="8"
        x2="12"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="animate-pulse-slow"
      />
    </svg>
  );
}

export function ScrollIndicator() {
  const t = useTranslations('landing.opening');

  return (
    <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-3 animate-bounce">
      <span className="font-mono text-[10px] tracking-[0.3em] text-white uppercase">{t('scroll')}</span>
      <MouseIcon />
    </div>
  );
}

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
      <ScrollIndicator />
      <div className={`mt-[72px] flex ${sizes} items-center justify-center rounded-3xl bg-black`}>
        <h1 className="max-w-6xl text-center tracking-[-.01em] text-white text-[32px] lg:text-[56px] lg:text-[4rem] leading-[1.05] font-normal">
          {t('title')}
        </h1>
      </div>
    </div>
  );
}
