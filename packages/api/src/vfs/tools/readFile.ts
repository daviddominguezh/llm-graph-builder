import { tool } from 'ai';

import type { ReadFileResult } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { ReadFileSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapReadFileResult(result: ReadFileResult) {
  return {
    path: result.path,
    content: result.content,
    start_line: result.startLine,
    end_line: result.endLine,
    total_lines: result.totalLines,
    token_estimate: result.tokenEstimate,
  };
}

export function createReadFileTool(vfs: VFSContext) {
  return tool({
    description: 'Read file content. Use start_line/end_line for large files.',
    inputSchema: ReadFileSchema,
    execute: async (data, { toolCallId }) => {
      try {
        const result = await vfs.readFile(data.path, data.start_line, data.end_line);
        return toToolSuccess(toolCallId, VFSTool.read_file, mapReadFileResult(result));
      } catch (error) {
        if (error instanceof VFSError) {
          return toToolError(toolCallId, VFSTool.read_file, error);
        }
        throw error;
      }
    },
  });
}
