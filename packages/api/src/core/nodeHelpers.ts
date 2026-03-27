import type { ModelMessage, ToolChoice, ToolSet } from 'ai';

import { getEdgesFromNode, getNode } from '@src/stateMachine/graph/index.js';
import { buildNextAgentConfig } from '@src/stateMachine/index.js';
import type { ParsedResult } from '@src/types/ai/index.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

import { buildGlobalNodeConfig, processReplyNode, processToolNode } from './nodeProcessor.js';
import type { ToolCallsArray } from './nodeProcessorHelpers.js';
import { processStructuredOutputNode } from './structuredOutputProcessor.js';
import { createEmptyTokenLog } from './tokenTracker.js';
import type { CallAgentInput, NodeProcessingConfig } from './types.js';

export type { ToolCallsArray } from './nodeProcessorHelpers.js';

export interface ProcessNodeResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  error: boolean;
  toolCalls: ToolCallsArray;
  structuredOutput?: { nodeId: string; data: unknown };
  reasoning?: string;
  toolResults?: Array<{ toolName: string; output: unknown }>;
  errorMessage?: string;
  responseMessages?: unknown[];
}

export interface ProcessNodeParams {
  context: Context;
  input: CallAgentInput;
  currentNodeID: string;
  nodeBeforeGlobal: string;
  debugMessages: Record<string, ModelMessage[][]>;
  structuredOutputs?: Record<string, unknown[]>;
}

/**
 * Extracts the required tool name from tool choice
 */
export function getRequiredTool(toolChoice?: ToolChoice<NoInfer<ToolSet>>): string | undefined {
  if (toolChoice === undefined || typeof toolChoice === 'string') return undefined;
  return toolChoice.toolName;
}

function isGlobalNode(context: Context, nodeID: string): boolean {
  const node = getNode(context.graph, nodeID);
  return node.global;
}

async function getNodeConfig(
  context: Context,
  currentNodeID: string,
  nodeBeforeGlobal: string,
  structuredOutputs?: Record<string, unknown[]>
): Promise<NodeProcessingConfig> {
  const isGlobal = isGlobalNode(context, currentNodeID);
  if (isGlobal) return buildGlobalNodeConfig(context, nodeBeforeGlobal, currentNodeID);
  return await buildNextAgentConfig(context.graph, context, currentNodeID, {
    toolsOverride: context.toolsOverride,
    structuredOutputs,
  });
}

async function applyJumpTo(context: Context, currentNodeID: string, nextNodeID: string): Promise<string> {
  const edges = await getEdgesFromNode(context.graph, context, currentNodeID);
  const selectedEdge = edges.find((edge) => edge.to === nextNodeID);
  const jumpTo = selectedEdge?.contextPreconditions?.jumpTo;

  if (jumpTo !== undefined && jumpTo !== '') {
    logger.info(
      `callAgentStep/${context.tenantID}/${context.userID}| JumpTo detected: ${nextNodeID} -> ${jumpTo}`
    );
    return jumpTo;
  }

  return nextNodeID;
}

async function processToolCallNode(
  params: ProcessNodeParams,
  config: NodeProcessingConfig,
  isGlobal: boolean
): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, debugMessages } = params;
  const edgeValues = Object.values(config.toolsByEdge);
  const [firstEdge] = edgeValues;
  const requiredTool = getRequiredTool(firstEdge?.toolChoice);

  const result = await processToolNode({
    context,
    config,
    input,
    currentNodeID,
    requiredTool,
    isGlobal,
    debugMessages,
  });

  if (result.error) {
    return { ...result, errorMessage: result.errorMessage };
  }

  const finalNextNodeID = await applyJumpTo(context, currentNodeID, result.nextNodeID);
  return { ...result, nextNodeID: finalNextNodeID };
}

async function processReplyCallNode(
  params: ProcessNodeParams,
  config: NodeProcessingConfig
): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, debugMessages } = params;
  const result = await processReplyNode({ context, config, input, currentNodeID, debugMessages });
  const finalNextNodeID = await applyJumpTo(context, currentNodeID, result.nextNodeID);
  return { ...result, nextNodeID: finalNextNodeID, error: false, reasoning: result.reasoning };
}

async function processStructuredOutputCallNode(
  params: ProcessNodeParams,
  config: NodeProcessingConfig
): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, debugMessages } = params;
  const result = await processStructuredOutputNode({ context, config, input, currentNodeID, debugMessages });
  return {
    parsedResult: result.parsedResult,
    nextNodeID: result.nextNodeID,
    error: false,
    toolCalls: result.toolCalls,
    structuredOutput: result.structuredOutput,
    responseMessages: result.responseMessages,
  };
}

/**
 * Processes a single node in the agent flow
 */
export async function processNode(params: ProcessNodeParams): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, nodeBeforeGlobal } = params;
  const isGlobal = isGlobalNode(context, currentNodeID);

  input.tokensLog.push({ action: currentNodeID, tokens: createEmptyTokenLog() });

  const config = await getNodeConfig(context, currentNodeID, nodeBeforeGlobal, params.structuredOutputs);

  logger.info(`callAgentStep/${context.tenantID}/${context.userID}| Kind: ${config.kind}`);
  logger.info(
    `callAgentStep/${context.tenantID}/${context.userID}| PROMPT:\n${config.promptWithoutToolPreconditions}\n`
  );

  if (config.kind === 'structured_output') return await processStructuredOutputCallNode(params, config);
  if (config.kind === 'tool_call') return await processToolCallNode(params, config, isGlobal);
  return await processReplyCallNode(params, config);
}
