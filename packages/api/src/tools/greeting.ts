import { tool } from 'ai';
import z from 'zod';

import { logger } from '@globalUtils/logger.js';

import type { Context, ToolResponsePrompt } from '@src/types/tools.js';

import { type ToolCallInfo, createErrorResult, createSuccessResult } from './abstractToolExecuter.js';
import { CloserTool } from './toolEnum.js';

const MIN_NAME_LENGTH = 1;

export const AddUserNameSchema = z.object({
  name: z.string().nonempty().min(MIN_NAME_LENGTH).describe('The human name provided by the user'),
});

export type AddUserNameSchemaType = z.infer<typeof AddUserNameSchema>;

const SUCCESS_MSG =
  'User name successfully registered. Do not call this tool again. The name was already registered, NEVER call this tool again.';

const ERROR_MSG = 'Some error';

const handleAddUserName = async (
  context: Context,
  data: AddUserNameSchemaType,
  info: ToolCallInfo
): Promise<ToolResponsePrompt> => {
  const { sessionID } = context;
  const { toolCallId, toolName } = info;
  logger.info(`${sessionID}Setting user name in Firebase...`, data);

  try {
    // Some processing...
    // eslint-disable-next-line promise/avoid-new -- Just to show
    await new Promise((resolve) => {
      resolve('Hello World!');
    });

    logger.info(`${sessionID}User name set successfully`);
    return createSuccessResult(toolCallId, toolName, SUCCESS_MSG);
  } catch (e) {
    logger.error(`${sessionID} ${ERROR_MSG}`);
    return createErrorResult(info.toolCallId, info.toolName, ERROR_MSG);
  }
};

export const GreetingTools = {
  generate: (context: Context, isTest = false) => ({
    [CloserTool.addUserName]: tool({
      description: 'Registers the name of the user',
      inputSchema: AddUserNameSchema,
      execute: async (data: AddUserNameSchemaType, { toolCallId }) =>
        await executer({
          context,
          data,
          callback: handleAddUserName,
          info: { toolCallId, toolName: CloserTool.addUserName, isTest },
        }),
    }),
  }),
};
