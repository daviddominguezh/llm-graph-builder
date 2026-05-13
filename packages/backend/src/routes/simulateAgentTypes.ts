import type { McpServerConfig } from '@daviddh/graph-types';
import type { AgentToolCallRecord, Message, SelectedTool, SkillDefinition } from '@daviddh/llm-graph-runner';
import { SelectedToolSchema } from '@daviddh/llm-graph-runner';
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

const SimulationCompositionStackEntrySchema = z.object({
  appType: z.enum(['agent', 'workflow']),
  parentToolCallId: z.string(),
  parentMessages: z.array(z.unknown()),
  parentCurrentNodeId: z.string().optional(),
  parentStructuredOutputs: z.record(z.string(), z.array(z.unknown())).optional(),
});

const SimulationCompositionSchema = z.object({
  depth: z.number(),
  stack: z.array(SimulationCompositionStackEntrySchema),
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
  composition: SimulationCompositionSchema.optional(),
  orgId: z.string().optional(),
  selectedTools: z.array(SelectedToolSchema).optional(),
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
  orgId?: string;
  selectedTools?: SelectedTool[];
  composition?: {
    depth: number;
    stack: Array<{
      appType: 'agent' | 'workflow';
      parentToolCallId: string;
      parentMessages: unknown[];
      parentCurrentNodeId?: string;
      parentStructuredOutputs?: Record<string, unknown[]>;
    }>;
  };
}

/* --- SSE event types --- */

export interface AgentStepStartedEvent {
  type: 'step_started';
  step: number;
  depth?: number;
}

export interface AgentStepProcessedEvent {
  type: 'step_processed';
  step: number;
  depth?: number;
  responseText: string;
  toolCalls: AgentToolCallRecord[];
  tokens: { input: number; output: number; cached: number; costUSD?: number };
  durationMs: number;
  responseMessages: unknown[];
  reasoning?: string;
  error?: string;
}

export interface AgentToolExecutedEvent {
  type: 'tool_executed';
  step: number;
  depth?: number;
  toolCall: AgentToolCallRecord;
}

export interface AgentResponseEvent {
  type: 'agent_response';
  depth?: number;
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

export interface ChildDispatchedEvent {
  type: 'child_dispatched';
  depth: number;
  parentDepth: number;
  dispatchType: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  task: string;
  parentToolCallId: string;
  toolName: string;
}

export interface ChildFinishedEvent {
  type: 'child_finished';
  depth: number;
  output: string;
  status: 'success' | 'error';
  tokens: { input: number; output: number; cached: number; costUSD?: number };
}

export interface ChildWaitingEvent {
  type: 'child_waiting';
  depth: number;
  text: string;
}

export type AgentSimulationEvent =
  | AgentStepStartedEvent
  | AgentStepProcessedEvent
  | AgentToolExecutedEvent
  | AgentResponseEvent
  | AgentSimulationErrorEvent
  | AgentSimulationCompleteEvent
  | ChildDispatchedEvent
  | ChildFinishedEvent
  | ChildWaitingEvent;
