import type { Tool } from 'ai';
import { tool } from 'ai';

import type { ListDirectoryResult } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import type { ListDirectoryInput } from './schemas.js';
import { ListDirectorySchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapListDirectoryResult(result: ListDirectoryResult): Record<string, unknown> {
  return {
    path: result.path,
    entries: result.entries,
  };
}

export function createListDirectoryTool(vfs: VFSContext): Tool<ListDirectoryInput> {
  return tool({
    description: 'List directory contents. Set recursive=true to see subdirectories.',
    inputSchema: ListDirectorySchema,
    execute: async (data: ListDirectoryInput, { toolCallId }) => {
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
