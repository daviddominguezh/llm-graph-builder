import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  addAgentDomain,
  deleteAgentDomain,
  listAgentDomains,
  updateAgentDomain,
} from '../services/agentDomainService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const LIST_AGENT_DOMAINS_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const ADD_AGENT_DOMAIN_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  key: z.string().describe('Domain key identifier'),
  description: z.string().optional().describe('Domain description'),
};

const UPDATE_AGENT_DOMAIN_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  key: z.string().describe('Domain key identifier'),
  description: z.string().describe('New domain description'),
};

const DELETE_AGENT_DOMAIN_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  key: z.string().describe('Domain key identifier'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListAgentDomains(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_agent_domains',
    {
      description: 'List all agent domains in a graph with node counts',
      inputSchema: LIST_AGENT_DOMAINS_SCHEMA,
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listAgentDomains(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_agent_domains',
    description: 'List all agent domains in a graph with node counts',
    category: 'agent_domain',
    inputSchema: z.toJSONSchema(z.object(LIST_AGENT_DOMAINS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerAddAgentDomain(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'add_agent_domain',
    { description: 'Add a new agent domain to a graph', inputSchema: ADD_AGENT_DOMAIN_SCHEMA },
    async ({ agentSlug, key, description }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await addAgentDomain(ctx, agentId, key, description);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'add_agent_domain',
    description: 'Add a new agent domain to a graph',
    category: 'agent_domain',
    inputSchema: z.toJSONSchema(z.object(ADD_AGENT_DOMAIN_SCHEMA)) as Record<string, unknown>,
  });
}

function registerUpdateAgentDomain(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_agent_domain',
    { description: 'Update the description of an agent domain', inputSchema: UPDATE_AGENT_DOMAIN_SCHEMA },
    async ({ agentSlug, key, description }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateAgentDomain(ctx, agentId, key, description);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'update_agent_domain',
    description: 'Update the description of an agent domain',
    category: 'agent_domain',
    inputSchema: z.toJSONSchema(z.object(UPDATE_AGENT_DOMAIN_SCHEMA)) as Record<string, unknown>,
  });
}

function registerDeleteAgentDomain(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_agent_domain',
    {
      description: 'Delete an agent domain (fails if nodes still reference it)',
      inputSchema: DELETE_AGENT_DOMAIN_SCHEMA,
    },
    async ({ agentSlug, key }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await deleteAgentDomain(ctx, agentId, key);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'delete_agent_domain',
    description: 'Delete an agent domain (fails if nodes still reference it)',
    category: 'agent_domain',
    inputSchema: z.toJSONSchema(z.object(DELETE_AGENT_DOMAIN_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerAgentDomainTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerListAgentDomains(server, getContext, catalog);
  registerAddAgentDomain(server, getContext, catalog);
  registerUpdateAgentDomain(server, getContext, catalog);
  registerDeleteAgentDomain(server, getContext, catalog);
}
