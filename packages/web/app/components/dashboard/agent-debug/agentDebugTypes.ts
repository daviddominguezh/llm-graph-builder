import type { ExecutionMessageRow, NodeVisitRow } from '@/app/lib/dashboard';

export interface AgentStep {
  stepOrder: number;
  nodeId: string;
  visit: NodeVisitRow;
}

export interface AgentTurn {
  turnIndex: number;
  userMessage: ExecutionMessageRow | null;
  assistantMessages: ExecutionMessageRow[];
  steps: AgentStep[];
}

export interface AgentDebugData {
  turns: AgentTurn[];
  totalSteps: number;
}
