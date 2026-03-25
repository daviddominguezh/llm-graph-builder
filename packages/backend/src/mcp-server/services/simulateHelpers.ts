import type { Graph, McpTransport } from '@daviddh/graph-types';
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

const VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv;

function replaceVars(str: string, vars: Record<string, string>): string {
  return str.replace(VARIABLE_PATTERN, (_, name: string) => vars[name] ?? `{{${name}}}`);
}

function resolveStdioTransport(
  transport: Extract<McpTransport, { type: 'stdio' }>,
  vars: Record<string, string>
): McpTransport {
  return {
    ...transport,
    command: replaceVars(transport.command, vars),
    args: transport.args?.map((a) => replaceVars(a, vars)),
  };
}

function resolveTransportVars(transport: McpTransport, vars: Record<string, string>): McpTransport {
  if (transport.type === 'stdio') return resolveStdioTransport(transport, vars);
  return { ...transport, url: replaceVars(transport.url, vars) };
}

export function resolveMcpEnvVars(graph: Graph, envVars: Record<string, string>): Graph {
  const { mcpServers: servers } = graph;
  if (servers === undefined) return graph;
  return {
    ...graph,
    mcpServers: servers.map((s) => ({ ...s, transport: resolveTransportVars(s.transport, envVars) })),
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
