import type { FinishSentinel } from '../types/sentinels.js';

export type ChildErrorCode =
  | 'max_depth_exceeded'
  | 'child_failed'
  | 'no_result'
  | 'timeout'
  | 'agent_not_published'
  | 'aborted';

export type ChildResult =
  | { status: 'finished'; result: string; outcome: 'success' | 'error' }
  | { status: 'awaiting_input'; partial: string }
  | { status: 'error'; code: ChildErrorCode; message: string };

export interface TerminationInput {
  environment: 'production' | 'simulation';
  finishResult?: FinishSentinel;
  lastAssistantText: string;
  depthExceeded?: boolean;
  failure?: {
    kind: 'child_failed' | 'timeout' | 'agent_not_published' | 'aborted';
    message: string;
  };
}

function fromFinish(finish: FinishSentinel): ChildResult {
  return { status: 'finished', result: finish.output, outcome: finish.status };
}

function fromEnd(environment: 'production' | 'simulation', text: string): ChildResult {
  if (environment === 'simulation') return { status: 'awaiting_input', partial: text };
  if (text !== '') return { status: 'finished', result: text, outcome: 'success' };
  return { status: 'error', code: 'no_result', message: 'Child ended without a result.' };
}

export function mapTerminationToChildResult(input: TerminationInput): ChildResult {
  if (input.depthExceeded === true) {
    return { status: 'error', code: 'max_depth_exceeded', message: 'Max dispatch depth exceeded.' };
  }
  if (input.failure !== undefined) {
    return { status: 'error', code: input.failure.kind, message: input.failure.message };
  }
  if (input.finishResult !== undefined) return fromFinish(input.finishResult);
  return fromEnd(input.environment, input.lastAssistantText);
}
