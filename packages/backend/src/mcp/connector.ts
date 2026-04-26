import type { MCPClient as AiSdkMcpClient } from '@ai-sdk/mcp';
import type { McpServerConfig } from '@daviddh/graph-types';
import type { McpClient, McpConnector } from '@daviddh/llm-graph-runner';
import type { Tool as AiSdkTool } from 'ai';

import { connectMcpClient } from './client.js';

/**
 * Backend (Node/Express) implementation of the McpConnector contract.
 * Wraps the existing connectMcpClient(transport). Supports stdio + sse + http.
 *
 * See packages/api/src/providers/mcp/README.md for the contract and architectural
 * context. The conformance test suite (testConnectorConformance) runs against
 * this implementation in packages/backend/src/mcp/__tests__/connector.test.ts.
 */
export function createBackendMcpConnector(): McpConnector {
  return {
    connect: async (server: McpServerConfig): Promise<McpClient> => {
      const aiSdkClient = await connectMcpClient(server.transport);
      return adaptAiSdkClient(aiSdkClient);
    },
  };
}

/**
 * Widen the ai-sdk McpToolSet (Record<string, McpToolBase>) to the McpClient
 * contract's Record<string, Tool>. McpToolBase extends Tool, so each value is
 * structurally compatible. Object.assign is used here because TypeScript cannot
 * automatically widen FlexibleSchema<unknown> → FlexibleSchema<any> across the
 * @ai-sdk/mcp / ai package boundary (they share the type definition but
 * TypeScript treats them as distinct due to different generic instantiation).
 */
function collectTools(toolSet: Awaited<ReturnType<AiSdkMcpClient['tools']>>): Record<string, AiSdkTool> {
  const out: Record<string, AiSdkTool> = {};
  Object.assign(out, toolSet);
  return out;
}

function adaptAiSdkClient(client: AiSdkMcpClient): McpClient {
  let closed = false;
  return {
    tools: async (): Promise<Record<string, AiSdkTool>> => {
      const result = await client.tools();
      return collectTools(result);
    },
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      try {
        await client.close();
      } catch {
        // Idempotent: ignore double-close errors
      }
    },
  };
}
