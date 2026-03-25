import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { diffVersions } from '../services/versionIntelService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool: diff_versions                                                 */
/* ------------------------------------------------------------------ */

const versionRefSchema = z.union([z.number(), z.literal('draft')]);

function registerDiffVersions(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'diff_versions',
    {
      description: 'Compare two versions of an agent graph and return a structured diff of nodes, edges, domains, MCP servers, and output schemas',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        fromVersion: versionRefSchema.describe('Source version (number or "draft")'),
        toVersion: versionRefSchema.describe('Target version (number or "draft")'),
      },
    },
    async ({ agentSlug, fromVersion, toVersion }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await diffVersions(ctx, agentId, fromVersion, toVersion);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerVersionIntelTools(server: McpServer, getContext: () => ServiceContext): void {
  registerDiffVersions(server, getContext);
}
