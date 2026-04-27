import type { McpServerConfig } from '@daviddh/graph-types';
import type { Tool as AiSdkTool } from 'ai';

/**
 * The minimum surface a connected MCP client must expose so the Provider
 * abstraction can describe and call its tools. Both runtime connectors
 * (backend + edge function) must produce something that satisfies this.
 */
export interface McpClient {
  tools: () => Promise<Record<string, AiSdkTool>>;
  close: () => Promise<void>;
}

/**
 * Per-runtime adapter that knows how to open a connection to an MCP server.
 * Backend implements via Node + stdio/sse/http. Edge function (Deno) via
 * sse/http only. The Provider abstraction is environment-agnostic; the
 * connector is environment-specific.
 *
 * See packages/api/src/providers/mcp/README.md for the architectural rationale.
 */
export interface McpConnector {
  connect: (server: McpServerConfig) => Promise<McpClient>;
}
