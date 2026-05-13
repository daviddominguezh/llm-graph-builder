'use client';

import { getKvEntriesAction, saveKvEntriesAction } from '@/app/actions/kvStores';
import type { KvEntry } from '@/app/lib/kvStores';
import { useEffect, useRef, useState } from 'react';

import { KvStoreTable } from './KvStoreTable';

interface KvStoreTableConnectedProps {
  storeId: string;
  tenantId: string;
}

interface LoadedState {
  key: string;
  entries: KvEntry[];
}

const SAVE_DEBOUNCE_MS = 600;

export function KvStoreTableConnected({
  storeId,
  tenantId,
}: KvStoreTableConnectedProps): React.JSX.Element | null {
  const [state, setState] = useState<LoadedState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadKey = `${storeId}::${tenantId}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { result } = await getKvEntriesAction(storeId, tenantId);
      if (!cancelled) setState({ key: loadKey, entries: result });
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, tenantId, loadKey]);

  function scheduleSave(next: KvEntry[]) {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveKvEntriesAction(storeId, tenantId, next);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleChange(next: KvEntry[]) {
    setState({ key: loadKey, entries: next });
    scheduleSave(next);
  }

  if (state === null || state.key !== loadKey) return null;
  return <KvStoreTable entries={state.entries} onEntriesChange={handleChange} />;
}
