// Public surface of the hand-rolled MCP client.
// Used by buildMcpProvider (next task) — does NOT need to be re-exported
// from the api package's main index.ts.

export { connectMcp, type McpClientHandle, type ConnectMcpArgs } from './client/mcpClient.js';
export type {
  ClientInfo,
  ServerInfo,
  ServerCapabilities,
  ClientCapabilities,
  RawMcpTool,
  InitializeResult,
  ToolsListResult,
  ToolsCallResult,
} from './client/types.js';
export { MCP_PROTOCOL_VERSION } from './client/types.js';

export { createTransport } from './transport/createTransport.js';
export type { McpTransport, TransportOptions } from './transport/transport.js';

export { McpError, SessionExpiredError, TransportError, isSessionExpired } from './transport/errors.js';
