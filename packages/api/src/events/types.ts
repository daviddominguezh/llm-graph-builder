import type { ChildResult } from '../runtime/childResult.js';

export interface Tokens {
  input: number;
  output: number;
  cached: number;
  costUSD?: number;
}

export type ExecutionEvent =
  | { type: 'node_entered'; nodeId: string; depth: number }
  | {
      type: 'node_exited';
      nodeId: string;
      depth: number;
      text?: string;
      tokens?: Tokens;
      durationMs?: number;
      reasoning?: string;
      structuredOutput?: { nodeId: string; data: unknown };
    }
  | { type: 'assistant_message'; text: string; depth: number }
  | {
      type: 'tool_call';
      toolName: string;
      toolCallId: string;
      args: unknown;
      depth: number;
      isMcp: boolean;
    }
  | { type: 'tool_result'; toolCallId: string; result: unknown; depth: number }
  | { type: 'simulation_state_patch'; tool: string; path: string; value: unknown }
  | { type: 'simulation_state_snapshot'; state: Record<string, unknown> }
  | {
      type: 'child_dispatched';
      childExecutionId: string;
      dispatchType: string;
      task: string;
      depth: number;
    }
  | { type: 'child_suspended'; childExecutionId: string; depth: number }
  | { type: 'child_awaiting_input'; childExecutionId: string; partial: string; depth: number }
  | { type: 'child_finished'; childExecutionId: string; result: ChildResult; tokens?: Tokens; depth: number }
  | { type: 'node_error'; nodeId: string; message: string; depth: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'finished'; result: string; tokens?: Tokens; structuredOutputs?: Record<string, unknown[]> };
