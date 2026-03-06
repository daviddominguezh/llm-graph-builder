import type { Context, ToolResponsePrompt } from '@src/types/tools.js';

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  isTest?: boolean;
}

export interface ExecuterParams<T> {
  context: Context;
  data: T;
  callback: (context: Context, data: T, info: ToolCallInfo) => Promise<ToolResponsePrompt>;
  info: ToolCallInfo;
}

export const executer = async <T>(params: ExecuterParams<T>): Promise<ToolResponsePrompt> => {
  const { context, data, callback, info } = params;
  return await callback(context, data, info);
};

export const createSuccessResult = (
  toolCallId: string,
  toolName: string,
  result: string
): ToolResponsePrompt => ({
  type: 'tool-result',
  toolCallId,
  toolName,
  result: { result },
});

export const createErrorResult = (
  toolCallId: string,
  toolName: string,
  message: string
): ToolResponsePrompt => ({
  type: 'tool-result',
  toolCallId,
  toolName,
  isError: true,
  result: { result: message },
});
