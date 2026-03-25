import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  addAgentDomain,
  deleteAgentDomain,
  listAgentDomains,
  updateAgentDomain,
} from '../services/agentDomainService.js';
import type { ServiceContext } from '../types.js';

function registerListAgentDomains(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_agent_domains',
    {
      description: 'List all agent domains in a graph with node counts',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listAgentDomains(ctx, agentId);
      return textResult(result);
    }
  );
}

function registerAddAgentDomain(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'add_agent_domain',
    {
      description: 'Add a new agent domain to a graph',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        key: z.string().describe('Domain key identifier'),
        description: z.string().optional().describe('Domain description'),
      },
    },
    async ({ agentSlug, key, description }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await addAgentDomain(ctx, agentId, key, description);
      return textResult({ success: true });
    }
  );
}

function registerUpdateAgentDomain(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'update_agent_domain',
    {
      description: 'Update the description of an agent domain',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        key: z.string().describe('Domain key identifier'),
        description: z.string().describe('New domain description'),
      },
    },
    async ({ agentSlug, key, description }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateAgentDomain(ctx, agentId, key, description);
      return textResult({ success: true });
    }
  );
}

function registerDeleteAgentDomain(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'delete_agent_domain',
    {
      description: 'Delete an agent domain (fails if nodes still reference it)',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        key: z.string().describe('Domain key identifier'),
      },
    },
    async ({ agentSlug, key }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await deleteAgentDomain(ctx, agentId, key);
      return textResult({ success: true });
    }
  );
}

export function registerAgentDomainTools(server: McpServer, getContext: () => ServiceContext): void {
  registerListAgentDomains(server, getContext);
  registerAddAgentDomain(server, getContext);
  registerUpdateAgentDomain(server, getContext);
  registerDeleteAgentDomain(server, getContext);
}
