import type {
  AgentToolCallRecord,
  CalendarService,
  DispatchSentinel,
  Message,
  OAuthTokenBundle,
} from '@daviddh/llm-graph-runner';
import { MESSAGES_PROVIDER, isDispatchSentinel, unwrapToolOutput } from '@daviddh/llm-graph-runner';
import { randomUUID } from 'node:crypto';

import type { McpSession } from '../mcp/lifecycle.js';
import type { ResolvedChildConfig } from './simulateChildResolver.js';
import type { OrchestratorConfig } from './simulationOrchestratorTypes.js';
import { buildSimulationProviderCtx, buildSimulationRegistry } from './simulationProviderCtx.js';

const INCREMENT = 1;
const ZERO = 0;
const WORKFLOW_TYPE = 'invoke_workflow';
const WORKFLOW_PARAM_KEY = 'user_said';
const EMPTY_MODEL_ID = '';

/**
 * Builds the Provider registry + ProviderCtx for the agent simulation path
 * alongside the legacy injectSystemTools-driven tool dict. Currently the
 * AgentLoop API still consumes a static `tools` record, so the registry
 * is constructed for parity with the workflow path but not yet wired into
 * the loop. Task 24 will collapse the legacy path once the agent loop
 * accepts a registry directly.
 */
function makeSimulationServices(calendar: CalendarService): (providerId: string) => unknown {
  return (providerId: string): unknown => {
    if (providerId === 'calendar') return calendar;
    return undefined;
  };
}

export function prepareSimulationProviders(config: OrchestratorConfig, calendar: CalendarService): void {
  const { depth, orgId, body } = config;
  const isChild = depth > ZERO;
  const { mcpServers } = body;
  // Simulation has no concrete agentId; an empty string is fine because the
  // registry is built for wiring parity only and not yet consumed by the loop.
  buildSimulationProviderCtx({
    orgId,
    agentId: '',
    isChildAgent: isChild,
    oauthTokens: new Map<string, OAuthTokenBundle>(),
    mcpServers,
    services: makeSimulationServices(calendar),
  });
  buildSimulationRegistry({ mcpServers });
}

/**
 * Builds an AI SDK format tool-result Message to inject the child's output
 * back into the parent's conversation history.
 */
export function buildToolResultMessage(parentToolCallId: string, toolName: string, output: string): Message {
  const now = Date.now();
  const id = `child-result-${randomUUID()}`;

  return {
    provider: MESSAGES_PROVIDER.WEB,
    id,
    timestamp: now,
    originalId: id,
    type: 'text',
    message: {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: parentToolCallId,
          toolName,
          output: { type: 'text', value: output },
        },
      ],
    },
  };
}

/**
 * Returns an error string if the depth limit would be exceeded, null otherwise.
 */
export function checkDepthLimit(currentDepth: number, maxDepth: number): string | null {
  if (currentDepth + INCREMENT > maxDepth) {
    return `Maximum nesting depth (${String(maxDepth)}) exceeded. Cannot dispatch child at depth ${String(currentDepth + INCREMENT)}.`;
  }
  return null;
}

function getStringParam(params: Record<string, unknown>, key: string): string {
  const value: unknown = params[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Extracts the task string from dispatch params based on dispatch type.
 */
export function extractTask(dispatchType: string, params: Record<string, unknown>): string {
  if (dispatchType === WORKFLOW_TYPE) {
    return getStringParam(params, WORKFLOW_PARAM_KEY);
  }
  return getStringParam(params, 'task');
}

/**
 * Extracts the dispatch type string from a DispatchSentinel.
 */
export function extractDispatchType(sentinel: DispatchSentinel): DispatchSentinel['type'] {
  return sentinel.type;
}

export interface DispatchToolCallInfo {
  toolCallId: string;
  toolName: string;
}

/**
 * Finds the tool call record that triggered the dispatch sentinel.
 */
export function findDispatchToolCall(toolCalls: AgentToolCallRecord[]): DispatchToolCallInfo | null {
  for (const tc of toolCalls) {
    const raw = unwrapToolOutput(tc.output);
    if (isDispatchSentinel(raw)) {
      return { toolCallId: tc.toolCallId, toolName: tc.toolName };
    }
  }
  return null;
}

/**
 * Builds a user message for a child agent.
 */
export function buildUserMessage(task: string): Message {
  const id = `child-user-${randomUUID()}`;

  return {
    provider: MESSAGES_PROVIDER.WEB,
    id,
    timestamp: Date.now(),
    originalId: id,
    type: 'text',
    message: { role: 'user', content: task },
  };
}

/* ─── Build child orchestrator config ─── */

interface BuildChildParams {
  parentConfig: OrchestratorConfig;
  childConfig: ResolvedChildConfig;
  childSession: McpSession;
}

function resolveChildModelId(childModelId: string, parentModelId: string): string {
  if (childModelId === EMPTY_MODEL_ID) return parentModelId;
  return childModelId;
}

export function buildChildOrchestratorConfig(params: BuildChildParams): OrchestratorConfig {
  const { parentConfig, childConfig, childSession } = params;
  const modelId = resolveChildModelId(childConfig.modelId, parentConfig.body.modelId);

  return {
    body: {
      ...parentConfig.body,
      systemPrompt: childConfig.systemPrompt,
      context: childConfig.context,
      modelId,
      maxSteps: childConfig.maxSteps ?? parentConfig.body.maxSteps,
      messages: [buildUserMessage(childConfig.task)],
      mcpServers: childConfig.mcpServers,
      skills: undefined,
    },
    session: childSession,
    depth: parentConfig.depth + INCREMENT,
    maxNestingDepth: parentConfig.maxNestingDepth,
    orgId: parentConfig.orgId,
    supabase: parentConfig.supabase,
  };
}
