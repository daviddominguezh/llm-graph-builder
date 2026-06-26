import type { ToolDescriptor } from '../provider.js';
import type { RawJsonSchema } from '../types.js';
import {
  GET_VALUES_KEYS_DESC,
  GET_VALUES_TOOL_DESC,
  LIST_KEYS_LIMIT_DESC,
  LIST_KEYS_TOOL_DESC,
  OFFSET_DESC,
  SEARCH_LIMIT_DESC,
  SEARCH_MODE_DESC,
  SEARCH_ON_DESC,
  SEARCH_QUERY_DESC,
  SEARCH_TOOL_DESC,
  UPDATE_KEY_DESC,
  UPDATE_VALUE_DESC,
  UPDATE_VALUE_TOOL_DESC,
} from './descriptions.js';

const ONE_KILOBYTE = 1024;
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = KEY_MAX_BYTES * ONE_KILOBYTE;
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

const offsetSchema: RawJsonSchema = {
  type: 'integer',
  minimum: OFFSET_MIN,
  default: OFFSET_MIN,
  description: OFFSET_DESC,
};
const listKeysLimitSchema: RawJsonSchema = {
  type: 'integer',
  minimum: LIMIT_MIN,
  maximum: LIMIT_MAX,
  default: LIST_KEYS_DEFAULT_LIMIT,
  description: LIST_KEYS_LIMIT_DESC,
};
const searchLimitSchema: RawJsonSchema = {
  type: 'integer',
  minimum: LIMIT_MIN,
  maximum: LIMIT_MAX,
  default: SEARCH_DEFAULT_LIMIT,
  description: SEARCH_LIMIT_DESC,
};

const listKeysDescriptor: ToolDescriptor = {
  toolName: KV_LIST_KEYS_TOOL_NAME,
  description: LIST_KEYS_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: LIST_KEYS_TOOL_DESC,
    required: [],
    properties: { offset: offsetSchema, limit: listKeysLimitSchema },
  },
};

const getValuesDescriptor: ToolDescriptor = {
  toolName: KV_GET_VALUES_TOOL_NAME,
  description: GET_VALUES_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: GET_VALUES_TOOL_DESC,
    required: ['keys'],
    properties: {
      keys: {
        type: 'array',
        description: GET_VALUES_KEYS_DESC,
        items: { type: 'string', maxLength: KEY_MAX_BYTES },
        maxItems: KEYS_MAX_ITEMS,
      },
    },
  },
};

const searchDescriptor: ToolDescriptor = {
  toolName: KV_SEARCH_TOOL_NAME,
  description: SEARCH_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: SEARCH_TOOL_DESC,
    required: ['mode', 'query'],
    properties: {
      mode: { type: 'string', enum: ['substring', 'regex'], description: SEARCH_MODE_DESC },
      on: { type: 'string', enum: ['keys', 'values', 'both'], default: 'both', description: SEARCH_ON_DESC },
      query: {
        type: 'string',
        minLength: LIMIT_MIN,
        maxLength: QUERY_MAX,
        description: SEARCH_QUERY_DESC,
      },
      offset: offsetSchema,
      limit: searchLimitSchema,
    },
  },
};

const updateValueDescriptor: ToolDescriptor = {
  toolName: KV_UPDATE_VALUE_TOOL_NAME,
  description: UPDATE_VALUE_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: UPDATE_VALUE_TOOL_DESC,
    required: ['key', 'value'],
    properties: {
      key: {
        type: 'string',
        maxLength: KEY_MAX_BYTES,
        minLength: LIMIT_MIN,
        description: UPDATE_KEY_DESC,
      },
      value: { type: 'string', maxLength: VALUE_MAX_BYTES, description: UPDATE_VALUE_DESC },
    },
  },
};

export const KV_DESCRIPTORS: ToolDescriptor[] = [
  listKeysDescriptor,
  getValuesDescriptor,
  searchDescriptor,
  updateValueDescriptor,
];
