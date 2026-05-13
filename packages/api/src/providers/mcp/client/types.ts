/**
 * Type surface for the hand-rolled MCP client. Mirrors the subset of the MCP
 * spec we actually consume today (initialize, tools/list, tools/call). The
 * server may surface additional capabilities — we only model what we use.
 */
import type { RawJsonSchema } from '../../types.js';

/** MCP protocol version we negotiate. Bump when MCP releases a breaking version. */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

export interface ClientInfo {
  name: string;
  version: string;
}

export interface ServerInfo {
  name: string;
  version: string;
}

/** Subset of server capabilities we care about today. Servers may expose more. */
export interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { listChanged?: boolean; subscribe?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface ClientCapabilities {
  roots?: { listChanged?: boolean };
  sampling?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

/**
 * The shape of a single tool entry in MCP's tools/list response.
 * The server returns raw JSON Schema for inputSchema (object with type/properties/required).
 * Typed as `RawJsonSchema` (JSONSchema7) so it flows directly into `OpenFlowTool.inputSchema`
 * without conversion; the server is trusted to send schema-shaped objects per the MCP spec.
 */
export interface RawMcpTool {
  name: string;
  description?: string;
  inputSchema: RawJsonSchema;
}

export interface InitializeResult {
  protocolVersion: string;
  serverInfo: ServerInfo;
  capabilities: ServerCapabilities;
  /** Server may include human-readable instructions on first connect. */
  instructions?: string;
}

export interface ToolsListResult {
  tools: RawMcpTool[];
  /** Pagination cursor when listChanged=false but list is large. Rarely used. */
  nextCursor?: string;
}

export interface ToolsCallResult {
  /** Free-form content array per MCP spec. We surface as unknown for now. */
  content: unknown[];
  isError?: boolean;
  /** Structured content if the server returns it. */
  structuredContent?: Record<string, unknown>;
}
