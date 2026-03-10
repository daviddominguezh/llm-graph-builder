'use client';

import { fetchVersions } from '@/app/lib/graphApi';
import type { VersionSummary } from '@/app/lib/graphApi';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface UseVersionsReturn {
  versions: VersionSummary[];
  currentVersion: number;
  loading: boolean;
  refresh: () => Promise<void>;
  setCurrentVersion: (version: number) => void;
}

interface VersionsState {
  versions: VersionSummary[];
  loading: boolean;
}

const INITIAL_STATE: VersionsState = { versions: [], loading: false };

function useLoadVersionsOnMount(
  agentId: string | undefined,
  onLoaded: (versions: VersionSummary[]) => void,
  onError: () => void
): void {
  useEffect(() => {
    if (agentId === undefined) return;

    let cancelled = false;

    fetchVersions(agentId)
      .then((result) => {
        if (!cancelled) onLoaded(result);
      })
      .catch(() => {
        if (!cancelled) onError();
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, onLoaded, onError]);
}

export function useVersions(agentId: string | undefined, initialVersion: number): UseVersionsReturn {
  const t = useTranslations('editor');
  const [state, setState] = useState<VersionsState>(INITIAL_STATE);
  const [currentVersion, setCurrentVersion] = useState(initialVersion);

  const handleLoaded = useCallback((versions: VersionSummary[]) => {
    setState({ versions, loading: false });
  }, []);

  const handleError = useCallback(() => {
    setState((prev) => ({ ...prev, loading: false }));
    toast.error(t('loadVersionsFailed'));
  }, [t]);

  useLoadVersionsOnMount(agentId, handleLoaded, handleError);

  const refresh = useCallback(async () => {
    if (agentId === undefined) return;
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const result = await fetchVersions(agentId);
      setState({ versions: result, loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
      toast.error(t('loadVersionsFailed'));
    }
  }, [agentId, t]);

  return {
    versions: state.versions,
    currentVersion,
    loading: state.loading,
    refresh,
    setCurrentVersion,
  };
}
