import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { getVersion, listVersions, publishAgent, restoreVersion } from '../services/publishService.js';
import type { ServiceContext } from '../types.js';

function registerPublishAgent(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'publish_agent',
    {
      description: 'Publish the current state of an agent as a new version',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
      },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await publishAgent(ctx, agentId);
      return textResult(result);
    }
  );
}

function registerListVersions(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_versions',
    {
      description: 'List all published versions of an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
      },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listVersions(ctx, agentId);
      return textResult(result);
    }
  );
}

function registerGetVersion(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_version',
    {
      description: 'Get the graph snapshot for a specific version of an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        version: z.number().describe('Version number'),
      },
    },
    async ({ agentSlug, version }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getVersion(ctx, agentId, version);
      return textResult(result);
    }
  );
}

function registerRestoreVersion(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'restore_version',
    {
      description: 'Restore an agent to a specific published version',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        version: z.number().describe('Version number to restore'),
      },
    },
    async ({ agentSlug, version }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await restoreVersion(ctx, agentId, version);
      return textResult(result);
    }
  );
}

export function registerPublishTools(server: McpServer, getContext: () => ServiceContext): void {
  registerPublishAgent(server, getContext);
  registerListVersions(server, getContext);
  registerGetVersion(server, getContext);
  registerRestoreVersion(server, getContext);
}
