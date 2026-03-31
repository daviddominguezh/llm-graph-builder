import { tool } from 'ai';

import type { FindFilesResult } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import { FindFilesSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapFindFilesResult(result: FindFilesResult) {
  return {
    pattern: result.pattern,
    matches: result.matches,
    total_matches: result.totalMatches,
    truncated: result.truncated,
  };
}

export function createFindFilesTool(vfs: VFSContext) {
  return tool({
    description: 'Find files matching a glob pattern.',
    inputSchema: FindFilesSchema,
    execute: async (data, { toolCallId }) => {
      try {
        const result = await vfs.findFiles(data.pattern, data.path, data.exclude, data.max_results);
        return toToolSuccess(toolCallId, VFSTool.find_files, mapFindFilesResult(result));
      } catch (error) {
        if (error instanceof VFSError) {
          return toToolError(toolCallId, VFSTool.find_files, error);
        }
        throw error;
      }
    },
  });
}
