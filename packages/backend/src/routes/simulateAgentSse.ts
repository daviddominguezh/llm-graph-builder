import type { AgentLoopResult, AgentStepEvent, AgentToolEvent } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';

import type { AgentSimulationEvent } from './simulateAgentTypes.js';

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

export function sendStepStarted(res: Response, step: number): void {
  writeAgentSSE(res, { type: 'step_started', step });
}

export function sendStepProcessed(res: Response, event: AgentStepEvent): void {
  writeAgentSSE(res, {
    type: 'step_processed',
    step: event.step,
    responseText: event.responseText,
    toolCalls: event.toolCalls,
    tokens: event.tokens,
    durationMs: event.durationMs,
    responseMessages: event.responseMessages,
    reasoning: event.reasoning,
    error: event.error,
  });
}

export function sendToolExecuted(res: Response, event: AgentToolEvent): void {
  writeAgentSSE(res, {
    type: 'tool_executed',
    step: event.step,
    toolCall: event.toolCall,
  });
}

export function sendAgentResponse(res: Response, result: AgentLoopResult): void {
  writeAgentSSE(res, {
    type: 'agent_response',
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
