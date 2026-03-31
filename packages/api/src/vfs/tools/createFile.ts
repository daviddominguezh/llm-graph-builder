import { tool } from 'ai';

import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { CreateFileSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

export function createCreateFileTool(vfs: VFSContext) {
  return tool({
    description: 'Create a new file. Fails if the file already exists.',
    inputSchema: CreateFileSchema,
    execute: async (data, { toolCallId }) => {
      try {
        const result = await vfs.createFile(data.path, data.content);
        return toToolSuccess(toolCallId, VFSTool.create_file, {
          path: result.path,
          lines_written: result.linesWritten,
        });
      } catch (error) {
        if (error instanceof VFSError) return toToolError(toolCallId, VFSTool.create_file, error);
        throw error;
      }
    },
  });
}
