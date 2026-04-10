import type { Message } from '@daviddh/llm-graph-runner';

import type { SimChildDispatchedEvent } from '../lib/sseSimComposition';
import {
  type ChildAgentConfig,
  type CompositionLevel,
  type PushChildParams,
  appendUserMessage,
  popChild,
  pushChild,
} from './useCompositionStack';
import { createAssistantMessage } from './useSimulationHelpers';

/* ─── Types ─── */

export type CompositionPhase =
  | 'idle'
  | 'running'
  | 'child_dispatched'
  | 'child_running'
  | 'child_waiting'
  | 'resuming_parent';

export interface CompositionState {
  stack: CompositionLevel[];
  rootMessages: Message[];
  phase: CompositionPhase;
  pendingDispatch: PendingChildDispatch | null;
  childConfig: ChildAgentConfig | null;
}

export interface PendingChildDispatch {
  task: string;
  childConfig?: ChildAgentConfig;
  label: string;
}

export type CompositionEvent =
  | { type: 'START'; rootMessages: Message[] }
  | { type: 'CHILD_DISPATCHED'; event: SimChildDispatchedEvent; parentMessages: Message[] }
  | { type: 'CHILD_AUTO_SENT' }
  | { type: 'CHILD_RESPONSE'; text: string }
  | { type: 'USER_MESSAGE'; text: string }
  | { type: 'CHILD_FINISHED'; output: string; status: 'success' | 'error' }
  | { type: 'PARENT_RESUMED' }
  | { type: 'STREAM_COMPLETED' }
  | { type: 'RESET' };

export const INITIAL_STATE: CompositionState = {
  stack: [],
  rootMessages: [],
  phase: 'idle',
  pendingDispatch: null,
  childConfig: null,
};

/* ─── Event handlers ─── */

function handleStart(state: CompositionState, rootMessages: Message[]): CompositionState {
  return { ...state, rootMessages, phase: 'running' };
}

function buildPushParams(event: SimChildDispatchedEvent, parentMessages: Message[]): PushChildParams {
  return {
    appType: (event.dispatchType as 'agent' | 'workflow') || 'agent',
    dispatchParams: {},
    parentToolCallId: event.parentToolCallId,
    toolName: event.toolName,
    task: event.task,
    parentMessages,
    childConfig: event.childConfig,
  };
}

function handleChildDispatched(
  state: CompositionState,
  event: SimChildDispatchedEvent,
  parentMessages: Message[]
): CompositionState {
  const params = buildPushParams(event, parentMessages);
  const stack = pushChild(state.stack, params);
  const pending: PendingChildDispatch = {
    task: event.task,
    childConfig: event.childConfig,
    label: event.toolName,
  };
  return {
    ...state,
    stack,
    phase: 'child_dispatched',
    pendingDispatch: pending,
    childConfig: event.childConfig ?? null,
  };
}

function handleChildAutoSent(state: CompositionState): CompositionState {
  return { ...state, phase: 'child_running', pendingDispatch: null };
}

function handleUserMessage(state: CompositionState, text: string): CompositionState {
  const { stack, rootMessages } = appendUserMessage(state.stack, state.rootMessages, text);
  return { ...state, stack, rootMessages };
}

function appendAssistantToStack(stack: CompositionLevel[], text: string): CompositionLevel[] {
  if (stack.length === 0) return stack;
  const last = stack[stack.length - 1]!;
  const msg = createAssistantMessage(text);
  const updated: CompositionLevel = { ...last, messages: [...last.messages, msg] };
  return [...stack.slice(0, -1), updated];
}

function handleChildResponse(state: CompositionState, text: string): CompositionState {
  return { ...state, stack: appendAssistantToStack(state.stack, text) };
}

function handleChildFinished(
  state: CompositionState,
  output: string,
  status: 'success' | 'error'
): CompositionState {
  const { stack, rootMessages } = popChild(state.stack, state.rootMessages, output, status);
  return { ...state, stack, rootMessages, phase: 'resuming_parent', childConfig: null };
}

function handleParentResumed(state: CompositionState): CompositionState {
  return { ...state, phase: 'running' };
}

function handleStreamCompleted(state: CompositionState): CompositionState {
  return state;
}

/* ─── Transition function ─── */

export function transition(state: CompositionState, event: CompositionEvent): CompositionState {
  switch (event.type) {
    case 'RESET':
      return INITIAL_STATE;
    case 'START':
      return handleStart(state, event.rootMessages);
    case 'CHILD_DISPATCHED':
      return handleChildDispatched(state, event.event, event.parentMessages);
    case 'CHILD_AUTO_SENT':
      return handleChildAutoSent(state);
    case 'USER_MESSAGE':
      return handleUserMessage(state, event.text);
    case 'CHILD_RESPONSE':
      return handleChildResponse(state, event.text);
    case 'CHILD_FINISHED':
      return handleChildFinished(state, event.output, event.status);
    case 'PARENT_RESUMED':
      return handleParentResumed(state);
    case 'STREAM_COMPLETED':
      return handleStreamCompleted(state);
  }
}
