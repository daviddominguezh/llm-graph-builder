'use client';

import { getKvEntries, type KvEntry, saveKvEntries } from '@/app/lib/kvStores';
import { useEffect, useRef, useState } from 'react';

import { KvStoreTable } from './KvStoreTable';

interface KvStoreTableConnectedProps {
  storeId: string;
  tenantId: string;
}

const SAVE_DEBOUNCE_MS = 600;

export function KvStoreTableConnected({
  storeId,
  tenantId,
}: KvStoreTableConnectedProps): React.JSX.Element | null {
  const [entries, setEntries] = useState<KvEntry[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadKey = `${storeId}::${tenantId}`;
  const lastLoadedRef = useRef<string>('');

  useEffect(() => {
    if (lastLoadedRef.current === loadKey) return;
    lastLoadedRef.current = loadKey;
    setEntries(null);
    let cancelled = false;
    void (async () => {
      const { result } = await getKvEntries(storeId, tenantId);
      if (!cancelled) setEntries(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, tenantId, loadKey]);

  function scheduleSave(next: KvEntry[]) {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveKvEntries(storeId, tenantId, next);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleChange(next: KvEntry[]) {
    setEntries(next);
    scheduleSave(next);
  }

  if (entries === null) return null;
  return <KvStoreTable entries={entries} onEntriesChange={handleChange} />;
}
