import { TemplateCategorySchema } from '@daviddh/graph-types';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from '../services/agentService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const LIST_AGENTS_SCHEMA = { search: z.string().optional().describe('Filter by name or slug substring') };

const CREATE_AGENT_SCHEMA = {
  name: z.string().describe('Agent name'),
  description: z.string().describe('Agent description'),
  category: TemplateCategorySchema.describe('Agent category'),
};

const GET_AGENT_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const UPDATE_AGENT_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  name: z.string().optional().describe('New name'),
  description: z.string().optional().describe('New description'),
};

const DELETE_AGENT_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListAgents(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_agents',
    { description: 'List all agents in the organization', inputSchema: LIST_AGENTS_SCHEMA },
    async ({ search }) => {
      const ctx = getContext();
      const result = await listAgents(ctx, search);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_agents',
    description: 'List all agents in the organization',
    category: 'agent_management',
    inputSchema: z.toJSONSchema(z.object(LIST_AGENTS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerCreateAgent(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'create_agent',
    { description: 'Create a new agent in the organization', inputSchema: CREATE_AGENT_SCHEMA },
    async ({ name, description, category }) => {
      const ctx = getContext();
      const result = await createAgent(ctx, name, description, category);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'create_agent',
    description: 'Create a new agent in the organization',
    category: 'agent_management',
    inputSchema: z.toJSONSchema(z.object(CREATE_AGENT_SCHEMA)) as Record<string, unknown>,
  });
}

function registerGetAgent(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_agent',
    { description: 'Get full details of an agent by slug', inputSchema: GET_AGENT_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      await resolveAgentId(ctx, agentSlug);
      const result = await getAgent(ctx, agentSlug);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_agent',
    description: 'Get full details of an agent by slug',
    category: 'agent_management',
    inputSchema: z.toJSONSchema(z.object(GET_AGENT_SCHEMA)) as Record<string, unknown>,
  });
}

function registerUpdateAgent(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_agent',
    { description: 'Update an agent name or description', inputSchema: UPDATE_AGENT_SCHEMA },
    async ({ agentSlug, name, description }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateAgent(ctx, agentId, { name, description });
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'update_agent',
    description: 'Update an agent name or description',
    category: 'agent_management',
    inputSchema: z.toJSONSchema(z.object(UPDATE_AGENT_SCHEMA)) as Record<string, unknown>,
  });
}

function registerDeleteAgent(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_agent',
    { description: 'Delete an agent by slug', inputSchema: DELETE_AGENT_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      await resolveAgentId(ctx, agentSlug);
      await deleteAgent(ctx, agentSlug);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'delete_agent',
    description: 'Delete an agent by slug',
    category: 'agent_management',
    inputSchema: z.toJSONSchema(z.object(DELETE_AGENT_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerAgentTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerListAgents(server, getContext, catalog);
  registerCreateAgent(server, getContext, catalog);
  registerGetAgent(server, getContext, catalog);
  registerUpdateAgent(server, getContext, catalog);
  registerDeleteAgent(server, getContext, catalog);
}
