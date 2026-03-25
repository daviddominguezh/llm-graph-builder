import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import { diffVersions } from '../services/versionIntelService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const versionRefSchema = z.union([z.number(), z.literal('draft')]);

const DIFF_VERSIONS_DESC =
  'Compare two versions of an agent graph and return a structured diff of nodes, edges, domains, MCP servers, and output schemas';

const DIFF_VERSIONS_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  fromVersion: versionRefSchema.describe('Source version (number or "draft")'),
  toVersion: versionRefSchema.describe('Target version (number or "draft")'),
};

/* ------------------------------------------------------------------ */
/*  Tool: diff_versions                                                 */
/* ------------------------------------------------------------------ */

function registerDiffVersions(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'diff_versions',
    { description: DIFF_VERSIONS_DESC, inputSchema: DIFF_VERSIONS_SCHEMA },
    async ({ agentSlug, fromVersion, toVersion }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await diffVersions(ctx, agentId, fromVersion, toVersion);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'diff_versions',
    description: DIFF_VERSIONS_DESC,
    category: 'version_intelligence',
    inputSchema: z.toJSONSchema(z.object(DIFF_VERSIONS_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerVersionIntelTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerDiffVersions(server, getContext, catalog);
}
