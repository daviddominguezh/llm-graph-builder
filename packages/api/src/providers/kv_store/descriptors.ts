import type { ToolDescriptor } from '../provider.js';
import type { RawJsonSchema } from '../types.js';

const ONE_KILOBYTE = 1024;
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = KEY_MAX_BYTES * ONE_KILOBYTE;
const KEY_PATTERN_MAX = ONE_KILOBYTE;
const QUERY_MAX = 2048;
const KEYS_MAX_ITEMS = 100;
const OFFSET_MIN = 0;
const LIMIT_MIN = 1;
const LIMIT_MAX = 500;
const LIST_KEYS_DEFAULT_LIMIT = 100;
const SEARCH_DEFAULT_LIMIT = 50;

export const KV_LIST_KEYS_TOOL_NAME = 'list_keys';
export const KV_GET_VALUES_TOOL_NAME = 'get_values';
export const KV_SEARCH_TOOL_NAME = 'search';
export const KV_UPDATE_VALUE_TOOL_NAME = 'update_value';

const offsetSchema: RawJsonSchema = { type: 'integer', minimum: OFFSET_MIN, default: OFFSET_MIN };
const listKeysLimitSchema: RawJsonSchema = {
  type: 'integer',
  minimum: LIMIT_MIN,
  maximum: LIMIT_MAX,
  default: LIST_KEYS_DEFAULT_LIMIT,
};
const searchLimitSchema: RawJsonSchema = {
  type: 'integer',
  minimum: LIMIT_MIN,
  maximum: LIMIT_MAX,
  default: SEARCH_DEFAULT_LIMIT,
};

const listKeysDescriptor: ToolDescriptor = {
  toolName: KV_LIST_KEYS_TOOL_NAME,
  description: 'List the keys stored in the bound KV store for the current tenant. Paginated.',
  inputSchema: {
    type: 'object',
    required: ['offset', 'limit'],
    properties: { offset: offsetSchema, limit: listKeysLimitSchema },
  },
};

const getValuesDescriptor: ToolDescriptor = {
  toolName: KV_GET_VALUES_TOOL_NAME,
  description: 'Fetch values for an explicit list of keys. Missing keys map to null.',
  inputSchema: {
    type: 'object',
    required: ['keys'],
    properties: {
      keys: {
        type: 'array',
        items: { type: 'string', maxLength: KEY_MAX_BYTES },
        maxItems: KEYS_MAX_ITEMS,
      },
    },
  },
};

const searchDescriptor: ToolDescriptor = {
  toolName: KV_SEARCH_TOOL_NAME,
  description:
    'Search KV entries by substring or POSIX regex. Use mode="substring" for case-insensitive ILIKE; mode="regex" for full POSIX regex (bounded scan).',
  inputSchema: {
    type: 'object',
    required: ['mode', 'on', 'offset', 'limit'],
    properties: {
      mode: { type: 'string', enum: ['substring', 'regex'] },
      on: { type: 'string', enum: ['keys', 'values', 'both'] },
      query: { type: 'string', minLength: LIMIT_MIN, maxLength: QUERY_MAX },
      pattern: { type: 'string', maxLength: KEY_PATTERN_MAX },
      offset: offsetSchema,
      limit: searchLimitSchema,
    },
  },
};

const updateValueDescriptor: ToolDescriptor = {
  toolName: KV_UPDATE_VALUE_TOOL_NAME,
  description: 'Insert or update a value for a key. Keys starting with "_sys." are reserved.',
  inputSchema: {
    type: 'object',
    required: ['key', 'value'],
    properties: {
      key: { type: 'string', maxLength: KEY_MAX_BYTES, minLength: LIMIT_MIN },
      value: { type: 'string', maxLength: VALUE_MAX_BYTES },
    },
  },
};

export const KV_DESCRIPTORS: ToolDescriptor[] = [
  listKeysDescriptor,
  getValuesDescriptor,
  searchDescriptor,
  updateValueDescriptor,
];
