export interface PublicNodeVisitedEvent {
  type: 'node_visited';
  nodeId: string;
}

export interface PublicTextEvent {
  type: 'text';
  text: string;
  nodeId: string;
}

export interface PublicToolCallEvent {
  type: 'toolCall';
  nodeId: string;
  name: string;
  args: unknown;
  result: unknown;
}

export interface PublicTokenUsageEvent {
  type: 'tokenUsage';
  nodeId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  durationMs: number;
}

export interface PublicStructuredOutputEvent {
  type: 'structuredOutput';
  nodeId: string;
  data: unknown;
}

export interface PublicNodeErrorEvent {
  type: 'nodeError';
  nodeId: string;
  message: string;
}

export interface PublicErrorEvent {
  type: 'error';
  message: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalCost: number;
}

export interface AgentAppResponse {
  appType: 'agent';
  text: string;
  toolCalls: Array<{
    name: string;
    args: unknown;
    result: unknown;
  }>;
  tokenUsage: TokenUsage;
  durationMs: number;
}

export interface PublicDoneEvent {
  type: 'done';
  response: AgentAppResponse;
}

export type PublicExecutionEvent =
  | PublicNodeVisitedEvent
  | PublicTextEvent
  | PublicToolCallEvent
  | PublicTokenUsageEvent
  | PublicStructuredOutputEvent
  | PublicNodeErrorEvent
  | PublicErrorEvent
  | PublicDoneEvent;
