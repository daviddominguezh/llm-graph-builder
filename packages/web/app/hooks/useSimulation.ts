import { type CallAgentOutput, MESSAGES_PROVIDER, type Message, execute } from '@daviddh/llm-graph-runner';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import type { Agent } from '../schemas/graph.schema';
import type { ContextPreset } from '../types/preset';
import type { SimulationStep, SimulationTokens } from '../types/simulation';
import { sumTokensFromLogs } from '../types/simulation';
import { START_NODE_ID, buildContext, buildGraph } from '../utils/graphContext';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';

const INITIAL_TOKEN_COUNT = 0;

interface UseSimulationParams {
  allNodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  agents: Agent[];
  preset: ContextPreset | undefined;
  apiKey: string;
  onZoomToNode: (nodeId: string) => void;
  onExitZoomView: () => void;
}

export interface SimulationState {
  active: boolean;
  loading: boolean;
  currentNode: string;
  steps: SimulationStep[];
  totalTokens: SimulationTokens;
  start: () => void;
  stop: () => void;
  sendMessage: (text: string) => void;
}

const EMPTY_TOKENS: SimulationTokens = {
  input: INITIAL_TOKEN_COUNT,
  output: INITIAL_TOKEN_COUNT,
  cached: INITIAL_TOKEN_COUNT,
};

function createUserMessage(text: string): Message {
  return {
    id: nanoid(),
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: nanoid(),
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
}

const LAST_ELEMENT_INDEX = -1;

function getLastVisitedNode(visitedNodes: string[], fallback: string): string {
  return visitedNodes.at(LAST_ELEMENT_INDEX) ?? fallback;
}

function buildStepFromResult(
  result: CallAgentOutput,
  userText: string,
  currentNode: string
): { step: SimulationStep; newNode: string } {
  const { visitedNodes, text: agentText, tokensLogs } = result;
  const newNode = getLastVisitedNode(visitedNodes, currentNode);

  const step: SimulationStep = {
    userText,
    agentText: agentText ?? '',
    visitedNodes,
    tokenUsage: sumTokensFromLogs(tokensLogs),
  };

  return { step, newNode };
}

function addTokens(prev: SimulationTokens, step: SimulationStep): SimulationTokens {
  return {
    input: prev.input + step.tokenUsage.input,
    output: prev.output + step.tokenUsage.output,
    cached: prev.cached + step.tokenUsage.cached,
  };
}

function wrapAgentMessage(result: CallAgentOutput): Message | null {
  if (result.message === null) return null;

  return {
    id: nanoid(),
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: nanoid(),
    message: result.message,
  };
}

function appendAgentMessage(allMessages: Message[], result: CallAgentOutput): Message[] {
  const wrapped = wrapAgentMessage(result);
  if (wrapped === null) return allMessages;
  return [...allMessages, wrapped];
}

interface SimulationSetters {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSteps: React.Dispatch<React.SetStateAction<SimulationStep[]>>;
  setTotalTokens: React.Dispatch<React.SetStateAction<SimulationTokens>>;
  setCurrentNode: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

interface ApplyResultParams {
  result: CallAgentOutput;
  userText: string;
  allMessages: Message[];
  currentNode: string;
  setters: SimulationSetters;
  onZoomToNode: (nodeId: string) => void;
}

function applyExecutionResult(p: ApplyResultParams): void {
  const { step, newNode } = buildStepFromResult(p.result, p.userText, p.currentNode);

  p.setters.setMessages(appendAgentMessage(p.allMessages, p.result));
  p.setters.setSteps((prev) => [...prev, step]);
  p.setters.setTotalTokens((prev) => addTokens(prev, step));
  p.setters.setCurrentNode(newNode);
  p.setters.setLoading(false);
  p.onZoomToNode(newNode);
}

function useSimulationStart(
  setters: SimulationSetters & { setActive: React.Dispatch<React.SetStateAction<boolean>> },
  onZoomToNode: (nodeId: string) => void
): () => void {
  return useCallback(() => {
    setters.setActive(true);
    setters.setCurrentNode(START_NODE_ID);
    setters.setMessages([]);
    setters.setSteps([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    onZoomToNode(START_NODE_ID);
  }, [setters, onZoomToNode]);
}

function useSimulationStop(
  setters: SimulationSetters & { setActive: React.Dispatch<React.SetStateAction<boolean>> },
  onExitZoomView: () => void
): () => void {
  return useCallback(() => {
    setters.setActive(false);
    setters.setMessages([]);
    setters.setSteps([]);
    setters.setTotalTokens(EMPTY_TOKENS);
    onExitZoomView();
  }, [setters, onExitZoomView]);
}

interface SendMessageDeps {
  preset: ContextPreset | undefined;
  loading: boolean;
  messages: Message[];
  allNodes: Array<RFNode<RFNodeData>>;
  edges: Array<RFEdge<RFEdgeData>>;
  agents: Agent[];
  apiKey: string;
  currentNode: string;
  setters: SimulationSetters;
  onZoomToNode: (nodeId: string) => void;
}

function useSimulationSend(deps: SendMessageDeps): (text: string) => void {
  const { preset, loading, messages, allNodes, edges, agents, apiKey, currentNode } = deps;
  const { setters, onZoomToNode } = deps;

  return useCallback(
    (text: string) => {
      if (preset === undefined || loading) return;
      setters.setLoading(true);

      const userMessage = createUserMessage(text);
      const allMessages = [...messages, userMessage];
      const graph = buildGraph(allNodes, edges, agents);
      const context = { ...buildContext(preset, apiKey), graph };

      void execute(context, allMessages, currentNode).then((result) => {
        if (result === null) {
          setters.setLoading(false);
          return;
        }
        applyExecutionResult({
          result,
          userText: text,
          allMessages,
          currentNode,
          setters,
          onZoomToNode,
        });
      });
    },
    [preset, loading, messages, allNodes, edges, agents, apiKey, currentNode, setters, onZoomToNode]
  );
}

export function useSimulation(params: UseSimulationParams): SimulationState {
  const { allNodes, edges, agents, preset, apiKey, onZoomToNode, onExitZoomView } = params;

  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentNode, setCurrentNode] = useState(START_NODE_ID);
  const [messages, setMessages] = useState<Message[]>([]);
  const [steps, setSteps] = useState<SimulationStep[]>([]);
  const [totalTokens, setTotalTokens] = useState<SimulationTokens>(EMPTY_TOKENS);

  const setters: SimulationSetters & { setActive: React.Dispatch<React.SetStateAction<boolean>> } = {
    setMessages,
    setSteps,
    setTotalTokens,
    setCurrentNode,
    setLoading,
    setActive,
  };

  const start = useSimulationStart(setters, onZoomToNode);
  const stop = useSimulationStop(setters, onExitZoomView);
  const sendMessage = useSimulationSend({
    preset,
    loading,
    messages,
    allNodes,
    edges,
    agents,
    apiKey,
    currentNode,
    setters,
    onZoomToNode,
  });

  return { active, loading, currentNode, steps, totalTokens, start, stop, sendMessage };
}
