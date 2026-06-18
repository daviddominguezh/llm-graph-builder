import type { ToolDescriptor } from '../provider.js';
import type { RawJsonSchema } from '../types.js';
import {
  RAG_LIMIT_DESC,
  RAG_MIN_SIMILARITY_DESC,
  RAG_MODE_DESC,
  RAG_OFFSET_DESC,
  RAG_PATTERN_DESC,
  RAG_QUERY_DESC,
  RAG_SEARCH_TOOL_DESC,
} from './descriptions.js';

const ONE_KILOBYTE = 1024;
const QUERY_MAX = 4096;
const OFFSET_MIN = 0;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;
const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_SIMILARITY = 0.5;
const MIN_SIMILARITY_FLOOR = 0;
const MIN_SIMILARITY_CEIL = 1;

export const RAG_SEARCH_TOOL_NAME = 'search';

const offsetSchema: RawJsonSchema = {
  type: 'integer',
  minimum: OFFSET_MIN,
  default: OFFSET_MIN,
  description: RAG_OFFSET_DESC,
};
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
    required: ['mode', 'offset', 'limit'],
    properties: {
      mode: { type: 'string', enum: ['bm25', 'semantic', 'hybrid', 'regex'], description: RAG_MODE_DESC },
      query: { type: 'string', minLength: LIMIT_MIN, maxLength: QUERY_MAX, description: RAG_QUERY_DESC },
      pattern: { type: 'string', maxLength: ONE_KILOBYTE, description: RAG_PATTERN_DESC },
      minSimilarity: {
        type: 'number',
        minimum: MIN_SIMILARITY_FLOOR,
        maximum: MIN_SIMILARITY_CEIL,
        default: DEFAULT_MIN_SIMILARITY,
        description: RAG_MIN_SIMILARITY_DESC,
      },
      offset: offsetSchema,
      limit: limitSchema,
    },
  },
};

export const RAG_DESCRIPTORS: ToolDescriptor[] = [searchDescriptor];
