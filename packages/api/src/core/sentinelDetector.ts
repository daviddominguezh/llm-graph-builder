import type { AgentToolCallRecord } from '@src/agentLoop/agentLoopTypes.js';
import {
  type DispatchSentinel,
  type FinishSentinel,
  isDispatchSentinel,
  isFinishSentinel,
} from '@src/types/sentinels.js';

export interface SentinelDetectionResult {
  type: 'none' | 'finish' | 'dispatch';
  finishSentinel?: FinishSentinel;
  dispatchSentinel?: DispatchSentinel;
}

/**
 * Inspects tool call results for sentinel values after each agent loop step.
 * Returns the first sentinel found (finish takes priority over dispatch).
 */
export function detectSentinels(toolCalls: AgentToolCallRecord[]): SentinelDetectionResult {
  for (const tc of toolCalls) {
    if (isFinishSentinel(tc.output)) {
      return { type: 'finish', finishSentinel: tc.output };
    }
  }

  for (const tc of toolCalls) {
    if (isDispatchSentinel(tc.output)) {
      return { type: 'dispatch', dispatchSentinel: tc.output };
    }
  }

  return { type: 'none' };
}
