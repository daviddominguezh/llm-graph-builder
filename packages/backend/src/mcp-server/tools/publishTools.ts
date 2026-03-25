import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { getVersion, listVersions, publishAgent, restoreVersion } from '../services/publishService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const PUBLISH_AGENT_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const LIST_VERSIONS_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const GET_VERSION_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  version: z.number().describe('Version number'),
};

const RESTORE_VERSION_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  version: z.number().describe('Version number to restore'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerPublishAgent(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'publish_agent',
    {
      description: 'Publish the current state of an agent as a new version',
      inputSchema: PUBLISH_AGENT_SCHEMA,
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await publishAgent(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'publish_agent',
    description: 'Publish the current state of an agent as a new version',
    category: 'publishing',
    inputSchema: z.toJSONSchema(z.object(PUBLISH_AGENT_SCHEMA)) as Record<string, unknown>,
  });
}

function registerListVersions(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_versions',
    { description: 'List all published versions of an agent', inputSchema: LIST_VERSIONS_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listVersions(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_versions',
    description: 'List all published versions of an agent',
    category: 'publishing',
    inputSchema: z.toJSONSchema(z.object(LIST_VERSIONS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerGetVersion(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_version',
    {
      description: 'Get the graph snapshot for a specific version of an agent',
      inputSchema: GET_VERSION_SCHEMA,
    },
    async ({ agentSlug, version }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getVersion(ctx, agentId, version);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_version',
    description: 'Get the graph snapshot for a specific version of an agent',
    category: 'publishing',
    inputSchema: z.toJSONSchema(z.object(GET_VERSION_SCHEMA)) as Record<string, unknown>,
  });
}

function registerRestoreVersion(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'restore_version',
    {
      description: 'Restore an agent to a specific published version',
      inputSchema: RESTORE_VERSION_SCHEMA,
    },
    async ({ agentSlug, version }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await restoreVersion(ctx, agentId, version);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'restore_version',
    description: 'Restore an agent to a specific published version',
    category: 'publishing',
    inputSchema: z.toJSONSchema(z.object(RESTORE_VERSION_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerPublishTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerPublishAgent(server, getContext, catalog);
  registerListVersions(server, getContext, catalog);
  registerGetVersion(server, getContext, catalog);
  registerRestoreVersion(server, getContext, catalog);
}
