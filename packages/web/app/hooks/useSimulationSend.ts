'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { streamSimulation } from '../lib/api';
import type { CompositionPhase } from './compositionMachine';
import type { CompositionStore } from './compositionStore';
import { buildMergedCallbacks, sendAgentSim, sendWorkflowSim } from './simulationSendHelpers';
import type { SendMessageDeps } from './useSimulationHelpers';
import { buildSimulateParams } from './useSimulationHelpers';

/* ─── Main Send Hook ─── */

export function useSimulationSend(
  depsRef: React.RefObject<SendMessageDeps>,
  store: CompositionStore,
  abortAndCreateSignal: () => AbortSignal
): (text: string) => void {
  return useCallback(
    (text: string) => {
      const deps = depsRef.current;
      const snap = store.getSnapshot();
      const isChildActive = snap.stack.length > 0;
      if (deps.loading) return;
      const signal = abortAndCreateSignal();
      if (deps.appType === 'agent' || isChildActive) {
        sendAgentSim(deps, store, signal, text);
        return;
      }
      sendWorkflowSim(deps, store, signal, text);
    },
    [depsRef, store, abortAndCreateSignal]
  );
}

/* ─── Side-effect: auto-send child ─── */

function buildChildDeps(deps: SendMessageDeps, childCfg: NonNullable<ChildCfgParam>): SendMessageDeps {
  return {
    ...deps,
    appType: 'agent',
    agentConfig: {
      systemPrompt: childCfg.systemPrompt,
      maxSteps: childCfg.maxSteps,
      contextItems: [],
      skills: [],
    },
    modelId: childCfg.modelId === '' ? deps.modelId : childCfg.modelId,
  };
}

type ChildCfgParam = { systemPrompt: string; maxSteps: number | null; modelId: string } | undefined;

export function useAutoDispatchChild(
  store: CompositionStore,
  depsRef: React.RefObject<SendMessageDeps>,
  phase: CompositionPhase,
  abortAndCreateSignal: () => AbortSignal
): void {
  const hasFired = useRef(false);
  useEffect(() => {
    if (phase !== 'child_dispatched') {
      hasFired.current = false;
      return;
    }
    if (hasFired.current) return;
    hasFired.current = true;
    const snap = store.getSnapshot();
    const pending = snap.pendingDispatch;
    if (pending === null) return;
    const childCfg = pending.childConfig;
    if (childCfg === undefined) return;
    const deps = depsRef.current;
    deps.setters.setConversationEntries((prev) => [...prev, { type: 'child_start', label: pending.label }]);
    store.dispatch({ type: 'CHILD_AUTO_SENT' });
    const signal = abortAndCreateSignal();
    const childDeps = buildChildDeps(deps, childCfg);
    sendAgentSim(childDeps, store, signal, pending.task);
  }, [phase, store, depsRef, abortAndCreateSignal]);
}

/* ─── Side-effect: auto-resume parent ─── */

export function useAutoResumeParent(
  store: CompositionStore,
  depsRef: React.RefObject<SendMessageDeps>,
  phase: CompositionPhase,
  abortAndCreateSignal: () => AbortSignal
): void {
  const hasFired = useRef(false);
  useEffect(() => {
    if (phase !== 'resuming_parent') {
      hasFired.current = false;
      return;
    }
    if (hasFired.current) return;
    hasFired.current = true;
    const deps = depsRef.current;
    const snap = store.getSnapshot();
    store.dispatch({ type: 'PARENT_RESUMED' });
    deps.setters.setLoading(true);
    const signal = abortAndCreateSignal();
    if (deps.preset === undefined) return;
    const snapshot = deps.setters.getSnapshot();
    if (snapshot === null) return;
    const params = buildSimulateParams({
      snapshot,
      agents: deps.agents,
      mcpServers: deps.mcpServers,
      outputSchemas: deps.outputSchemas,
      allMessages: snap.rootMessages,
      currentNode: deps.currentNode,
      preset: deps.preset,
      apiKeyId: deps.apiKeyId,
      modelId: deps.modelId,
      structuredOutputs: deps.structuredOutputs,
      orgId: deps.orgId,
    });
    const callbacks = buildMergedCallbacks(deps, store);
    void streamSimulation(params, callbacks, signal).catch((err: unknown) => {
      deps.setters.setLoading(false);
      toast.error(err instanceof Error ? err.message : 'Workflow resume failed');
    });
  }, [phase, store, depsRef, abortAndCreateSignal]);
}
