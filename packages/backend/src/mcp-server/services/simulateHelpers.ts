import type { Graph } from '@daviddh/graph-types';
import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';
import type { CallAgentOutput, Message } from '@daviddh/llm-graph-runner';
import { MESSAGES_PROVIDER } from '@daviddh/llm-graph-runner';
import { randomUUID } from 'node:crypto';

import type {
  SimulateInput,
  SimulationResult,
  SimulationTokenUsage,
  SimulationToolCall,
} from './simulateTypes.js';

/* ------------------------------------------------------------------ */
/*  Message conversion                                                 */
/* ------------------------------------------------------------------ */

function buildModelMessage(role: string, content: string): Message['message'] {
  if (role === 'assistant') return { role: 'assistant', content };
  return { role: 'user', content };
}

export function toRunnerMessages(input: SimulateInput): Message[] {
  return input.messages.map((m) => ({
    provider: MESSAGES_PROVIDER.WEB,
    id: randomUUID(),
    timestamp: Date.now(),
    originalId: randomUUID(),
    type: 'text' as const,
    message: buildModelMessage(m.role, m.content),
  }));
}

/* ------------------------------------------------------------------ */
/*  MCP transport variable resolution                                  */
/* ------------------------------------------------------------------ */

export function resolveMcpEnvVars(graph: Graph, envById: Record<string, string>): Graph {
  const { mcpServers: servers } = graph;
  if (servers === undefined) return graph;
  return {
    ...graph,
    mcpServers: servers.map((s) => {
      // The old resolveServerVars returned `envById` directly when variableValues was
      // undefined. buildResolvedVars only reads `byName` in that branch, so we pass
      // envById as BOTH byName and byId to preserve that exact fallback (env_ref still
      // resolves via byId; the no-variableValues case still falls back to envById).
      const vars = buildResolvedVars(s.variableValues, { byName: envById, byId: envById });
      return { ...s, transport: resolveTransport(s.transport, vars) };
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  Token summation                                                    */
/* ------------------------------------------------------------------ */

const ZERO = 0;

export function sumTokens(output: CallAgentOutput): SimulationTokenUsage {
  let input = ZERO;
  let outputTokens = ZERO;
  let cached = ZERO;
  for (const log of output.tokensLogs) {
    input += log.tokens.input;
    outputTokens += log.tokens.output;
    cached += log.tokens.cached;
  }
  return { input, output: outputTokens, cached };
}

/* ------------------------------------------------------------------ */
/*  Result transformation                                              */
/* ------------------------------------------------------------------ */

function extractToolCalls(output: CallAgentOutput): SimulationToolCall[] {
  return output.toolCalls.map((tc) => ({
    toolName: tc.toolName,
    input: tc.input as unknown,
    output: undefined as unknown,
  }));
}

export function toSimulationResult(output: CallAgentOutput | null): SimulationResult {
  if (output === null) {
    return {
      response: null,
      visitedNodes: [],
      toolCalls: [],
      tokenUsage: { input: ZERO, output: ZERO, cached: ZERO },
    };
  }
  return {
    response: output.text ?? null,
    visitedNodes: output.visitedNodes,
    toolCalls: extractToolCalls(output),
    tokenUsage: sumTokens(output),
  };
}
