'use client';

import { updateAgentSelectedToolsAction } from '@/app/actions/agentSelectedTools';
import type { SaveState } from '@/app/components/panels/SaveStateIndicator';
import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDebouncedCallback } from 'use-debounce';

export interface AgentToolsStateConfig {
  agentId: string;
  initialSelectedTools: SelectedTool[];
  initialUpdatedAt: string;
  registryFailed?: boolean;
}

export interface AgentToolsStateResult {
  selectedTools: SelectedTool[];
  saveState: SaveState;
  handleToolsChange: (next: SelectedTool[]) => void;
  handleRemoveStale: (entry: SelectedTool) => void;
  handleRetrySave: () => void;
}

const MAX_SELECTED = 100;
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
  lastSavedRef: React.MutableRefObject<{ tools: SelectedTool[]; updatedAt: string }>;
  idleTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setSelectedTools: React.Dispatch<React.SetStateAction<SelectedTool[]>>;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
}

function applySuccess(ctx: SaveContext, tools: SelectedTool[], updatedAt: string): void {
  ctx.lastSavedRef.current = { tools, updatedAt };
  ctx.setSaveState('saved');
  scheduleIdleTransition(ctx.idleTimeoutRef, ctx.setSaveState, IDLE_HIDE_MS_SAVED);
}

function applyConflict(ctx: SaveContext, currentTools: SelectedTool[], currentUpdatedAt: string): void {
  ctx.lastSavedRef.current = { tools: currentTools, updatedAt: currentUpdatedAt };
  ctx.setSelectedTools(currentTools);
  ctx.setSaveState('conflict');
  scheduleIdleTransition(ctx.idleTimeoutRef, ctx.setSaveState, IDLE_HIDE_MS_CONFLICT);
}

function applyValidationFailure(ctx: SaveContext, next: SelectedTool[]): void {
  const toastKey = next.length > MAX_SELECTED ? 'limitExceeded' : 'saveError';
  toast.error(ctx.tRef.current(toastKey));
  ctx.setSelectedTools(ctx.lastSavedRef.current.tools);
  ctx.setSaveState('error');
}

function applyTransientFailure(ctx: SaveContext): void {
  toast.error(ctx.tRef.current('saveError'));
  ctx.setSelectedTools(ctx.lastSavedRef.current.tools);
  ctx.setSaveState('error');
}

async function retryOnce(ctx: SaveContext, tools: SelectedTool[]): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
  const retry = await updateAgentSelectedToolsAction(
    ctx.agentIdRef.current,
    tools,
    ctx.lastSavedRef.current.updatedAt
  );
  if (retry.ok) {
    applySuccess(ctx, retry.tools, retry.updatedAt);
  } else {
    applyTransientFailure(ctx);
  }
}

async function performSave(ctx: SaveContext, tools: SelectedTool[]): Promise<void> {
  ctx.setSaveState('saving');
  const result = await updateAgentSelectedToolsAction(
    ctx.agentIdRef.current,
    tools,
    ctx.lastSavedRef.current.updatedAt
  );

  if (result.ok) {
    applySuccess(ctx, result.tools, result.updatedAt);
    return;
  }

  if (result.kind === 'conflict' && result.conflict !== undefined) {
    applyConflict(ctx, result.conflict.currentTools, result.conflict.currentUpdatedAt);
    return;
  }

  if (result.kind === 'validation') {
    applyValidationFailure(ctx, tools);
    return;
  }

  await retryOnce(ctx, tools);
}

export function useAgentToolsState({
  agentId,
  initialSelectedTools,
  initialUpdatedAt,
  registryFailed,
}: AgentToolsStateConfig): AgentToolsStateResult {
  const tAgentTools = useTranslations('agentTools');
  const [selectedTools, setSelectedTools] = useState<SelectedTool[]>(initialSelectedTools);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const registryFailedRef = useRef<boolean>(registryFailed === true);
  useEffect(() => {
    registryFailedRef.current = registryFailed === true;
  }, [registryFailed]);
  useEffect(() => {
    if (registryFailed === true) setSaveState('disabled-by-failure');
  }, [registryFailed]);

  const lastSavedRef = useRef<{ tools: SelectedTool[]; updatedAt: string }>({
    tools: initialSelectedTools,
    updatedAt: initialUpdatedAt,
  });
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mutable refs for values that change but must be read inside async callbacks
  const agentIdRef = useRef(agentId);
  const tRef = useRef(tAgentTools);

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

  // Stable ctx: all members are refs or stable setState functions — never recreated
  const stableCtx = useRef<SaveContext>({
    agentIdRef,
    tRef,
    lastSavedRef,
    idleTimeoutRef,
    setSelectedTools,
    setSaveState,
  }).current;

  const executeSave = useCallback(
    (tools: SelectedTool[]) => {
      void performSave(stableCtx, tools);
    },
    [stableCtx]
  );

  const debouncedSave = useDebouncedCallback(executeSave, DEBOUNCE_MS);

  const handleToolsChange = useCallback(
    (next: SelectedTool[]) => {
      setSelectedTools(next);
      if (registryFailedRef.current) {
        setSaveState('disabled-by-failure');
        return;
      }
      debouncedSave(next);
    },
    [debouncedSave]
  );

  const handleRemoveStale = useCallback(
    (entry: SelectedTool) => {
      setSelectedTools((prev) => {
        const next = prev.filter(
          (t) => !(t.providerId === entry.providerId && t.toolName === entry.toolName)
        );
        if (registryFailedRef.current) {
          setSaveState('disabled-by-failure');
          return next;
        }
        debouncedSave(next);
        return next;
      });
    },
    [debouncedSave]
  );

  const handleRetrySave = useCallback(() => {
    if (registryFailedRef.current) return;
    executeSave(selectedTools);
  }, [executeSave, selectedTools]);

  return {
    selectedTools,
    saveState,
    handleToolsChange,
    handleRemoveStale,
    handleRetrySave,
  };
}
