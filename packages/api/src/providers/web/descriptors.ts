import type { ToolDescriptor } from '../provider.js';
import type { RawJsonSchema } from '../types.js';
import {
  ALLOW_EXTERNAL_DESC,
  CRAWL_EXTRACT_DEPTH_DESC,
  CRAWL_FORMAT_DESC,
  CRAWL_INCLUDE_FAVICON_DESC,
  CRAWL_TOOL_DESC,
  CRAWL_URL_DESC,
  EXTRACT_DEPTH_DESC,
  EXTRACT_FORMAT_DESC,
  EXTRACT_INCLUDE_FAVICON_DESC,
  EXTRACT_INCLUDE_IMAGES_DESC,
  EXTRACT_QUERY_DESC,
  EXTRACT_TOOL_DESC,
  EXTRACT_URLS_DESC,
  INSTRUCTIONS_DESC,
  LIMIT_DESC,
  MAP_TOOL_DESC,
  MAP_URL_DESC,
  MAX_BREADTH_DESC,
  MAX_DEPTH_DESC,
  SEARCH_COUNTRY_DESC,
  SEARCH_DEPTH_DESC,
  SEARCH_END_DATE_DESC,
  SEARCH_EXACT_MATCH_DESC,
  SEARCH_EXCLUDE_DOMAINS_DESC,
  SEARCH_INCLUDE_DOMAINS_DESC,
  SEARCH_INCLUDE_FAVICON_DESC,
  SEARCH_INCLUDE_IMAGES_DESC,
  SEARCH_INCLUDE_IMAGE_DESCRIPTIONS_DESC,
  SEARCH_INCLUDE_RAW_CONTENT_DESC,
  SEARCH_MAX_RESULTS_DESC,
  SEARCH_QUERY_DESC,
  SEARCH_START_DATE_DESC,
  SEARCH_TIME_RANGE_DESC,
  SEARCH_TOOL_DESC,
  SEARCH_TOPIC_DESC,
  SELECT_DOMAINS_DESC,
  SELECT_PATHS_DESC,
} from './descriptions.js';

export const WEB_SEARCH_TOOL_NAME = 'search';
export const WEB_EXTRACT_TOOL_NAME = 'extract';
export const WEB_CRAWL_TOOL_NAME = 'crawl';
export const WEB_MAP_TOOL_NAME = 'map';

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_BREADTH = 20;
const DEFAULT_LIMIT = 50;
const MIN_BOUND = 1;
const DEFAULT_DEPTH = 1;

const stringArray = (description: string): RawJsonSchema => ({
  type: 'array',
  items: { type: 'string' },
  default: [],
  description,
});
const depthFrom = (description: string): RawJsonSchema => ({
  type: 'integer',
  minimum: MIN_BOUND,
  default: DEFAULT_DEPTH,
  description,
});
const breadth: RawJsonSchema = {
  type: 'integer',
  minimum: MIN_BOUND,
  default: DEFAULT_BREADTH,
  description: MAX_BREADTH_DESC,
};
const limit: RawJsonSchema = {
  type: 'integer',
  minimum: MIN_BOUND,
  default: DEFAULT_LIMIT,
  description: LIMIT_DESC,
};
const allowExternal: RawJsonSchema = { type: 'boolean', default: true, description: ALLOW_EXTERNAL_DESC };

