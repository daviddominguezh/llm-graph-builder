import { z } from 'zod';

/* ─── Request validation ─── */

const MIN_LENGTH = 1;
const nonEmpty = z.string().min(MIN_LENGTH);

const TextMessageSchema = z.object({ text: nonEmpty });
const MediaMessageSchema = z.object({ media: z.string(), text: z.string().optional() });
const IncomingMessageSchema = z.union([TextMessageSchema, MediaMessageSchema]);

export const AgentExecutionInputSchema = z.object({
  tenantId: nonEmpty,
  userId: nonEmpty,
  sessionId: nonEmpty,
  message: IncomingMessageSchema,
  model: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  channel: z.enum(['whatsapp', 'web', 'instagram', 'api']).optional().default('web'),
  stream: z.boolean().optional().default(false),
});

export type AgentExecutionInput = z.infer<typeof AgentExecutionInputSchema>;

/* ─── Internal SSE events (edge function → Express) ─── */

export interface InternalNodeVisitedEvent {
  type: 'node_visited';
  nodeId: string;
}

export interface InternalNodeProcessedEvent {
  type: 'node_processed';
  nodeId: string;
  text: string;
  toolCalls: Array<{ toolName: string; input: unknown; output?: unknown }>;
  tokens: { input: number; output: number; cached: number; costUSD?: number };
  durationMs: number;
  structuredOutput?: { nodeId: string; data: unknown };
  reasoning?: string;
  error?: string;
}

export interface InternalAgentResponseEvent {
  type: 'agent_response';
  text: string;
  currentNodeId: string;
  visitedNodes: string[];
  toolCalls: Array<{ toolName: string; input: unknown; output: unknown }>;
  tokenUsage: { input: number; output: number; cached: number; totalCost: number };
  structuredOutputs: Record<string, unknown[]>;
}

export interface InternalErrorEvent {
  type: 'error';
  message: string;
}

export interface InternalCompleteEvent {
  type: 'execution_complete';
}

export type InternalExecutionEvent =
  | InternalNodeVisitedEvent
  | InternalNodeProcessedEvent
  | InternalAgentResponseEvent
  | InternalErrorEvent
  | InternalCompleteEvent;

/* ─── Public SSE events (Express → caller) ─── */

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

export interface PublicDoneEvent {
  type: 'done';
  response: AgentExecutionResponse;
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

/* ─── Shared response type (non-streaming + done event) ─── */

export interface ToolCallRecord {
  name: string;
  args: unknown;
  result: unknown;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalCost: number;
}

export interface WorkflowExecutionResponse {
  appType: 'workflow';
  text: string;
  currentNodeId: string;
  visitedNodes: string[];
  toolCalls: ToolCallRecord[];
  structuredOutputs: Record<string, unknown>;
  tokenUsage: TokenUsage;
  durationMs: number;
}

export interface AgentAppResponse {
  appType: 'agent';
  text: string;
  toolCalls: ToolCallRecord[];
  tokenUsage: TokenUsage;
  durationMs: number;
}

export type AgentExecutionResponse = WorkflowExecutionResponse | AgentAppResponse;
