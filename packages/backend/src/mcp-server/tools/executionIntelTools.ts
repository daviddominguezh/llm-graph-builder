import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  getExecutionHistory,
  getExecutionTrace,
  getSessionDetailById,
} from '../services/executionIntelService.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Tool: get_execution_history                                         */
/* ------------------------------------------------------------------ */

function registerGetExecutionHistory(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_execution_history',
    {
      description: 'Get execution history for an agent: summary stats and recent sessions',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        limit: z.number().optional().describe('Max number of sessions to return (default: 20)'),
      },
    },
    async ({ agentSlug, limit }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getExecutionHistory(ctx, agentId, limit);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_session_detail                                            */
/* ------------------------------------------------------------------ */

function registerGetSessionDetail(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_session_detail',
    {
      description: 'Get detail for a specific session including all executions',
      inputSchema: {
        sessionId: z.string().describe('Session ID'),
      },
    },
    async ({ sessionId }) => {
      const ctx = getContext();
      const result = await getSessionDetailById(ctx, sessionId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Tool: get_execution_trace                                           */
/* ------------------------------------------------------------------ */

function registerGetExecutionTrace(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_execution_trace',
    {
      description: 'Get step-by-step node visit trace for a specific execution',
      inputSchema: {
        executionId: z.string().describe('Execution ID'),
      },
    },
    async ({ executionId }) => {
      const ctx = getContext();
      const result = await getExecutionTrace(ctx, executionId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerExecutionIntelTools(server: McpServer, getContext: () => ServiceContext): void {
  registerGetExecutionHistory(server, getContext);
  registerGetSessionDetail(server, getContext);
  registerGetExecutionTrace(server, getContext);
}
