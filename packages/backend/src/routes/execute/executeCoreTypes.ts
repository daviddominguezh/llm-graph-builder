import type { CallAgentOutput, NodeProcessedEvent } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { NodeProcessedData } from './edgeFunctionClient.js';
import type { OverrideAgentConfig } from './executeOverrideTypes.js';
import type { AgentExecutionInput } from './executeTypes.js';

export type { OverrideAgentConfig };

export interface ExecuteCoreInput {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  version: number;
  input: AgentExecutionInput;
  /** Pre-existing conversation ID (webhook channels pass this to skip messaging pre-writes) */
  conversationId?: string;
  /** When set, reuse an existing execution record instead of creating a new one */
  continueExecutionId?: string;
  /**
   * When set, overrides the agent config loaded from the published agent version.
   * Used for dynamically created children (create_agent) which have no published agent.
   */
  overrideAgentConfig?: OverrideAgentConfig;
  /** Pre-generated execution ID (enables subscribe-before-dispatch) */
  executionId?: string;
  /** Root execution ID for composition notification routing */
  rootExecutionId?: string;
  /** Parent execution ID — set for child executions so they're findable by parent */
  parentExecutionId?: string;
}

export interface ExecuteCoreOutput {
  executionId: string;
  output: CallAgentOutput | null;
  nodeData: NodeProcessedData[];
  durationMs: number;
  appType: string;
}

export interface ExecuteCoreCallbacks {
  onNodeVisited: (nodeId: string) => void;
  onNodeProcessed: (event: NodeProcessedEvent) => void;
}
