import { INITIAL_STEP_NODE } from './constants/index.js';
import { type CallAgentOutput, callAgentStep } from './core/index.js';
import type { Message } from './types/ai/messages.js';
import type { Context } from './types/tools.js';
import { Pipeline } from './utils/pipeline.js';

export { buildNextAgentConfig } from './stateMachine/index.js';
export { createDummyToolsForGraph } from './tools/dummyTools.js';
export type { CallAgentOutput } from './core/index.js';
export type { Message } from './types/ai/messages.js';
export { MESSAGES_PROVIDER } from './types/ai/messages.js';
export type { TokenLog, ActionTokenUsage } from './types/ai/logs.js';
export type { Context } from './types/tools.js';

export const execute = async (
  context: Context,
  messages: Message[],
  currentNode?: string
): Promise<CallAgentOutput | null> =>
  await Pipeline.executeSingleStep(context, callAgentStep, {
    messages,
    tokensLog: [],
    currentNode: currentNode ?? INITIAL_STEP_NODE,
  });
