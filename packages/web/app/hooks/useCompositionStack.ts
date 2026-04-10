import type { Message } from '@daviddh/llm-graph-runner';

import { createToolResultMessage, createUserMessage, sumByDepth } from './compositionStackHelpers';

/* ─── Types ─── */

export interface ChildAgentConfig {
  systemPrompt: string;
  context: string;
  modelId: string;
  maxSteps: number | null;
}

export interface CompositionLevel {
  appType: 'agent' | 'workflow';
  messages: Message[];
  parentMessages: Message[];
  currentNodeId?: string;
  structuredOutputs?: Record<string, unknown[]>;
  dispatchParams: Record<string, unknown>;
  parentToolCallId: string;
  toolName: string;
  childConfig?: ChildAgentConfig;
}

export interface SimulationComposition {
  depth: number;
  stack: Array<{
    appType: 'agent' | 'workflow';
    parentToolCallId: string;
    parentMessages: Message[];
    parentCurrentNodeId?: string;
    parentStructuredOutputs?: Record<string, unknown[]>;
  }>;
}

export interface PushChildParams {
  appType: 'agent' | 'workflow';
  dispatchParams: Record<string, unknown>;
  parentToolCallId: string;
  toolName: string;
  task: string;
  parentMessages: Message[];
  childConfig?: ChildAgentConfig;
}

export interface PopChildResult {
  stack: CompositionLevel[];
  rootMessages: Message[];
}

export interface AppendMessageResult {
  stack: CompositionLevel[];
  rootMessages: Message[];
}

export interface DepthTokens {
  byDepth: Record<number, TokenTotals>;
  aggregate: TokenTotals;
}

export interface TokenTotals {
  input: number;
  output: number;
  cached: number;
}

/* ─── Pure functions ─── */

export function pushChild(stack: CompositionLevel[], params: PushChildParams): CompositionLevel[] {
  const taskMessage = createUserMessage(params.task);
  const level: CompositionLevel = {
    appType: params.appType,
    messages: [taskMessage],
    parentMessages: [...params.parentMessages],
    dispatchParams: params.dispatchParams,
    parentToolCallId: params.parentToolCallId,
    toolName: params.toolName,
    childConfig: params.childConfig,
  };
  return [...stack, level];
}

export function popChild(
  stack: CompositionLevel[],
  rootMessages: Message[],
  childOutput: string,
  _childStatus: 'success' | 'error'
): PopChildResult {
  if (stack.length === 0) {
    return { stack: [], rootMessages };
  }
  const popped = stack[stack.length - 1]!;
  const newStack = stack.slice(0, -1);
  const toolResultMsg = createToolResultMessage(popped.parentToolCallId, popped.toolName, childOutput);

  if (newStack.length === 0) {
    return { stack: newStack, rootMessages: [...rootMessages, toolResultMsg] };
  }
  return { stack: appendToLastLevel(newStack, toolResultMsg), rootMessages };
}

function appendToLastLevel(stack: CompositionLevel[], msg: Message): CompositionLevel[] {
  const last = stack[stack.length - 1]!;
  const updated: CompositionLevel = { ...last, messages: [...last.messages, msg] };
  return [...stack.slice(0, -1), updated];
}

export function getActiveDepth(stack: CompositionLevel[]): number {
  return stack.length;
}

export function getActiveMessages(stack: CompositionLevel[], rootMessages: Message[]): Message[] {
  if (stack.length === 0) return rootMessages;
  return stack[stack.length - 1]!.messages;
}

export function appendUserMessage(
  stack: CompositionLevel[],
  rootMessages: Message[],
  text: string
): AppendMessageResult {
  const msg = createUserMessage(text);
  if (stack.length === 0) {
    return { stack, rootMessages: [...rootMessages, msg] };
  }
  return { stack: appendToLastLevel(stack, msg), rootMessages };
}

export function buildCompositionPayload(stack: CompositionLevel[]): SimulationComposition | undefined {
  if (stack.length === 0) return undefined;
  return {
    depth: stack.length,
    stack: stack.map((level) => ({
      appType: level.appType,
      parentToolCallId: level.parentToolCallId,
      parentMessages: level.parentMessages,
      parentCurrentNodeId: level.currentNodeId,
      parentStructuredOutputs: level.structuredOutputs,
    })),
  };
}

export function createEmptyDepthTokens(): DepthTokens {
  return { byDepth: {}, aggregate: { input: 0, output: 0, cached: 0 } };
}

export function accumulateDepthTokens(current: DepthTokens, depth: number, tokens: TokenTotals): DepthTokens {
  const prev = current.byDepth[depth];
  const updated: TokenTotals = prev
    ? {
        input: prev.input + tokens.input,
        output: prev.output + tokens.output,
        cached: prev.cached + tokens.cached,
      }
    : { ...tokens };
  const byDepth = { ...current.byDepth, [depth]: updated };
  return { byDepth, aggregate: sumByDepth(byDepth) };
}
