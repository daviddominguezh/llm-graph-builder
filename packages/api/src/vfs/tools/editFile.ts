import { tool } from 'ai';

import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { EditFileSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapEditFileResult(path: string, editsApplied: number, newLineCount: number) {
  return {
    path,
    edits_applied: editsApplied,
    new_line_count: newLineCount,
  };
}

export function createEditFileTool(vfs: VFSContext) {
  return tool({
    description: 'Edit a file using search-and-replace or full content replacement.',
    inputSchema: EditFileSchema,
    execute: async (data, { toolCallId }) => {
      try {
        const edits = data.edits?.map((e) => ({ old_text: e.old_text, new_text: e.new_text }));
        const result = await vfs.editFile(data.path, edits, data.full_content);
        return toToolSuccess(
          toolCallId,
          VFSTool.edit_file,
          mapEditFileResult(result.path, result.editsApplied, result.newLineCount)
        );
      } catch (error) {
        if (error instanceof VFSError) return toToolError(toolCallId, VFSTool.edit_file, error);
        throw error;
      }
    },
  });
}
