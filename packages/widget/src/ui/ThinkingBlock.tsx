import { useT } from '../app/i18nContext.js';

// Pulsing-dots indicator shown while the stream is alive but no text is
// currently streaming. Respects prefers-reduced-motion via motion-reduce:.
export function ThinkingBlock() {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 py-1 text-xs text-muted-foreground"
    >
      <span className="inline-flex gap-1" aria-hidden="true">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
      <span>{t('thinking')}</span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-pulse motion-reduce:opacity-70"
      style={{ animationDelay: delay }}
    />
  );
}
