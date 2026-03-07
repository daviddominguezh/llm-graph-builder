import { INITIAL_STEP_NODE } from './constants/index.js';
import { type CallAgentOutput, callAgentStep } from './core/index.js';
import type { Message } from './types/ai/messages.js';
import type { Context } from './types/tools.js';
import { Pipeline } from './utils/pipeline.js';

export { buildNextAgentConfig } from './stateMachine/index.js';
export { createDummyToolsForGraph } from './tools/dummyTools.js';

export const execute = async (context: Context, messages: Message[]): Promise<CallAgentOutput | null> =>
  await Pipeline.executeSingleStep(context, callAgentStep, {
    messages,
    tokensLog: [],
    currentNode: INITIAL_STEP_NODE,
  });
