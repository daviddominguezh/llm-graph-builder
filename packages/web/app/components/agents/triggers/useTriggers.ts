'use client';

import { useCallback, useState } from 'react';

import type { Trigger, TriggerFormState } from './types';

export interface UseTriggersResult {
  triggers: Trigger[];
  addTrigger: (form: TriggerFormState) => void;
  updateTrigger: (id: string, form: TriggerFormState) => void;
  deleteTrigger: (id: string) => void;
}

type TriggersByTenant = Record<string, Trigger[]>;

function withAdded(prev: TriggersByTenant, tenantId: string, form: TriggerFormState): TriggersByTenant {
  const next: Trigger = { ...form, id: crypto.randomUUID() };
  return { ...prev, [tenantId]: [...(prev[tenantId] ?? []), next] };
}

function withUpdated(
  prev: TriggersByTenant,
  tenantId: string,
  id: string,
  form: TriggerFormState
): TriggersByTenant {
  const list = prev[tenantId] ?? [];
  return { ...prev, [tenantId]: list.map((t) => (t.id === id ? { ...form, id } : t)) };
}

function withRemoved(prev: TriggersByTenant, tenantId: string, id: string): TriggersByTenant {
  const list = prev[tenantId] ?? [];
  return { ...prev, [tenantId]: list.filter((t) => t.id !== id) };
}

export function useTriggers(tenantId: string): UseTriggersResult {
  const [byTenant, setByTenant] = useState<TriggersByTenant>({});

  const addTrigger = useCallback(
    (form: TriggerFormState) => {
      if (tenantId === '') return;
      setByTenant((prev) => withAdded(prev, tenantId, form));
    },
    [tenantId]
  );

  const updateTrigger = useCallback(
    (id: string, form: TriggerFormState) => {
      if (tenantId === '') return;
      setByTenant((prev) => withUpdated(prev, tenantId, id, form));
    },
    [tenantId]
  );

  const deleteTrigger = useCallback(
    (id: string) => {
      if (tenantId === '') return;
      setByTenant((prev) => withRemoved(prev, tenantId, id));
    },
    [tenantId]
  );

  return { triggers: byTenant[tenantId] ?? [], addTrigger, updateTrigger, deleteTrigger };
}
