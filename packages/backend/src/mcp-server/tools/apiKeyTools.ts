import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  setProductionKey,
  setStagingKey,
} from '../services/apiKeyService.js';
import type { ServiceContext } from '../types.js';

function registerListApiKeys(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_api_keys',
    {
      description: 'List all API keys in the organization',
      inputSchema: {},
    },
    async () => {
      const ctx = getContext();
      const result = await listApiKeys(ctx);
      return textResult(result);
    }
  );
}

function registerCreateApiKey(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'create_api_key',
    {
      description: 'Create a new API key in the organization',
      inputSchema: {
        name: z.string().describe('API key name'),
        keyValue: z.string().describe('The API key value'),
      },
    },
    async ({ name, keyValue }) => {
      const ctx = getContext();
      const result = await createApiKey(ctx, name, keyValue);
      return textResult(result);
    }
  );
}

function registerDeleteApiKey(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'delete_api_key',
    {
      description: 'Delete an API key',
      inputSchema: {
        keyId: z.string().describe('API key ID'),
      },
    },
    async ({ keyId }) => {
      const ctx = getContext();
      await deleteApiKey(ctx, keyId);
      return textResult({ success: true });
    }
  );
}

function registerSetAgentStagingKey(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'set_agent_staging_key',
    {
      description: 'Set the staging API key for an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        keyId: z.string().nullable().describe('API key ID, or null to clear'),
      },
    },
    async ({ agentSlug, keyId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await setStagingKey(ctx, agentId, keyId);
      return textResult({ success: true });
    }
  );
}

function registerSetAgentProductionKey(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'set_agent_production_key',
    {
      description: 'Set the production API key for an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        keyId: z.string().nullable().describe('API key ID, or null to clear'),
      },
    },
    async ({ agentSlug, keyId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await setProductionKey(ctx, agentId, keyId);
      return textResult({ success: true });
    }
  );
}

export function registerApiKeyTools(server: McpServer, getContext: () => ServiceContext): void {
  registerListApiKeys(server, getContext);
  registerCreateApiKey(server, getContext);
  registerDeleteApiKey(server, getContext);
  registerSetAgentStagingKey(server, getContext);
  registerSetAgentProductionKey(server, getContext);
}
