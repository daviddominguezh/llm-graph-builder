import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import { explainAgentFlow, getAgentHealth, getAgentOverview } from '../services/agentIntelligenceService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const AGENT_SLUG_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const GET_AGENT_OVERVIEW_DESC =
  'Get a comprehensive overview of an agent: metadata, graph summary, health, MCP servers, schemas, versions';

const GET_AGENT_HEALTH_DESC =
  'Get health status of an agent: validation violations, orphan nodes, dead ends, config issues';

const EXPLAIN_AGENT_FLOW_DESC =
  'Explain agent flow: domain breakdown with entry/exit points, global behaviors, summary';

/* ------------------------------------------------------------------ */
/*  Tool: get_agent_overview                                            */
/* ------------------------------------------------------------------ */

function registerGetAgentOverview(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_agent_overview',
    { description: GET_AGENT_OVERVIEW_DESC, inputSchema: AGENT_SLUG_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getAgentOverview(ctx, agentId, agentSlug);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_agent_overview',
    description: GET_AGENT_OVERVIEW_DESC,
    category: 'agent_intelligence',
    inputSchema: z.toJSONSchema(z.object(AGENT_SLUG_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_agent_health                                              */
/* ------------------------------------------------------------------ */

function registerGetAgentHealth(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_agent_health',
    { description: GET_AGENT_HEALTH_DESC, inputSchema: AGENT_SLUG_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getAgentHealth(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_agent_health',
    description: GET_AGENT_HEALTH_DESC,
    category: 'agent_intelligence',
    inputSchema: z.toJSONSchema(z.object(AGENT_SLUG_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: explain_agent_flow                                            */
/* ------------------------------------------------------------------ */

function registerExplainAgentFlow(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'explain_agent_flow',
    { description: EXPLAIN_AGENT_FLOW_DESC, inputSchema: AGENT_SLUG_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await explainAgentFlow(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'explain_agent_flow',
    description: EXPLAIN_AGENT_FLOW_DESC,
    category: 'agent_intelligence',
    inputSchema: z.toJSONSchema(z.object(AGENT_SLUG_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerAgentIntelligenceTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerGetAgentOverview(server, getContext, catalog);
  registerGetAgentHealth(server, getContext, catalog);
  registerExplainAgentFlow(server, getContext, catalog);
}
