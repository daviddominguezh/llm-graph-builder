import { McpError } from '../transport/errors.js';
import type { McpTransport } from '../transport/transport.js';
import { initialize } from './initialize.js';
import type { ClientInfo, InitializeResult, RawMcpTool, ToolsCallResult, ToolsListResult } from './types.js';

/**
 * Sentinel JSON-RPC error code we use for client-side validation failures
 * (the server returned a 200/result but the payload didn't match the shape
 * we require). Distinct from any reserved JSON-RPC range.
 */
const INVALID_RESPONSE_CODE = -32099;

export interface McpClientHandle {
  readonly initialized: InitializeResult;
  readonly sessionId: string | null;
  listTools: () => Promise<RawMcpTool[]>;
  callTool: (name: string, args: unknown) => Promise<ToolsCallResult>;
  close: () => Promise<void>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isToolsListResult(value: unknown): value is ToolsListResult {
  if (!isPlainObject(value)) return false;
  return Array.isArray(value.tools);
}

function isToolsCallResult(value: unknown): value is ToolsCallResult {
  if (!isPlainObject(value)) return false;
  return Array.isArray(value.content);
}

export interface ConnectMcpArgs {
  transport: McpTransport;
  clientInfo?: ClientInfo;
}

async function listToolsViaTransport(transport: McpTransport): Promise<RawMcpTool[]> {
  const result = await transport.request('tools/list');
  if (!isToolsListResult(result)) {
    throw new McpError(INVALID_RESPONSE_CODE, 'tools/list: invalid response shape');
  }
  return result.tools;
}

async function callToolViaTransport(
  transport: McpTransport,
  name: string,
  args: unknown
): Promise<ToolsCallResult> {
  const result = await transport.request('tools/call', { name, arguments: args });
  if (!isToolsCallResult(result)) {
    throw new McpError(INVALID_RESPONSE_CODE, 'tools/call: invalid response shape');
  }
  return result;
}

function buildHandle(transport: McpTransport, initialized: InitializeResult): McpClientHandle {
  return {
    initialized,
    get sessionId() {
      return transport.sessionId;
    },
    listTools: async () => await listToolsViaTransport(transport),
    callTool: async (name, args) => await callToolViaTransport(transport, name, args),
    close: async () => {
      await transport.close();
    },
  };
}

/**
 * Connect, initialize, and return a high-level handle. The handle exposes
 * MCP-specific operations and surfaces the session ID + serverInfo for caching.
 *
 * If `transport.sessionId` is already set (i.e., the caller pre-populated a
 * cached session id via `transport.setSessionId(id)`), the initialize handshake
 * still runs — the server will reattach to the existing session because the
 * Mcp-Session-Id header is included on the request. If the session has expired,
 * the server returns 401/404 and `SessionExpiredError` is thrown by the transport.
 */
export async function connectMcp(args: ConnectMcpArgs): Promise<McpClientHandle> {
  const initialized = await initialize({ transport: args.transport, clientInfo: args.clientInfo });
  return buildHandle(args.transport, initialized);
}
