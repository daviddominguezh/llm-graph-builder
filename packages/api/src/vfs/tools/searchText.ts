import type { Tool } from 'ai';
import { tool } from 'ai';

import type { SearchTextMatch, SearchTextResult } from '../types.js';
import { VFSError } from '../types.js';
import type { VFSContext } from '../vfsContext.js';
import type { SearchTextInput } from './schemas.js';
import { SearchTextSchema } from './schemas.js';
import { VFSTool } from './toolEnum.js';
import { toToolError, toToolSuccess } from './toolResponse.js';

function mapMatch(match: SearchTextMatch): Record<string, unknown> {
  return {
    path: match.path,
    line: match.line,
    column: match.column,
    content: match.content,
    context_before: match.contextBefore,
    context_after: match.contextAfter,
  };
}

function mapSearchTextResult(result: SearchTextResult): Record<string, unknown> {
  return {
    pattern: result.pattern,
    matches: result.matches.map(mapMatch),
    total_matches: result.totalMatches,
    truncated: result.truncated,
  };
}

export function createSearchTextTool(vfs: VFSContext): Tool<SearchTextInput> {
  return tool({
    description: 'Search for text or regex patterns across files.',
    inputSchema: SearchTextSchema,
    execute: async (data: SearchTextInput, { toolCallId }) => {
      try {
        const params = {
          pattern: data.pattern,
          isRegex: data.is_regex,
          path: data.path,
          includeGlob: data.include_glob,
          ignoreCase: data.ignore_case,
          maxResults: data.max_results,
        };
        const result = await vfs.searchText(params);
        return toToolSuccess(toolCallId, VFSTool.search_text, mapSearchTextResult(result));
      } catch (error) {
        if (error instanceof VFSError) {
          return toToolError(toolCallId, VFSTool.search_text, error);
        }
        throw error;
      }
    },
  });
}
