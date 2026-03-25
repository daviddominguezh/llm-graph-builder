import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  explainAgentFlow,
  getAgentHealth,
  getAgentOverview,
} from '../services/agentIntelligenceService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool: get_agent_overview                                            */
/* ------------------------------------------------------------------ */

function registerGetAgentOverview(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_agent_overview',
    {
      description: 'Get a comprehensive overview of an agent: metadata, graph summary, health, MCP servers, schemas, versions',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getAgentOverview(ctx, agentId, agentSlug);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_agent_health                                              */
/* ------------------------------------------------------------------ */

function registerGetAgentHealth(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_agent_health',
    {
      description: 'Get health status of an agent: validation violations, orphan nodes, dead ends, config issues',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getAgentHealth(ctx, agentId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: explain_agent_flow                                            */
/* ------------------------------------------------------------------ */

function registerExplainAgentFlow(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'explain_agent_flow',
    {
      description: 'Explain agent flow: domain breakdown with entry/exit points, global behaviors, summary',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await explainAgentFlow(ctx, agentId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerAgentIntelligenceTools(server: McpServer, getContext: () => ServiceContext): void {
  registerGetAgentOverview(server, getContext);
  registerGetAgentHealth(server, getContext);
  registerExplainAgentFlow(server, getContext);
}
