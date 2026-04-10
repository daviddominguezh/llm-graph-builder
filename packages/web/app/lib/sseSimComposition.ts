import { z } from 'zod';

export interface SimChildDispatchedEvent {
  depth: number;
  parentDepth: number;
  dispatchType: string;
  task: string;
  parentToolCallId: string;
  toolName: string;
  childConfig?: {
    systemPrompt: string;
    context: string;
    modelId: string;
    maxSteps: number | null;
  };
}

export interface SimChildFinishedEvent {
  depth: number;
  output: string;
  status: string;
  tokens: { input: number; output: number; cached: number };
}

export interface SimChildWaitingEvent {
  depth: number;
  text: string;
}

export interface SimCompositionCallbacks {
  onSimChildDispatched?: (event: SimChildDispatchedEvent) => void;
  onSimChildFinished?: (event: SimChildFinishedEvent) => void;
  onSimChildWaiting?: (event: SimChildWaitingEvent) => void;
}

export const SimCompositionSchemaFields = {
  depth: z.number().optional(),
  parentDepth: z.number().optional(),
  dispatchType: z.string().optional(),
  parentToolCallId: z.string().optional(),
  toolName: z.string().optional(),
  task: z.string().optional(),
};

interface CompositionSseEvent {
  type: string;
  depth?: number;
  parentDepth?: number;
  dispatchType?: string;
  task?: string;
  parentToolCallId?: string;
  toolName?: string;
  output?: unknown;
  text?: string;
  status?: string;
  tokens?: { input: number; output: number; cached: number };
  childConfig?: {
    systemPrompt: string;
    context: string;
    modelId: string;
    maxSteps: number | null;
  };
}

function handleSimChildDispatched(event: CompositionSseEvent, cbs: SimCompositionCallbacks): void {
  if (event.depth === undefined) return;
  cbs.onSimChildDispatched?.({
    depth: event.depth,
    parentDepth: event.parentDepth ?? 0,
    dispatchType: event.dispatchType ?? '',
    task: event.task ?? '',
    parentToolCallId: event.parentToolCallId ?? '',
    toolName: event.toolName ?? '',
    childConfig: event.childConfig,
  });
}

function handleSimChildFinished(event: CompositionSseEvent, cbs: SimCompositionCallbacks): void {
  if (event.depth === undefined) return;
  const outputStr = typeof event.output === 'string' ? event.output : (event.text ?? '');
  cbs.onSimChildFinished?.({
    depth: event.depth,
    output: outputStr,
    status: event.status ?? 'success',
    tokens: {
      input: event.tokens?.input ?? 0,
      output: event.tokens?.output ?? 0,
      cached: event.tokens?.cached ?? 0,
    },
  });
}

function handleSimChildWaiting(event: CompositionSseEvent, cbs: SimCompositionCallbacks): void {
  if (event.depth === undefined) return;
  cbs.onSimChildWaiting?.({
    depth: event.depth,
    text: event.text ?? '',
  });
}

/** Returns true if the event was handled as a composition event. */
export function dispatchSimCompositionEvent(
  event: CompositionSseEvent,
  callbacks: SimCompositionCallbacks
): boolean {
  if (event.type === 'child_dispatched') {
    console.log('[composition:sse] child_dispatched event received', {
      depth: event.depth,
      dispatchType: event.dispatchType,
      task: event.task,
      hasCallback: callbacks.onSimChildDispatched !== undefined,
    });
    if (event.depth !== undefined) {
      handleSimChildDispatched(event, callbacks);
      return true;
    }
    console.warn('[composition:sse] child_dispatched missing depth field, skipped');
    return false;
  }
  if (event.type === 'child_finished') {
    console.log('[composition:sse] child_finished event received', { depth: event.depth });
    if (event.depth !== undefined) {
      handleSimChildFinished(event, callbacks);
      return true;
    }
    return false;
  }
  if (event.type === 'child_waiting') {
    console.log('[composition:sse] child_waiting event received', { depth: event.depth });
    if (event.depth !== undefined) {
      handleSimChildWaiting(event, callbacks);
      return true;
    }
    return false;
  }
  return false;
}
