import type { ModelMessage } from 'ai';

import { getNode, getToolsFromEdges } from '@src/stateMachine/graph/index.js';
import { generateToolReplyPrompt } from '@src/stateMachine/prompts/index.js';
import type { ParsedResult } from '@src/types/ai/ai.js';
import type { Graph, ToolFieldValue } from '@src/types/graph.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';
import { formatMessages } from '@src/utils/messages.js';

import { getModel } from './agentExecutorHelpers.js';
import { getConfig } from './config.js';
import { AGENT_CONSTANTS, PROMPTS } from './constants.js';
import { MessageProcessor } from './messageProcessor.js';
import { DECISION_ONLY_OUTPUT_SCHEMA, type OutputSchema, TERMINAL_OUTPUT_SCHEMA } from './modelCaller.js';
import { type ToolCallsArray, getProviderFromMessages } from './nodeProcessorHelpers.js';
import { generateReply } from './replyGenerator.js';
import { accumulateTokens } from './tokenTracker.js';
import { type ProcessToolNodeParams, executeToolCall } from './toolCallExecutor.js';
import type { AgentExecutionResult, CallAgentInput, NodeProcessingConfig } from './types.js';

const LAST_INDEX_OFFSET = 1;

interface ProcessReplyNodeParams {
  context: Context;
  config: NodeProcessingConfig;
  input: CallAgentInput;
  currentNodeID: string;
  debugMessages: Record<string, ModelMessage[][]>;
}

interface GenerateToolReplyParams {
  context: Context;
  input: CallAgentInput;
  currentNodeID: string;
  nextNodeID: string;
  nodes: Record<string, string>;
  isGlobal: boolean;
  debugMessages: Record<string, ModelMessage[][]>;
}

interface GlobalNodeToolInfo {
  name: string;
  toolFields: Record<string, ToolFieldValue> | undefined;
}

function getGlobalNodeToolInfo(graph: Graph, globalNodeID: string): GlobalNodeToolInfo {
  const edges = graph.edges.filter((edge) => edge.from === globalNodeID);

  for (const edge of edges) {
    const toolPrecondition = (edge.preconditions ?? []).find((p) => p.type === 'tool_call');
    if (toolPrecondition !== undefined) {
      return { name: toolPrecondition.value, toolFields: toolPrecondition.toolFields };
    }
  }

  throw new Error(`Global node "${globalNodeID}" has no outgoing edge with a tool_call precondition`);
}

export function buildGlobalNodeConfig(
  context: Context,
  nodeBeforeGlobal: string,
  globalNodeID: string
): NodeProcessingConfig {
  const { INITIAL_STEP, DEFAULT_OUTPUT_NODE } = AGENT_CONSTANTS;
  const targetNode = nodeBeforeGlobal === INITIAL_STEP ? INITIAL_STEP : nodeBeforeGlobal;
  const toolInfo = getGlobalNodeToolInfo(context.graph, globalNodeID);

  return {
    kind: 'tool_call' as const,
    promptWithoutToolPreconditions: PROMPTS.GLOBAL_NODE_MUST_CALL_TOOL(toolInfo.name, toolInfo.toolFields),
    toolsByEdge: getToolsFromEdges(context, [
      {
        from: globalNodeID,
        to: targetNode,
        preconditions: [{ type: 'tool_call', value: toolInfo.name, toolFields: toolInfo.toolFields }],
      },
    ]),
    nodes: { [DEFAULT_OUTPUT_NODE]: nodeBeforeGlobal },
  };
}

function resolveReplyOutputSchema(config: NodeProcessingConfig): OutputSchema | undefined {
  if (config.isTerminal === true) return TERMINAL_OUTPUT_SCHEMA;
  if (config.skipMessageToUser === true) return DECISION_ONLY_OUTPUT_SCHEMA;
  return undefined;
}

interface ReplyNodeResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  toolCalls: ToolCallsArray;
  reasoning?: string;
  responseMessages?: unknown[];
}

export async function processReplyNode(params: ProcessReplyNodeParams): Promise<ReplyNodeResult> {
  const { context, config, input, currentNodeID, debugMessages } = params;
  const { promptWithoutToolPreconditions, nodes } = config;
  const provider = getProviderFromMessages(input.messages);
  const { model } = getModel(context.apiKey, context.modelId);

  const cleanMessages = formatMessages(input.messages, [promptWithoutToolPreconditions]);
  const modelConfig = getConfig({ model, cleanMessages, toolChoice: 'none' });
  const outputSchema = resolveReplyOutputSchema(config);

  const res = await generateReply({
    context,
    provider,
    config: modelConfig,
    messages: input.messages,
    step: currentNodeID,
    nodes,
    outputSchema,
  });
  const { tokensLog } = input;
  const lastTokenLog = tokensLog.at(-LAST_INDEX_OFFSET);
  if (lastTokenLog !== undefined) {
    accumulateTokens(lastTokenLog.tokens, res.tokens);
  }
  Object.assign(debugMessages, { [currentNodeID]: res.copyMsgs });

  const { [res.result.nextNodeID]: nextNodeID } = nodes;
  return {
    parsedResult: res.result,
    nextNodeID: nextNodeID ?? '',
    toolCalls: res.toolCalls,
    reasoning: res.reasoning,
    responseMessages: res.responseMessages,
  };
}

