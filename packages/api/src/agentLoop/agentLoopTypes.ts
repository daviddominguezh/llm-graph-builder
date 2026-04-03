import type { ModelMessage, Tool } from 'ai';

import type { ActionTokenUsage, TokenLog } from '@src/types/ai/logs.js';
import type { Message } from '@src/types/ai/messages.js';
import type { DispatchSentinel, FinishSentinel } from '@src/types/sentinels.js';

/** Hard ceiling on steps to prevent infinite loops */
export const AGENT_LOOP_HARD_LIMIT = 50;

export interface SkillDefinition {
  name: string;
  description: string;
  content: string;
}

export interface AgentLoopConfig {
  systemPrompt: string;
  context: string;
  messages: Message[];
  apiKey: string;
  modelId: string;
  maxSteps: number | null;
  tools: Record<string, Tool>;
  skills?: SkillDefinition[];
}

export interface AgentStepEvent {
  step: number;
  messagesSent: ModelMessage[];
  responseText: string;
  responseMessages: unknown[];
  reasoning?: string;
  toolCalls: AgentToolCallRecord[];
  tokens: TokenLog;
  durationMs: number;
  error?: string;
}

export interface AgentToolCallRecord {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
}

export interface AgentToolEvent {
  step: number;
  toolCall: AgentToolCallRecord;
}

export interface AgentLoopCallbacks {
  onStepStarted?: (step: number) => void;
  onStepProcessed: (event: AgentStepEvent) => void;
  onToolExecuted?: (event: AgentToolEvent) => void;
}

export interface AgentLoopResult {
  finalText: string;
  steps: number;
  totalTokens: TokenLog;
  tokensLogs: ActionTokenUsage[];
  toolCalls: AgentToolCallRecord[];
  finishResult?: FinishSentinel;
  dispatchResult?: DispatchSentinel;
}
