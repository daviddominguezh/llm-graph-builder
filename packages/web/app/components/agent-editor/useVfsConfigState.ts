'use client';

import type { AgentVfsSettings, VfsConfigRow } from '@/app/actions/vfsConfig';
import {
  deleteVfsConfigAction,
  fetchVfsConfigs,
  fetchVfsSettings,
  updateVfsSettingsAction,
  upsertVfsConfigAction,
} from '@/app/actions/vfsConfig';
import { useCallback, useEffect, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  State shape                                                        */
/* ------------------------------------------------------------------ */

export interface VfsConfigState {
  configs: VfsConfigRow[];
  settings: AgentVfsSettings | null;
  loading: boolean;
  error: string | null;
}

export interface VfsConfigActions {
  handleUpsertConfig: (orgId: string, installId: number, repoId: number, repoName: string) => void;
  handleDeleteConfig: (orgId: string) => void;
  handleToggleEnabled: (enabled: boolean) => void;
  handleUpdateSettings: (settings: AgentVfsSettings) => void;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useVfsConfigState(agentId: string): VfsConfigState & VfsConfigActions {
  const [configs, setConfigs] = useState<VfsConfigRow[]>([]);
  const [settings, setSettings] = useState<AgentVfsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadData(agentId, setConfigs, setSettings, setLoading, setError);
  }, [agentId]);

  const handleUpsertConfig = useCallback(
    (orgId: string, installId: number, repoId: number, repoName: string) => {
      void upsertConfig(agentId, orgId, installId, repoId, repoName, setConfigs, setError);
    },
    [agentId]
  );

  const handleDeleteConfig = useCallback(
    (orgId: string) => {
      void removeConfig(agentId, orgId, setConfigs, setError);
    },
    [agentId]
  );

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      void toggleEnabled(agentId, enabled, setSettings, setError);
    },
    [agentId]
  );

  const handleUpdateSettings = useCallback(
    (newSettings: AgentVfsSettings) => {
      void saveSettings(agentId, newSettings, setSettings, setError);
    },
    [agentId]
  );

  return {
    configs,
    settings,
    loading,
    error,
    handleUpsertConfig,
    handleDeleteConfig,
    handleToggleEnabled,
    handleUpdateSettings,
  };
}

/* ------------------------------------------------------------------ */
/*  Async helpers (extracted for line limits)                           */
/* ------------------------------------------------------------------ */

type SetConfigs = (fn: (prev: VfsConfigRow[]) => VfsConfigRow[]) => void;
type SetSettings = (fn: (prev: AgentVfsSettings | null) => AgentVfsSettings | null) => void;
type SetError = (val: string | null) => void;

async function loadData(
  agentId: string,
  setConfigs: (val: VfsConfigRow[]) => void,
  setSettings: (val: AgentVfsSettings | null) => void,
  setLoading: (val: boolean) => void,
  setError: SetError
): Promise<void> {
  try {
    const [cfgs, stngs] = await Promise.all([fetchVfsConfigs(agentId), fetchVfsSettings(agentId)]);
    setConfigs(cfgs);
    setSettings(stngs);
  } catch {
    setError('Failed to load VFS configuration');
  } finally {
    setLoading(false);
  }
}

async function upsertConfig(
  agentId: string,
  orgId: string,
  installId: number,
  repoId: number,
  repoName: string,
  setConfigs: SetConfigs,
  setError: SetError
): Promise<void> {
  const result = await upsertVfsConfigAction(agentId, orgId, installId, repoId, repoName);
  if (result.error !== null) {
    setError(result.error);
    return;
  }
  const refreshed = await fetchVfsConfigs(agentId);
  setConfigs(() => refreshed);
}

async function removeConfig(
  agentId: string,
  orgId: string,
  setConfigs: SetConfigs,
  setError: SetError
): Promise<void> {
  const result = await deleteVfsConfigAction(agentId, orgId);
  if (result.error !== null) {
    setError(result.error);
    return;
  }
  setConfigs((prev) => prev.filter((c) => c.org_id !== orgId));
}

async function toggleEnabled(
  agentId: string,
  enabled: boolean,
  setSettings: SetSettings,
  setError: SetError
): Promise<void> {
  const value = enabled ? { enabled: true as const } : null;
  setSettings(() => value); // optimistic update
  const result = await updateVfsSettingsAction(agentId, value);
  if (result.error !== null) {
    setSettings(() => (enabled ? null : { enabled: true })); // revert on error
    setError(result.error);
  }
}

async function saveSettings(
  agentId: string,
  newSettings: AgentVfsSettings,
  setSettings: SetSettings,
  setError: SetError
): Promise<void> {
  const result = await updateVfsSettingsAction(agentId, newSettings);
  if (result.error !== null) {
    setError(result.error);
    return;
  }
  setSettings(() => newSettings);
}
