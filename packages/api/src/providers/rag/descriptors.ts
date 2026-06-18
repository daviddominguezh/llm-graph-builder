import type { ToolDescriptor } from '../provider.js';
import type { RawJsonSchema } from '../types.js';

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

const offsetSchema: RawJsonSchema = { type: 'integer', minimum: OFFSET_MIN, default: OFFSET_MIN };
const limitSchema: RawJsonSchema = {
  type: 'integer',
  minimum: LIMIT_MIN,
  maximum: LIMIT_MAX,
  default: DEFAULT_LIMIT,
};

const searchDescriptor: ToolDescriptor = {
  toolName: RAG_SEARCH_TOOL_NAME,
  description:
    'Search a bound RAG (knowledge base) store. Modes: ' +
    '"bm25" (Postgres FTS, ranked text), ' +
    '"semantic" (vector similarity over embeddings), ' +
    '"hybrid" (weighted blend of bm25 + semantic), ' +
    '"regex" (POSIX regex with 500ms statement timeout). Returns top chunks as strings.',
  inputSchema: {
    type: 'object',
    required: ['mode', 'offset', 'limit'],
    properties: {
      mode: { type: 'string', enum: ['bm25', 'semantic', 'hybrid', 'regex'] },
      query: { type: 'string', minLength: LIMIT_MIN, maxLength: QUERY_MAX },
      pattern: { type: 'string', maxLength: ONE_KILOBYTE },
      minSimilarity: {
        type: 'number',
        minimum: MIN_SIMILARITY_FLOOR,
        maximum: MIN_SIMILARITY_CEIL,
        default: DEFAULT_MIN_SIMILARITY,
        description: 'For semantic/hybrid modes only. 0 disables the similarity floor.',
      },
      offset: offsetSchema,
      limit: limitSchema,
    },
  },
};

export const RAG_DESCRIPTORS: ToolDescriptor[] = [searchDescriptor];
