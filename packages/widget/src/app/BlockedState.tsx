import { useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Rendered when the widget's effective host origin is not in the    */
/*  tenant's web-channel allowlist, or when the tenant has web-channel*/
/*  disabled. Intentionally renders nothing visible — we don't want   */
/*  to telegraph an allow/deny decision to the embedding page.        */
/*                                                                      */
/*  A single console.warn hints to the embedder why the widget isn't  */
/*  showing; the backend still enforces origin on every execute call. */
/* ------------------------------------------------------------------ */

export function BlockedState(): null {
  useEffect(() => {
    console.warn('[openflow-widget] blocked: this origin is not in the tenant web-channel allowlist');
  }, []);
  return null;
}
