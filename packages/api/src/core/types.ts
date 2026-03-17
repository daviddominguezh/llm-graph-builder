import type { OutputSchemaField } from '@daviddh/graph-types';
import type {
  AssistantContent,
  AssistantModelMessage,
  ModelMessage,
  Tool,
  ToolChoice,
  ToolModelMessage,
  ToolSet,
  TypedToolCall,
} from 'ai';

import type {
  ActionTokenUsage,
  MESSAGES_PROVIDER,
  Message,
  ParsedResult,
  TokenLog,
  ToolModelConfig,
} from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';

/**
 * Input parameters for the callAgent step
 */
export interface CallAgentInput {
  messages: Message[];
  tokensLog: ActionTokenUsage[];
  currentNode: string;
  indicatorOriginalId?: string;
  structuredOutputs: Record<string, unknown[]>;
}

/**
 * Output result from the callAgent step
 */
export interface CallAgentOutput {
  message: AssistantModelMessage | null;
  tokensLogs: ActionTokenUsage[];
  toolCalls: Array<TypedToolCall<Record<string, Tool>>>;
  visitedNodes: string[];
  parsedResults?: ParsedResult[];
  text?: string;
  debugMessages: Record<string, ModelMessage[][]>;
  structuredOutputs?: Array<{ nodeId: string; data: unknown }>;
}

/**
 * Represents a step in the ordered flow execution
 */
export interface OrderedFlowStep {
  kind: string;
  prompt: string;
  nextNode: string;
  outputNode: string;
  agentResponse: AssistantContent;
  messages: Message[];
}

/**
 * Result from executing an agent
 */
export interface AgentExecutionResult {
  messages: Array<AssistantModelMessage | ToolModelMessage>;
  tokens: TokenLog;
  toolCalls: Array<TypedToolCall<Record<string, Tool>>>;
  toolResults: Array<{ toolName: string; output: unknown }>;
  lastMessage: AssistantModelMessage;
  copyMsgs: ModelMessage[][];
  error: boolean;
}

/**
 * Result from generating a reply
 */
export interface ReplyGenerationResult {
  tokens: TokenLog;
  result: ParsedResult;
  toolCalls: Array<TypedToolCall<Record<string, Tool>>>;
  lastMessage: AssistantModelMessage;
  copyMsgs: ModelMessage[][];
  reasoning?: string;
}

/**
 * Configuration for node processing
 */
export interface NodeProcessingConfig {
  kind: 'tool_call' | 'agent_decision' | 'user_reply' | 'structured_output' | undefined;
  promptWithoutToolPreconditions: string;
  toolsByEdge: Record<
    string,
    {
      tools?: Record<string, Tool> | undefined;
      toolChoice?: ToolChoice<NoInfer<ToolSet>> | undefined;
    }
  >;
  nodes: Record<string, string>;
  outputSchema?: OutputSchemaField[];
  skipMessageToUser?: boolean;
  isTerminal?: boolean;
}

/**
 * Parameters for text extraction from messages
 */
export interface TextExtractionParams {
  message: AssistantModelMessage | ToolModelMessage;
  text: string;
}

export interface ReplyUsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export interface ReplyWithObject {
  output?: unknown;
  toolCalls?: Array<TypedToolCall<Record<string, Tool<unknown, unknown>>>>;
  toolResults?: Array<{ toolName: string; output: unknown }>;
  usage?: ReplyUsageInfo;
  response?: { messages?: Array<AssistantModelMessage | ToolModelMessage> };
}

export interface ExecuteAgentParams {
  context: Context;
  provider: MESSAGES_PROVIDER;
  config: ToolModelConfig;
  messages: Message[];
  step: string;
  expectedTool?: string;
}

export interface ExecutionState {
  modelWorkedFine: boolean;
  msgs: Array<AssistantModelMessage | ToolModelMessage>;
  attemptCount: number;
  lastError: Error | undefined;
}
