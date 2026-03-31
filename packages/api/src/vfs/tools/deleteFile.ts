import { tool } from 'ai';

import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { DeleteFileSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

export function createDeleteFileTool(vfs: VFSContext) {
  return tool({
    description: 'Delete a file. Fails if the file does not exist.',
    inputSchema: DeleteFileSchema,
    execute: async (data, { toolCallId }) => {
      try {
        const result = await vfs.deleteFile(data.path);
        return toToolSuccess(toolCallId, VFSTool.delete_file, {
          path: result.path,
          deleted: result.deleted,
        });
      } catch (error) {
        if (error instanceof VFSError) return toToolError(toolCallId, VFSTool.delete_file, error);
        throw error;
      }
    },
  });
}
