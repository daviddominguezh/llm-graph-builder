import { useEffect } from 'react';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractSessionId(state: unknown): string | null {
  if (!isRecord(state)) return null;
  const { sessionId } = state;
  return typeof sessionId === 'string' ? sessionId : null;
}

export function useSessionUrlSync(
  currentSessionId: string | null,
  onPopState: (sessionId: string | null) => void
): void {
  useEffect(() => {
    function onPop(e: PopStateEvent): void {
      onPopState(extractSessionId(e.state));
    }
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
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
