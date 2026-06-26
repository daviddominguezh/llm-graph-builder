# `openflow/web` Builtin Tool Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a builtin tool group `web` (provider id `web`, "OpenFlow/Web") exposing four web tools — `search`, `extract`, `crawl`, `map` — that wrap Tavily's REST API behind our own `WebSearchService` abstraction so the provider can be swapped later.

**Architecture:** A standard builtin provider in `packages/api/src/providers/web/` declares the tool schemas (copied from Tavily's MCP tool schemas, `tavily_` prefix stripped) and builds AI-SDK tools that call a `WebSearchService` resolved from `ctx.services('web')`. The only Tavily-aware code is a pure, fetch-injected client (`makeTavilyWebService`) — itself isolated to one module. The edge function (`supabase/functions/execute-agent/`) constructs that client from `TAVILY_API_KEY` (a Supabase secret) and wires it into the per-execution bundle, exactly as `calendar`/`kv` wire their services today.

**Tech Stack:** TypeScript (ESM, NodeNext), Zod for input validation, the AI SDK tool adapter, Jest (API package tests), Deno (edge function runtime).

## Global Constraints

- ESLint (do not disable, no `eslint-disable`): `max-lines-per-function` 40, `max-lines` 300/file, `max-depth` 2. When near a limit, extract helpers or split files — never compress lines.
- TypeScript strict, `noUncheckedIndexedAccess` on. **Never** use `any` — explicit types only.
- ESM: every relative import ends in `.js` (NodeNext), even for `.ts` sources.
- Prettier: single quotes, 2-space indent, 110 print width, trailing comma es5.
- Always add translations for user-facing text. The Jest test `packages/web/app/lib/__tests__/toolCatalog.test.ts` fails CI unless `messages/en.json` has `toolCatalog.web.groupName` plus a description and every-param entry for each of the four tools.
- Tool input schemas are the Tavily MCP schemas with the `tavily_` prefix removed (names `search`/`extract`/`crawl`/`map`). LLM-facing names become `web__search` etc. automatically.
- The Tavily client **always** sends `include_usage: true` on every request; it is never an agent-facing parameter.
- Never run DB resets/migrations or `git stash`; stage files explicitly (no `git commit -a/-am`).

---

## File Structure

**Create (API package, `packages/api/src/providers/web/`):**
- `schemas.ts` — Zod input schemas + inferred input types (no defaults; only provided params are forwarded).
- `types.ts` — `WebSearchService` interface, `WebProviderServices` bundle type, `isWebProviderServices` guard.
- `tavilyClient.ts` — `makeTavilyWebService(cfg)` — the only Tavily-aware module; pure, fetch-injected.
- `descriptions.ts` — LLM-facing description strings (tool + params).
- `descriptors.ts` — tool-name constants and `WEB_DESCRIPTORS: ToolDescriptor[]` (raw JSON Schemas for the registry/UI).
- `buildTools.ts` — `buildWebTools` (validate → call service → log usage → return verbatim).
- `index.ts` — `webProvider` export.
- `buildTools.test.ts`, `tavilyClient.test.ts`, `descriptors.test.ts` — tests.

**Modify (API package):**
- `src/providers/types.ts` — add `'upstream_error'` to `ToolErrorCode`.
- `src/providers/bundles.ts` — add `'web'` to the id union, the id array, and `BuiltinBundles`.
- `src/providers/index.ts` — register `webProvider`; export web types + `makeTavilyWebService`.
- `src/index.ts` — re-export `WebSearchService`, `WebProviderServices`, `TavilyConfig`, `makeTavilyWebService`.

**Modify (edge function, `supabase/functions/execute-agent/`):**
- Create `webServices.ts` — `makeWebService()` reads `Deno.env`, returns `WebProviderServices | undefined`.
- `toolBuilder.ts` — add `prepareWebBundle` and the `web` entry in `PREPARERS`.

**Modify (web package):**
- `packages/web/messages/en.json` — add the `toolCatalog.web` block.

---

## Task 1: Tavily client + service contract

**Files:**
- Create: `packages/api/src/providers/web/schemas.ts`
- Create: `packages/api/src/providers/web/types.ts`
- Create: `packages/api/src/providers/web/tavilyClient.ts`
- Modify: `packages/api/src/providers/types.ts` (add `'upstream_error'`)
- Test: `packages/api/src/providers/web/tavilyClient.test.ts`

**Interfaces:**
- Produces: `webSearchInput`/`webExtractInput`/`webCrawlInput`/`webMapInput` (Zod) and types `WebSearchInput`/`WebExtractInput`/`WebCrawlInput`/`WebMapInput`; `WebSearchService` (methods `search`/`extract`/`crawl`/`map`, each `(input) => Promise<unknown>`); `WebProviderServices = { service: WebSearchService }`; `isWebProviderServices(v): v is WebProviderServices`; `TavilyConfig`, `TavilyFetch`, `TavilyHttpResponse`, `makeTavilyWebService(cfg): WebSearchService`.

- [ ] **Step 1: Add the `upstream_error` ToolError code**

In `packages/api/src/providers/types.ts`, extend the union (around line 8-15):

```typescript
export type ToolErrorCode =
  | 'no_store_bound'
  | 'protected_key'
  | 'key_too_long'
  | 'value_too_large'
  | 'invalid_pattern'
  | 'pattern_timeout'
  | 'tenant_not_allowed'
  | 'upstream_error';
```

- [ ] **Step 2: Create the Zod input schemas**

Create `packages/api/src/providers/web/schemas.ts`. Fields are `.optional()` with **no defaults** so only parameters the LLM actually supplies are forwarded to Tavily (Tavily applies its own server-side defaults).

```typescript
import { z } from 'zod';

export const webSearchInput = z.object({
  query: z.string().min(1),
  max_results: z.number().int().optional(),
  search_depth: z.enum(['basic', 'advanced', 'fast', 'ultra-fast']).optional(),
  topic: z.literal('general').optional(),
  time_range: z.enum(['day', 'week', 'month', 'year']).nullable().optional(),
  include_images: z.boolean().optional(),
  include_image_descriptions: z.boolean().optional(),
  include_raw_content: z.boolean().optional(),
  include_domains: z.array(z.string()).optional(),
  exclude_domains: z.array(z.string()).optional(),
  country: z.string().optional(),
  include_favicon: z.boolean().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  exact_match: z.boolean().nullable().optional(),
});

export const webExtractInput = z.object({
  urls: z.array(z.string()).min(1),
  extract_depth: z.enum(['basic', 'advanced']).optional(),
  include_images: z.boolean().optional(),
  format: z.enum(['markdown', 'text']).optional(),
  include_favicon: z.boolean().optional(),
  query: z.string().optional(),
});

export const webCrawlInput = z.object({
  url: z.string().min(1),
  max_depth: z.number().int().min(1).optional(),
  max_breadth: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
  instructions: z.string().optional(),
  select_paths: z.array(z.string()).optional(),
  select_domains: z.array(z.string()).optional(),
  allow_external: z.boolean().optional(),
  extract_depth: z.enum(['basic', 'advanced']).optional(),
  format: z.enum(['markdown', 'text']).optional(),
  include_favicon: z.boolean().optional(),
});

export const webMapInput = z.object({
  url: z.string().min(1),
  max_depth: z.number().int().min(1).optional(),
  max_breadth: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
  instructions: z.string().optional(),
  select_paths: z.array(z.string()).optional(),
  select_domains: z.array(z.string()).optional(),
  allow_external: z.boolean().optional(),
});

export type WebSearchInput = z.infer<typeof webSearchInput>;
export type WebExtractInput = z.infer<typeof webExtractInput>;
export type WebCrawlInput = z.infer<typeof webCrawlInput>;
export type WebMapInput = z.infer<typeof webMapInput>;
```

- [ ] **Step 3: Create the service contract**

Create `packages/api/src/providers/web/types.ts`:

```typescript
import type { WebCrawlInput, WebExtractInput, WebMapInput, WebSearchInput } from './schemas.js';

/**
 * Provider-neutral web tools contract. The swap-seam: any implementation of
 * this interface (Tavily today, our own infra later) is a drop-in. Each method
 * returns the upstream JSON verbatim.
 */
export interface WebSearchService {
  search: (input: WebSearchInput) => Promise<unknown>;
  extract: (input: WebExtractInput) => Promise<unknown>;
  crawl: (input: WebCrawlInput) => Promise<unknown>;
  map: (input: WebMapInput) => Promise<unknown>;
}

export interface WebProviderServices {
  service: WebSearchService;
}

export function isWebProviderServices(v: unknown): v is WebProviderServices {
  if (typeof v !== 'object' || v === null || !('service' in v)) return false;
  const { service } = v as { service: unknown };
  return (
    typeof service === 'object' &&
    service !== null &&
    'search' in service &&
    typeof (service as { search: unknown }).search === 'function'
  );
}
```

- [ ] **Step 4: Write the failing test for the Tavily client**

Create `packages/api/src/providers/web/tavilyClient.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';

import { ToolError } from '../types.js';
import { makeTavilyWebService, type TavilyFetch, type TavilyHttpResponse } from './tavilyClient.js';

function okResponse(body: unknown): TavilyHttpResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') };
}

interface Captured {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
}

function recordingFetch(body: unknown): { fetchImpl: TavilyFetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl: TavilyFetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(okResponse(body));
  };
  return { fetchImpl, calls };
}

describe('makeTavilyWebService', () => {
  it('posts to the right URL with bearer auth and always sets include_usage', async () => {
    const { fetchImpl, calls } = recordingFetch({ results: [], usage: { credits: 1 } });
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl });

    await svc.search({ query: 'hello' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.tavily.com/search');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers.Authorization).toBe('Bearer k');
    const sent = JSON.parse(calls[0]?.init.body ?? '{}') as Record<string, unknown>;
    expect(sent.query).toBe('hello');
    expect(sent.include_usage).toBe(true);
  });

  it('returns the upstream JSON verbatim', async () => {
    const payload = { results: [{ url: 'u' }], usage: { credits: 2 } };
    const { fetchImpl } = recordingFetch(payload);
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl });

    await expect(svc.extract({ urls: ['https://x'] })).resolves.toEqual(payload);
  });

  it('throws ToolError(upstream_error) on non-2xx', async () => {
    const fetchImpl: TavilyFetch = () =>
      Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve('rate limited'),
      });
    const svc = makeTavilyWebService({ apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl });

    await expect(svc.map({ url: 'https://x' })).rejects.toBeInstanceOf(ToolError);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=tavilyClient`
Expected: FAIL — cannot find module `./tavilyClient.js`.

- [ ] **Step 6: Implement the Tavily client**

Create `packages/api/src/providers/web/tavilyClient.ts`:

```typescript
import { ToolError } from '../types.js';
import type { WebSearchService } from './types.js';

export interface TavilyHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export type TavilyFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<TavilyHttpResponse>;

export interface TavilyConfig {
  apiKey: string;
  baseUrl: string;
  fetchImpl: TavilyFetch;
}

const ERROR_BODY_MAX = 300;

async function callTavily(cfg: TavilyConfig, endpoint: string, args: object): Promise<unknown> {
  const res = await cfg.fetchImpl(`${cfg.baseUrl}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    // include_usage is ALWAYS set so every response carries cost/usage data.
    body: JSON.stringify({ ...args, include_usage: true }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ToolError(
      'upstream_error',
      `web ${endpoint} failed: HTTP ${String(res.status)} ${detail.slice(0, ERROR_BODY_MAX)}`
    );
  }
  return await res.json();
}

