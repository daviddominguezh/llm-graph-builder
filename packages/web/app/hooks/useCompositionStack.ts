import type { Message } from '@daviddh/llm-graph-runner';

/* ─── Types ─── */

export interface CompositionLevel {
  appType: 'agent' | 'workflow';
  messages: Message[];
  parentMessages: Message[];
  currentNodeId?: string;
  structuredOutputs?: Record<string, unknown[]>;
  dispatchParams: Record<string, unknown>;
  parentToolCallId: string;
  toolName: string;
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

/* ─── Stubs (tests compile, but fail at runtime) ─── */

export function pushChild(_stack: CompositionLevel[], _params: PushChildParams): CompositionLevel[] {
  throw new Error('not implemented');
}

export function popChild(
  _stack: CompositionLevel[],
  _rootMessages: Message[],
  _childOutput: string,
  _childStatus: 'success' | 'error'
): PopChildResult {
  throw new Error('not implemented');
}

export function getActiveDepth(_stack: CompositionLevel[]): number {
  throw new Error('not implemented');
}

export function getActiveMessages(_stack: CompositionLevel[], _rootMessages: Message[]): Message[] {
  throw new Error('not implemented');
}

export function appendUserMessage(
  _stack: CompositionLevel[],
  _rootMessages: Message[],
  _text: string
): AppendMessageResult {
  throw new Error('not implemented');
}

export function buildCompositionPayload(
  _stack: CompositionLevel[]
): SimulationComposition | undefined {
  throw new Error('not implemented');
}

export function accumulateDepthTokens(
  _current: DepthTokens,
  _depth: number,
  _tokens: TokenTotals
): DepthTokens {
  throw new Error('not implemented');
}

export function createEmptyDepthTokens(): DepthTokens {
  throw new Error('not implemented');
}
