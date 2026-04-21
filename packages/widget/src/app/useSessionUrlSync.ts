import { useEffect } from 'react';

export function useSessionUrlSync(
  currentSessionId: string | null,
  onPopState: (sessionId: string | null) => void
): void {
  useEffect(() => {
    function onPop(e: PopStateEvent): void {
      const state = e.state as { sessionId?: string } | null;
      onPopState(state?.sessionId ?? null);
    }
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); };
  }, [onPopState]);

  useEffect(() => {
    if (currentSessionId === null) return;
    const current = new URLSearchParams(window.location.search).get('s');
    if (current === currentSessionId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('s', currentSessionId);
    window.history.pushState({ sessionId: currentSessionId }, '', url.toString());
  }, [currentSessionId]);
}
