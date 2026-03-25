import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from '../services/agentService.js';
import type { ServiceContext } from '../types.js';

function registerListAgents(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_agents',
    {
      description: 'List all agents in the organization',
      inputSchema: { search: z.string().optional().describe('Filter by name or slug substring') },
    },
    async ({ search }) => {
      const ctx = getContext();
      const result = await listAgents(ctx, search);
      return textResult(result);
    }
  );
}

function registerCreateAgent(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'create_agent',
    {
      description: 'Create a new agent in the organization',
      inputSchema: {
        name: z.string().describe('Agent name'),
        description: z.string().describe('Agent description'),
      },
    },
    async ({ name, description }) => {
      const ctx = getContext();
      const result = await createAgent(ctx, name, description);
      return textResult(result);
    }
  );
}

function registerGetAgent(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_agent',
    {
      description: 'Get full details of an agent by slug',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      await resolveAgentId(ctx, agentSlug);
      const result = await getAgent(ctx, agentSlug);
      return textResult(result);
    }
  );
}

function registerUpdateAgent(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'update_agent',
    {
      description: 'Update an agent name or description',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        name: z.string().optional().describe('New name'),
        description: z.string().optional().describe('New description'),
      },
    },
    async ({ agentSlug, name, description }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateAgent(ctx, agentId, { name, description });
      return textResult({ success: true });
    }
  );
}

function registerDeleteAgent(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'delete_agent',
    {
      description: 'Delete an agent by slug',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      await resolveAgentId(ctx, agentSlug);
      await deleteAgent(ctx, agentSlug);
      return textResult({ success: true });
    }
  );
}

export function registerAgentTools(server: McpServer, getContext: () => ServiceContext): void {
  registerListAgents(server, getContext);
  registerCreateAgent(server, getContext);
  registerGetAgent(server, getContext);
  registerUpdateAgent(server, getContext);
  registerDeleteAgent(server, getContext);
}
