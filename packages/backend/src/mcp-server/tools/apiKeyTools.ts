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
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const LIST_API_KEYS_SCHEMA = {};

const CREATE_API_KEY_SCHEMA = {
  name: z.string().describe('API key name'),
  keyValue: z.string().describe('The API key value'),
};

const DELETE_API_KEY_SCHEMA = { keyId: z.string().describe('API key ID') };

const SET_AGENT_STAGING_KEY_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  keyId: z.string().nullable().describe('API key ID, or null to clear'),
};

const SET_AGENT_PRODUCTION_KEY_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  keyId: z.string().nullable().describe('API key ID, or null to clear'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListApiKeys(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_api_keys',
    { description: 'List all API keys in the organization', inputSchema: LIST_API_KEYS_SCHEMA },
    async () => {
      const ctx = getContext();
      const result = await listApiKeys(ctx);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_api_keys',
    description: 'List all API keys in the organization',
    category: 'api_key',
    inputSchema: z.toJSONSchema(z.object(LIST_API_KEYS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerCreateApiKey(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'create_api_key',
    { description: 'Create a new API key in the organization', inputSchema: CREATE_API_KEY_SCHEMA },
    async ({ name, keyValue }) => {
      const ctx = getContext();
      const result = await createApiKey(ctx, name, keyValue);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'create_api_key',
    description: 'Create a new API key in the organization',
    category: 'api_key',
    inputSchema: z.toJSONSchema(z.object(CREATE_API_KEY_SCHEMA)) as Record<string, unknown>,
  });
}

function registerDeleteApiKey(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_api_key',
    { description: 'Delete an API key', inputSchema: DELETE_API_KEY_SCHEMA },
    async ({ keyId }) => {
      const ctx = getContext();
      await deleteApiKey(ctx, keyId);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'delete_api_key',
    description: 'Delete an API key',
    category: 'api_key',
    inputSchema: z.toJSONSchema(z.object(DELETE_API_KEY_SCHEMA)) as Record<string, unknown>,
  });
}

function registerSetAgentStagingKey(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'set_agent_staging_key',
    { description: 'Set the staging API key for an agent', inputSchema: SET_AGENT_STAGING_KEY_SCHEMA },
    async ({ agentSlug, keyId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await setStagingKey(ctx, agentId, keyId);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'set_agent_staging_key',
    description: 'Set the staging API key for an agent',
    category: 'api_key',
    inputSchema: z.toJSONSchema(z.object(SET_AGENT_STAGING_KEY_SCHEMA)) as Record<string, unknown>,
  });
}

function registerSetAgentProductionKey(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'set_agent_production_key',
    { description: 'Set the production API key for an agent', inputSchema: SET_AGENT_PRODUCTION_KEY_SCHEMA },
    async ({ agentSlug, keyId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await setProductionKey(ctx, agentId, keyId);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'set_agent_production_key',
    description: 'Set the production API key for an agent',
    category: 'api_key',
    inputSchema: z.toJSONSchema(z.object(SET_AGENT_PRODUCTION_KEY_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerApiKeyTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerListApiKeys(server, getContext, catalog);
  registerCreateApiKey(server, getContext, catalog);
  registerDeleteApiKey(server, getContext, catalog);
  registerSetAgentStagingKey(server, getContext, catalog);
  registerSetAgentProductionKey(server, getContext, catalog);
}
