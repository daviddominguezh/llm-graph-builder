import { tool } from 'ai';
import { z } from 'zod';

import type { FinishSentinel } from '@src/types/sentinels.js';

const TOOL_NAME = '__system_finish';

const finishToolSchema = z.object({
  output: z.string().describe('The final output to return to the parent agent'),
  status: z.enum(['success', 'error']).describe('Whether the task completed successfully or with an error'),
});

function createFinishTool() {
  return tool({
    description:
      'Signal that you have completed your task. Call this when you are done. ' +
      'Pass your final output and whether you succeeded or encountered an error.',
    parameters: finishToolSchema,
    execute: async (params): Promise<FinishSentinel> => {
      return {
        __sentinel: 'finish',
        output: params.output,
        status: params.status,
      };
    },
  });
}

export { TOOL_NAME as FINISH_TOOL_NAME, createFinishTool };
