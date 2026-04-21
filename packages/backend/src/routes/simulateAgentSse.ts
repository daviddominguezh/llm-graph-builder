import type { AgentLoopResult, AgentStepEvent, AgentToolEvent } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';

import type { AgentSimulationEvent, ChildDispatchedEvent, ChildFinishedEvent } from './simulateAgentTypes.js';

interface Flushable {
  flush: () => void;
}

function hasFlushMethod(value: object): value is Flushable {
  return 'flush' in value && typeof (value as Record<string, unknown>).flush === 'function';
}

function isFlushable(value: unknown): value is Flushable {
  return typeof value === 'object' && value !== null && hasFlushMethod(value);
}

export function writeAgentSSE(res: Response, event: AgentSimulationEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  res.write(payload);
  if (isFlushable(res)) {
    res.flush();
  }
}

const ROOT_DEPTH = 0;

export function sendStepStarted(res: Response, step: number, depth = ROOT_DEPTH): void {
  writeAgentSSE(res, { type: 'step_started', step, depth });
}

export function sendStepProcessed(res: Response, event: AgentStepEvent, depth = ROOT_DEPTH): void {
  writeAgentSSE(res, {
    type: 'step_processed',
    step: event.step,
    depth,
    responseText: event.responseText,
    toolCalls: event.toolCalls,
    tokens: event.tokens,
    durationMs: event.durationMs,
    responseMessages: event.responseMessages,
    reasoning: event.reasoning,
    error: event.error,
  });
}

export function sendToolExecuted(res: Response, event: AgentToolEvent, depth = ROOT_DEPTH): void {
  writeAgentSSE(res, {
    type: 'tool_executed',
    step: event.step,
    depth,
    toolCall: event.toolCall,
  });
}

export function sendAgentResponse(res: Response, result: AgentLoopResult, depth = ROOT_DEPTH): void {
  writeAgentSSE(res, {
    type: 'agent_response',
    depth,
    text: result.finalText,
    steps: result.steps,
    totalTokens: result.totalTokens,
    toolCalls: result.toolCalls,
  });
}

export function sendAgentError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'Agent simulation failed';
  writeAgentSSE(res, { type: 'error', message });
}

type ChildDispatchedOptions = Omit<ChildDispatchedEvent, 'type'>;

export function sendChildDispatched(res: Response, options: ChildDispatchedOptions): void {
  writeAgentSSE(res, { type: 'child_dispatched', ...options });
}

type ChildFinishedOptions = Omit<ChildFinishedEvent, 'type'>;

export function sendChildFinished(res: Response, options: ChildFinishedOptions): void {
  writeAgentSSE(res, { type: 'child_finished', ...options });
}

export function sendChildWaiting(res: Response, depth: number, text: string): void {
  writeAgentSSE(res, { type: 'child_waiting', depth, text });
}

export function sendKeepAlive(res: Response): void {
  res.write(': keepalive\n\n');
  if (isFlushable(res)) {
    res.flush();
  }
}
