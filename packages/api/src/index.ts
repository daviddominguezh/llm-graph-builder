import type { Tool } from 'ai';

import { INITIAL_STEP_NODE } from './constants/index.js';
import { type CallAgentOutput, callAgentStep } from './core/index.js';
import type { Message } from './types/ai/messages.js';
import type { Context, NodeProcessedEvent } from './types/tools.js';
import type { Logger } from './utils/logger.js';
import { setLogger } from './utils/logger.js';
import { Pipeline } from './utils/pipeline.js';

export { buildNextAgentConfig } from './stateMachine/index.js';
export { createDummyToolsForGraph } from './tools/dummyTools.js';
export type { CallAgentOutput } from './core/index.js';
export type { Message } from './types/ai/messages.js';
export { MESSAGES_PROVIDER } from './types/ai/messages.js';
export type { TokenLog, ActionTokenUsage } from './types/ai/logs.js';
export type { Context, NodeProcessedEvent } from './types/tools.js';
export type { Logger } from './utils/logger.js';

export { executeAgentLoop, executeAgentLoopSimple } from './agentLoop/index.js';
export type {
  AgentLoopCallbacks,
  AgentLoopConfig,
  AgentLoopResult,
  AgentStepEvent,
  AgentToolCallRecord,
  AgentToolEvent,
  SkillDefinition,
} from './agentLoop/index.js';
export { AGENT_LOOP_HARD_LIMIT } from './agentLoop/index.js';

export const execute = async (
  context: Context,
  messages: Message[],
  currentNode?: string,
  logger?: Logger
): Promise<CallAgentOutput | null> => {
  if (logger !== undefined) setLogger(logger);
  return await Pipeline.executeSingleStep(context, callAgentStep, {
    messages,
    tokensLog: [],
    currentNode: currentNode ?? INITIAL_STEP_NODE,
    structuredOutputs: {},
  });
};

export interface ExecuteWithCallbacksOptions {
  context: Context;
  messages: Message[];
  currentNode?: string;
  logger?: Logger;
  toolsOverride?: Record<string, Tool>;
  onNodeVisited?: (nodeId: string) => void;
  onNodeProcessed?: (event: NodeProcessedEvent) => void;
  structuredOutputs?: Record<string, unknown[]>;
}

export const executeWithCallbacks = async (
  options: ExecuteWithCallbacksOptions
): Promise<CallAgentOutput | null> => {
  if (options.logger !== undefined) setLogger(options.logger);
  const context: Context = {
    ...options.context,
    toolsOverride: options.toolsOverride,
    onNodeVisited: options.onNodeVisited,
    onNodeProcessed: options.onNodeProcessed,
  };
  return await Pipeline.executeSingleStep(context, callAgentStep, {
    messages: options.messages,
    tokensLog: [],
    currentNode: options.currentNode ?? INITIAL_STEP_NODE,
    structuredOutputs: options.structuredOutputs ?? {},
  });
};
