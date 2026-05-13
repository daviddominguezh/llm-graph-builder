import type { McpTransport } from '../transport/transport.js';
import {
  type ClientCapabilities,
  type ClientInfo,
  type InitializeResult,
  MCP_PROTOCOL_VERSION,
} from './types.js';

const DEFAULT_CLIENT_NAME = 'openflow';
const DEFAULT_CLIENT_VERSION = '0.0.0';

const DEFAULT_CAPABILITIES: ClientCapabilities = {
  // We don't expose roots/sampling today.
};

export interface InitializeArgs {
  transport: McpTransport;
  clientInfo?: ClientInfo;
  capabilities?: ClientCapabilities;
}

interface InitializeRpcParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: ClientInfo;
}

function buildInitializeParams(args: InitializeArgs): InitializeRpcParams {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: args.capabilities ?? DEFAULT_CAPABILITIES,
    clientInfo: args.clientInfo ?? { name: DEFAULT_CLIENT_NAME, version: DEFAULT_CLIENT_VERSION },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isServerInfo(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return typeof value.name === 'string' && typeof value.version === 'string';
}

function isInitializeResult(value: unknown): value is InitializeResult {
  if (!isPlainObject(value)) return false;
  if (typeof value.protocolVersion !== 'string') return false;
  if (!isServerInfo(value.serverInfo)) return false;
  if (!isPlainObject(value.capabilities)) return false;
  return true;
}

/**
 * Run the MCP initialize handshake against the transport.
 *
 * Per the MCP spec:
 * 1. Client sends `initialize` request with its capabilities + protocolVersion + clientInfo.
 * 2. Server responds with its capabilities + serverInfo + protocolVersion.
 * 3. Client sends `notifications/initialized` (a JSON-RPC notification, no response).
 *
 * The server may set the `Mcp-Session-Id` response header during step 2 — the
 * transport layer captures it automatically and includes it on subsequent requests.
 */
export async function initialize(args: InitializeArgs): Promise<InitializeResult> {
  const params = buildInitializeParams(args);
  const result = await args.transport.request('initialize', params);
  if (!isInitializeResult(result)) {
    throw new Error('initialize: invalid response shape');
  }
  await args.transport.notify('notifications/initialized');
  return result;
}
