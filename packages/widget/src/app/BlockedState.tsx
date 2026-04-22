import { useEffect } from 'react';

import { useT } from './i18nContext.js';

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

function BlockedStandalone() {
  const t = useT();
  const origin = window.location.origin;
  return (
    <div
      role="alert"
      className="w-full h-dvh flex flex-col items-center justify-center bg-background gap-3 px-6 text-center"
    >
      <img src="/favicon.png" alt="" width={32} height={32} className="size-8 opacity-60" />
      <div className="flex flex-col gap-1.5 max-w-md">
        <p className="text-sm font-semibold">{t('blockedTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('blockedHint')}</p>
      </div>
      <ol className="flex flex-col gap-1 text-left text-xs text-muted-foreground max-w-md">
        <li>1. {t('blockedStep1')}</li>
        <li>2. {t('blockedStep2')}</li>
        <li>
          3. {t('blockedStep3')}
          <code className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground break-all">
            {origin}
          </code>
        </li>
        <li>4. {t('blockedStep4')}</li>
      </ol>
    </div>
  );
}
