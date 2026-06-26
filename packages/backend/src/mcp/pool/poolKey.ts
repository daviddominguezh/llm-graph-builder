import type { McpClientHandle } from '@daviddh/llm-graph-runner';

export interface PoolKeyParts {
  agentId: string;
  tenantId: string;
  mcpBindingId: string;
}

const SEP = '::';

export function buildPoolKey(parts: PoolKeyParts): string {
  return `${parts.agentId}${SEP}${parts.tenantId}${SEP}${parts.mcpBindingId}`;
}

export interface PoolEntry {
  handle: McpClientHandle | null;
  lastUsed: number;
  borrows: number;
  isStdio: boolean;
  connecting?: Promise<McpClientHandle>;
  connectFailedUntil?: number;
}
