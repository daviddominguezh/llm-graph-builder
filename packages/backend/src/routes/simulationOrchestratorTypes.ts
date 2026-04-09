import type { AgentLoopResult, AgentStepEvent, AgentToolEvent } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../db/queries/operationHelpers.js';
import type { McpSession } from '../mcp/lifecycle.js';
import type { SimulateAgentRequest } from './simulateAgentTypes.js';

export interface OrchestratorConfig {
  body: SimulateAgentRequest;
  session: McpSession;
  depth: number;
  maxNestingDepth: number;
  orgId: string;
  supabase: SupabaseClient;
}

export interface ChildDispatchedInfo {
  depth: number;
  parentDepth: number;
  dispatchType: string;
  task: string;
  parentToolCallId: string;
  toolName: string;
}

export interface ChildFinishedInfo {
  depth: number;
  output: string;
  status: 'success' | 'error';
  tokens: { input: number; output: number; cached: number };
}

export interface OrchestratorCallbacks {
  onStepStarted: (step: number, depth: number) => void;
  onStepProcessed: (event: AgentStepEvent, depth: number) => void;
  onToolExecuted: (event: AgentToolEvent, depth: number) => void;
  onChildDispatched: (info: ChildDispatchedInfo) => void;
  onChildFinished: (info: ChildFinishedInfo) => void;
  onChildWaiting: (depth: number, text: string) => void;
}

export type OrchestratorResult =
  | { type: 'completed'; result: AgentLoopResult }
  | { type: 'child_waiting'; depth: number; text: string };
