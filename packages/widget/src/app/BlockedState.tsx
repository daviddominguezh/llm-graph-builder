import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '../ui/primitives/button.js';
import { useT } from './i18nContext.js';

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://app.openflow.build';
const COPIED_FEEDBACK_MS = 1500;

/* ------------------------------------------------------------------ */
/*  Rendered when the widget's effective host origin is not in the    */
/*  tenant's web-channel allowlist, or when the tenant has web-channel*/
/*  disabled.                                                          */
/*                                                                      */
/*  Embedded mode stays silent (renders null) — we don't want to       */
/*  telegraph an allow/deny decision to an arbitrary embedding page.   */
/*  Standalone mode shows a visible empty-state since the user is      */
/*  visiting the widget's own hostname directly.                       */
/*                                                                      */
/*  A console.warn still hints to operators why the widget isn't       */
/*  showing; the backend enforces origin on every execute call.        */
/* ------------------------------------------------------------------ */

function useBlockedLogOnce(): void {
  useEffect(() => {
    console.warn('[openflow-widget] blocked: this origin is not in the tenant web-channel allowlist');
  }, []);
}

export function BlockedState({ embedded }: { embedded: boolean }) {
  useBlockedLogOnce();
  if (embedded) return null;
  return <BlockedStandalone />;
}

function CopyOriginPill({ origin }: { origin: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(origin);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? t('originCopied') : t('copyOrigin')}
      className="group inline-flex max-w-md items-center gap-2 rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground break-all transition-colors hover:bg-muted/70"
    >
      <span className="text-left">{origin}</span>
      {copied ? (
        <Check
          className="size-3 shrink-0 text-primary motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:duration-150"
          aria-hidden
        />
      ) : (
        <Copy
          className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      )}
    </button>
  );
}

function BlockedStandalone() {
  const t = useT();
  const origin = useMemo(() => window.location.origin, []);
  return (
    <div
      role="alert"
      className="w-full h-dvh flex flex-col items-center justify-center bg-background gap-4 px-6 text-center"
    >
      <img src="/favicon.png" alt="" width={32} height={32} className="size-8 opacity-60" />
      <div className="flex flex-col gap-1.5 max-w-md">
        <p className="text-sm font-semibold">{t('blockedTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('blockedHint')}</p>
      </div>
      <CopyOriginPill origin={origin} />
      <Button render={<a href={APP_ORIGIN} target="_blank" rel="noopener noreferrer" />}>
        {t('blockedCta')}
        <ArrowUpRight className="size-3.5" />
      </Button>
    </div>
  );
}