const searchDescriptor: ToolDescriptor = {
  toolName: WEB_SEARCH_TOOL_NAME,
  description: SEARCH_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: SEARCH_TOOL_DESC,
    required: ['query'],
    properties: {
      query: { type: 'string', description: SEARCH_QUERY_DESC },
      max_results: { type: 'integer', default: DEFAULT_MAX_RESULTS, description: SEARCH_MAX_RESULTS_DESC },
      search_depth: {
        type: 'string',
        enum: ['basic', 'advanced', 'fast', 'ultra-fast'],
        default: 'basic',
        description: SEARCH_DEPTH_DESC,
      },
      topic: { type: 'string', const: 'general', default: 'general', description: SEARCH_TOPIC_DESC },
      time_range: {
        anyOf: [{ type: 'string', enum: ['day', 'week', 'month', 'year'] }, { type: 'null' }],
        default: null,
        description: SEARCH_TIME_RANGE_DESC,
      },
      include_images: { type: 'boolean', default: false, description: SEARCH_INCLUDE_IMAGES_DESC },
      include_image_descriptions: {
        type: 'boolean',
        default: false,
        description: SEARCH_INCLUDE_IMAGE_DESCRIPTIONS_DESC,
      },
      include_raw_content: { type: 'boolean', default: false, description: SEARCH_INCLUDE_RAW_CONTENT_DESC },
      include_domains: stringArray(SEARCH_INCLUDE_DOMAINS_DESC),
      exclude_domains: stringArray(SEARCH_EXCLUDE_DOMAINS_DESC),
      country: { type: 'string', default: '', description: SEARCH_COUNTRY_DESC },
      include_favicon: { type: 'boolean', default: false, description: SEARCH_INCLUDE_FAVICON_DESC },
      start_date: { type: 'string', default: '', description: SEARCH_START_DATE_DESC },
      end_date: { type: 'string', default: '', description: SEARCH_END_DATE_DESC },
      exact_match: {
        anyOf: [{ type: 'boolean' }, { type: 'null' }],
        default: null,
        description: SEARCH_EXACT_MATCH_DESC,
      },
    },
  },
};

const extractDescriptor: ToolDescriptor = {
  toolName: WEB_EXTRACT_TOOL_NAME,
  description: EXTRACT_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: EXTRACT_TOOL_DESC,
    required: ['urls'],
    properties: {
      urls: stringArray(EXTRACT_URLS_DESC),
      extract_depth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        default: 'basic',
        description: EXTRACT_DEPTH_DESC,
      },
      include_images: { type: 'boolean', default: false, description: EXTRACT_INCLUDE_IMAGES_DESC },
      format: {
        type: 'string',
        enum: ['markdown', 'text'],
        default: 'markdown',
        description: EXTRACT_FORMAT_DESC,
      },
      include_favicon: { type: 'boolean', default: false, description: EXTRACT_INCLUDE_FAVICON_DESC },
      query: { type: 'string', default: '', description: EXTRACT_QUERY_DESC },
    },
  },
};

const crawlDescriptor: ToolDescriptor = {
  toolName: WEB_CRAWL_TOOL_NAME,
  description: CRAWL_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: CRAWL_TOOL_DESC,
    required: ['url'],
    properties: {
      url: { type: 'string', description: CRAWL_URL_DESC },
      max_depth: depthFrom(MAX_DEPTH_DESC),
      max_breadth: breadth,
      limit,
      instructions: { type: 'string', default: '', description: INSTRUCTIONS_DESC },
      select_paths: stringArray(SELECT_PATHS_DESC),
      select_domains: stringArray(SELECT_DOMAINS_DESC),
      allow_external: allowExternal,
      extract_depth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        default: 'basic',
        description: CRAWL_EXTRACT_DEPTH_DESC,
      },
      format: {
        type: 'string',
        enum: ['markdown', 'text'],
        default: 'markdown',
        description: CRAWL_FORMAT_DESC,
      },
      include_favicon: { type: 'boolean', default: false, description: CRAWL_INCLUDE_FAVICON_DESC },
    },
  },
};

const mapDescriptor: ToolDescriptor = {
  toolName: WEB_MAP_TOOL_NAME,
  description: MAP_TOOL_DESC,
  inputSchema: {
    type: 'object',
    description: MAP_TOOL_DESC,
    required: ['url'],
    properties: {
      url: { type: 'string', description: MAP_URL_DESC },
      max_depth: depthFrom(MAX_DEPTH_DESC),
      max_breadth: breadth,
      limit,
      instructions: { type: 'string', default: '', description: INSTRUCTIONS_DESC },
      select_paths: stringArray(SELECT_PATHS_DESC),
      select_domains: stringArray(SELECT_DOMAINS_DESC),
      allow_external: allowExternal,
    },
  },
};

export const WEB_DESCRIPTORS: ToolDescriptor[] = [
  searchDescriptor,
  extractDescriptor,
  crawlDescriptor,
  mapDescriptor,
];
