'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';
import type { Message } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { streamAgentSimulation } from '../lib/agentSimulationApi';
import { streamSimulation } from '../lib/api';
import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { ConversationEntry, NodeResult, SimulationTokens } from '../types/simulation';
import { START_NODE_ID } from '../utils/graphContext';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import type { CompositionLevel } from './useCompositionStack';
import {
  type PendingChildDispatch,
  buildMergedCallbacks,
  createUserMessage,
  getCompositionRequestOverrides,
  resetBeforeSend,
  resetBeforeSendComposition,
  routeUserMessage,
} from './useSimulationComposition';
import type {
  AgentSimConfig,
  FullSetters,
  GraphSnapshot,
  SendMessageDeps,
  SimulationStartDeps,
} from './useSimulationHelpers';
import { buildAgentSimulateParams, buildSimulateParams } from './useSimulationHelpers';
import {
  EMPTY_TOKENS,
  type SimulationHookState,
  useAbortRef,
  useSimulationState,
} from './useSimulationState';

const ZERO_EDGES = 0;

function isNodeTerminal(edges: Array<RFEdge<RFEdgeData>>, nodeId: string): boolean {
  return nodeId !== START_NODE_ID && edges.filter((e) => e.source === nodeId).length === ZERO_EDGES;
}

interface UseSimulationParams {
  allNodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  agents: Agent[];
  preset: ContextPreset | undefined;
  apiKeyId: string;
  mcpServers: McpServerConfig[];
  outputSchemas: OutputSchemaEntity[];
  onZoomToNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onExitZoomView: () => void;
  orgId?: string;
  appType?: 'workflow' | 'agent';
  agentConfig?: AgentSimConfig;
}

export interface SimulationState {
  active: boolean;
  loading: boolean;
  currentNode: string;
  terminated: boolean;
  visitedNodes: string[];
  lastUserText: string;
  nodeResults: NodeResult[];
  conversationEntries: ConversationEntry[];
  totalTokens: SimulationTokens;
  compositionStack: CompositionLevel[];
  modelId: string;
  setModelId: (id: string) => void;
  start: () => void;
  stop: () => void;
  clear: () => void;
  sendMessage: (text: string) => void;
}

