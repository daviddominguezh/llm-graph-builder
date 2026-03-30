'use client';

import type { Message } from '@daviddh/llm-graph-runner';
import { useCallback, useRef, useState } from 'react';

import type { NodeResult, SimulationTokens } from '../types/simulation';
import { START_NODE_ID } from '../utils/graphContext';
import type { FullSetters, GraphSnapshot } from './useSimulationHelpers';

const DEFAULT_MODEL_ID = 'x-ai/grok-4.1-fast';
const INITIAL_TOKEN_COUNT = 0;

const EMPTY_TOKENS: SimulationTokens = {
  input: INITIAL_TOKEN_COUNT,
  output: INITIAL_TOKEN_COUNT,
  cached: INITIAL_TOKEN_COUNT,
};

export { EMPTY_TOKENS };

export interface SimulationHookState {
  active: boolean;
  loading: boolean;
  currentNode: string;
  messages: Message[];
  lastUserText: string;
  nodeResults: NodeResult[];
  visitedNodes: string[];
  totalTokens: SimulationTokens;
  structuredOutputs: Record<string, unknown[]>;
  modelId: string;
  setModelId: React.Dispatch<React.SetStateAction<string>>;
  snapshotRef: React.RefObject<GraphSnapshot | null>;
  setters: FullSetters;
}

interface SnapshotRefReturn {
  snapshotRef: React.RefObject<GraphSnapshot | null>;
  saveSnapshot: (s: GraphSnapshot | null) => void;
  getSnapshot: () => GraphSnapshot | null;
}

function useSnapshotRef(): SnapshotRefReturn {
  const snapshotRef = useRef<GraphSnapshot | null>(null);
  const saveSnapshot = useCallback((s: GraphSnapshot | null) => {
    snapshotRef.current = s;
  }, []);
  const getSnapshot = useCallback((): GraphSnapshot | null => snapshotRef.current, []);
  return { snapshotRef, saveSnapshot, getSnapshot };
}

interface AbortRefReturn {
  abortSimulation: () => void;
  abortAndCreateSignal: () => AbortSignal;
}

export function useAbortRef(): AbortRefReturn {
  const abortRef = useRef<AbortController | null>(null);
  const abortSimulation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);
  const abortAndCreateSignal = useCallback((): AbortSignal => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  }, []);
  return { abortSimulation, abortAndCreateSignal };
}

interface CoreStateValues {
  active: boolean;
  loading: boolean;
  currentNode: string;
  messages: Message[];
  lastUserText: string;
  nodeResults: NodeResult[];
  visitedNodes: string[];
  totalTokens: SimulationTokens;
  structuredOutputs: Record<string, unknown[]>;
}

interface CoreDispatchers {
  setActive: React.Dispatch<React.SetStateAction<boolean>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentNode: React.Dispatch<React.SetStateAction<string>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setLastUserText: React.Dispatch<React.SetStateAction<string>>;
  setNodeResults: React.Dispatch<React.SetStateAction<NodeResult[]>>;
  setVisitedNodes: React.Dispatch<React.SetStateAction<string[]>>;
  setTotalTokens: React.Dispatch<React.SetStateAction<SimulationTokens>>;
  setStructuredOutputs: React.Dispatch<React.SetStateAction<Record<string, unknown[]>>>;
}

interface CoreStateResult {
  values: CoreStateValues;
  dispatchers: CoreDispatchers;
}

function useSimCoreState(): CoreStateResult {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentNode, setCurrentNode] = useState(START_NODE_ID);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastUserText, setLastUserText] = useState('');
  const [nodeResults, setNodeResults] = useState<NodeResult[]>([]);
  const [visitedNodes, setVisitedNodes] = useState<string[]>([]);
  const [totalTokens, setTotalTokens] = useState<SimulationTokens>(EMPTY_TOKENS);
  const [structuredOutputs, setStructuredOutputs] = useState<Record<string, unknown[]>>({});
  return {
    values: {
      active,
      loading,
      currentNode,
      messages,
      lastUserText,
      nodeResults,
      visitedNodes,
      totalTokens,
      structuredOutputs,
    },
    dispatchers: {
      setActive,
      setLoading,
      setCurrentNode,
      setMessages,
      setLastUserText,
      setNodeResults,
      setVisitedNodes,
      setTotalTokens,
      setStructuredOutputs,
    },
  };
}

function buildSetters(d: CoreDispatchers, snap: SnapshotRefReturn): FullSetters {
  return { ...d, saveSnapshot: snap.saveSnapshot, getSnapshot: snap.getSnapshot };
}

export function useSimulationState(): SimulationHookState {
  const { values, dispatchers } = useSimCoreState();
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const snap = useSnapshotRef();
  const setters = buildSetters(dispatchers, snap);
  return { ...values, modelId, setModelId, snapshotRef: snap.snapshotRef, setters };
}
