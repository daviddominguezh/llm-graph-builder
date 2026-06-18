'use client';

import { useEffect, useState } from 'react';

import type { AgentToolStoreBindings } from '../actions/agentToolStoreBindings';
import { getKvStoresByOrgAction } from '../actions/kvStores';
import { getRagStoresByOrgAction } from '../actions/ragStores';
import type { SaveState } from '../components/panels/SaveStateIndicator';
import { useAgentToolStoresState } from './useAgentToolStoresState';

export interface StoreOption {
  id: string;
  name: string;
}

export interface ToolStoresState {
  bindings: AgentToolStoreBindings;
  kvStores: StoreOption[];
  ragStores: StoreOption[];
  saveState: SaveState;
  onChangeBindings: (next: AgentToolStoreBindings) => void;
  retrySave: () => void;
}

export interface UseToolStoresStateConfig {
  agentId: string;
  orgId: string;
  initialBindings: AgentToolStoreBindings;
  initialBindingsUpdatedAt: string;
}

function useStoreOptions(orgId: string): { kvStores: StoreOption[]; ragStores: StoreOption[] } {
  const [kvStores, setKvStores] = useState<StoreOption[]>([]);
  const [ragStores, setRagStores] = useState<StoreOption[]>([]);

  useEffect(() => {
    if (orgId === '') return;
    let cancelled = false;
    void (async () => {
      const [kv, rag] = await Promise.all([getKvStoresByOrgAction(orgId), getRagStoresByOrgAction(orgId)]);
      if (cancelled) return;
      setKvStores(kv.result.map((s) => ({ id: s.id, name: s.name })));
      setRagStores(rag.result.map((s) => ({ id: s.id, name: s.name })));
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { kvStores, ragStores };
}

export function useToolStoresState(config: UseToolStoresStateConfig): ToolStoresState {
  const bindingsHook = useAgentToolStoresState({
    agentId: config.agentId,
    initialBindings: config.initialBindings,
    initialUpdatedAt: config.initialBindingsUpdatedAt,
  });
  const { kvStores, ragStores } = useStoreOptions(config.orgId);

  return {
    bindings: bindingsHook.bindings,
    kvStores,
    ragStores,
    saveState: bindingsHook.saveState,
    onChangeBindings: bindingsHook.setBindings,
    retrySave: bindingsHook.retrySave,
  };
}
