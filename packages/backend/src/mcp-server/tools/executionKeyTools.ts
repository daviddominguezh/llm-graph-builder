import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { textResult } from '../helpers.js';
import {
  createExecutionKey,
  deleteExecutionKey,
  listExecutionKeys,
  updateExecutionKey,
} from '../services/executionKeyService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const LIST_EXECUTION_KEYS_SCHEMA = {};

const CREATE_EXECUTION_KEY_SCHEMA = {
  name: z.string().describe('Execution key name'),
  agentIds: z
    .array(z.string())
    .describe('Agent IDs this key grants access to (ignored when allAgents is true)'),
  expiresAt: z.string().nullable().optional().describe('Expiry date (ISO 8601) or null'),
  allAgents: z.boolean().optional().describe('Grant access to all agents in the org'),
};

const UPDATE_EXECUTION_KEY_SCHEMA = {
  keyId: z.string().describe('Execution key ID'),
  name: z.string().optional().describe('New name'),
  allAgents: z.boolean().optional().describe('Grant access to all agents in the org'),
  agentIds: z.array(z.string()).optional().describe('New agent IDs to assign'),
};

const DELETE_EXECUTION_KEY_SCHEMA = {
  keyId: z.string().describe('Execution key ID'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListExecutionKeys(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_execution_keys',
    { description: 'List all execution keys in the organization', inputSchema: LIST_EXECUTION_KEYS_SCHEMA },
    async () => {
      const ctx = getContext();
      const result = await listExecutionKeys(ctx);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_execution_keys',
    description: 'List all execution keys in the organization',
    category: 'execution_key',
    inputSchema: z.toJSONSchema(z.object(LIST_EXECUTION_KEYS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerCreateExecutionKey(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'create_execution_key',
    {
      description: 'Create a new execution key in the organization',
      inputSchema: CREATE_EXECUTION_KEY_SCHEMA,
    },
    async ({ name, agentIds, expiresAt, allAgents }) => {
      const ctx = getContext();
      const result = await createExecutionKey(ctx, { name, agentIds, expiresAt, allAgents });
      return textResult(result);
    }
  );
  catalog.register({
    name: 'create_execution_key',
    description: 'Create a new execution key in the organization',
    category: 'execution_key',
    inputSchema: z.toJSONSchema(z.object(CREATE_EXECUTION_KEY_SCHEMA)) as Record<string, unknown>,
  });
}

function registerUpdateExecutionKey(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_execution_key',
    {
      description: 'Update an execution key name or agent assignments',
      inputSchema: UPDATE_EXECUTION_KEY_SCHEMA,
    },
    async ({ keyId, name, allAgents, agentIds }) => {
      const ctx = getContext();
      await updateExecutionKey(ctx, keyId, { name, allAgents, agentIds });
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'update_execution_key',
    description: 'Update an execution key name or agent assignments',
    category: 'execution_key',
    inputSchema: z.toJSONSchema(z.object(UPDATE_EXECUTION_KEY_SCHEMA)) as Record<string, unknown>,
  });
}

function registerDeleteExecutionKey(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_execution_key',
    { description: 'Delete an execution key', inputSchema: DELETE_EXECUTION_KEY_SCHEMA },
    async ({ keyId }) => {
      const ctx = getContext();
      await deleteExecutionKey(ctx, keyId);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'delete_execution_key',
    description: 'Delete an execution key',
    category: 'execution_key',
    inputSchema: z.toJSONSchema(z.object(DELETE_EXECUTION_KEY_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerExecutionKeyTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerListExecutionKeys(server, getContext, catalog);
  registerCreateExecutionKey(server, getContext, catalog);
  registerUpdateExecutionKey(server, getContext, catalog);
  registerDeleteExecutionKey(server, getContext, catalog);
}