export function addNodeSpecificPrompts(context: Context, currentNodeID: string, replyPrompt: string): string {
  const prompt = replyPrompt;
  return prompt;
}

async function generateToolReply(params: GenerateToolReplyParams): Promise<ParsedResult> {
  const { context, input, currentNodeID, nextNodeID, nodes, isGlobal, debugMessages } = params;
  const provider = getProviderFromMessages(input.messages);
  const { model } = getModel(context.apiKey, context.modelId);
  const nextNode = getNode(context.graph, nextNodeID);

  let replyPrompt = generateToolReplyPrompt({
    ctx: context,
    nodeId: AGENT_CONSTANTS.DEFAULT_OUTPUT_NODE,
    nodeName: nextNode.id,
    textExample: nextNode.text,
    description: nextNode.description,
  });
  if (isGlobal) replyPrompt += PROMPTS.GLOBAL_NODE_REPLY_SUFFIX;
  replyPrompt = addNodeSpecificPrompts(context, currentNodeID, replyPrompt);

  const replyConfig = getConfig({
    model,
    cleanMessages: formatMessages(input.messages, [replyPrompt]),
    toolChoice: 'none',
  });
  const replyRes = await generateReply({
    context,
    provider,
    config: replyConfig,
    messages: input.messages,
    step: currentNodeID,
    nodes,
    nextNodeKnown: AGENT_CONSTANTS.DEFAULT_OUTPUT_NODE,
  });

  const { tokensLog: replyTokensLog } = input;
  const replyLastTokenLog = replyTokensLog.at(-LAST_INDEX_OFFSET);
  if (replyLastTokenLog !== undefined) {
    accumulateTokens(replyLastTokenLog.tokens, replyRes.tokens);
  }
  Object.assign(debugMessages, {
    [`${currentNodeID}${AGENT_CONSTANTS.AFTER_TOOL_REPLY_SUFFIX}`]: replyRes.copyMsgs,
  });

  return { ...replyRes.result, nextNodeID: AGENT_CONSTANTS.DEFAULT_OUTPUT_NODE };
}

interface ToolNodeResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  error: boolean;
  toolCalls: ToolCallsArray;
  reasoning?: string;
  toolResults?: Array<{ toolName: string; output: unknown }>;
  errorMessage?: string;
  responseMessages?: unknown[];
}

function extractReasoningFromResult(agentRes: AgentExecutionResult): string | undefined {
  const parts = MessageProcessor.extractContentByType(agentRes.messages, 'reasoning');
  const [first] = parts;
  return first !== undefined && first !== '' ? first : undefined;
}

function createErrorResult(errorMessage?: string): ToolNodeResult {
  return { parsedResult: { nextNodeID: '' }, nextNodeID: '', error: true, toolCalls: [], errorMessage };
}

export async function processToolNode(params: ProcessToolNodeParams): Promise<ToolNodeResult> {
  const { context, config, input, currentNodeID, isGlobal, debugMessages, requiredTool } = params;
  const { toolsByEdge, nodes } = config;

  const toolsByEdgeKeys = Object.keys(toolsByEdge);
  const [firstNextNodeID] = toolsByEdgeKeys;
  if (firstNextNodeID === undefined) {
    logger.error(`callAgentStep/${context.tenantID}/${context.userID}| No edges found in toolsByEdge`);
    return createErrorResult('No edges found in toolsByEdge');
  }

  const nextNodeID = firstNextNodeID;
  const nextNode = getNode(context.graph, nextNodeID);

  const { agentRes, hasError, finalToolCalls } = await executeToolCall(params);
  const reasoning = extractReasoningFromResult(agentRes);
  const { toolResults } = agentRes;

  if (hasError) {
    const errMsg = `Tool node failed: ${requiredTool ?? 'unknown'}`;
    logger.error(`callAgentStep/${context.tenantID}/${context.userID}| Tool node failed`, {
      currentNodeID,
      requiredTool: requiredTool ?? 'none',
    });
    return createErrorResult(errMsg);
  }

  const shouldGenerateReply = nextNode.nextNodeIsUser === true || isGlobal;
  const parsedResult: ParsedResult = shouldGenerateReply
    ? await generateToolReply({ context, input, currentNodeID, nextNodeID, nodes, isGlobal, debugMessages })
    : { nextNodeID: AGENT_CONSTANTS.DEFAULT_OUTPUT_NODE };

  const { [parsedResult.nextNodeID]: finalNextNodeID } = nodes;
  return {
    parsedResult,
    nextNodeID: finalNextNodeID ?? '',
    error: false,
    toolCalls: finalToolCalls,
    reasoning,
    toolResults,
    responseMessages: agentRes.messages,
  };
}
