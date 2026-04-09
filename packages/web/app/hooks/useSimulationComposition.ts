import { MESSAGES_PROVIDER, type Message } from '@daviddh/llm-graph-runner';
import { nanoid } from 'nanoid';

import type { AgentSimulateRequestBody } from '../lib/agentSimulationApi';
import type { SimChildDispatchedEvent, SimCompositionCallbacks } from '../lib/sseSimComposition';
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

export interface PendingChildDispatch {
  task: string;
  childConfig: SimChildDispatchedEvent['childConfig'];
  label: string;
}

export interface CompositionCallbackDeps {
  compositionStackRef: React.RefObject<CompositionLevel[]>;
  messagesRef: React.RefObject<Message[]>;
  setters: Pick<
    SimulationSetters,
    'setCompositionStack' | 'setMessages' | 'setLoading' | 'setConversationEntries'
  >;
  pendingChildRef: React.MutableRefObject<PendingChildDispatch | null>;
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
      console.log('[composition:callback] onSimChildDispatched', {
        task: event.task,
        depth: event.depth,
        dispatchType: event.dispatchType,
      });
      const parentMsgs = getActiveMessages(compositionStackRef.current, messagesRef.current);
      const params = buildPushParams(event, parentMsgs);
      setters.setCompositionStack((prev) => {
        const next = pushChild(prev, params);
        console.log('[composition:callback] stack after push', {
          prevDepth: prev.length,
          newDepth: next.length,
        });
        return next;
      });
      deps.pendingChildRef.current = {
        task: event.task,
        childConfig: event.childConfig,
        label: event.dispatchType === 'invoke_agent' ? 'Agent' : event.dispatchType,
      };
      console.log('[composition:callback] pendingChild set:', {
        task: event.task,
        hasConfig: event.childConfig !== undefined,
      });
    },
    onSimChildFinished: (event) => {
      console.log('[composition:callback] onSimChildFinished', {
        depth: event.depth,
        status: event.status,
        output: event.output.slice(0, 100),
      });
      setters.setConversationEntries((prev) => [...prev, { type: 'child_end', label: event.status }]);
      const status = event.status === 'error' ? 'error' : 'success';
      setters.setCompositionStack((prev) => {
        const root = messagesRef.current;
        const result = popChild(prev, root, event.output, status);
        setters.setMessages(result.rootMessages);
        console.log('[composition:callback] stack after pop', {
          prevDepth: prev.length,
          newDepth: result.stack.length,
        });
        return result.stack;
      });
    },
    onSimChildWaiting: () => {
      console.log('[composition:callback] onSimChildWaiting');
      setters.setLoading(false);
    },
  };
}

export function buildMergedCallbacks(
  deps: StreamCallbackDeps & CompositionCallbackDeps,
  autoSendChild?: (dispatch: PendingChildDispatch) => void
): ReturnType<typeof buildStreamCallbacks> {
  const base = buildStreamCallbacks(deps);
  const comp = buildCompositionSseCallbacks(deps);
  const baseOnComplete = base.onComplete;
  return {
    ...base,
    ...comp,
    onComplete: () => {
      const pending = deps.pendingChildRef.current;
      console.log(
        '[composition:onComplete] stream ended, pending:',
        pending !== null,
        'hasAutoSend:',
        autoSendChild !== undefined
      );
      baseOnComplete?.();
      if (pending !== null) {
        deps.pendingChildRef.current = null;
        console.log('[composition:onComplete] auto-sending child:', pending.task.slice(0, 50));
        autoSendChild?.(pending);
      } else {
        console.log('[composition:onComplete] no pending child');
      }
    },
  };
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
