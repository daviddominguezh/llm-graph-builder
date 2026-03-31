import { tool } from 'ai';

import type { CountLinesResult } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { CountLinesSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapCountLinesResult(result: CountLinesResult) {
  return {
    path: result.path,
    total_lines: result.totalLines,
    matching_lines: result.matchingLines,
    pattern: result.pattern,
  };
}

export function createCountLinesTool(vfs: VFSContext) {
  return tool({
    description: 'Count total lines or lines matching a pattern in a file.',
    inputSchema: CountLinesSchema,
    execute: async (data, { toolCallId }) => {
      try {
        const result = await vfs.countLines(data.path, data.pattern, data.is_regex);
        return toToolSuccess(toolCallId, VFSTool.count_lines, mapCountLinesResult(result));
      } catch (error) {
        if (error instanceof VFSError) {
          return toToolError(toolCallId, VFSTool.count_lines, error);
        }
        throw error;
      }
    },
  });
}
