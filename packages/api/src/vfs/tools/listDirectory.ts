import { tool } from 'ai';

import type { ListDirectoryResult } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { ListDirectorySchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapListDirectoryResult(result: ListDirectoryResult) {
  return {
    path: result.path,
    entries: result.entries,
  };
}

export function createListDirectoryTool(vfs: VFSContext) {
  return tool({
    description: 'List directory contents. Set recursive=true to see subdirectories.',
    inputSchema: ListDirectorySchema,
    execute: async (data, { toolCallId }) => {
      try {
        const result = await vfs.listDirectory(data.path, data.recursive, data.max_depth);
        return toToolSuccess(toolCallId, VFSTool.list_directory, mapListDirectoryResult(result));
      } catch (error) {
        if (error instanceof VFSError) {
          return toToolError(toolCallId, VFSTool.list_directory, error);
        }
        throw error;
      }
    },
  });
}
