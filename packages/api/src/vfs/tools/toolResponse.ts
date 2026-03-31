import type { ToolResponsePrompt } from '@src/types/tools.js';

import type { VFSError } from '../types.js';

export function toToolSuccess(
  toolCallId: string,
  toolName: string,
  data: Record<string, unknown>
): ToolResponsePrompt {
  return {
    type: 'tool-result',
    toolCallId,
    toolName,
    result: { result: { success: true, ...data } },
  };
}

interface ToolErrorResult {
  success: false;
  error: string;
  error_code: string;
  details?: Record<string, unknown>;
}

function buildErrorResult(error: VFSError): ToolErrorResult {
  const base: ToolErrorResult = {
    success: false,
    error: error.message,
    error_code: error.code,
  };

  if (error.details !== undefined) {
    return { ...base, details: error.details };
  }

  return base;
}

export function toToolError(toolCallId: string, toolName: string, error: VFSError): ToolResponsePrompt {
  return {
    type: 'tool-result',
    toolCallId,
    toolName,
    isError: true,
    result: { result: buildErrorResult(error) },
  };
}
