'use client';

import {
  createTriggerAction,
  deleteTriggerAction,
  listTriggersAction,
  setTriggerEnabledAction,
} from '@/app/actions/triggers';
import type { TriggerRow } from '@/app/lib/triggers';
import { useCallback, useEffect, useState } from 'react';

import type { TriggerFormState } from './types';

export interface UseTriggersResult {
  triggers: TriggerRow[];
  loading: boolean;
  error: string | null;
  addTrigger: (form: TriggerFormState) => Promise<void>;
  deleteTrigger: (id: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
}

interface LoadState {
  triggers: TriggerRow[];
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: LoadState = { triggers: [], loading: true, error: null };

function useTriggersLoad(agentId: string, tenantId: string, setState: (s: LoadState) => void): void {
  useEffect(() => {
    if (agentId === '' || tenantId === '') {
      setState({ triggers: [], loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setState({ triggers: [], loading: true, error: null });
    void listTriggersAction(agentId, tenantId).then(({ result, error }) => {
      if (cancelled) return;
      setState({ triggers: result, loading: false, error });
    });
    return () => {
      cancelled = true;
    };
  }, [agentId, tenantId, setState]);
}

function useAddTrigger(
  agentId: string,
  tenantId: string,
  setState: React.Dispatch<React.SetStateAction<LoadState>>
) {
  return useCallback(
    async (form: TriggerFormState) => {
      if (agentId === '' || tenantId === '') return;
      const { result } = await createTriggerAction(agentId, tenantId, form);
      if (result === null) return;
      setState((prev) => ({ ...prev, triggers: [...prev.triggers, result] }));
    },
    [agentId, tenantId, setState]
  );
}

function useDeleteTrigger(agentId: string, setState: React.Dispatch<React.SetStateAction<LoadState>>) {
  return useCallback(
    async (id: string) => {
      if (agentId === '') return;
      const { error } = await deleteTriggerAction(agentId, id);
      if (error !== null) return;
      setState((prev) => ({ ...prev, triggers: prev.triggers.filter((t) => t.id !== id) }));
    },
    [agentId, setState]
  );
}

function setEnabledLocally(triggers: TriggerRow[], id: string, enabled: boolean): TriggerRow[] {
  return triggers.map((t) => (t.id === id ? { ...t, enabled } : t));
}

function useSetEnabled(agentId: string, setState: React.Dispatch<React.SetStateAction<LoadState>>) {
  return useCallback(
    async (id: string, enabled: boolean) => {
      if (agentId === '') return;
      setState((prev) => ({ ...prev, triggers: setEnabledLocally(prev.triggers, id, enabled) }));
      const { error } = await setTriggerEnabledAction(agentId, id, enabled);
      if (error === null) return;
      setState((prev) => ({ ...prev, triggers: setEnabledLocally(prev.triggers, id, !enabled) }));
    },
    [agentId, setState]
  );
}

export function useTriggers(agentId: string, tenantId: string): UseTriggersResult {
  const [state, setState] = useState<LoadState>(INITIAL_STATE);
  const setLoad = useCallback((s: LoadState) => setState(s), []);

  useTriggersLoad(agentId, tenantId, setLoad);

  const addTrigger = useAddTrigger(agentId, tenantId, setState);
  const deleteTrigger = useDeleteTrigger(agentId, setState);
  const setEnabled = useSetEnabled(agentId, setState);

  return {
    triggers: state.triggers,
    loading: state.loading,
    error: state.error,
    addTrigger,
    deleteTrigger,
    setEnabled,
  };
}
