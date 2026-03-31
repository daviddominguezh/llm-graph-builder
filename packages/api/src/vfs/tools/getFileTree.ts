import { tool } from 'ai';

import type { FileTreeResult } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { GetFileTreeSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapFileTreeResult(result: FileTreeResult) {
  return {
    path: result.path,
    tree: result.tree,
    truncated: result.truncated,
  };
}

export function createGetFileTreeTool(vfs: VFSContext) {
  return tool({
    description: 'Get a nested tree view of the project structure.',
    inputSchema: GetFileTreeSchema,
    execute: async (data, { toolCallId }) => {
      try {
        const result = await vfs.getFileTree(data.path);
        return toToolSuccess(toolCallId, VFSTool.get_file_tree, mapFileTreeResult(result));
      } catch (error) {
        if (error instanceof VFSError) {
          return toToolError(toolCallId, VFSTool.get_file_tree, error);
        }
        throw error;
      }
    },
  });
}
