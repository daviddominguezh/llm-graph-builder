import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { textResult } from '../helpers.js';
import {
  createExecutionKey,
  deleteExecutionKey,
  listExecutionKeys,
  updateExecutionKey,
} from '../services/executionKeyService.js';
import type { ServiceContext } from '../types.js';

function registerListExecutionKeys(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_execution_keys',
    {
      description: 'List all execution keys in the organization',
      inputSchema: {},
    },
    async () => {
      const ctx = getContext();
      const result = await listExecutionKeys(ctx);
      return textResult(result);
    }
  );
}

function registerCreateExecutionKey(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'create_execution_key',
    {
      description: 'Create a new execution key in the organization',
      inputSchema: {
        name: z.string().describe('Execution key name'),
        agentIds: z.array(z.string()).describe('Agent IDs this key grants access to'),
        expiresAt: z.string().nullable().optional().describe('Expiry date (ISO 8601) or null'),
      },
    },
    async ({ name, agentIds, expiresAt }) => {
      const ctx = getContext();
      const result = await createExecutionKey(ctx, name, agentIds, expiresAt);
      return textResult(result);
    }
  );
}

function registerUpdateExecutionKey(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'update_execution_key',
    {
      description: 'Update an execution key name or agent assignments',
      inputSchema: {
        keyId: z.string().describe('Execution key ID'),
        name: z.string().optional().describe('New name'),
        agentIds: z.array(z.string()).optional().describe('New agent IDs to assign'),
      },
    },
    async ({ keyId, name, agentIds }) => {
      const ctx = getContext();
      await updateExecutionKey(ctx, keyId, { name, agentIds });
      return textResult({ success: true });
    }
  );
}

function registerDeleteExecutionKey(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'delete_execution_key',
    {
      description: 'Delete an execution key',
      inputSchema: {
        keyId: z.string().describe('Execution key ID'),
      },
    },
    async ({ keyId }) => {
      const ctx = getContext();
      await deleteExecutionKey(ctx, keyId);
      return textResult({ success: true });
    }
  );
}

export function registerExecutionKeyTools(server: McpServer, getContext: () => ServiceContext): void {
  registerListExecutionKeys(server, getContext);
  registerCreateExecutionKey(server, getContext);
  registerUpdateExecutionKey(server, getContext);
  registerDeleteExecutionKey(server, getContext);
}
