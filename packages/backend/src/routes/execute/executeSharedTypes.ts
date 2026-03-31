/** VFS payload structure sent to the Edge Function */
export interface VfsEdgeFunctionPayload {
  token: string;
  owner: string;
  repo: string;
  commitSha: string;
  tenantSlug: string;
  agentSlug: string;
  userJwt: string;
  settings: Record<string, unknown>;
}

/** Tool call data used in node processing */
export interface ToolCallData {
  name: string;
  args: unknown;
  result: unknown;
}

/** Processed node data collected during SSE streaming */
export interface NodeProcessedData {
  nodeId: string;
  text: string;
  toolCalls: ToolCallData[];
  durationMs: number;
  error?: string;
  responseMessages?: unknown[];
}
