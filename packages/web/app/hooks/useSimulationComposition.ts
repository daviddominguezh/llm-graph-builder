import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';
import { nanoid } from 'nanoid';

import type { AgentSimulateRequestBody } from '../lib/agentSimulationApi';
import type { SimCompositionCallbacks } from '../lib/sseSimComposition';
import {
  type CompositionLevel,
  type PushChildParams,
  appendUserMessage,
  buildCompositionPayload,
  getActiveDepth,
  getActiveMessages,
  popChild,
  pushChild,
} from './useCompositionStack';
import type { SimulationSetters } from './useSimulationHelpers';
import { type StreamCallbackDeps, buildStreamCallbacks } from './useSimulationHelpers';

/* ─── Types ─── */

export interface CompositionCallbackDeps {
  compositionStackRef: React.RefObject<CompositionLevel[]>;
  messagesRef: React.RefObject<Message[]>;
  setters: Pick<SimulationSetters, 'setCompositionStack' | 'setMessages' | 'setLoading'>;
}

export interface CompositionRequestOverrides {
  messages: Message[];
  composition: NonNullable<AgentSimulateRequestBody['composition']>;
  orgId?: string;
}

/* ─── Message Helpers ─── */

export function createUserMessage(text: string): Message {
  return {
    id: nanoid(),
    provider: MESSAGES_PROVIDER.WEB,
    type: 'text',
    timestamp: Date.now(),
    originalId: nanoid(),
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
}

const TURN_INCREMENT = 1;

function advanceTurnCount(setters: SimulationSetters, isAgent: boolean): void {
  setters.setTurnCount((prev) => {
    const next = prev + TURN_INCREMENT;
    if (isAgent) setters.setCurrentNode(`Turn ${String(next)}`);
    return next;
  });
}

export function resetBeforeSend(
  setters: SimulationSetters,
  text: string,
  userMsg: Message,
  isAgent: boolean
): void {
  setters.setLoading(true);
  setters.setLastUserText(text);
  setters.setMessages((prev) => [...prev, userMsg]);
  setters.setConversationEntries((prev) => [...prev, { type: 'user' as const, text }]);
  advanceTurnCount(setters, isAgent);
}

export function resetBeforeSendComposition(setters: SimulationSetters, text: string, isAgent: boolean): void {
  setters.setLoading(true);
  setters.setLastUserText(text);
  setters.setConversationEntries((prev) => [...prev, { type: 'user' as const, text }]);
  advanceTurnCount(setters, isAgent);
}

/* ─── User Message Routing ─── */

export interface CompositionAwareDeps {
  compositionStackRef: React.RefObject<CompositionLevel[]>;
  messagesRef: React.RefObject<Message[]>;
  messages: Message[];
  setters: SimulationSetters;
}

export function routeUserMessage(deps: CompositionAwareDeps, text: string, userMsg: Message): void {
  const { compositionStackRef, messages, setters } = deps;
  const depth = getActiveDepth(compositionStackRef.current);
  if (depth > 0) {
    const result = appendUserMessage(compositionStackRef.current, messages, text);
    setters.setCompositionStack(result.stack);
    setters.setMessages(result.rootMessages);
  } else {
    setters.setMessages((prev) => [...prev, userMsg]);
  }
}

/* ─── SSE Callback Builders ─── */

function buildPushParams(
  event: { parentToolCallId: string; toolName: string; task: string; dispatchType: string },
  parentMessages: Message[]
): PushChildParams {
  return {
    appType: 'agent',
    dispatchParams: { dispatchType: event.dispatchType },
    parentToolCallId: event.parentToolCallId,
    toolName: event.toolName,
    task: event.task,
    parentMessages,
  };
}

export function buildCompositionSseCallbacks(deps: CompositionCallbackDeps): SimCompositionCallbacks {
  const { compositionStackRef, messagesRef, setters } = deps;

  return {
    onSimChildDispatched: (event) => {
      const parentMsgs = getActiveMessages(compositionStackRef.current, messagesRef.current);
      const params = buildPushParams(event, parentMsgs);
      setters.setCompositionStack((prev) => pushChild(prev, params));
    },
    onSimChildFinished: (event) => {
      const status = event.status === 'error' ? 'error' : 'success';
      setters.setCompositionStack((prev) => {
        const root = messagesRef.current;
        const result = popChild(prev, root, event.output, status);
        setters.setMessages(result.rootMessages);
        return result.stack;
      });
    },
    onSimChildWaiting: () => {
      setters.setLoading(false);
    },
  };
}

export function buildMergedCallbacks(
  deps: StreamCallbackDeps & CompositionCallbackDeps
): ReturnType<typeof buildStreamCallbacks> {
  const base = buildStreamCallbacks(deps);
  const comp = buildCompositionSseCallbacks(deps);
  return { ...base, ...comp };
}

/* ─── Request Overrides ─── */

export function getCompositionRequestOverrides(
  stack: CompositionLevel[],
  rootMessages: Message[],
  orgId?: string
): CompositionRequestOverrides | undefined {
  const depth = getActiveDepth(stack);
  if (depth === 0) return undefined;
  const activeMessages = getActiveMessages(stack, rootMessages);
  const composition = buildCompositionPayload(stack);
  if (composition === undefined) return undefined;
  return { messages: activeMessages, composition, orgId };
}
