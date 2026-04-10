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
/**
 * The AI SDK wraps tool results in { type: 'json', value: {...} }.
 * This function unwraps that envelope to get the raw tool output.
 */
export function unwrapToolOutput(output: unknown): unknown {
  if (typeof output !== 'object' || output === null) return output;
  if (!('type' in output) || !('value' in output)) return output;
  const obj = output as { type: unknown; value: unknown };
  return obj.type === 'json' ? obj.value : output;
}

export function detectSentinels(toolCalls: AgentToolCallRecord[]): SentinelDetectionResult {
  for (const tc of toolCalls) {
    const raw = unwrapToolOutput(tc.output);
    if (isFinishSentinel(raw)) {
      return { type: 'finish', finishSentinel: raw };
    }
  }

  for (const tc of toolCalls) {
    const raw = unwrapToolOutput(tc.output);
    if (isDispatchSentinel(raw)) {
      return { type: 'dispatch', dispatchSentinel: raw };
    }
  }

  return { type: 'none' };
}
