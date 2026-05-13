import { useEffect, useRef, useState } from 'react';

import { getOAuthConnectionStatus } from '../actions/mcpOauth';

export interface OAuthStatusResult {
  connected: boolean;
  loading: boolean;
}

function getInitialLoading(libraryItemId: string | undefined): boolean {
  return libraryItemId !== undefined;
}

export function useOAuthStatus(orgId: string, libraryItemId: string | undefined): OAuthStatusResult {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(() => getInitialLoading(libraryItemId));
  const prevItemId = useRef(libraryItemId);

  useEffect(() => {
    if (prevItemId.current !== libraryItemId) {
      prevItemId.current = libraryItemId;
    }

    if (libraryItemId === undefined) return;

    void getOAuthConnectionStatus(orgId, libraryItemId)
      .then((result) => {
        setConnected(result.connected);
      })
      .catch(() => {
        setConnected(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [orgId, libraryItemId]);

  return { connected, loading };
}
