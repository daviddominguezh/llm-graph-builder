'use client';

import type { Edge as RFEdge } from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { streamSimulation } from '../lib/api';
import type { RFEdgeData } from '../utils/graphTransformers';
import type { CompositionPhase } from './compositionMachine';
import type { CompositionStore } from './compositionStore';
import { buildMergedCallbacks, sendAgentSim, sendWorkflowSim } from './simulationSendHelpers';
import type { GraphSnapshot, SendMessageDeps } from './useSimulationHelpers';
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
    const controller = new AbortController();
    const childDeps = buildChildDeps(deps, childCfg);
    sendAgentSim(childDeps, store, controller.signal, pending.task);
  }, [phase, store, depsRef, abortAndCreateSignal]);
}

/* ─── Side-effect: auto-resume parent ─── */

/** Find the edge target from a node that has a tool_call precondition (the dispatch edge). */
function findNextNodeAfterDispatch(
  edges: Array<RFEdge<RFEdgeData>>,
  sourceNodeId: string
): string | undefined {
  const edge = edges.find(
    (e) =>
      e.source === sourceNodeId &&
      e.data?.preconditions?.some((p) => p.type === 'tool_call')
  );
  return edge?.target;
}

function resolveResumeNode(snapshot: GraphSnapshot | null, parentCurrentNode: string | null, fallback: string): string {
  if (parentCurrentNode === null) return fallback;
  if (snapshot === null) return parentCurrentNode;
  const nextNode = findNextNodeAfterDispatch(snapshot.edges, parentCurrentNode);
  return nextNode ?? parentCurrentNode;
}

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
    const controller = new AbortController();
    if (deps.preset === undefined) return;
    const snapshot = deps.setters.getSnapshot();
    if (snapshot === null) return;
    // Advance to the next node after the dispatch edge — don't re-execute the dispatch node
    const resumeNode = resolveResumeNode(snapshot, snap.parentCurrentNode, deps.currentNode);
    const params = buildSimulateParams({
      snapshot,
      agents: deps.agents,
      mcpServers: deps.mcpServers,
      outputSchemas: deps.outputSchemas,
      allMessages: snap.rootMessages,
      currentNode: resumeNode,
      preset: deps.preset,
      apiKeyId: deps.apiKeyId,
      modelId: deps.modelId,
      structuredOutputs: deps.structuredOutputs,
      orgId: deps.orgId,
    });
    const callbacks = buildMergedCallbacks(deps, store);
    void streamSimulation(params, callbacks, controller.signal).catch((err: unknown) => {
      deps.setters.setLoading(false);
      toast.error(err instanceof Error ? err.message : 'Workflow resume failed');
    });
  }, [phase, store, depsRef, abortAndCreateSignal]);
}
