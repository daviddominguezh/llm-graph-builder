import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';
import type { CallAgentOutput, Message, NodeProcessedEvent } from '@daviddh/llm-graph-runner';
import { MESSAGES_PROVIDER } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { resolveAccessToken } from '../../mcp/oauth/tokenRefresh.js';
import type { AgentExecutionInput, PublicExecutionEvent } from './executeTypes.js';

/* ─── SSE utilities ─── */

interface Flushable {
  flush: () => void;
}

function hasFlushMethod(value: object): value is Flushable {
  return 'flush' in value && typeof (value as Record<string, unknown>).flush === 'function';
}

export function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

export function writePublicSSE(res: Response, event: PublicExecutionEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  res.write(payload);
  if (hasFlushMethod(res)) {
    res.flush();
  }
}

/* ─── Message construction ─── */

const CHANNEL_TO_PROVIDER: Record<string, MESSAGES_PROVIDER> = {
  whatsapp: MESSAGES_PROVIDER.WHATSAPP,
  web: MESSAGES_PROVIDER.WEB,
};

function resolveProvider(channel: string): MESSAGES_PROVIDER {
  return CHANNEL_TO_PROVIDER[channel] ?? MESSAGES_PROVIDER.WEB;
}

export function extractTextFromInput(input: AgentExecutionInput): string {
  if ('text' in input.message && typeof input.message.text === 'string') {
    return input.message.text;
  }
  return '';
}

export function buildUserMessage(input: AgentExecutionInput): Message {
  const text = extractTextFromInput(input);
  return {
    provider: resolveProvider(input.channel),
    id: randomUUID(),
    timestamp: Date.now(),
    originalId: randomUUID(),
    type: 'text',
    message: { role: 'user', content: text },
  };
}

/* ─── MCP transport variable resolution ─── */

export function resolveServerTransport(
  server: McpServerConfig,
  envByName: Record<string, string>,
  envById: Record<string, string>
): McpServerConfig {
  const vars = buildResolvedVars(server.variableValues, { byName: envByName, byId: envById });
  return { ...server, transport: resolveTransport(server.transport, vars) };
}

export function resolveMcpTransportVariables(
  graph: RuntimeGraph,
  envByName: Record<string, string>,
  envById: Record<string, string>
): RuntimeGraph {
  const { mcpServers } = graph;
  if (mcpServers === undefined) return graph;
  return { ...graph, mcpServers: mcpServers.map((s) => resolveServerTransport(s, envByName, envById)) };
}

/* ─── Token summation ─── */

export function sumTokens(result: CallAgentOutput): { input: number; output: number; cached: number } {
  let input = 0;
  let output = 0;
  let cached = 0;
  for (const log of result.tokensLogs) {
    input += log.tokens.input;
    output += log.tokens.output;
    cached += log.tokens.cached;
  }
  return { input, output, cached };
}

const ZERO_COST = 0;

export function sumTotalCost(result: CallAgentOutput): number {
  let total = ZERO_COST;
  for (const log of result.tokensLogs) {
    total += log.tokens.costUSD ?? ZERO_COST;
  }
  return total;
}

/* ─── Streaming event builders ─── */

export function sendNodeVisitedEvent(res: Response, nodeId: string): void {
  writePublicSSE(res, { type: 'node_visited', nodeId });
}

export function sendNodeProcessedEvent(res: Response, event: NodeProcessedEvent): void {
  if (event.text !== undefined && event.text !== '') {
    writePublicSSE(res, { type: 'text', text: event.text, nodeId: event.nodeId });
  }
  for (const tc of event.toolCalls) {
    writePublicSSE(res, {
      type: 'toolCall',
      nodeId: event.nodeId,
      name: tc.toolName,
      args: tc.input,
      result: tc.output,
    });
  }
  writePublicSSE(res, {
    type: 'tokenUsage',
    nodeId: event.nodeId,
    inputTokens: event.tokens.input,
    outputTokens: event.tokens.output,
    cachedTokens: event.tokens.cached,
    cost: event.tokens.costUSD ?? ZERO_COST,
    durationMs: event.durationMs,
  });
  if (event.structuredOutput !== undefined) {
    writePublicSSE(res, {
      type: 'structuredOutput',
      nodeId: event.structuredOutput.nodeId,
      data: event.structuredOutput.data,
    });
  }
  if (event.error !== undefined && event.error !== '') {
    writePublicSSE(res, { type: 'nodeError', nodeId: event.nodeId, message: event.error });
  }
}

/* ─── OAuth token resolution for MCP servers ─── */

function hasAuthorizationHeader(server: McpServerConfig): boolean {
  const { transport } = server;
  if (transport.type === 'stdio') return false;
  if (transport.headers === undefined) return false;
  return Object.keys(transport.headers).some((k) => k.toLowerCase() === 'authorization');
}

function isOAuthCandidate(server: McpServerConfig): boolean {
  return typeof server.libraryItemId === 'string' && !hasAuthorizationHeader(server);
}

interface McpLibraryRow {
  auth_type?: string;
  transport_config?: { url?: string };
}

function isMcpLibraryRow(value: unknown): value is McpLibraryRow {
  return typeof value === 'object' && value !== null;
}

async function lookupLibraryItem(
  supabase: SupabaseClient,
  libraryItemId: string
): Promise<McpLibraryRow | null> {
  const result = await supabase
    .from('mcp_library')
    .select('auth_type, transport_config')
    .eq('id', libraryItemId)
    .single();
  if (result.error !== null) return null;
  const data: unknown = result.data;
  if (!isMcpLibraryRow(data)) return null;
  return data;
}

function withAuthHeader(server: McpServerConfig, token: string): McpServerConfig {
  if (server.transport.type === 'stdio') return server;
  const existing = server.transport.headers ?? {};
  return {
    ...server,
    transport: { ...server.transport, headers: { ...existing, Authorization: `Bearer ${token}` } },
  };
}

async function resolveOneOAuthServer(
  supabase: SupabaseClient,
  orgId: string,
  server: McpServerConfig
): Promise<McpServerConfig> {
  if (!isOAuthCandidate(server)) return server;
  const { libraryItemId } = server;
  if (libraryItemId === undefined) return server;
  const item = await lookupLibraryItem(supabase, libraryItemId);
  if (item?.auth_type !== 'oauth') return server;
  const mcpServerUrl = item.transport_config?.url;
  if (typeof mcpServerUrl !== 'string' || mcpServerUrl === '') return server;
  const token = await resolveAccessToken(supabase, orgId, libraryItemId, mcpServerUrl);
  return withAuthHeader(server, token);
}

export async function resolveOAuthForExecution(
  supabase: SupabaseClient,
  graph: RuntimeGraph,
  orgId: string
): Promise<RuntimeGraph> {
  const { mcpServers } = graph;
  if (mcpServers === undefined) return graph;
  const resolved = await Promise.all(
    mcpServers.map(async (s) => await resolveOneOAuthServer(supabase, orgId, s))
  );
  return { ...graph, mcpServers: resolved };
}

/* ─── Execution logging ─── */

export function logExec(label: string, data?: Record<string, unknown>): void {
  const suffix = data === undefined ? '' : `: ${JSON.stringify(data)}`;
  process.stdout.write(`[execute] ${label}${suffix}\n`);
}
