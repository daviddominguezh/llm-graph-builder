import { tool } from 'ai';

import type { FileMetadataResult } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { GetFileMetadataSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapFileMetadataResult(result: FileMetadataResult) {
  return {
    path: result.path,
    size_bytes: result.sizeBytes,
    line_count: result.lineCount,
    language: result.language,
    is_binary: result.isBinary,
  };
}

export function createGetFileMetadataTool(vfs: VFSContext) {
  return tool({
    description: 'Get file size, language, and line count without reading content.',
    inputSchema: GetFileMetadataSchema,
    execute: async (data, { toolCallId }) => {
      try {
        const result = await vfs.getFileMetadata(data.path);
        return toToolSuccess(toolCallId, VFSTool.get_file_metadata, mapFileMetadataResult(result));
      } catch (error) {
        if (error instanceof VFSError) {
          return toToolError(toolCallId, VFSTool.get_file_metadata, error);
        }
        throw error;
      }
    },
  });
}
