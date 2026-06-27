import type { ToolDescriptor } from '../provider.js';
import type { RawJsonSchema } from '../types.js';
import {
  RAG_CURSOR_DESC,
  RAG_LIMIT_DESC,
  RAG_MIN_SIMILARITY_DESC,
  RAG_MODE_DESC,
  RAG_QUERY_DESC,
  RAG_SEARCH_TOOL_DESC,
} from './descriptions.js';

const QUERY_MAX = 4096;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;
const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_SIMILARITY = 0.5;
const MIN_SIMILARITY_FLOOR = 0;
const MIN_SIMILARITY_CEIL = 1;

export const RAG_SEARCH_TOOL_NAME = 'search';

const cursorSchema: RawJsonSchema = { type: 'string', description: RAG_CURSOR_DESC };
const limitSchema: RawJsonSchema = {
  type: 'integer',
  minimum: LIMIT_MIN,
  maximum: LIMIT_MAX,
  default: DEFAULT_LIMIT,
  description: RAG_LIMIT_DESC,
};

const searchDescriptor: ToolDescriptor = {
  toolName: RAG_SEARCH_TOOL_NAME,
  description: RAG_SEARCH_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: RAG_SEARCH_TOOL_DESC,
    required: ['mode', 'query'],
    properties: {
      mode: { type: 'string', enum: ['bm25', 'semantic', 'hybrid', 'regex'], description: RAG_MODE_DESC },
      query: { type: 'string', minLength: LIMIT_MIN, maxLength: QUERY_MAX, description: RAG_QUERY_DESC },
      minSimilarity: {
        type: 'number',
        minimum: MIN_SIMILARITY_FLOOR,
        maximum: MIN_SIMILARITY_CEIL,
        default: DEFAULT_MIN_SIMILARITY,
        description: RAG_MIN_SIMILARITY_DESC,
      },
      cursor: cursorSchema,
      limit: limitSchema,
    },
  },
};

export const RAG_DESCRIPTORS: ToolDescriptor[] = [searchDescriptor];
