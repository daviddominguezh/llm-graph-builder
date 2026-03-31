import type { McpServerConfig } from '@daviddh/graph-types';
import type { AgentToolCallRecord, Message, SkillDefinition } from '@daviddh/llm-graph-runner';
import { z } from 'zod';

/* --- Request schema --- */

const StdioTransportSchema = z.object({
  type: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const SseTransportSchema = z.object({
  type: z.literal('sse'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

const HttpTransportSchema = z.object({
  type: z.literal('http'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

const McpTransportSchema = z.discriminatedUnion('type', [
  StdioTransportSchema,
  SseTransportSchema,
  HttpTransportSchema,
]);

const DirectValueSchema = z.object({ type: z.literal('direct'), value: z.string() });
const EnvRefValueSchema = z.object({ type: z.literal('env_ref'), envVariableId: z.string() });

const McpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: McpTransportSchema,
  enabled: z.boolean().default(true),
  libraryItemId: z.string().optional(),
  variableValues: z.record(z.string(), z.union([DirectValueSchema, EnvRefValueSchema])).optional(),
});

const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
});

export const SimulateAgentRequestSchema = z.object({
  appType: z.literal('agent'),
  systemPrompt: z.string(),
  context: z.string(),
  messages: z.array(z.unknown()),
  apiKey: z.string(),
  modelId: z.string(),
  maxSteps: z.number().nullable(),
  mcpServers: z.array(McpServerSchema),
  skills: z.array(SkillSchema).optional(),
});

export interface SimulateAgentRequest {
  appType: 'agent';
  systemPrompt: string;
  context: string;
  messages: Message[];
  apiKey: string;
  modelId: string;
  maxSteps: number | null;
  mcpServers: McpServerConfig[];
  skills?: SkillDefinition[];
}

/* --- SSE event types --- */

export interface AgentStepStartedEvent {
  type: 'step_started';
  step: number;
}

export interface AgentStepProcessedEvent {
  type: 'step_processed';
  step: number;
  responseText: string;
  toolCalls: AgentToolCallRecord[];
  tokens: { input: number; output: number; cached: number; costUSD?: number };
  durationMs: number;
}

export interface AgentToolExecutedEvent {
  type: 'tool_executed';
  step: number;
  toolCall: AgentToolCallRecord;
}

export interface AgentResponseEvent {
  type: 'agent_response';
  text: string;
  steps: number;
  totalTokens: { input: number; output: number; cached: number; costUSD?: number };
  toolCalls: AgentToolCallRecord[];
}

export interface AgentSimulationErrorEvent {
  type: 'error';
  message: string;
}

export interface AgentSimulationCompleteEvent {
  type: 'simulation_complete';
}

export type AgentSimulationEvent =
  | AgentStepStartedEvent
  | AgentStepProcessedEvent
  | AgentToolExecutedEvent
  | AgentResponseEvent
  | AgentSimulationErrorEvent
  | AgentSimulationCompleteEvent;