export function makeTavilyWebService(cfg: TavilyConfig): WebSearchService {
  return {
    search: async (input) => await callTavily(cfg, 'search', input),
    extract: async (input) => await callTavily(cfg, 'extract', input),
    crawl: async (input) => await callTavily(cfg, 'crawl', input),
    map: async (input) => await callTavily(cfg, 'map', input),
  };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=tavilyClient`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/providers/types.ts packages/api/src/providers/web/schemas.ts packages/api/src/providers/web/types.ts packages/api/src/providers/web/tavilyClient.ts packages/api/src/providers/web/tavilyClient.test.ts
git commit -m "feat(web): Tavily REST client behind WebSearchService contract"
```

---

## Task 2: Tool descriptions + descriptors

**Files:**
- Create: `packages/api/src/providers/web/descriptions.ts`
- Create: `packages/api/src/providers/web/descriptors.ts`
- Test: `packages/api/src/providers/web/descriptors.test.ts`

**Interfaces:**
- Consumes: `ToolDescriptor` from `../provider.js`, `RawJsonSchema` from `../types.js`.
- Produces: tool-name constants `WEB_SEARCH_TOOL_NAME='search'`, `WEB_EXTRACT_TOOL_NAME='extract'`, `WEB_CRAWL_TOOL_NAME='crawl'`, `WEB_MAP_TOOL_NAME='map'`; `WEB_DESCRIPTORS: ToolDescriptor[]`; and the description string consts used by Task 3.

- [ ] **Step 1: Create the description strings**

Create `packages/api/src/providers/web/descriptions.ts` (LLM-facing copy, taken from Tavily's MCP tool schemas):

```typescript
/* Tool descriptions */
export const SEARCH_TOOL_DESC =
  'Search the web for current information on any topic. Use for news, facts, or data beyond your knowledge cutoff. Returns snippets and source URLs.';
export const EXTRACT_TOOL_DESC =
  'Extract content from URLs. Returns raw page content in markdown or text format.';
export const CRAWL_TOOL_DESC =
  'Crawl a website starting from a URL. Extracts content from pages with configurable depth and breadth.';
export const MAP_TOOL_DESC =
  "Map a website's structure. Returns a list of URLs found starting from the base URL.";

/* search params */
export const SEARCH_QUERY_DESC = 'Search query';
export const SEARCH_MAX_RESULTS_DESC = 'The maximum number of search results to return';
export const SEARCH_DEPTH_DESC =
  "The depth of the search. 'basic' for generic results, 'advanced' for more thorough search, 'fast' for optimized low latency with high relevance, 'ultra-fast' for prioritizing latency above all else";
export const SEARCH_TOPIC_DESC =
  'The category of the search. This will determine which of our agents will be used for the search';
export const SEARCH_TIME_RANGE_DESC =
  'The time range back from the current date to include in the search results';
export const SEARCH_INCLUDE_IMAGES_DESC = 'Include a list of query-related images in the response';
export const SEARCH_INCLUDE_IMAGE_DESCRIPTIONS_DESC =
  'Include a list of query-related images and their descriptions in the response';
export const SEARCH_INCLUDE_RAW_CONTENT_DESC =
  'Include the cleaned and parsed HTML content of each search result';
export const SEARCH_INCLUDE_DOMAINS_DESC =
  'A list of domains to specifically include in the search results, if the user asks to search on specific sites set this to the domain of the site';
export const SEARCH_EXCLUDE_DOMAINS_DESC =
  'List of domains to specifically exclude, if the user asks to exclude a domain set this to the domain of the site';
export const SEARCH_COUNTRY_DESC =
  "Boost search results from a specific country. Must be a full country name (e.g., 'United States', 'Japan', 'Germany'). ISO country codes are not supported. Available only if topic is general.";
export const SEARCH_INCLUDE_FAVICON_DESC = 'Whether to include the favicon URL for each result';
export const SEARCH_START_DATE_DESC =
  'Will return all results after the specified start date (format YYYY-MM-DD).';
export const SEARCH_END_DATE_DESC =
  'Will return all results before the specified end date (format YYYY-MM-DD).';
export const SEARCH_EXACT_MATCH_DESC =
  'Only return results containing the exact phrase(s) in quotes in your query';

/* extract params */
export const EXTRACT_URLS_DESC = 'List of URLs to extract content from';
export const EXTRACT_DEPTH_DESC = "Use 'advanced' for LinkedIn, protected sites, or tables/embedded content";
export const EXTRACT_INCLUDE_IMAGES_DESC = 'Include images from pages';
export const EXTRACT_FORMAT_DESC = 'Output format';
export const EXTRACT_INCLUDE_FAVICON_DESC = 'Include favicon URLs';
export const EXTRACT_QUERY_DESC = 'Query to rerank content chunks by relevance';

/* crawl + map shared params */
export const CRAWL_URL_DESC = 'The root URL to begin the crawl';
export const MAP_URL_DESC = 'The root URL to begin the mapping';
export const MAX_DEPTH_DESC =
  'Max depth of the crawl. Defines how far from the base URL the crawler can explore.';
export const MAX_BREADTH_DESC = 'Max number of links to follow per level of the tree (i.e., per page)';
export const LIMIT_DESC = 'Total number of links the crawler will process before stopping';
export const INSTRUCTIONS_DESC =
  'Natural language instructions for the crawler. Specify which types of pages to return.';
export const SELECT_PATHS_DESC =
  'Regex patterns to select only URLs with specific path patterns (e.g., /docs/.*, /api/v1.*)';
export const SELECT_DOMAINS_DESC =
  'Regex patterns to restrict crawling to specific domains or subdomains (e.g., ^docs\\.example\\.com$)';
export const ALLOW_EXTERNAL_DESC = 'Whether to return external links in the final response';
export const CRAWL_EXTRACT_DEPTH_DESC =
  'Advanced extraction retrieves more data, including tables and embedded content, with higher success but may increase latency';
export const CRAWL_FORMAT_DESC =
  'The format of the extracted web page content: markdown or plain text (text may increase latency).';
export const CRAWL_INCLUDE_FAVICON_DESC = 'Whether to include the favicon URL for each result';
```

- [ ] **Step 2: Write the failing test for descriptors**

Create `packages/api/src/providers/web/descriptors.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';

import { WEB_DESCRIPTORS } from './descriptors.js';

describe('WEB_DESCRIPTORS', () => {
  it('declares exactly the four tools by name', () => {
    expect(WEB_DESCRIPTORS.map((d) => d.toolName)).toEqual(['search', 'extract', 'crawl', 'map']);
  });

  it('marks the required field per tool', () => {
    const byName = new Map(WEB_DESCRIPTORS.map((d) => [d.toolName, d]));
    expect(byName.get('search')?.inputSchema.required).toEqual(['query']);
    expect(byName.get('extract')?.inputSchema.required).toEqual(['urls']);
    expect(byName.get('crawl')?.inputSchema.required).toEqual(['url']);
    expect(byName.get('map')?.inputSchema.required).toEqual(['url']);
  });

  it('exposes the search parameter surface', () => {
    const search = WEB_DESCRIPTORS.find((d) => d.toolName === 'search');
    const props = Object.keys(search?.inputSchema.properties ?? {});
    expect(props).toContain('query');
    expect(props).toContain('search_depth');
    expect(props).toContain('exact_match');
    expect(props).not.toContain('include_usage');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=web/descriptors`
Expected: FAIL — cannot find module `./descriptors.js`.

- [ ] **Step 4: Implement the descriptors**

Create `packages/api/src/providers/web/descriptors.ts`:

```typescript
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
  SEARCH_INCLUDE_IMAGE_DESCRIPTIONS_DESC,
  SEARCH_INCLUDE_IMAGES_DESC,
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

const stringArray = (description: string): RawJsonSchema => ({
  type: 'array',
  items: { type: 'string' },
  default: [],
  description,
});
const depthFrom = (description: string): RawJsonSchema => ({
  type: 'integer',
  minimum: 1,
  default: 1,
  description,
});
const breadth: RawJsonSchema = { type: 'integer', minimum: 1, default: 20, description: MAX_BREADTH_DESC };
const limit: RawJsonSchema = { type: 'integer', minimum: 1, default: 50, description: LIMIT_DESC };
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
      max_results: { type: 'integer', default: 5, description: SEARCH_MAX_RESULTS_DESC },
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
      extract_depth: { type: 'string', enum: ['basic', 'advanced'], default: 'basic', description: EXTRACT_DEPTH_DESC },
      include_images: { type: 'boolean', default: false, description: EXTRACT_INCLUDE_IMAGES_DESC },
      format: { type: 'string', enum: ['markdown', 'text'], default: 'markdown', description: EXTRACT_FORMAT_DESC },
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
      extract_depth: { type: 'string', enum: ['basic', 'advanced'], default: 'basic', description: CRAWL_EXTRACT_DEPTH_DESC },
      format: { type: 'string', enum: ['markdown', 'text'], default: 'markdown', description: CRAWL_FORMAT_DESC },
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=web/descriptors`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/providers/web/descriptions.ts packages/api/src/providers/web/descriptors.ts packages/api/src/providers/web/descriptors.test.ts
git commit -m "feat(web): tool descriptions and registry descriptors"
```

---

## Task 3: buildTools + provider

**Files:**
- Create: `packages/api/src/providers/web/buildTools.ts`
- Create: `packages/api/src/providers/web/index.ts`
- Test: `packages/api/src/providers/web/buildTools.test.ts`

**Interfaces:**
- Consumes: `webProvider` deps from Tasks 1-2; `ProviderCtx`, `BuiltinProvider`, `ToolDescriptor`, `OpenFlowTool`.
- Produces: `buildWebTools({ toolNames, ctx })`; `webProvider: BuiltinProvider<'web', typeof TOOL_NAMES>`.

- [ ] **Step 1: Write the failing test for buildWebTools**

Create `packages/api/src/providers/web/buildTools.test.ts`:

```typescript
import { describe, expect, it, jest } from '@jest/globals';

import type { ProviderCtx } from '../provider.js';
import { buildWebTools } from './buildTools.js';
import type { WebSearchService } from './types.js';

function fakeService(): { service: WebSearchService; calls: unknown[] } {
  const calls: unknown[] = [];
  const record = (name: string) => (input: unknown) => {
    calls.push({ name, input });
    return Promise.resolve({ ok: name, usage: { credits: 1 } });
  };
  return {
    calls,
    service: { search: record('search'), extract: record('extract'), crawl: record('crawl'), map: record('map') },
  };
}

function ctxWith(serviceBundle: unknown): ProviderCtx {
  const noop = () => undefined;
  const logger = { info: noop, warn: noop, error: noop, help: noop, data: noop, debug: noop, prompt: noop, http: noop, verbose: noop, input: noop, silly: noop } as unknown as ProviderCtx['logger'];
  return {
    orgId: 'o', tenantId: 't', agentId: 'a', isChildAgent: false, logger,
    oauthTokens: new Map(), mcpServers: new Map(),
    services: ((id: string) => (id === 'web' ? serviceBundle : undefined)) as ProviderCtx['services'],
  };
}

describe('buildWebTools', () => {
  it('builds the requested tools and forwards validated args verbatim', async () => {
    const { service, calls } = fakeService();
    const tools = await buildWebTools({ toolNames: ['search'], ctx: ctxWith({ service }) });
    expect(Object.keys(tools)).toEqual(['search']);
    const result = await tools.search?.execute({ query: 'hi', max_results: 3 });
    expect(result).toEqual({ ok: 'search', usage: { credits: 1 } });
    expect(calls).toEqual([{ name: 'search', input: { query: 'hi', max_results: 3 } }]);
  });

  it('returns an empty map when no web service is bound', async () => {
    const tools = await buildWebTools({ toolNames: ['search', 'extract'], ctx: ctxWith(undefined) });
    expect(tools).toEqual({});
  });

  it('rejects invalid args via the zod schema', async () => {
    const { service } = fakeService();
    const tools = await buildWebTools({ toolNames: ['search'], ctx: ctxWith({ service }) });
    await expect(tools.search?.execute({})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=web/buildTools`
Expected: FAIL — cannot find module `./buildTools.js`.

- [ ] **Step 3: Implement buildTools**

Create `packages/api/src/providers/web/buildTools.ts`:

```typescript
import type { z } from 'zod';

import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';
import { CRAWL_TOOL_DESC, EXTRACT_TOOL_DESC, MAP_TOOL_DESC, SEARCH_TOOL_DESC } from './descriptions.js';
import {
  WEB_CRAWL_TOOL_NAME,
  WEB_EXTRACT_TOOL_NAME,
  WEB_MAP_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from './descriptors.js';
import { webCrawlInput, webExtractInput, webMapInput, webSearchInput } from './schemas.js';
import { isWebProviderServices, type WebSearchService } from './types.js';

type WebToolName =
  | typeof WEB_SEARCH_TOOL_NAME
  | typeof WEB_EXTRACT_TOOL_NAME
  | typeof WEB_CRAWL_TOOL_NAME
  | typeof WEB_MAP_TOOL_NAME;

interface WebToolCtx {
  service: WebSearchService;
  logger: ProviderCtx['logger'];
}

function logUsage(ctx: WebToolCtx, tool: string, result: unknown): void {
  if (typeof result === 'object' && result !== null && 'usage' in result) {
    ctx.logger.info(`[web] ${tool} usage`, (result as { usage: unknown }).usage);
  }
}

type Caller<S extends z.ZodType> = (input: z.infer<S>) => Promise<unknown>;

function makeTool<S extends z.ZodType>(
  ctx: WebToolCtx,
  description: string,
  schema: S,
  toolKey: string,
  call: Caller<S>
): OpenFlowTool {
  return {
    description,
    inputSchema: schema,
    execute: async (args: unknown) => {
      const input = schema.parse(args) as z.infer<S>;
      const result = await call(input);
      logUsage(ctx, toolKey, result);
      return result;
    },
  };
}

function buildAll(ctx: WebToolCtx): Record<WebToolName, OpenFlowTool> {
  return {
    [WEB_SEARCH_TOOL_NAME]: makeTool(ctx, SEARCH_TOOL_DESC, webSearchInput, 'search', (i) => ctx.service.search(i)),
    [WEB_EXTRACT_TOOL_NAME]: makeTool(ctx, EXTRACT_TOOL_DESC, webExtractInput, 'extract', (i) => ctx.service.extract(i)),
    [WEB_CRAWL_TOOL_NAME]: makeTool(ctx, CRAWL_TOOL_DESC, webCrawlInput, 'crawl', (i) => ctx.service.crawl(i)),
    [WEB_MAP_TOOL_NAME]: makeTool(ctx, MAP_TOOL_DESC, webMapInput, 'map', (i) => ctx.service.map(i)),
  };
}

const WEB_TOOL_NAMES: readonly string[] = [
  WEB_SEARCH_TOOL_NAME,
  WEB_EXTRACT_TOOL_NAME,
  WEB_CRAWL_TOOL_NAME,
  WEB_MAP_TOOL_NAME,
];

function isWebToolName(s: string): s is WebToolName {
  return WEB_TOOL_NAMES.includes(s);
}

function pickTools(
  all: Record<WebToolName, OpenFlowTool>,
  names: string[]
): Partial<Record<WebToolName, OpenFlowTool>> {
  const out: Partial<Record<WebToolName, OpenFlowTool>> = {};
  for (const name of names) {
    if (!isWebToolName(name)) continue;
    const { [name]: tool } = all;
    out[name] = tool;
  }
  return out;
}

function narrowService(ctx: ProviderCtx): WebSearchService | undefined {
  const raw = ctx.services('web');
  return isWebProviderServices(raw) ? raw.service : undefined;
}

export async function buildWebTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Partial<Record<WebToolName, OpenFlowTool>>> {
  const service = narrowService(args.ctx);
  if (service === undefined) return await Promise.resolve({});
  const toolCtx: WebToolCtx = { service, logger: args.ctx.logger };
  return await Promise.resolve(pickTools(buildAll(toolCtx), args.toolNames));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=web/buildTools`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the provider**

Create `packages/api/src/providers/web/index.ts`:

```typescript
import type { BuiltinProvider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildWebTools } from './buildTools.js';
import {
  WEB_CRAWL_TOOL_NAME,
  WEB_DESCRIPTORS,
  WEB_EXTRACT_TOOL_NAME,
  WEB_MAP_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from './descriptors.js';

async function describeWebTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(WEB_DESCRIPTORS);
}

const TOOL_NAMES = [
  WEB_SEARCH_TOOL_NAME,
  WEB_EXTRACT_TOOL_NAME,
  WEB_CRAWL_TOOL_NAME,
  WEB_MAP_TOOL_NAME,
] as const;

export const webProvider: BuiltinProvider<'web', typeof TOOL_NAMES> = {
  type: 'builtin',
  id: 'web',
  displayName: 'OpenFlow/Web',
  description: 'Search the web, extract page content, and crawl or map sites.',
  toolNames: TOOL_NAMES,
  describeTools: describeWebTools,
  buildTools: buildWebTools,
};
```

> Note: `WEB_DESCRIPTORS` must be exported from `descriptors.ts` (it already is) and imported here alongside the tool-name constants.

- [ ] **Step 6: Run the test again (still passing) and commit**

Run: `npm run test -w packages/api -- --testPathPattern=web/buildTools`
Expected: PASS.

```bash
git add packages/api/src/providers/web/buildTools.ts packages/api/src/providers/web/index.ts packages/api/src/providers/web/buildTools.test.ts
git commit -m "feat(web): buildWebTools and webProvider"
```

---

## Task 4: Register the provider in the API package

**Files:**
- Modify: `packages/api/src/providers/bundles.ts`
- Modify: `packages/api/src/providers/index.ts`
- Modify: `packages/api/src/index.ts`

**Interfaces:**
- Consumes: `webProvider`, `WebProviderServices`, `WebSearchService`, `makeTavilyWebService`, `TavilyConfig`.
- Produces: `builtInProviders` now contains `web`; `BuiltinBundles.web`; root re-exports of the web types and `makeTavilyWebService` for the edge function.

- [ ] **Step 1: Extend bundles.ts**

In `packages/api/src/providers/bundles.ts`:

Add the import at the top (after the existing type imports):
```typescript
import type { WebProviderServices } from './web/types.js';
```

Add `'web'` to the union (line ~13):
```typescript
export type BuiltinProviderId =
  | 'kv_store'
  | 'rag'
  | 'forms'
  | 'lead_scoring'
  | 'calendar'
  | 'composition'
  | 'web';
```

Add `'web'` to the runtime array (line ~20-27):
```typescript
export const BUILTIN_PROVIDER_IDS: readonly BuiltinProviderId[] = [
  'kv_store',
  'rag',
  'forms',
  'lead_scoring',
  'calendar',
  'composition',
  'web',
] as const;
```

Add the bundle field to `BuiltinBundles` (line ~37-44):
```typescript
export interface BuiltinBundles {
  kv_store: KvStoreServices;
  rag: RagStoreServices;
  forms: FormsServices | undefined;
  lead_scoring: LeadScoringProviderServices | undefined;
  calendar: CalendarServices | undefined;
  composition: undefined;
  web: WebProviderServices | undefined;
}
```

- [ ] **Step 2: Register in providers/index.ts**

In `packages/api/src/providers/index.ts`:

Add the import (with the other provider imports):
```typescript
import { webProvider } from './web/index.js';
```

Add to `builtInEntries`:
```typescript
const builtInEntries: ReadonlyArray<readonly [string, Provider]> = [
  ['kv_store', kvStoreProvider],
  ['rag', ragProvider],
  ['calendar', calendarProvider],
  ['forms', formsProvider],
  ['lead_scoring', leadScoringProvider],
  ['composition', compositionProvider],
  ['web', webProvider],
];
```

Add exports at the bottom of the file:
```typescript
export type { WebSearchService, WebProviderServices } from './web/types.js';
export type { TavilyConfig, TavilyFetch, TavilyHttpResponse } from './web/tavilyClient.js';
export { makeTavilyWebService } from './web/tavilyClient.js';
```

- [ ] **Step 3: Re-export from the package root**

In `packages/api/src/index.ts`, add to the type-export block that ends at `} from './providers/index.js';` (the one listing `KvStoreServices` etc., lines ~155-180):
```typescript
  WebSearchService,
  WebProviderServices,
  TavilyConfig,
```

And add a value re-export next to `export { ToolError, isKvStoreServices, isRagStoreServices } from './providers/index.js';`:
```typescript
export { makeTavilyWebService } from './providers/index.js';
```

- [ ] **Step 4: Typecheck and run the API test suite**

Run: `npm run typecheck -w packages/api`
Expected: PASS (no errors).

Run: `npm run test -w packages/api`
Expected: PASS. The existing provider backstop test now sees `web` in `builtInProviders` and confirms its id is in `BUILTIN_PROVIDER_IDS` and its tuple matches the descriptors.

- [ ] **Step 5: Build the API package (the edge function imports its dist)**

Run: `npm run build -w packages/api`
Expected: builds `packages/api/dist` with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/providers/bundles.ts packages/api/src/providers/index.ts packages/api/src/index.ts
git commit -m "feat(web): register web provider and export Tavily client"
```

---

## Task 5: Add translations

**Files:**
- Modify: `packages/web/messages/en.json`
- Test: `packages/web/app/lib/__tests__/toolCatalog.test.ts` (existing — must pass)

**Interfaces:**
- Consumes: `builtInProviders` (now includes `web`) — the test walks every descriptor param and requires a matching key.

- [ ] **Step 1: Run the catalog test to verify it fails for `web`**

Run: `npm run test -w packages/web -- --testPathPattern=toolCatalog`
Expected: FAIL — lists missing `toolCatalog.web.*` keys (groupName + every tool/param).

- [ ] **Step 2: Add the `toolCatalog.web` block**

In `packages/web/messages/en.json`, add a `"web"` entry inside the `"toolCatalog"` object (sibling of `"kv_store"`). Every parameter that appears in the descriptors must have a key:

```json
"web": {
  "groupName": "Web",
  "tools": {
    "search": {
      "description": "Search the web for current information — news, facts, or anything beyond the model's knowledge cutoff. Returns snippets and source URLs.",
      "params": {
        "query": "What to search for.",
        "max_results": "Maximum number of results to return. Defaults to 5.",
        "search_depth": "Search thoroughness: basic, advanced, fast, or ultra-fast. Defaults to basic.",
        "topic": "Search category. Currently fixed to 'general'.",
        "time_range": "Restrict results to the last day, week, month, or year.",
        "include_images": "Include query-related images in the response.",
        "include_image_descriptions": "Include descriptions alongside any returned images.",
        "include_raw_content": "Include the cleaned, parsed page content of each result.",
        "include_domains": "Only return results from these domains.",
        "exclude_domains": "Never return results from these domains.",
        "country": "Boost results from a specific country (full country name, e.g. 'Germany').",
        "include_favicon": "Include each result's favicon URL.",
        "start_date": "Only results on or after this date (YYYY-MM-DD).",
        "end_date": "Only results on or before this date (YYYY-MM-DD).",
        "exact_match": "Only return results containing the exact quoted phrase(s) in the query."
      }
    },
    "extract": {
      "description": "Extract the content of specific URLs as markdown or plain text.",
      "params": {
        "urls": "The URLs to extract content from.",
        "extract_depth": "Extraction thoroughness: basic, or advanced for protected sites and embedded content. Defaults to basic.",
        "include_images": "Include images found on the pages.",
        "format": "Output format: markdown or text. Defaults to markdown.",
        "include_favicon": "Include each page's favicon URL.",
        "query": "Optional query used to rerank extracted content by relevance."
      }
    },
    "crawl": {
      "description": "Crawl a website from a starting URL, extracting page content with configurable depth and breadth.",
      "params": {
        "url": "The root URL to begin crawling.",
        "max_depth": "How far from the root URL to crawl (1–5). Defaults to 1.",
        "max_breadth": "Maximum links followed per page level. Defaults to 20.",
        "limit": "Total number of links to process before stopping. Defaults to 50.",
        "instructions": "Natural-language guidance on which pages to return.",
        "select_paths": "Regex patterns; only crawl URLs whose path matches.",
        "select_domains": "Regex patterns; only crawl matching domains or subdomains.",
        "allow_external": "Whether to include links to external domains. Defaults to true.",
        "extract_depth": "Extraction thoroughness: basic or advanced. Defaults to basic.",
        "format": "Output format: markdown or text. Defaults to markdown.",
        "include_favicon": "Include each result's favicon URL."
      }
    },
    "map": {
      "description": "Map a website's structure, returning the URLs discovered from a starting URL.",
      "params": {
        "url": "The root URL to begin mapping.",
        "max_depth": "How far from the root URL to map (1–5). Defaults to 1.",
        "max_breadth": "Maximum links followed per page level. Defaults to 20.",
        "limit": "Total number of links to process before stopping. Defaults to 50.",
        "instructions": "Natural-language guidance for the crawler.",
        "select_paths": "Regex patterns; only include URLs whose path matches.",
        "select_domains": "Regex patterns; only include matching domains or subdomains.",
        "allow_external": "Whether to include links to external domains. Defaults to true."
      }
    }
  }
}
```

- [ ] **Step 3: Run the catalog test to verify it passes**

Run: `npm run test -w packages/web -- --testPathPattern=toolCatalog`
Expected: PASS — `has translations for every tool + param of "web"`.

- [ ] **Step 4: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat(web): tool-catalog translations for the web group"
```

---

## Task 6: Wire the Tavily service into the edge function

**Files:**
- Create: `supabase/functions/execute-agent/webServices.ts`
- Modify: `supabase/functions/execute-agent/toolBuilder.ts`

**Interfaces:**
- Consumes: `makeTavilyWebService`, `WebProviderServices`, `BuiltinBundles`, `BuiltinProviderId` from `@daviddh/llm-graph-runner`.
- Produces: `makeWebService(): WebProviderServices | undefined`; a `web` entry in the edge `PREPARERS` map (required — the map is exhaustive over `BuiltinProviderId`, so the edge will not typecheck without it once Task 4 adds `web` to the union).

- [ ] **Step 1: Create the edge service factory**

Create `supabase/functions/execute-agent/webServices.ts`:

```typescript
// Deno-side WebSearchService factory. Reads the Tavily key from the
// environment (a Supabase secret) and builds the provider-neutral
// WebSearchService backed by Tavily's REST API. Returns undefined when no
// key is configured, so the web tools simply do not materialize.
import type { WebProviderServices } from '@daviddh/llm-graph-runner';
import { makeTavilyWebService } from '@daviddh/llm-graph-runner';

const DEFAULT_BASE_URL = 'https://api.tavily.com';

export function makeWebService(): WebProviderServices | undefined {
  const apiKey = Deno.env.get('TAVILY_API_KEY') ?? '';
  if (apiKey === '') return undefined;
  const baseUrl = Deno.env.get('TAVILY_API_BASE_URL') ?? DEFAULT_BASE_URL;
  return { service: makeTavilyWebService({ apiKey, baseUrl, fetchImpl: fetch }) };
}
```

- [ ] **Step 2: Add the preparer in toolBuilder.ts**

In `supabase/functions/execute-agent/toolBuilder.ts`:

Add the import near the other local imports (alongside `./storeServices.ts`):
```typescript
import { makeWebService } from './webServices.ts';
```

Add a preparer function in the "Per-provider preparers" section (next to `prepareCalendarBundle`):
```typescript
function prepareWebBundle(): Promise<BuiltinBundles['web']> {
  return Promise.resolve(makeWebService());
}
```

Add the `web` entry to the `PREPARERS` map:
```typescript
const PREPARERS: { [K in BuiltinProviderId]: BundlePreparer<K> } = {
  kv_store: (payload, supabase) => prepareKvBundle(payload, supabase),
  rag: (payload, supabase) => prepareRagBundle(payload, supabase),
  forms: (payload) => prepareFormsBundle(payload),
  lead_scoring: (payload) => prepareLeadScoringBundle(payload),
  calendar: (payload) => prepareCalendarBundle(payload),
  composition: () => prepareCompositionBundle(),
  web: () => prepareWebBundle(),
};
```

- [ ] **Step 3: Typecheck the edge function**

Run: `cd supabase/functions/execute-agent && deno check index.ts && cd -`
Expected: PASS (`Check file://.../index.ts` with no errors). This resolves `@daviddh/llm-graph-runner` against the dist built in Task 4, so the new `web` exports and the exhaustive `PREPARERS` map both typecheck.

> If `deno` is unavailable in the environment, note it and rely on Task 7's `npm run check` for the TS packages; the edge wiring still follows the exact `BuiltinBundles['web']` and `BundlePreparer<'web'>` types from the runner.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/execute-agent/webServices.ts supabase/functions/execute-agent/toolBuilder.ts
git commit -m "feat(web): wire Tavily web service into edge bundle preparers"
```

---

## Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full check**

Run: `npm run check`
Expected: format, lint, and typecheck all PASS across packages.

- [ ] **Step 2: Run the full API + web test suites**

Run: `npm run test -w packages/api`
Expected: PASS (includes `tavilyClient`, `web/descriptors`, `web/buildTools`, and the provider backstop test).

Run: `npm run test -w packages/web -- --testPathPattern=toolCatalog`
Expected: PASS.

- [ ] **Step 3: Confirm the deployment secret is documented**

Confirm `TAVILY_API_KEY` must be set as a Supabase Edge Function secret for the tools to materialize at runtime (optionally `TAVILY_API_BASE_URL`). This is the only operational prerequisite. No code change — note it in the PR description.

- [ ] **Step 4: Final commit (if any formatting changed)**

```bash
git add -A
git commit -m "chore(web): formatting after full check" || echo "nothing to commit"
```

> Note: only run the `git add -A` here if `npm run check` reformatted files in this feature; if other unrelated in-flight changes are present in the working tree, stage the specific web feature files instead.

---

## Self-Review Notes

- **Spec coverage:** four tools (search/extract/crawl/map) ✓ Task 2-3; MCP-derived schemas, `tavily_` stripped ✓ Task 2; verbatim outputs ✓ Task 3 (execute returns service result directly); `WebSearchService` swap-seam ✓ Task 1; edge-direct connection with `TAVILY_API_KEY` from `Deno.env` ✓ Task 6; `include_usage` always injected ✓ Task 1 + tested; usage logged ✓ Task 3; registry wiring ✓ Task 4; translations ✓ Task 5; `research` deferred (not implemented) ✓.
- **Type consistency:** `WebSearchService` (interface) and `WebProviderServices` (bundle `{ service }`) used consistently across Tasks 1/3/4/6. Tool-name constants resolve to `search`/`extract`/`crawl`/`map`. `'upstream_error'` added to `ToolErrorCode` (Task 1) before use in `tavilyClient` (Task 1).
- **Note on the spec's informal name:** the spec text referred to the bundle as `WebSearchServices`; this plan uses `WebProviderServices` to match the existing `LeadScoringProviderServices` convention. This is the authoritative name.
