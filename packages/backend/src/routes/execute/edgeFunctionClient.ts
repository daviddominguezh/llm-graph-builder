import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
import type { CallAgentOutput, Context, Message, NodeProcessedEvent } from '@daviddh/llm-graph-runner';
import { executeWithCallbacks } from '@daviddh/llm-graph-runner';

import { consoleLogger } from '../../logger.js';
import { type McpSession, closeMcpSession, createMcpSession } from '../../mcp/lifecycle.js';

export interface ExecuteAgentParams {
  graph: RuntimeGraph;
  apiKey: string;
  modelId: string;
  currentNodeId: string;
  messages: Message[];
  structuredOutputs: Record<string, unknown[]>;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  sessionID: string;
  tenantID: string;
  userID: string;
  isFirstMessage: boolean;
}

export interface ExecuteAgentCallbacks {
  onNodeVisited: (nodeId: string) => void;
  onNodeProcessed: (event: NodeProcessedEvent) => void;
}

const EMPTY_SESSION: McpSession = { clients: [], tools: {} };

function buildContext(params: ExecuteAgentParams): Omit<Context, 'toolsOverride' | 'onNodeVisited'> {
  return {
    graph: params.graph,
    apiKey: params.apiKey,
    modelId: params.modelId,
    sessionID: params.sessionID,
    tenantID: params.tenantID,
    userID: params.userID,
    data: params.data,
    quickReplies: params.quickReplies,
    isFirstMessage: params.isFirstMessage,
  };
}

function getMcpServers(graph: RuntimeGraph): McpServerConfig[] {
  return graph.mcpServers ?? [];
}

export async function executeAgent(
  params: ExecuteAgentParams,
  callbacks: ExecuteAgentCallbacks
): Promise<CallAgentOutput | null> {
  const servers = getMcpServers(params.graph);
  let session: McpSession = EMPTY_SESSION;

  try {
    session = await createMcpSession(servers);
    const context = buildContext(params);

    return await executeWithCallbacks({
      context,
      messages: params.messages,
      currentNode: params.currentNodeId,
      toolsOverride: session.tools,
      logger: consoleLogger,
      structuredOutputs: params.structuredOutputs,
      onNodeVisited: callbacks.onNodeVisited,
      onNodeProcessed: callbacks.onNodeProcessed,
    });
  } finally {
    await closeMcpSession(session);
  }
}
