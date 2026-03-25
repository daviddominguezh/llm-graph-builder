import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  getExecutionHistory,
  getExecutionTrace,
  getSessionDetailById,
} from '../services/executionIntelService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const GET_EXECUTION_HISTORY_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  limit: z.number().optional().describe('Max number of sessions to return (default: 20)'),
};

const GET_SESSION_DETAIL_SCHEMA = {
  sessionId: z.string().describe('Session ID'),
};

const GET_EXECUTION_TRACE_SCHEMA = {
  executionId: z.string().describe('Execution ID'),
};

/* ------------------------------------------------------------------ */
/*  Tool: get_execution_history                                         */
/* ------------------------------------------------------------------ */

function registerGetExecutionHistory(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_execution_history',
    {
      description: 'Get execution history for an agent: summary stats and recent sessions',
      inputSchema: GET_EXECUTION_HISTORY_SCHEMA,
    },
    async ({ agentSlug, limit }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getExecutionHistory(ctx, agentId, limit);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_execution_history',
    description: 'Get execution history for an agent: summary stats and recent sessions',
    category: 'execution_intelligence',
    inputSchema: z.toJSONSchema(z.object(GET_EXECUTION_HISTORY_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_session_detail                                            */
/* ------------------------------------------------------------------ */

function registerGetSessionDetail(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_session_detail',
    {
      description: 'Get detail for a specific session including all executions',
      inputSchema: GET_SESSION_DETAIL_SCHEMA,
    },
    async ({ sessionId }) => {
      const ctx = getContext();
      const result = await getSessionDetailById(ctx, sessionId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_session_detail',
    description: 'Get detail for a specific session including all executions',
    category: 'execution_intelligence',
    inputSchema: z.toJSONSchema(z.object(GET_SESSION_DETAIL_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Tool: get_execution_trace                                           */
/* ------------------------------------------------------------------ */

function registerGetExecutionTrace(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_execution_trace',
    {
      description: 'Get step-by-step node visit trace for a specific execution',
      inputSchema: GET_EXECUTION_TRACE_SCHEMA,
    },
    async ({ executionId }) => {
      const ctx = getContext();
      const result = await getExecutionTrace(ctx, executionId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_execution_trace',
    description: 'Get step-by-step node visit trace for a specific execution',
    category: 'execution_intelligence',
    inputSchema: z.toJSONSchema(z.object(GET_EXECUTION_TRACE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerExecutionIntelTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerGetExecutionHistory(server, getContext, catalog);
  registerGetSessionDetail(server, getContext, catalog);
  registerGetExecutionTrace(server, getContext, catalog);
}
