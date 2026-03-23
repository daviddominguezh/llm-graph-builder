import type { McpServerConfig, McpTransport, RuntimeGraph } from '@daviddh/graph-types';
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

const VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv;

function replaceVarsInString(str: string, vars: Record<string, string>): string {
  return str.replace(VARIABLE_PATTERN, (_, name: string) => vars[name] ?? `{{${name}}}`);
}

function replaceVarsInHeaders(
  headers: Record<string, string> | undefined,
  vars: Record<string, string>
): Record<string, string> | undefined {
  if (headers === undefined) return undefined;
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, replaceVarsInString(v, vars)]));
}

function replaceStdioVars(
  transport: Extract<McpTransport, { type: 'stdio' }>,
  vars: Record<string, string>
): McpTransport {
  return {
    ...transport,
    command: replaceVarsInString(transport.command, vars),
    args: transport.args?.map((a) => replaceVarsInString(a, vars)),
    env:
      transport.env === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(transport.env).map(([k, v]) => [k, replaceVarsInString(v, vars)])
          ),
  };
}

function replaceVarsInTransport(transport: McpTransport, vars: Record<string, string>): McpTransport {
  if (transport.type === 'stdio') return replaceStdioVars(transport, vars);
  return {
    ...transport,
    url: replaceVarsInString(transport.url, vars),
    headers: replaceVarsInHeaders(transport.headers, vars),
  };
}

function resolveServerTransport(server: McpServerConfig, vars: Record<string, string>): McpServerConfig {
  return { ...server, transport: replaceVarsInTransport(server.transport, vars) };
}

export function resolveMcpTransportVariables(
  graph: RuntimeGraph,
  envVars: Record<string, string>
): RuntimeGraph {
  const { mcpServers } = graph;
  if (mcpServers === undefined) return graph;
  return { ...graph, mcpServers: mcpServers.map((s) => resolveServerTransport(s, envVars)) };
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
    cost: event.tokens.costUSD ?? 0,
    durationMs: event.durationMs,
  });
  if (event.structuredOutput !== undefined) {
    writePublicSSE(res, {
      type: 'structuredOutput',
      nodeId: event.structuredOutput.nodeId,
      data: event.structuredOutput.data,
    });
  }
  if (event.error) {
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
