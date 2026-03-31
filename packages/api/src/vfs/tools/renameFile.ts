import type { Tool } from 'ai';
import { tool } from 'ai';

import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import type { RenameFileInput } from './schemas.js';
import { RenameFileSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

export function createRenameFileTool(vfs: VFSContext): Tool<RenameFileInput> {
  return tool({
    description: 'Rename or move a file from one path to another.',
    inputSchema: RenameFileSchema,
    execute: async (data: RenameFileInput, { toolCallId }) => {
      try {
        const result = await vfs.renameFile(data.old_path, data.new_path);
        return toToolSuccess(toolCallId, VFSTool.rename_file, {
          old_path: result.oldPath,
          new_path: result.newPath,
        });
      } catch (error) {
        if (error instanceof VFSError) return toToolError(toolCallId, VFSTool.rename_file, error);
        throw error;
      }
    },
  });
}
