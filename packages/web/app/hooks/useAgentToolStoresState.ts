'use client';

import {
  type AgentToolStoreBindings,
  type ConflictCurrent,
  updateAgentToolStoreBindingsAction,
} from '@/app/actions/agentToolStoreBindings';
import type { SaveState } from '@/app/components/panels/SaveStateIndicator';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDebouncedCallback } from 'use-debounce';

export interface AgentToolStoresStateConfig {
  agentId: string;
  initialBindings: AgentToolStoreBindings;
  initialUpdatedAt: string;
}

export interface AgentToolStoresStateResult {
  bindings: AgentToolStoreBindings;
  saveState: SaveState;
  setBindings: (next: AgentToolStoreBindings) => void;
  retrySave: () => void;
}

const DEBOUNCE_MS = 800;
const IDLE_HIDE_MS_SAVED = 2000;
const IDLE_HIDE_MS_CONFLICT = 1000;
const RETRY_BACKOFF_MS = 2000;

function scheduleIdleTransition(
  idleTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setSaveState: (s: SaveState) => void,
  delayMs: number
): void {
  if (idleTimeoutRef.current !== null) clearTimeout(idleTimeoutRef.current);
  idleTimeoutRef.current = setTimeout(() => {
    idleTimeoutRef.current = null;
    setSaveState('idle');
  }, delayMs);
}

interface SaveContext {
  agentIdRef: React.MutableRefObject<string>;
  tRef: React.MutableRefObject<(key: string) => string>;
  lastSavedRef: React.MutableRefObject<{ bindings: AgentToolStoreBindings; updatedAt: string }>;
  idleTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setBindings: React.Dispatch<React.SetStateAction<AgentToolStoreBindings>>;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
}

function applySuccess(ctx: SaveContext, bindings: AgentToolStoreBindings, updatedAt: string): void {
  ctx.lastSavedRef.current = { bindings, updatedAt };
  ctx.setSaveState('saved');
  scheduleIdleTransition(ctx.idleTimeoutRef, ctx.setSaveState, IDLE_HIDE_MS_SAVED);
}

function applyConflict(ctx: SaveContext, current: ConflictCurrent | undefined): void {
  // When the backend includes the current bindings, reseat lastSavedRef so the
  // next edit fires with a fresh expectedUpdatedAt; otherwise fall back to the
  // previously saved snapshot (next edit will conflict again until refreshed).
  if (current !== undefined) {
    ctx.lastSavedRef.current = { bindings: current.bindings, updatedAt: current.updatedAt };
  }
  ctx.setBindings(ctx.lastSavedRef.current.bindings);
  ctx.setSaveState('conflict');
  scheduleIdleTransition(ctx.idleTimeoutRef, ctx.setSaveState, IDLE_HIDE_MS_CONFLICT);
}

function applyInvalidFailure(ctx: SaveContext): void {
  toast.error(ctx.tRef.current('saveError'));
  ctx.setBindings(ctx.lastSavedRef.current.bindings);
  ctx.setSaveState('error');
}

function applyOrgMismatchFailure(ctx: SaveContext): void {
  toast.error(ctx.tRef.current('storeOrgMismatch'));
  ctx.setBindings(ctx.lastSavedRef.current.bindings);
  ctx.setSaveState('error');
}

function applyTransientFailure(ctx: SaveContext): void {
  toast.error(ctx.tRef.current('saveError'));
  ctx.setBindings(ctx.lastSavedRef.current.bindings);
  ctx.setSaveState('error');
}

async function retryOnce(ctx: SaveContext, bindings: AgentToolStoreBindings): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
  const retry = await updateAgentToolStoreBindingsAction({
    agentId: ctx.agentIdRef.current,
    expectedUpdatedAt: ctx.lastSavedRef.current.updatedAt,
    selectedKvStoreId: bindings.selectedKvStoreId,
    selectedRagStoreId: bindings.selectedRagStoreId,
  });
  if (retry.ok) {
    applySuccess(ctx, retry.bindings, retry.updatedAt);
  } else {
    applyTransientFailure(ctx);
  }
}

async function performSave(ctx: SaveContext, bindings: AgentToolStoreBindings): Promise<void> {
  ctx.setSaveState('saving');
  const result = await updateAgentToolStoreBindingsAction({
    agentId: ctx.agentIdRef.current,
    expectedUpdatedAt: ctx.lastSavedRef.current.updatedAt,
    selectedKvStoreId: bindings.selectedKvStoreId,
    selectedRagStoreId: bindings.selectedRagStoreId,
  });

  if (result.ok) {
    applySuccess(ctx, result.bindings, result.updatedAt);
    return;
  }
  if (result.reason === 'conflict') {
    applyConflict(ctx, result.current);
    return;
  }
  if (result.reason === 'org_mismatch') {
    applyOrgMismatchFailure(ctx);
    return;
  }
  if (result.reason === 'invalid') {
    applyInvalidFailure(ctx);
    return;
  }
  await retryOnce(ctx, bindings);
}

interface MutableRefs {
  agentIdRef: React.MutableRefObject<string>;
  tRef: React.MutableRefObject<(key: string) => string>;
  lastSavedRef: React.MutableRefObject<{ bindings: AgentToolStoreBindings; updatedAt: string }>;
  idleTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

function useMutableRefs(
  agentId: string,
  tAgentTools: (key: string) => string,
  initialBindings: AgentToolStoreBindings,
  initialUpdatedAt: string
): MutableRefs {
  const agentIdRef = useRef(agentId);
  const tRef = useRef(tAgentTools);
  const lastSavedRef = useRef<{ bindings: AgentToolStoreBindings; updatedAt: string }>({
    bindings: initialBindings,
    updatedAt: initialUpdatedAt,
  });
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    agentIdRef.current = agentId;
  }, [agentId]);

  useEffect(() => {
    tRef.current = tAgentTools;
  }, [tAgentTools]);

  useEffect(
    () => () => {
      if (idleTimeoutRef.current !== null) clearTimeout(idleTimeoutRef.current);
    },
    []
  );

  return { agentIdRef, tRef, lastSavedRef, idleTimeoutRef };
}

export function useAgentToolStoresState({
  agentId,
  initialBindings,
  initialUpdatedAt,
}: AgentToolStoresStateConfig): AgentToolStoresStateResult {
  const tAgentTools = useTranslations('agentTools');
  const [bindings, setBindingsState] = useState<AgentToolStoreBindings>(initialBindings);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const refs = useMutableRefs(agentId, tAgentTools, initialBindings, initialUpdatedAt);

  // Stable ctx: all members are refs or stable setState functions — never recreated
  const stableCtx = useRef<SaveContext>({
    agentIdRef: refs.agentIdRef,
    tRef: refs.tRef,
    lastSavedRef: refs.lastSavedRef,
    idleTimeoutRef: refs.idleTimeoutRef,
    setBindings: setBindingsState,
    setSaveState,
  }).current;

  const executeSave = useCallback(
    (next: AgentToolStoreBindings) => {
      void performSave(stableCtx, next);
    },
    [stableCtx]
  );

  const debouncedSave = useDebouncedCallback(executeSave, DEBOUNCE_MS);

  const setBindings = useCallback(
    (next: AgentToolStoreBindings) => {
      setBindingsState(next);
      debouncedSave(next);
    },
    [debouncedSave]
  );

  const retrySave = useCallback(() => {
    executeSave(bindings);
  }, [executeSave, bindings]);

  return {
    bindings,
    saveState,
    setBindings,
    retrySave,
  };
}