function useSimulationStart(deps: SimulationStartDeps & { appType?: string }): () => void {
  const { setters, allNodes, edges, onZoomToNode, appType } = deps;

  return useCallback(() => {
    setters.saveSnapshot({ nodes: [...allNodes], edges: [...edges] });
    setters.setActive(true);
    setters.setCurrentNode(appType === 'agent' ? 'agent' : START_NODE_ID);
    setters.setMessages([]);
    setters.setNodeResults([]);
    setters.setLastUserText('');
    setters.setVisitedNodes([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    setters.setStructuredOutputs({});
    setters.setCompositionStack([]);
    if (appType !== 'agent') {
      onZoomToNode(START_NODE_ID);
    }
  }, [setters, allNodes, edges, onZoomToNode, appType]);
}

function useSimulationStop(
  setters: FullSetters,
  abortSimulation: () => void,
  onExitZoomView: () => void,
  clearSelection: () => void
): () => void {
  return useCallback(() => {
    abortSimulation();
    setters.setActive(false);
    clearSelection();
    onExitZoomView();
  }, [setters, abortSimulation, onExitZoomView, clearSelection]);
}

function useSimulationClear(
  setters: FullSetters,
  abortSimulation: () => void,
  onExitZoomView: () => void
): () => void {
  return useCallback(() => {
    abortSimulation();
    setters.saveSnapshot(null);
    setters.setActive(false);
    setters.setMessages([]);
    setters.setNodeResults([]);
    setters.setConversationEntries([]);
    setters.setTurnCount(0);
    setters.setLastUserText('');
    setters.setVisitedNodes([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    setters.setStructuredOutputs({});
    setters.setCompositionStack([]);
    onExitZoomView();
  }, [setters, abortSimulation, onExitZoomView]);
}

function checkTerminated(
  active: boolean,
  loading: boolean,
  snapshot: GraphSnapshot | null,
  currentNode: string
): boolean {
  return active && !loading && snapshot !== null && isNodeTerminal(snapshot.edges, currentNode);
}

interface CompositionRefs {
  compositionStackRef: React.RefObject<CompositionLevel[]>;
  messagesRef: React.RefObject<Message[]>;
  pendingChildRef: React.MutableRefObject<PendingChildDispatch | null>;
  pendingParentResumeRef: React.MutableRefObject<boolean>;
  autoResumeParentRef: React.MutableRefObject<(() => void) | null>;
}

function sendAgentSim(deps: SendMessageDeps, refs: CompositionRefs, signal: AbortSignal, text: string): void {
  const stack = refs.compositionStackRef.current;
  const activeChild = stack.length > 0 ? stack[stack.length - 1] : undefined;
  console.log('[sim:sendAgentSim] sending', {
    text: text.slice(0, 50),
    stackDepth: stack.length,
    hasAgentConfig: deps.agentConfig !== undefined,
    hasChildConfig: activeChild?.childConfig !== undefined,
  });
  const { mcpServers, apiKeyId, messages, setters } = deps;
  const agentConfig: AgentSimConfig | undefined =
    deps.agentConfig ??
    (activeChild?.childConfig !== undefined
      ? {
          systemPrompt: activeChild.childConfig.systemPrompt,
          maxSteps: activeChild.childConfig.maxSteps,
          contextItems: [],
          skills: [],
        }
      : undefined);
  const modelId =
    activeChild?.childConfig?.modelId !== undefined && activeChild.childConfig.modelId !== ''
      ? activeChild.childConfig.modelId
      : deps.modelId;
  if (agentConfig === undefined) return;
  const userMsg = createUserMessage(text);
  const fullDeps = { ...deps, ...refs };
  const { updatedStack, updatedRootMessages } = routeUserMessage(fullDeps, text, userMsg);
  resetBeforeSendComposition(setters, text, true);
  const allMessages = [...messages, userMsg];
  const params = buildAgentSimulateParams({ agentConfig, mcpServers, allMessages, apiKeyId, modelId });
  const overrides = getCompositionRequestOverrides(updatedStack, updatedRootMessages);
  if (overrides !== undefined) {
    params.messages = overrides.messages;
    params.composition = overrides.composition;
    params.orgId = overrides.orgId;
  }
  const autoSend = (dispatch: PendingChildDispatch) => {
    console.log('[sim:autoSend] dispatching child directly', {
      task: dispatch.task.slice(0, 50),
      hasConfig: dispatch.childConfig !== undefined,
    });
    setters.setConversationEntries((prev) => [...prev, { type: 'child_start', label: dispatch.label }]);
    const newSignal = new AbortController().signal;
    sendAgentSim(deps, refs, newSignal, dispatch.task);
  };
  void streamAgentSimulation(params, buildMergedCallbacks(fullDeps, autoSend), signal).catch(
    (err: unknown) => {
      setters.setLoading(false);
      toast.error(err instanceof Error ? err.message : 'Simulation failed');
    }
  );
}

function sendWorkflowSim(
  deps: SendMessageDeps,
  refs: CompositionRefs,
  signal: AbortSignal,
  text: string
): void {
  console.log('[sim:sendWorkflowSim] sending', {
    text: text.slice(0, 50),
    stackDepth: refs.compositionStackRef.current.length,
  });
  const { preset, messages, agents, mcpServers, outputSchemas, currentNode } = deps;
  const { apiKeyId, modelId, structuredOutputs, setters } = deps;
  const snapshot = setters.getSnapshot();
  if (preset === undefined || snapshot === null) return;
  const userMsg = createUserMessage(text);
  const allMessages = [...messages, userMsg];
  resetBeforeSend(setters, text, userMsg, false);
  const params = buildSimulateParams({
    snapshot,
    agents,
    mcpServers,
    outputSchemas,
    allMessages,
    currentNode,
    preset,
    apiKeyId,
    modelId,
    structuredOutputs,
    orgId: deps.orgId,
  });
  const fullDeps = { ...deps, ...refs };
  const autoSend = (dispatch: PendingChildDispatch) => {
    console.log('[sim:autoSend:workflow] dispatching child from workflow parent', {
      task: dispatch.task.slice(0, 50),
      hasConfig: dispatch.childConfig !== undefined,
    });
    if (dispatch.childConfig === undefined) {
      console.error('[sim:autoSend:workflow] no childConfig in dispatch, cannot auto-send');
      return;
    }
    setters.setConversationEntries((prev) => [...prev, { type: 'child_start', label: dispatch.label }]);
    const newSignal = new AbortController().signal;
    const childAgentConfig: AgentSimConfig = {
      systemPrompt: dispatch.childConfig.systemPrompt,
      maxSteps: dispatch.childConfig.maxSteps,
      contextItems: [],
      skills: [],
    };
    const childDeps: SendMessageDeps = {
      ...deps,
      agentConfig: childAgentConfig,
      appType: 'agent',
      modelId: dispatch.childConfig.modelId === '' ? deps.modelId : dispatch.childConfig.modelId,
    };
    sendAgentSim(childDeps, refs, newSignal, dispatch.task);
  };
  refs.autoResumeParentRef.current = () => {
    console.log('[sim:autoResume] resuming parent workflow after child finished');
    const newSignal = new AbortController().signal;
    setters.setLoading(true);
    const resumeSnapshot = setters.getSnapshot();
    if (resumeSnapshot === null || preset === undefined) return;
    const resumeParams = buildSimulateParams({
      snapshot: resumeSnapshot,
      agents,
      mcpServers,
      outputSchemas,
      allMessages: refs.messagesRef.current,
      currentNode,
      preset,
      apiKeyId,
      modelId,
      structuredOutputs,
      orgId: deps.orgId,
    });
    const resumeDeps = { ...deps, ...refs };
    void streamSimulation(resumeParams, buildMergedCallbacks(resumeDeps, autoSend), newSignal).catch(
      (err: unknown) => {
        setters.setLoading(false);
        toast.error(err instanceof Error ? err.message : 'Workflow resume failed');
      }
    );
  };
  void streamSimulation(params, buildMergedCallbacks(fullDeps, autoSend), signal).catch((err: unknown) => {
    setters.setLoading(false);
    toast.error(err instanceof Error ? err.message : 'Simulation failed');
  });
}

function useSimulationSend(
  depsRef: React.RefObject<SendMessageDeps>,
  refsRef: React.RefObject<CompositionRefs>,
  abortAndCreateSignal: () => AbortSignal
): (text: string) => void {
  return useCallback(
    (text: string) => {
      const deps = depsRef.current;
      const refs = refsRef.current;
      const stackDepth = refs.compositionStackRef.current.length;
      const isChildActive = stackDepth > 0;
      console.log('[sim:send] routing message', {
        text: text.slice(0, 50),
        appType: deps.appType,
        loading: deps.loading,
        stackDepth,
        isChildActive,
      });
      if (deps.loading) {
        console.log('[sim:send] BLOCKED: loading=true, ignoring');
        return;
      }
      const signal = abortAndCreateSignal();
      if (deps.appType === 'agent' || isChildActive) {
        sendAgentSim(deps, refs, signal, text);
        return;
      }
      sendWorkflowSim(deps, refs, signal, text);
    },
    [depsRef, refsRef, abortAndCreateSignal]
  );
}

function buildSendDeps(params: UseSimulationParams, s: SimulationHookState): SendMessageDeps {
  return {
    preset: params.preset,
    loading: s.loading,
    messages: s.messages,
    agents: params.agents,
    apiKeyId: params.apiKeyId,
    modelId: s.modelId,
    currentNode: s.currentNode,
    mcpServers: params.mcpServers,
    outputSchemas: params.outputSchemas,
    structuredOutputs: s.structuredOutputs,
    setters: s.setters,
    onZoomToNode: params.onZoomToNode,
    onSelectNode: params.onSelectNode,
    orgId: params.orgId,
    appType: params.appType,
    agentConfig: params.agentConfig,
  };
}

export function useSimulation(params: UseSimulationParams): SimulationState {
  const { allNodes, edges, onZoomToNode, onExitZoomView } = params;
  const s = useSimulationState();
  const { abortSimulation, abortAndCreateSignal } = useAbortRef();
  const compositionStackRef = useRef<CompositionLevel[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    compositionStackRef.current = s.compositionStack;
  }, [s.compositionStack]);
  useEffect(() => {
    messagesRef.current = s.messages;
  }, [s.messages]);

  const start = useSimulationStart({
    setters: s.setters,
    allNodes,
    edges,
    onZoomToNode,
    appType: params.appType,
  });
  const clearSelection = useCallback(() => {
    /* no-op, panels cleared by onPaneClick */
  }, []);
  const stop = useSimulationStop(s.setters, abortSimulation, onExitZoomView, clearSelection);
  const clear = useSimulationClear(s.setters, abortSimulation, onExitZoomView);
  const pendingChildRef = useRef<PendingChildDispatch | null>(null);
  const pendingParentResumeRef = useRef(false);
  const autoResumeParentRef = useRef<(() => void) | null>(null);
  const compRefs = useRef<CompositionRefs>({
    compositionStackRef,
    messagesRef,
    pendingChildRef,
    pendingParentResumeRef,
    autoResumeParentRef,
  });
  const sendDeps = buildSendDeps(params, s);
  const sendDepsRef = useRef(sendDeps);
  useEffect(() => {
    sendDepsRef.current = sendDeps;
  });
  const sendMessage = useSimulationSend(sendDepsRef, compRefs, abortAndCreateSignal);
  const isAgent = params.appType === 'agent';
  const hasActiveChild = s.compositionStack.length > 0;
  const terminated =
    isAgent || hasActiveChild
      ? false
      : checkTerminated(s.active, s.loading, s.snapshotRef.current, s.currentNode);

  return {
    active: s.active,
    loading: s.loading,
    currentNode: s.currentNode,
    terminated,
    visitedNodes: s.visitedNodes,
    lastUserText: s.lastUserText,
    nodeResults: s.nodeResults,
    conversationEntries: s.conversationEntries,
    totalTokens: s.totalTokens,
    compositionStack: s.compositionStack,
    modelId: s.modelId,
    setModelId: s.setModelId,
    start,
    stop,
    clear,
    sendMessage,
  };
}
