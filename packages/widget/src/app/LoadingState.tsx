import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useT } from './i18nContext.js';

const LOADER_DELAY_MS = 1500;

function useDelayedVisible(delayMs: number): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);
  return visible;
}

function EmbeddedLoader({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="cursor-pointer w-full h-full rounded-full bg-primary/70 text-primary-foreground flex items-center justify-center animate-pulse"
    >
      <Sparkles className="size-6 opacity-80" />
    </div>
  );
}

function StandaloneLoader({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="w-full h-dvh flex flex-col items-center justify-center bg-background gap-3"
    >
      <img
        src="/favicon.png"
        alt=""
        width={40}
        height={40}
        className="size-10 rounded-md opacity-90 animate-pulse"
      />
      <div className="flex gap-1.5" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-pulse [animation-delay:0ms]" />
        <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-pulse [animation-delay:150ms]" />
        <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export function LoadingState({ embedded }: { embedded: boolean }) {
  const t = useT();
  const visible = useDelayedVisible(LOADER_DELAY_MS);
  if (!visible) return null;
  const label = t('loading');
  return embedded ? <EmbeddedLoader label={label} /> : <StandaloneLoader label={label} />;
}

export function AgentNotFoundState() {
  const t = useT();
  return (
    <div
      role="alert"
      className="w-full h-dvh flex flex-col items-center justify-center bg-background gap-2 px-6 text-center"
    >
      <img src="/favicon.png" alt="" width={32} height={32} className="size-8 opacity-60 mb-1" />
      <p className="text-sm font-semibold">{t('agentNotFound')}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{t('agentNotFoundHint')}</p>
    </div>
  );
}
