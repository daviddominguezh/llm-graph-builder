import type { Tool } from 'ai';
import { tool } from 'ai';

import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import type { EditFileInput } from './schemas.js';
import { EditFileSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

interface Edit {
  old_text: string;
  new_text: string;
}

function mapEdits(edits: Edit[] | undefined): Edit[] | undefined {
  if (edits === undefined) return undefined;
  return edits.map((e) => ({ old_text: e.old_text, new_text: e.new_text }));
}

function mapEditFileResult(
  path: string,
  editsApplied: number,
  newLineCount: number
): Record<string, unknown> {
  return {
    path,
    edits_applied: editsApplied,
    new_line_count: newLineCount,
  };
}

export function createEditFileTool(vfs: VFSContext): Tool<EditFileInput> {
  return tool({
    description: 'Edit a file using search-and-replace or full content replacement.',
    inputSchema: EditFileSchema,
    execute: async (data: EditFileInput, { toolCallId }) => {
      try {
        const edits = mapEdits(data.edits);
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
