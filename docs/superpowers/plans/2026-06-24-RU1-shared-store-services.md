# RU1 — shared-store-services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the four duplicated builtin store-service factories (KV, RAG, Forms, LeadScoring) into one portable `packages/shared-store-services` package, redesign KV+RAG agent search to a uniform opaque-cursor / match-count contract with ReDoS-safe `re2js` KV regex and always-on RAG rerank, and drop native `re2` plus the `/internal/regex/validate` hop.

**Architecture:** A new pure-JS/TS package (`@openflow/shared-store-services`) houses the supabase-js DB layer + factory logic for all four services, runnable in Node, Cloudflare Workers, and Deno. KV regex parses with `re2js`, extracts required literal substrings to drive a trigram-`ILIKE` prefilter, and otherwise runs a bounded keyset scan — the LLM-supplied regex never touches Postgres. RAG semantic/hybrid embed the query via the existing BE `/internal/embed` hop, vector-retrieve a bounded pool, always rerank via a new BE `/internal/rerank` hop, then cursor-paginate. All search modes expose `{ items, limit, nextCursor }` keyed by an opaque cursor (no offset/total). Backend and edge keep thin re-export shims during the transition.

**Tech Stack:** TypeScript (strict, NodeNext ESM), `@supabase/supabase-js`, `re2js` (pure-JS RE2 port), Jest (ESM via ts-jest), Express (BE internal routes), Next.js (FE dashboard), Zod (tool input schemas).

## Global Constraints

- Monorepo, npm workspaces. ESM, `"type":"module"`, NodeNext resolution.
- TypeScript strict, `noUncheckedIndexedAccess`. **Never use `any`. Never add eslint-disable.**
- ESLint: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2 — split into helper functions/files rather than compressing lines.
- Tests: Jest (ESM) — `npm run test -w packages/<pkg> -- --testPathPattern=…`. Full check: `npm run check` (format+lint+typecheck).
- Always add/maintain translations for any user-facing text change (here: removing the rerank checkbox means removing its i18n key `knowledgeBase.ragSearch.rerankLabel` + `knowledgeBase.ragSearch.rerankTooltip`).
- Prettier: single quotes, 2-space, width 110, trailing comma es5; `@trivago` import sorting.
- The new package must be portable: Node + Cloudflare Workers runtime + Deno (transition) — no native addons, only `@supabase/supabase-js` + `re2js` + pure JS.
- `re2js` API (verified, v2.8.3): `import { RE2JS } from 're2js'`; `RE2JS.compile(pattern)` throws `RE2JSSyntaxException` on bad patterns; compiled `.test(input)` is the unanchored linear-time DFA match (use this, not `.matcher().find()`); `RE2JS.CASE_INSENSITIVE` flag = 1. There is NO literal-extraction API — we implement our own literal extractor over the pattern string.
- Commit message trailer (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**New package `packages/shared-store-services/`**

- `package.json` — package manifest: name `@openflow/shared-store-services`, deps `@supabase/supabase-js` + `re2js`, scripts (build/lint/typecheck/format/check/test).
- `tsconfig.json` — strict NodeNext config mirroring `packages/api/tsconfig.json` (composite, declaration, noEmit for typecheck).
- `tsconfig.build.json` — emit config used by `build`.
- `jest.config.js` — ESM ts-jest config mirroring `packages/api/jest.config.js`.
- `src/index.ts` — package barrel: re-exports the four factories, the pagination codec/types, and the internal API client.
- `src/pagination.ts` — opaque-cursor codec (`encodeCursor`/`decodeCursor`) + `SearchPage<T>` + per-mode cursor payload types + scan/byte budget constants.
- `src/internalApiClient.ts` — portable client for `POST /internal/embed` and `POST /internal/rerank` (NOT regex). Config injected (base URL + master key).
- `src/kv/regexSearch.ts` — `re2js` compile + `extractRequiredLiterals()` + `matchEntry()` (pure, no DB).
- `src/kv/kvQueries.ts` — supabase-js KV queries: keyset list, keyset get-by-keys, ILIKE keyset prefilter, raw keyset scan page.
- `src/kv/kvStoreService.ts` — `makeKvStoreService()` factory: list/get/set/searchSubstring/searchRegex over cursor contract.
- `src/rag/ragQueries.ts` — supabase-js RAG queries: `rag_text_search`, `rag_semantic_search` RPC wrappers (keyset + pool retrieval).
- `src/rag/rerank.ts` — `rerankPool()`: calls `/internal/rerank`, reorders a candidate pool, always-on.
- `src/rag/ragStoreService.ts` — `makeRagStoreService()` factory: bm25/semantic/hybrid/regex → embed→pool→rerank→cursor-paginate.
- `src/forms/formsService.ts` — `makeFormsDbService()`: reads `conversations.metadata.forms[formId]` (ports edge `readFormDataFromMetadata`); implements `FormsService.getFormData`.
- `src/leadScoring/leadScoringService.ts` — `makeLeadScoringDbService()`: `conversations.metadata.lead_score` get + read-merge-write set (ports edge `setLeadScoreOnConversation`; no RPC, no migration).
- `src/__tests__/*.test.ts` — co-located per-feature test suites.

**Modified — `packages/api/`** (the LLM-facing contract)

- `src/providers/types.ts` — change `KvSearchArgs`/`KvRegexArgs`/`RagSearchArgs`/`RagRegexArgs` from `offset` → `cursor?: string`; replace `KvPagedResult<T>` consumption with `SearchPage<T>`; drop `total`/`truncated`. Add `SearchPage<T>` type (or re-export). Update `KvStoreServices`/`RagStoreServices` method signatures.
- `src/providers/kv_store/buildTools.ts` — search input: drop `offset`, add `cursor`; thread `cursor` to services.
- `src/providers/kv_store/descriptors.ts` — JSON-schema mirror: drop `offset` schema, add `cursor`.
- `src/providers/kv_store/descriptions.ts` — drop `OFFSET_DESC`/`total`/`truncated` copy; add `CURSOR_DESC` + `NEXT_CURSOR_DESC`.
- `src/providers/rag/buildTools.ts` — same offset→cursor change for RAG.
- `src/providers/rag/descriptors.ts` — same.
- `src/providers/rag/descriptions.ts` — same; update tool-level description's `{ items, total, offset, limit, truncated? }` to `{ items, limit, nextCursor }`.

**Modified — `packages/backend/`** (re-export shims + new rerank route)

- `src/routes/internal/utilityHandlers.ts` — add `handleRerank` (calls `rerankRecords`); remove `handleRegexValidate`.
- `src/routes/internal/internalRouter.ts` — add `POST /rerank`; remove `POST /regex/validate`.
- `src/server.ts` — allowlist `/internal/rerank`; remove `/internal/regex/validate`.
- `src/services/kvStoreService.ts` — becomes a re-export shim of `makeKvStoreService` from the new package.
- `src/services/ragStoreService.ts` — re-export shim of `makeRagStoreService`.
- `src/routes/ragStores/ragFiles/searchChunks.ts` — drop `rerank` param; hardcode rerank on (dashboard path).
- `src/routes/ragStores/ragFiles/hybridSearch.ts` — uses the shared `SearchParams` (rerank already removed there).
- `packages/backend/package.json` — remove `re2`; add `@openflow/shared-store-services`.
- `packages/shared-validation/package.json` + `src/kv/matcher.ts` — replace native `re2` with `re2js`.

**Modified — `supabase/functions/execute-agent/`** (edge re-export shims)

- `kvStoreServices.ts` / `ragStoreServices.ts` — re-export from the new package.
- `internalApiClient.ts` — remove `validateRegexPattern`; add `rerank` client; keep `embedText`.

**Modified — `packages/web/`** (FE rerank-toggle removal)

- `app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagSearchBar.tsx` — remove `RerankToggle` + props.
- `app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagTenantContent.tsx` — remove rerank state/props.
- `app/lib/ragFiles.ts` — remove `rerank?: boolean` from `SearchOptions` + `search()`.
- `messages/en.json` — remove `knowledgeBase.ragSearch.rerankLabel` + `rerankTooltip`; reword `description.hybrid`.

---

## Task 1: Package scaffold + pagination codec

Creates the package skeleton (manifest, tsconfig, jest) and the opaque-cursor codec + `SearchPage` type that every later task consumes. Folded together because the codec is the smallest independently testable deliverable and proves the build/test wiring works.

**Files:**
- Create: `packages/shared-store-services/package.json`
- Create: `packages/shared-store-services/tsconfig.json`
- Create: `packages/shared-store-services/tsconfig.build.json`
- Create: `packages/shared-store-services/jest.config.js`
- Create: `packages/shared-store-services/src/pagination.ts`
- Create: `packages/shared-store-services/src/index.ts`
- Test: `packages/shared-store-services/src/__tests__/pagination.test.ts`
- Modify: `tsconfig.json` (root references), `package.json` (root `check` script)

**Interfaces:**
- Produces: `export interface SearchPage<T> { items: T[]; limit: number; nextCursor: string | null }`
- Produces: `export function encodeCursor<P>(payload: P): string` — base64url-encodes `JSON.stringify(payload)`.
- Produces: `export function decodeCursor<P>(cursor: string): P` — inverse; throws `Error('invalid cursor')` on malformed input.
- Produces cursor payload types: `export interface KvKeysetCursor { lastKey: string }`, `export interface KvRegexScanCursor { lastKey: string }`, `export interface RagPoolCursor { poolIndex: number }`.
- Produces budget constants: `export const KV_SCAN_PAGE_SIZE = 500`, `export const KV_SCAN_ROW_BUDGET = 5000`, `export const KV_SCAN_BYTE_BUDGET = 4 * 1024 * 1024`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared-store-services/src/__tests__/pagination.test.ts`:

```ts
import { decodeCursor, encodeCursor, type KvKeysetCursor } from '../pagination.js';

describe('opaque cursor codec', () => {
  it('round-trips a payload', () => {
    const payload: KvKeysetCursor = { lastKey: 'user:42' };
    const token = encodeCursor(payload);
    expect(typeof token).toBe('string');
    expect(token).not.toContain('user:42'); // opaque, not plaintext
    expect(decodeCursor<KvKeysetCursor>(token)).toEqual(payload);
  });

  it('throws on a malformed cursor', () => {
    expect(() => decodeCursor('!!!not-base64!!!')).toThrow('invalid cursor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=pagination`
Expected: FAIL — package/module not found (`Cannot find module '../pagination.js'`).

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared-store-services/package.json`:

```json
{
  "name": "@openflow/shared-store-services",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "rm -rf dist tsconfig*.tsbuildinfo && tsc -p tsconfig.build.json",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"**/*.{js,ts,json}\"",
    "check": "npm run format && npm run lint && npm run typecheck",
    "test": "NODE_OPTIONS='--experimental-vm-modules' npx jest"
  },
  "files": ["dist", "README.md"],
  "license": "MIT",
  "engines": { "node": ">=18.0.0" },
  "dependencies": {
    "@daviddh/llm-graph-runner": "*",
    "@supabase/supabase-js": "^2.45.0",
    "re2js": "^2.8.3"
  }
}
```

Create `packages/shared-store-services/tsconfig.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "types": ["node", "jest"],
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../api" }]
}
```

Create `packages/shared-store-services/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false },
  "exclude": ["node_modules", "dist", "src/**/__tests__/**", "src/**/*.test.ts"]
}
```

Create `packages/shared-store-services/jest.config.js`:

```js
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json' }],
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/src/**/*.test.ts'],
  collectCoverage: false,
};
```

Create `packages/shared-store-services/src/pagination.ts`:

```ts
// Uniform opaque-cursor pagination primitives shared by every KV + RAG search
// mode. The LLM never sees the per-mode continuation — it round-trips an opaque
// token. `total`/`offset` are intentionally absent: forward-only paging by
// match count, "is there more?" == nextCursor != null.

export interface SearchPage<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
}

export interface KvKeysetCursor {
  lastKey: string;
}

export interface KvRegexScanCursor {
  lastKey: string;
}

export interface RagPoolCursor {
  poolIndex: number;
}

export const KV_SCAN_PAGE_SIZE = 500;
export const KV_SCAN_ROW_BUDGET = 5000;
export const KV_SCAN_BYTE_BUDGET = 4 * 1024 * 1024;

const INVALID_CURSOR = 'invalid cursor';

export function encodeCursor<P>(payload: P): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor<P>(cursor: string): P {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) throw new Error(INVALID_CURSOR);
    return parsed as P;
  } catch {
    throw new Error(INVALID_CURSOR);
  }
}
```

Create `packages/shared-store-services/src/index.ts`:

```ts
export {
  type SearchPage,
  type KvKeysetCursor,
  type KvRegexScanCursor,
  type RagPoolCursor,
  encodeCursor,
  decodeCursor,
  KV_SCAN_PAGE_SIZE,
  KV_SCAN_ROW_BUDGET,
  KV_SCAN_BYTE_BUDGET,
} from './pagination.js';
```

Wire the workspace: in root `tsconfig.json` add `{ "path": "./packages/shared-store-services" }` to `references`; in root `package.json` insert `npm run check -w packages/shared-store-services && ` into the `check` script before `packages/api`. Then install:

Run: `npm install`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=pagination`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-store-services/package.json packages/shared-store-services/tsconfig.json packages/shared-store-services/tsconfig.build.json packages/shared-store-services/jest.config.js packages/shared-store-services/src/pagination.ts packages/shared-store-services/src/index.ts packages/shared-store-services/src/__tests__/pagination.test.ts tsconfig.json package.json package-lock.json
git commit -m "RU1: scaffold shared-store-services + opaque-cursor codec

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: providers/types.ts cursor contract (offset→cursor, drop total)

Flips the LLM-facing service contract from offset/total to cursor/SearchPage. This is the type spine every downstream task (factories, buildTools, descriptors) depends on, so it ships first and standalone.

**Files:**
- Modify: `packages/api/src/providers/types.ts`
- Modify: `packages/api/src/index.ts` (export `SearchPage`)
- Test: `packages/api/src/providers/__tests__/searchContract.test.ts`

**Interfaces:**
- Consumes: `SearchPage<T>` shape from Task 1 (`{ items; limit; nextCursor }`) — re-declared locally in `api` to avoid a runtime dep on the new package at this layer.
- Produces: `export interface SearchPage<T> { items: T[]; limit: number; nextCursor: string | null }`
- Produces: `KvSearchArgs { tenantId; on: KvSearchTarget; query: string; limit: number; cursor?: string }`
- Produces: `KvRegexArgs { tenantId; on: KvSearchTarget; pattern: string; limit: number; cursor?: string }`
- Produces: `RagSearchArgs { tenantId; query: string; minSimilarity: number; limit: number; cursor?: string }`
- Produces: `RagRegexArgs { tenantId; pattern: string; limit: number; cursor?: string }`
- Produces updated `KvStoreServices.searchSubstring/searchRegex: (args) => Promise<SearchPage<{ key: string; value: string }>>`, `listKeys: (tenantId, limit, cursor?) => Promise<SearchPage<string>>`.
- Produces updated `RagStoreServices.searchBm25: (tenantId, query, limit, cursor?) => Promise<SearchPage<string>>`, `searchSemantic/searchHybrid/searchRegex: (args) => Promise<SearchPage<string>>`.

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/providers/__tests__/searchContract.test.ts`:

```ts
import type {
  KvRegexArgs,
  KvSearchArgs,
  RagSearchArgs,
  SearchPage,
} from '../types.js';

describe('search contract shape (compile-time)', () => {
  it('KvSearchArgs uses cursor not offset', () => {
    const args: KvSearchArgs = { tenantId: 't', on: 'both', query: 'q', limit: 10, cursor: 'c' };
    expect(args.cursor).toBe('c');
    // @ts-expect-error offset must no longer exist on the args type
    const hasOffset = args.offset;
    expect(hasOffset).toBeUndefined();
  });

  it('SearchPage exposes nextCursor and no total', () => {
    const page: SearchPage<string> = { items: ['a'], limit: 1, nextCursor: null };
    expect(page.nextCursor).toBeNull();
    // @ts-expect-error total was dropped from the page contract
    const hasTotal = page.total;
    expect(hasTotal).toBeUndefined();
  });

  it('RagRegexArgs and RagSearchArgs carry cursor', () => {
    const r: RagSearchArgs = { tenantId: 't', query: 'q', minSimilarity: 0.5, limit: 5 };
    const rx: KvRegexArgs = { tenantId: 't', on: 'keys', pattern: 'p', limit: 5 };
    expect(r.cursor).toBeUndefined();
    expect(rx.cursor).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=searchContract`
Expected: FAIL — `SearchPage` not exported and `KvSearchArgs.offset` still exists (the `@ts-expect-error` on `args.offset` reports an unused-directive type error, so compilation fails).

- [ ] **Step 3: Write minimal implementation**

In `packages/api/src/providers/types.ts`, replace the `KvPagedResult` interface and the four args interfaces + the two service interfaces. Replace this block (from `export interface KvPagedResult<T>` through the end of `RagStoreServices`):

```ts
export interface SearchPage<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
}

export type KvSearchTarget = 'keys' | 'values' | 'both';

export interface KvSearchArgs {
  tenantId: string;
  on: KvSearchTarget;
  query: string;
  limit: number;
  cursor?: string;
}

export interface KvRegexArgs {
  tenantId: string;
  on: KvSearchTarget;
  pattern: string;
  limit: number;
  cursor?: string;
}

export interface KvStoreServices {
  storeId: string;
  listKeys: (tenantId: string, limit: number, cursor?: string) => Promise<SearchPage<string>>;
  getValues: (tenantId: string, keys: string[]) => Promise<Record<string, string | null>>;
  searchSubstring: (args: KvSearchArgs) => Promise<SearchPage<{ key: string; value: string }>>;
  searchRegex: (args: KvRegexArgs) => Promise<SearchPage<{ key: string; value: string }>>;
  updateValue: (tenantId: string, key: string, value: string) => Promise<{ success: true }>;
}

export interface RagSearchArgs {
  tenantId: string;
  query: string;
  minSimilarity: number;
  limit: number;
  cursor?: string;
}

export interface RagRegexArgs {
  tenantId: string;
  pattern: string;
  limit: number;
  cursor?: string;
}

export interface RagStoreServices {
  storeId: string;
  searchBm25: (
    tenantId: string,
    query: string,
    limit: number,
    cursor?: string
  ) => Promise<SearchPage<string>>;
  searchSemantic: (args: RagSearchArgs) => Promise<SearchPage<string>>;
  searchHybrid: (args: RagSearchArgs) => Promise<SearchPage<string>>;
  searchRegex: (args: RagRegexArgs) => Promise<SearchPage<string>>;
}
```

Keep `isKvStoreServices` and `isRagStoreServices` unchanged (they probe `storeId` + `listKeys`/`searchBm25` only). In `packages/api/src/index.ts`, within the `export type { ... } from './providers/index.js';` block, replace `KvPagedResult,` with `SearchPage,` (and ensure `KvSearchArgs, KvRegexArgs, RagSearchArgs, RagRegexArgs` remain). In `packages/api/src/providers/index.ts`, update its re-export of these names from `./types.js` the same way (replace `KvPagedResult` with `SearchPage`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=searchContract`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/types.ts packages/api/src/providers/index.ts packages/api/src/index.ts packages/api/src/providers/__tests__/searchContract.test.ts
git commit -m "RU1: switch KV/RAG provider search contract to opaque cursor + SearchPage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: KV keyset + ILIKE supabase-js queries

The portable DB layer for KV: keyset-paginated list, get-by-keys, ILIKE keyset prefilter (trigram-accelerated), and a raw keyset scan page. All forward-only by `key`, no offset, no count.

**Files:**
- Create: `packages/shared-store-services/src/kv/kvQueries.ts`
- Test: `packages/shared-store-services/src/__tests__/kvQueries.test.ts`

**Interfaces:**
- Consumes: `KvKeysetCursor`, `KV_SCAN_PAGE_SIZE` from `../pagination.js`; `SupabaseClient` from `@supabase/supabase-js`.
- Produces: `export interface KvRow { key: string; value: string }`
- Produces: `export type KvSearchOn = 'keys' | 'values' | 'both'`
- Produces: `export async function listKeysPage(supabase, args: { kvStoreId; tenantId; limit; afterKey: string | null }): Promise<{ keys: string[]; error: string | null }>`
- Produces: `export async function getByKeys(supabase, kvStoreId, tenantId, keys: string[]): Promise<Record<string, string | null>>`
- Produces: `export async function ilikePrefilterPage(supabase, args: { kvStoreId; tenantId; on: KvSearchOn; literal: string; afterKey: string | null; pageSize: number }): Promise<{ entries: KvRow[]; error: string | null }>`
- Produces: `export async function scanKeysetPage(supabase, args: { kvStoreId; tenantId; afterKey: string | null; pageSize: number }): Promise<{ entries: KvRow[]; error: string | null }>`
- Produces: `export async function upsertValue(supabase, args: { kvStoreId; tenantId; key; value }): Promise<{ error: string | null }>`

- [ ] **Step 1: Write the failing test**

Create `packages/shared-store-services/src/__tests__/kvQueries.test.ts`. A hand-rolled supabase-client stub records the query chain; assert keyset filter `gt('key', afterKey)`, ascending order, and ILIKE literal escaping:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { ilikePrefilterPage, listKeysPage, scanKeysetPage } from '../kv/kvQueries.js';

interface Call {
  method: string;
  args: unknown[];
}

function makeStub(rows: Array<{ key: string; value: string }>): {
  client: SupabaseClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const builder: Record<string, (...a: unknown[]) => unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]): unknown => {
      calls.push({ method, args });
      return builder;
    };
  for (const m of ['from', 'select', 'eq', 'gt', 'or', 'ilike', 'order']) builder[m] = record(m);
  builder.limit = (...args: unknown[]): Promise<{ data: unknown; error: null }> => {
    calls.push({ method: 'limit', args });
    return Promise.resolve({ data: rows, error: null });
  };
  return { client: builder as unknown as SupabaseClient, calls };
}

describe('kvQueries keyset paging', () => {
  it('listKeysPage seeks past afterKey and orders ascending', async () => {
    const { client, calls } = makeStub([{ key: 'a', value: 'x' }]);
    const res = await listKeysPage(client, {
      kvStoreId: 's',
      tenantId: 't',
      limit: 10,
      afterKey: 'prev',
    });
    expect(res.error).toBeNull();
    expect(res.keys).toEqual(['a']);
    expect(calls).toContainEqual({ method: 'gt', args: ['key', 'prev'] });
    expect(calls).toContainEqual({ method: 'order', args: ['key', { ascending: true }] });
  });

  it('listKeysPage omits the gt seek on the first page', async () => {
    const { client, calls } = makeStub([]);
    await listKeysPage(client, { kvStoreId: 's', tenantId: 't', limit: 10, afterKey: null });
    expect(calls.find((c) => c.method === 'gt')).toBeUndefined();
  });

  it('ilikePrefilterPage escapes LIKE metacharacters in the literal', async () => {
    const { client, calls } = makeStub([]);
    await ilikePrefilterPage(client, {
      kvStoreId: 's',
      tenantId: 't',
      on: 'keys',
      literal: '50%_x',
      afterKey: null,
      pageSize: 500,
    });
    const ilikeCall = calls.find((c) => c.method === 'ilike');
    expect(ilikeCall?.args).toEqual(['key', '%50\\%\\_x%']);
  });

  it('scanKeysetPage paginates by key only', async () => {
    const { client, calls } = makeStub([{ key: 'b', value: 'y' }]);
    const res = await scanKeysetPage(client, {
      kvStoreId: 's',
      tenantId: 't',
      afterKey: 'a',
      pageSize: 500,
    });
    expect(res.entries).toEqual([{ key: 'b', value: 'y' }]);
    expect(calls).toContainEqual({ method: 'gt', args: ['key', 'a'] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=kvQueries`
Expected: FAIL — `Cannot find module '../kv/kvQueries.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared-store-services/src/kv/kvQueries.ts`:

```ts
// Portable supabase-js KV query layer. All paging is keyset (forward-only by
// `key`), so it is O(log n) per page and needs no offset clamp. Substring search
// uses ILIKE (trigram-indexed via idx_kv_entries_{key,value}_trgm); the
// LLM-supplied regex is never sent here.
import type { SupabaseClient } from '@supabase/supabase-js';

const EMPTY = 0;
const NULL_AFTER: string | null = null;

export interface KvRow {
  key: string;
  value: string;
}

export type KvSearchOn = 'keys' | 'values' | 'both';

interface KeyRow {
  key: string;
}

function isKeyRow(value: unknown): value is KeyRow {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { key?: unknown }).key === 'string';
}

function isKvRow(value: unknown): value is KvRow {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { key?: unknown; value?: unknown };
  return typeof r.key === 'string' && typeof r.value === 'string';
}

function mapKvRows(data: unknown): KvRow[] {
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const out: KvRow[] = [];
  for (const row of rows) if (isKvRow(row)) out.push({ key: row.key, value: row.value });
  return out;
}

function escapeLikePattern(input: string): string {
  return input.replace(/\\/gv, '\\\\').replace(/%/gv, '\\%').replace(/_/gv, '\\_');
}

interface ListKeysArgs {
  kvStoreId: string;
  tenantId: string;
  limit: number;
  afterKey: string | null;
}

export async function listKeysPage(
  supabase: SupabaseClient,
  args: ListKeysArgs
): Promise<{ keys: string[]; error: string | null }> {
  let q = supabase
    .from('kv_entries')
    .select('key')
    .eq('kv_store_id', args.kvStoreId)
    .eq('tenant_id', args.tenantId);
  if (args.afterKey !== NULL_AFTER) q = q.gt('key', args.afterKey);
  const { data, error } = await q.order('key', { ascending: true }).limit(args.limit);
  if (error !== null) return { keys: [], error: error.message };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return { keys: rows.filter(isKeyRow).map((r) => r.key), error: null };
}

function seedNulls(keys: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const key of keys) result[key] = null;
  return result;
}

export async function getByKeys(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  keys: string[]
): Promise<Record<string, string | null>> {
  const result = seedNulls(keys);
  if (keys.length === EMPTY) return result;
  const { data, error } = await supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId)
    .in('key', keys);
  if (error !== null) return result;
  for (const row of mapKvRows(data)) result[row.key] = row.value;
  return result;
}

interface IlikeArgs {
  kvStoreId: string;
  tenantId: string;
  on: KvSearchOn;
  literal: string;
  afterKey: string | null;
  pageSize: number;
}

function applyIlikeTarget(
  base: ReturnType<SupabaseClient['from']>['select'] extends never ? never : ReturnType<ReturnType<SupabaseClient['from']>['select']>,
  on: KvSearchOn,
  pattern: string
): ReturnType<ReturnType<SupabaseClient['from']>['select']> {
  if (on === 'keys') return base.ilike('key', pattern);
  if (on === 'values') return base.ilike('value', pattern);
  return base.or(`key.ilike.${pattern},value.ilike.${pattern}`);
}

export async function ilikePrefilterPage(
  supabase: SupabaseClient,
  args: IlikeArgs
): Promise<{ entries: KvRow[]; error: string | null }> {
  const pattern = `%${escapeLikePattern(args.literal)}%`;
  let base = supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', args.kvStoreId)
    .eq('tenant_id', args.tenantId);
  if (args.afterKey !== NULL_AFTER) base = base.gt('key', args.afterKey);
  const filtered = applyIlikeTarget(base, args.on, pattern);
  const { data, error } = await filtered.order('key', { ascending: true }).limit(args.pageSize);
  if (error !== null) return { entries: [], error: error.message };
  return { entries: mapKvRows(data), error: null };
}

interface ScanArgs {
  kvStoreId: string;
  tenantId: string;
  afterKey: string | null;
  pageSize: number;
}

export async function scanKeysetPage(
  supabase: SupabaseClient,
  args: ScanArgs
): Promise<{ entries: KvRow[]; error: string | null }> {
  let q = supabase
    .from('kv_entries')
    .select('key, value')
    .eq('kv_store_id', args.kvStoreId)
    .eq('tenant_id', args.tenantId);
  if (args.afterKey !== NULL_AFTER) q = q.gt('key', args.afterKey);
  const { data, error } = await q.order('key', { ascending: true }).limit(args.pageSize);
  if (error !== null) return { entries: [], error: error.message };
  return { entries: mapKvRows(data), error: null };
}

interface UpsertArgs {
  kvStoreId: string;
  tenantId: string;
  key: string;
  value: string;
}

export async function upsertValue(
  supabase: SupabaseClient,
  args: UpsertArgs
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('kv_entries')
    .upsert(
      { kv_store_id: args.kvStoreId, tenant_id: args.tenantId, key: args.key, value: args.value },
      { onConflict: 'kv_store_id,tenant_id,key' }
    );
  if (error !== null) return { error: error.message };
  return { error: null };
}
```

If the `applyIlikeTarget` parameter typing proves awkward under strict mode, replace its first parameter and return type with a small local type alias `type KvQuery = ReturnType<ReturnType<SupabaseClient['from']>['select']>;` declared above the function and used for both, rather than the inline conditional — keep it explicit, never `any`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=kvQueries`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-store-services/src/kv/kvQueries.ts packages/shared-store-services/src/__tests__/kvQueries.test.ts
git commit -m "RU1: KV keyset + ILIKE-prefilter supabase-js queries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: KV regex engine (re2js compile + literal extraction + match)

Pure, DB-free regex module: compile with `re2js` (linear-time, ReDoS-safe), extract required literal substrings to drive the ILIKE prefilter, and match a candidate entry. No backtracking regex ever runs on Postgres.

**Files:**
- Create: `packages/shared-store-services/src/kv/regexSearch.ts`
- Test: `packages/shared-store-services/src/__tests__/regexSearch.test.ts`

**Interfaces:**
- Consumes: `KvRow`, `KvSearchOn` from `../kv/kvQueries.js`; `RE2JS` from `re2js`.
- Produces: `export interface CompiledRegex { test: (s: string) => boolean }`
- Produces: `export function compileRegex(pattern: string): CompiledRegex` — throws `Error('invalid_pattern: <detail>')` on a syntax error.
- Produces: `export function extractRequiredLiteral(pattern: string): string | null` — returns the longest required literal substring (≥2 chars) the input MUST contain, or `null` if none can be proven required (alternation, leading quantifier, char-class start, etc.).
- Produces: `export function matchEntry(re: CompiledRegex, entry: KvRow, on: KvSearchOn): boolean`

- [ ] **Step 1: Write the failing test**

Create `packages/shared-store-services/src/__tests__/regexSearch.test.ts`:

```ts
import { compileRegex, extractRequiredLiteral, matchEntry } from '../kv/regexSearch.js';

describe('re2js regex engine', () => {
  it('compiles and matches with linear-time engine', () => {
    const re = compileRegex('foo.*bar');
    expect(re.test('xfoozbar')).toBe(true);
    expect(re.test('nope')).toBe(false);
  });

  it('stays linear on a catastrophic-backtracking pattern (ReDoS-safe)', () => {
    const re = compileRegex('(a+)+$');
    const start = Date.now();
    const result = re.test('a'.repeat(40) + 'b');
    expect(result).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000); // would hang under a backtracking engine
  });

  it('throws invalid_pattern on a syntax error', () => {
    expect(() => compileRegex('(')).toThrow('invalid_pattern');
  });

  it('extracts the longest required literal from a concatenation', () => {
    expect(extractRequiredLiteral('foo.*barbaz')).toBe('barbaz');
  });

  it('returns null when no literal is required (alternation / leading quantifier)', () => {
    expect(extractRequiredLiteral('(foo|foobar)')).toBeNull();
    expect(extractRequiredLiteral('[a-z]+')).toBeNull();
    expect(extractRequiredLiteral('.*')).toBeNull();
  });

  it('matchEntry honours the on-target', () => {
    const re = compileRegex('secret');
    expect(matchEntry(re, { key: 'k', value: 'has secret' }, 'values')).toBe(true);
    expect(matchEntry(re, { key: 'k', value: 'has secret' }, 'keys')).toBe(false);
    expect(matchEntry(re, { key: 'secret', value: 'v' }, 'both')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=regexSearch`
Expected: FAIL — `Cannot find module '../kv/regexSearch.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared-store-services/src/kv/regexSearch.ts`:

```ts
// ReDoS-safe KV regex: re2js gives linear-time matching in Node, Workers, and
// Deno (no native addon). We additionally extract a required literal substring
// so the DB can prefilter with a trigram-indexed ILIKE before re2js runs on the
// (small) candidate set. The regex itself is NEVER sent to Postgres.
import { RE2JS } from 're2js';

import type { KvRow, KvSearchOn } from './kvQueries.js';

const MIN_LITERAL_LEN = 2;
const EMPTY = '';

export interface CompiledRegex {
  test: (s: string) => boolean;
}

export function compileRegex(pattern: string): CompiledRegex {
  try {
    const compiled = RE2JS.compile(pattern);
    return { test: (s: string): boolean => compiled.test(s) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'syntax error';
    throw new Error(`invalid_pattern: ${detail}`);
  }
}

// Regex metacharacters that, when present, end the current literal run because
// what follows is not a required literal byte.
const META = new Set<string>(['.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|', '^', '$', '\\']);
// A quantifier immediately after a literal char makes THAT char optional/repeated,
// so the char before the quantifier is not guaranteed present.
const QUANTIFIER = new Set<string>(['*', '?', '{']);

function hasAlternation(pattern: string): boolean {
  // A top-level '|' means no single literal is guaranteed; bail conservatively.
  // (Any '|' is treated as disqualifying — sound, not maximally precise.)
  return pattern.includes('|');
}

function literalRuns(pattern: string): string[] {
  const runs: string[] = [];
  let current = EMPTY;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i] ?? EMPTY;
    const next = pattern[i + 1] ?? EMPTY;
    if (META.has(ch)) {
      if (current !== EMPTY) runs.push(current);
      current = EMPTY;
      continue;
    }
    // If this literal char is immediately quantified, it is not guaranteed —
    // close the run BEFORE it and skip the char.
    if (QUANTIFIER.has(next)) {
      if (current !== EMPTY) runs.push(current);
      current = EMPTY;
      continue;
    }
    current += ch;
  }
  if (current !== EMPTY) runs.push(current);
  return runs;
}

export function extractRequiredLiteral(pattern: string): string | null {
  if (hasAlternation(pattern)) return null;
  const runs = literalRuns(pattern).filter((r) => r.length >= MIN_LITERAL_LEN);
  if (runs.length === 0) return null;
  return runs.reduce((longest, r) => (r.length > longest.length ? r : longest), EMPTY) || null;
}

export function matchEntry(re: CompiledRegex, entry: KvRow, on: KvSearchOn): boolean {
  if (on === 'keys') return re.test(entry.key);
  if (on === 'values') return re.test(entry.value);
  return re.test(entry.key) || re.test(entry.value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=regexSearch`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-store-services/src/kv/regexSearch.ts packages/shared-store-services/src/__tests__/regexSearch.test.ts
git commit -m "RU1: re2js KV regex engine + required-literal extractor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: KV factory (`makeKvStoreService`) over the cursor contract

Wires queries (Task 3) + regex (Task 4) + pagination (Task 1) into the `KvStoreServices` factory: keyset list/get/set, ILIKE substring search, and regex search with literal-prefilter or bounded scan fallback (row + byte budgets, forward progress).

**Files:**
- Create: `packages/shared-store-services/src/kv/kvStoreService.ts`
- Modify: `packages/shared-store-services/src/index.ts` (export `makeKvStoreService`)
- Test: `packages/shared-store-services/src/__tests__/kvStoreService.test.ts`

**Interfaces:**
- Consumes: `listKeysPage`, `getByKeys`, `ilikePrefilterPage`, `scanKeysetPage`, `upsertValue`, `KvRow` from `./kvQueries.js`; `compileRegex`, `extractRequiredLiteral`, `matchEntry` from `./regexSearch.js`; `SearchPage`, `KvKeysetCursor`, `KvRegexScanCursor`, `encodeCursor`, `decodeCursor`, `KV_SCAN_PAGE_SIZE`, `KV_SCAN_ROW_BUDGET`, `KV_SCAN_BYTE_BUDGET` from `../pagination.js`; `KvStoreServices`, `KvSearchArgs`, `KvRegexArgs`, `ToolError` from `@daviddh/llm-graph-runner`.
- Produces: `export function makeKvStoreService(supabase: SupabaseClient, storeId: string): KvStoreServices`

- [ ] **Step 1: Write the failing test**

Create `packages/shared-store-services/src/__tests__/kvStoreService.test.ts`. Use an in-memory fake of the four query helpers via `jest.unstable_mockModule` (ESM). Cover: substring nextCursor = last key; regex with-literal accumulation; regex no-literal scan stops at row budget with forward-progress cursor; exhaustion → `nextCursor === null`.

```ts
import { jest } from '@jest/globals';

const sampleRows = (n: number, prefix: string): Array<{ key: string; value: string }> =>
  Array.from({ length: n }, (_, i) => ({ key: `${prefix}${String(i).padStart(4, '0')}`, value: 'v' }));

const listKeysPage = jest.fn();
const getByKeys = jest.fn();
const ilikePrefilterPage = jest.fn();
const scanKeysetPage = jest.fn();
const upsertValue = jest.fn();

jest.unstable_mockModule('../kv/kvQueries.js', () => ({
  listKeysPage,
  getByKeys,
  ilikePrefilterPage,
  scanKeysetPage,
  upsertValue,
}));

const { makeKvStoreService } = await import('../kv/kvStoreService.js');

interface SupabaseLike {
  __brand: 'fake';
}
const supabase = { __brand: 'fake' } as unknown as Parameters<typeof makeKvStoreService>[0];

describe('makeKvStoreService cursor contract', () => {
  beforeEach(() => {
    listKeysPage.mockReset();
    ilikePrefilterPage.mockReset();
    scanKeysetPage.mockReset();
  });

  it('listKeys returns nextCursor = last key when a full page comes back', async () => {
    listKeysPage.mockResolvedValue({ keys: ['a', 'b', 'c'], error: null });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.listKeys('t', 3);
    expect(page.items).toEqual(['a', 'b', 'c']);
    expect(page.nextCursor).not.toBeNull();
  });

  it('listKeys returns nextCursor = null when fewer than limit returned', async () => {
    listKeysPage.mockResolvedValue({ keys: ['a'], error: null });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.listKeys('t', 3);
    expect(page.nextCursor).toBeNull();
  });

  it('regex with literal accumulates matches across ILIKE batches', async () => {
    ilikePrefilterPage
      .mockResolvedValueOnce({ entries: [{ key: 'k0001', value: 'foobar' }], error: null })
      .mockResolvedValueOnce({ entries: [], error: null });
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchRegex({ tenantId: 't', on: 'values', pattern: 'foobar', limit: 5 });
    expect(page.items).toEqual([{ key: 'k0001', value: 'foobar' }]);
    expect(page.nextCursor).toBeNull();
    expect(scanKeysetPage).not.toHaveBeenCalled();
  });

  it('regex without literal scans with a row budget and forward-progress cursor', async () => {
    // Each call returns a full 500-row page that never matches the pattern.
    scanKeysetPage.mockImplementation(async () => ({ entries: sampleRows(500, 'z'), error: null }));
    const svc = makeKvStoreService(supabase, 'store1');
    const page = await svc.searchRegex({ tenantId: 't', on: 'keys', pattern: '[0-9]+QQQ', limit: 5 });
    expect(page.items).toEqual([]); // budget hit before any match
    expect(page.nextCursor).not.toBeNull(); // forward progress so the LLM keeps paging
    expect(ilikePrefilterPage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=kvStoreService`
Expected: FAIL — `Cannot find module '../kv/kvStoreService.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared-store-services/src/kv/kvStoreService.ts`:

```ts
import type { KvRegexArgs, KvSearchArgs, KvStoreServices, SearchPage } from '@daviddh/llm-graph-runner';
import { ToolError } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type KvKeysetCursor,
  type KvRegexScanCursor,
  KV_SCAN_BYTE_BUDGET,
  KV_SCAN_PAGE_SIZE,
  KV_SCAN_ROW_BUDGET,
  decodeCursor,
  encodeCursor,
} from '../pagination.js';
import {
  type KvRow,
  getByKeys,
  ilikePrefilterPage,
  listKeysPage,
  scanKeysetPage,
  upsertValue,
} from './kvQueries.js';
import { type CompiledRegex, compileRegex, extractRequiredLiteral, matchEntry } from './regexSearch.js';

const PROTECTED_PREFIX = '_sys.';
const ONE_KILOBYTE = 1024;
const KEY_MAX_BYTES = 256;
const VALUE_MAX_BYTES = KEY_MAX_BYTES * ONE_KILOBYTE;
const EMPTY = 0;
const LAST_OFFSET = 1;

interface Ctx {
  supabase: SupabaseClient;
  storeId: string;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

function lastKeyCursor(items: Array<{ key: string }>, limit: number): string | null {
  if (items.length < limit) return null;
  const last = items[items.length - LAST_OFFSET];
  if (last === undefined) return null;
  return encodeCursor<KvKeysetCursor>({ lastKey: last.key });
}

function afterKeyFromCursor(cursor: string | undefined): string | null {
  if (cursor === undefined) return null;
  return decodeCursor<KvKeysetCursor>(cursor).lastKey;
}

async function doListKeys(ctx: Ctx, tenantId: string, limit: number, cursor?: string): Promise<SearchPage<string>> {
  const afterKey = afterKeyFromCursor(cursor);
  const { keys, error } = await listKeysPage(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId,
    limit,
    afterKey,
  });
  if (error !== null) throw new Error(error);
  const last = keys[keys.length - LAST_OFFSET];
  const nextCursor =
    keys.length < limit || last === undefined ? null : encodeCursor<KvKeysetCursor>({ lastKey: last });
  return { items: keys, limit, nextCursor };
}

async function doSearchSubstring(ctx: Ctx, args: KvSearchArgs): Promise<SearchPage<KvRow>> {
  const afterKey = afterKeyFromCursor(args.cursor);
  const { entries, error } = await ilikePrefilterPage(ctx.supabase, {
    kvStoreId: ctx.storeId,
    tenantId: args.tenantId,
    on: args.on,
    literal: args.query,
    afterKey,
    pageSize: args.limit,
  });
  if (error !== null) throw new Error(error);
  return { items: entries, limit: args.limit, nextCursor: lastKeyCursor(entries, args.limit) };
}

interface RegexAccumulator {
  matches: KvRow[];
  rowsScanned: number;
  bytesScanned: number;
  lastKey: string | null;
}

function emptyAcc(): RegexAccumulator {
  return { matches: [], rowsScanned: EMPTY, bytesScanned: EMPTY, lastKey: null };
}

function ingestBatch(
  acc: RegexAccumulator,
  batch: KvRow[],
  re: CompiledRegex,
  args: KvRegexArgs
): void {
  for (const row of batch) {
    acc.rowsScanned += 1;
    acc.bytesScanned += byteLength(row.key) + byteLength(row.value);
    acc.lastKey = row.key;
    if (matchEntry(re, row, args.on)) acc.matches.push(row);
    if (acc.matches.length >= args.limit) return;
  }
}

function regexNextCursor(acc: RegexAccumulator, exhausted: boolean): string | null {
  if (exhausted || acc.lastKey === null) return null;
  return encodeCursor<KvRegexScanCursor>({ lastKey: acc.lastKey });
}

type FetchPage = (afterKey: string | null) => Promise<{ entries: KvRow[]; error: string | null }>;

async function runRegexScan(re: CompiledRegex, args: KvRegexArgs, start: string | null, fetch: FetchPage): Promise<SearchPage<KvRow>> {
  const acc = emptyAcc();
  let afterKey = start;
  for (;;) {
    const { entries, error } = await fetch(afterKey);
    if (error !== null) throw new Error(error);
    ingestBatch(acc, entries, re, args);
    const pageExhausted = entries.length < KV_SCAN_PAGE_SIZE;
    const budgetHit = acc.rowsScanned >= KV_SCAN_ROW_BUDGET || acc.bytesScanned >= KV_SCAN_BYTE_BUDGET;
    if (acc.matches.length >= args.limit || pageExhausted || budgetHit) {
      return { items: acc.matches, limit: args.limit, nextCursor: regexNextCursor(acc, pageExhausted) };
    }
    afterKey = acc.lastKey;
  }
}

async function doSearchRegex(ctx: Ctx, args: KvRegexArgs): Promise<SearchPage<KvRow>> {
  const re = compileRegex(args.pattern);
  const literal = extractRequiredLiteral(args.pattern);
  const start = afterKeyFromCursor(args.cursor);
  if (literal !== null) {
    return await runRegexScan(re, args, start, async (afterKey) =>
      await ilikePrefilterPage(ctx.supabase, {
        kvStoreId: ctx.storeId,
        tenantId: args.tenantId,
        on: args.on,
        literal,
        afterKey,
        pageSize: KV_SCAN_PAGE_SIZE,
      })
    );
  }
  return await runRegexScan(re, args, start, async (afterKey) =>
    await scanKeysetPage(ctx.supabase, {
      kvStoreId: ctx.storeId,
      tenantId: args.tenantId,
      afterKey,
      pageSize: KV_SCAN_PAGE_SIZE,
    })
  );
}

function assertWritable(key: string, value: string): void {
  if (key.toLowerCase().startsWith(PROTECTED_PREFIX)) {
    throw new ToolError('protected_key', `Keys starting with "${PROTECTED_PREFIX}" are reserved`);
  }
  if (byteLength(key) > KEY_MAX_BYTES) throw new ToolError('key_too_long', `Key exceeds ${String(KEY_MAX_BYTES)} bytes`);
  if (byteLength(value) > VALUE_MAX_BYTES) {
    throw new ToolError('value_too_large', `Value exceeds ${String(VALUE_MAX_BYTES)} bytes`);
  }
}

async function doUpdateValue(ctx: Ctx, tenantId: string, key: string, value: string): Promise<{ success: true }> {
  assertWritable(key, value);
  const { error } = await upsertValue(ctx.supabase, { kvStoreId: ctx.storeId, tenantId, key, value });
  if (error !== null) throw new Error(error);
  return { success: true };
}

export function makeKvStoreService(supabase: SupabaseClient, storeId: string): KvStoreServices {
  const ctx: Ctx = { supabase, storeId };
  return {
    storeId,
    listKeys: async (tenantId, limit, cursor) => await doListKeys(ctx, tenantId, limit, cursor),
    getValues: async (tenantId, keys) => await getByKeys(ctx.supabase, ctx.storeId, tenantId, keys),
    searchSubstring: async (args) => await doSearchSubstring(ctx, args),
    searchRegex: async (args) => await doSearchRegex(ctx, args),
    updateValue: async (tenantId, key, value) => await doUpdateValue(ctx, tenantId, key, value),
  };
}
```

Add to `packages/shared-store-services/src/index.ts`:

```ts
export { makeKvStoreService } from './kv/kvStoreService.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=kvStoreService`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-store-services/src/kv/kvStoreService.ts packages/shared-store-services/src/index.ts packages/shared-store-services/src/__tests__/kvStoreService.test.ts
git commit -m "RU1: KV factory over cursor contract (ILIKE prefilter + bounded regex scan)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: RAG queries + internal API client (embed/rerank)

The portable RAG DB layer (FTS + semantic-pool RPC wrappers) plus the host-injected internal-API client for `/internal/embed` and `/internal/rerank`. Both ship together because the rerank/embed client is what the RAG factory (Task 8) needs alongside the queries.

**Files:**
- Create: `packages/shared-store-services/src/rag/ragQueries.ts`
- Create: `packages/shared-store-services/src/internalApiClient.ts`
- Modify: `packages/shared-store-services/src/index.ts`
- Test: `packages/shared-store-services/src/__tests__/internalApiClient.test.ts`

**Interfaces:**
- Produces: `export interface RagChunk { id: string; content: string }`
- Produces: `export async function ftsPool(supabase, args: { storeId; tenantId; query; k }): Promise<{ rows: RagChunk[]; error: string | null }>` (wraps `rag_text_search`).
- Produces: `export async function semanticPool(supabase, args: { storeId; tenantId; queryVector: number[]; k; maxDistance: number | null }): Promise<{ rows: RagChunk[]; error: string | null }>` (wraps `rag_semantic_search`, vector serialized as `[a,b,...]`).
- Produces: `export interface InternalApiConfig { baseUrl: string; masterKey: string; fetchImpl?: typeof fetch }`
- Produces: `export function makeInternalApiClient(cfg: InternalApiConfig): { embed: (text: string) => Promise<number[]>; rerank: (input: { query: string; records: Array<{ id: string; content: string }>; topN: number }) => Promise<Array<{ id: string; score: number }>> }`

- [ ] **Step 1: Write the failing test**

Create `packages/shared-store-services/src/__tests__/internalApiClient.test.ts`:

```ts
import { makeInternalApiClient } from '../internalApiClient.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('internalApiClient', () => {
  it('embed posts to /internal/embed with the master key and returns the vector', async () => {
    const seen: { url: string; init: RequestInit | undefined } = { url: '', init: undefined };
    const fetchImpl: typeof fetch = async (input, init) => {
      seen.url = String(input);
      seen.init = init;
      return jsonResponse(200, { vector: [0.1, 0.2] });
    };
    const client = makeInternalApiClient({ baseUrl: 'http://be', masterKey: 'k', fetchImpl });
    const vec = await client.embed('hello');
    expect(vec).toEqual([0.1, 0.2]);
    expect(seen.url).toBe('http://be/internal/embed');
    const headers = new Headers(seen.init?.headers);
    expect(headers.get('x-master-key')).toBe('k');
  });

  it('rerank posts to /internal/rerank and returns scored records', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(200, { records: [{ id: 'b', score: 0.9 }, { id: 'a', score: 0.4 }] });
    const client = makeInternalApiClient({ baseUrl: 'http://be', masterKey: 'k', fetchImpl });
    const out = await client.rerank({
      query: 'q',
      records: [{ id: 'a', content: 'x' }, { id: 'b', content: 'y' }],
      topN: 2,
    });
    expect(out).toEqual([{ id: 'b', score: 0.9 }, { id: 'a', score: 0.4 }]);
  });

  it('embed throws on a non-200 response', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(500, { error: 'boom' });
    const client = makeInternalApiClient({ baseUrl: 'http://be', masterKey: 'k', fetchImpl });
    await expect(client.embed('x')).rejects.toThrow('embed failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=internalApiClient`
Expected: FAIL — `Cannot find module '../internalApiClient.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared-store-services/src/internalApiClient.ts`:

```ts
// Portable client for the two Node-only BE hops the Worker/Deno cannot run
// in-process: query embedding (Vertex SA auth) and rerank (Vertex
// semantic-ranker). Regex validation is gone — re2js runs in-process now.
const HTTP_OK = 200;

export interface InternalApiConfig {
  baseUrl: string;
  masterKey: string;
  fetchImpl?: typeof fetch;
}

export interface RerankRecord {
  id: string;
  content: string;
}

export interface RerankInput {
  query: string;
  records: RerankRecord[];
  topN: number;
}

export interface RerankedRecord {
  id: string;
  score: number;
}

export interface InternalApiClient {
  embed: (text: string) => Promise<number[]>;
  rerank: (input: RerankInput) => Promise<RerankedRecord[]>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function postJson(cfg: InternalApiConfig, path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const res = await doFetch(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'x-master-key': cfg.masterKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

function parseVector(json: unknown): number[] {
  if (!isRecord(json) || !Array.isArray(json.vector)) return [];
  return json.vector.filter((n): n is number => typeof n === 'number');
}

function parseReranked(json: unknown): RerankedRecord[] {
  if (!isRecord(json) || !Array.isArray(json.records)) return [];
  const out: RerankedRecord[] = [];
  for (const r of json.records) {
    if (!isRecord(r)) continue;
    if (typeof r.id !== 'string' || typeof r.score !== 'number') continue;
    out.push({ id: r.id, score: r.score });
  }
  return out;
}

export function makeInternalApiClient(cfg: InternalApiConfig): InternalApiClient {
  return {
    embed: async (text) => {
      const { status, json } = await postJson(cfg, '/internal/embed', { text });
      if (status !== HTTP_OK) throw new Error(`embed failed: HTTP ${String(status)}`);
      return parseVector(json);
    },
    rerank: async (input) => {
      const { status, json } = await postJson(cfg, '/internal/rerank', input);
      if (status !== HTTP_OK) throw new Error(`rerank failed: HTTP ${String(status)}`);
      return parseReranked(json);
    },
  };
}
```

Create `packages/shared-store-services/src/rag/ragQueries.ts`:

```ts
// Portable RAG retrieval via supabase-js RPCs (rag_text_search, rag_semantic_search).
// Returns a minimal { id, content } chunk shape — the agent surface only needs text.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RagChunk {
  id: string;
  content: string;
}

function isRagChunk(v: unknown): v is RagChunk {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as { id?: unknown; content?: unknown };
  return typeof r.id === 'string' && typeof r.content === 'string';
}

function mapChunks(data: unknown): RagChunk[] {
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const out: RagChunk[] = [];
  for (const row of rows) if (isRagChunk(row)) out.push({ id: row.id, content: row.content });
  return out;
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

interface FtsArgs {
  storeId: string;
  tenantId: string;
  query: string;
  k: number;
}

export async function ftsPool(
  supabase: SupabaseClient,
  args: FtsArgs
): Promise<{ rows: RagChunk[]; error: string | null }> {
  const { data, error } = (await supabase.rpc('rag_text_search', {
    p_rag_store_id: args.storeId,
    p_tenant_id: args.tenantId,
    p_query: args.query,
    p_k: args.k,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { rows: [], error: error.message };
  return { rows: mapChunks(data), error: null };
}

interface SemanticArgs {
  storeId: string;
  tenantId: string;
  queryVector: number[];
  k: number;
  maxDistance: number | null;
}

export async function semanticPool(
  supabase: SupabaseClient,
  args: SemanticArgs
): Promise<{ rows: RagChunk[]; error: string | null }> {
  const { data, error } = (await supabase.rpc('rag_semantic_search', {
    p_rag_store_id: args.storeId,
    p_tenant_id: args.tenantId,
    p_query_vector: vectorLiteral(args.queryVector),
    p_k: args.k,
    p_max_distance: args.maxDistance,
  })) as { data: unknown; error: { message: string } | null };
  if (error !== null) return { rows: [], error: error.message };
  return { rows: mapChunks(data), error: null };
}
```

Add to `packages/shared-store-services/src/index.ts`:

```ts
export {
  type InternalApiClient,
  type InternalApiConfig,
  type RerankInput,
  type RerankedRecord,
  makeInternalApiClient,
} from './internalApiClient.js';
export { type RagChunk, ftsPool, semanticPool } from './rag/ragQueries.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=internalApiClient`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-store-services/src/rag/ragQueries.ts packages/shared-store-services/src/internalApiClient.ts packages/shared-store-services/src/index.ts packages/shared-store-services/src/__tests__/internalApiClient.test.ts
git commit -m "RU1: RAG supabase-js queries + portable embed/rerank internal client

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: BE `/internal/rerank` endpoint; drop `/internal/regex/validate`

Adds the new BE hop the RAG factory + edge depend on, and removes the now-dead regex-validate hop (re2js validates in-process). Stays BE-side because Vertex semantic-ranker auth is Node-only.

**Files:**
- Modify: `packages/backend/src/routes/internal/utilityHandlers.ts`
- Modify: `packages/backend/src/routes/internal/internalRouter.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/src/routes/internal/__tests__/utilityHandlers.test.ts` (add cases)

**Interfaces:**
- Consumes: `rerankRecords` from `../../rag/rerank.js` (shape `{ query; records: Array<{ id; content }>; topN } → Array<{ id; score }>`).
- Produces: `export async function handleRerank(req: Request, res: Response): Promise<void>` — body `{ query: string; records: Array<{ id: string; content: string }>; topN: number }` → `200 { records: Array<{ id; score }> }`.
- Removes: `handleRegexValidate`.

- [ ] **Step 1: Write the failing test**

Add to `packages/backend/src/routes/internal/__tests__/utilityHandlers.test.ts` (preserve existing imports; add a mock of `rerankRecords` and these cases):

```ts
import { handleRerank } from '../utilityHandlers.js';

jest.mock('../../../rag/rerank.js', () => ({
  rerankRecords: jest.fn(async () => [{ id: 'b', score: 0.9 }]),
}));

function mockRes(): { status: jest.Mock; json: jest.Mock; body: unknown; code: number } {
  const out = { status: jest.fn(), json: jest.fn(), body: undefined as unknown, code: 0 };
  out.status.mockImplementation((c: number) => {
    out.code = c;
    return out;
  });
  out.json.mockImplementation((b: unknown) => {
    out.body = b;
  });
  return out;
}

describe('handleRerank', () => {
  it('returns reranked records for a valid body', async () => {
    const req = { body: { query: 'q', records: [{ id: 'b', content: 'y' }], topN: 1 } } as never;
    const res = mockRes();
    await handleRerank(req, res as never);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ records: [{ id: 'b', score: 0.9 }] });
  });

  it('rejects a malformed body with 400', async () => {
    const req = { body: { query: 'q' } } as never;
    const res = mockRes();
    await handleRerank(req, res as never);
    expect(res.code).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=utilityHandlers`
Expected: FAIL — `handleRerank` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/backend/src/routes/internal/utilityHandlers.ts`: remove the `import RE2 from 're2';` line, remove `RegexValidateBodySchema`, `PATTERN_MAX`, and `handleRegexValidate`. Add an import `import { rerankRecords } from '../../rag/rerank.js';`, a Zod schema, and the handler:

```ts
const RERANK_TEXT_MAX = 100_000;
const RECORDS_MIN = 1;
const TOP_N_MIN = 1;

const RerankBodySchema = z.object({
  query: z.string().min(STRING_MIN).max(EMBED_TEXT_MAX),
  records: z
    .array(z.object({ id: z.string().min(STRING_MIN), content: z.string().max(RERANK_TEXT_MAX) }))
    .min(RECORDS_MIN),
  topN: z.number().int().min(TOP_N_MIN),
});

export async function handleRerank(req: Request, res: Response): Promise<void> {
  const parsed = RerankBodySchema.safeParse(req.body);
  if (!parsed.success) {
    rejectInvalid(res, parsed.error.message);
    return;
  }
  try {
    const records = await rerankRecords({
      query: parsed.data.query,
      records: parsed.data.records,
      topN: parsed.data.topN,
    });
    res.status(HTTP_OK).json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'rerank failed';
    res.status(HTTP_INTERNAL).json({ error: message });
  }
}
```

In `packages/backend/src/routes/internal/internalRouter.ts`: change the import to `import { handleEmbed, handleRerank } from './utilityHandlers.js';`, replace `internalRouter.post('/regex/validate', handleRegexValidate);` with `internalRouter.post('/rerank', handleRerank);`, and update the comment to mention rerank instead of RE2. In `packages/backend/src/server.ts`: in the public-unauthed allowlist replace `'/internal/regex/validate',` with `'/internal/rerank',`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=utilityHandlers`
Expected: PASS (existing embed cases + 2 new rerank cases).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/internal/utilityHandlers.ts packages/backend/src/routes/internal/internalRouter.ts packages/backend/src/server.ts packages/backend/src/routes/internal/__tests__/utilityHandlers.test.ts
git commit -m "RU1: add /internal/rerank hop; drop /internal/regex/validate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: RAG factory — embed→pool→always-on rerank→cursor-paginate

Wires `ragQueries` + the internal client (Task 6) into `makeRagStoreService`: retrieve a bounded pool, rerank it (always on), cursor-paginate the reranked pool, then continue in retrieval order past the pool. Regex mode falls back to ftsPool + re2js filter to stay portable (no native re2, no Postgres `~`).

**Files:**
- Create: `packages/shared-store-services/src/rag/rerank.ts`
- Create: `packages/shared-store-services/src/rag/ragStoreService.ts`
- Modify: `packages/shared-store-services/src/index.ts`
- Test: `packages/shared-store-services/src/__tests__/ragStoreService.test.ts`

**Interfaces:**
- Consumes: `ftsPool`, `semanticPool`, `RagChunk` from `./ragQueries.js`; `InternalApiClient` from `../internalApiClient.js`; `RagPoolCursor`, `SearchPage`, `encodeCursor`, `decodeCursor` from `../pagination.js`; `compileRegex`, `matchEntry`-style filtering from `../kv/regexSearch.js`; `RagStoreServices`, `RagSearchArgs`, `RagRegexArgs` from `@daviddh/llm-graph-runner`.
- Produces: `export async function rerankPool(client, query, pool: RagChunk[]): Promise<RagChunk[]>` — calls `client.rerank` with `topN = pool.length`, reorders by score; on empty rerank response falls back to original order.
- Produces: `export function makeRagStoreService(supabase, storeId, client: InternalApiClient): RagStoreServices`
- Produces constant: `const POOL_SIZE = 100`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared-store-services/src/__tests__/ragStoreService.test.ts`. Mock `ragQueries` + an in-memory client; assert: pool reranked then paginated; `nextCursor` advances pool index; exhaustion null:

```ts
import { jest } from '@jest/globals';

const ftsPool = jest.fn();
const semanticPool = jest.fn();

jest.unstable_mockModule('../rag/ragQueries.js', () => ({
  ftsPool,
  semanticPool,
  // RagChunk is a type-only export; runtime no-op.
}));

const { makeRagStoreService } = await import('../rag/ragStoreService.js');

const chunk = (id: string): { id: string; content: string } => ({ id, content: `c-${id}` });

const client = {
  embed: jest.fn(async () => [0.1, 0.2]),
  rerank: jest.fn(async (input: { records: Array<{ id: string }> }) =>
    // reverse the pool so we can observe rerank reordering
    [...input.records].reverse().map((r, i) => ({ id: r.id, score: input.records.length - i }))
  ),
};
const supabase = {} as unknown as Parameters<typeof makeRagStoreService>[0];

describe('makeRagStoreService always-on rerank + cursor paging', () => {
  beforeEach(() => {
    ftsPool.mockReset();
    semanticPool.mockReset();
    client.rerank.mockClear();
  });

  it('bm25 reranks the pool then paginates by match count', async () => {
    ftsPool.mockResolvedValue({ rows: [chunk('a'), chunk('b'), chunk('c')], error: null });
    const svc = makeRagStoreService(supabase, 's', client as never);
    const page = await svc.searchBm25('t', 'q', 2);
    expect(client.rerank).toHaveBeenCalledTimes(1);
    expect(page.items).toEqual(['c-c', 'c-b']); // reranked (reversed) order, first 2
    expect(page.nextCursor).not.toBeNull();
  });

  it('semantic continuation past the pool exhausts with null cursor', async () => {
    semanticPool.mockResolvedValue({ rows: [chunk('a'), chunk('b')], error: null });
    const svc = makeRagStoreService(supabase, 's', client as never);
    const first = await svc.searchSemantic({ tenantId: 't', query: 'q', minSimilarity: 0.5, limit: 5 });
    expect(first.items.length).toBe(2);
    expect(first.nextCursor).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=ragStoreService`
Expected: FAIL — `Cannot find module '../rag/ragStoreService.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared-store-services/src/rag/rerank.ts`:

```ts
import type { InternalApiClient } from '../internalApiClient.js';
import type { RagChunk } from './ragQueries.js';

const EMPTY = 0;

// Always-on rerank of a bounded candidate pool. One rerank call per search; if
// the rerank hop returns nothing (e.g. empty pool), keep the retrieval order.
export async function rerankPool(
  client: InternalApiClient,
  query: string,
  pool: RagChunk[]
): Promise<RagChunk[]> {
  if (pool.length === EMPTY) return pool;
  const ranked = await client.rerank({
    query,
    records: pool.map((c) => ({ id: c.id, content: c.content })),
    topN: pool.length,
  });
  if (ranked.length === EMPTY) return pool;
  const byId = new Map(pool.map((c) => [c.id, c]));
  const out: RagChunk[] = [];
  for (const r of ranked) {
    const c = byId.get(r.id);
    if (c !== undefined) out.push(c);
  }
  return out;
}
```

Create `packages/shared-store-services/src/rag/ragStoreService.ts`:

```ts
import type { RagRegexArgs, RagSearchArgs, RagStoreServices, SearchPage } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { InternalApiClient } from '../internalApiClient.js';
import { type RagPoolCursor, decodeCursor, encodeCursor } from '../pagination.js';
import { compileRegex } from '../kv/regexSearch.js';
import { type RagChunk, ftsPool, semanticPool } from './ragQueries.js';
import { rerankPool } from './rerank.js';

const POOL_SIZE = 100;
const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;
const START = 0;

interface Ctx {
  supabase: SupabaseClient;
  storeId: string;
  client: InternalApiClient;
}

function toMaxDistance(minSimilarity: number): number | null {
  if (minSimilarity <= MIN_SIMILARITY) return null;
  return MAX_SIMILARITY - minSimilarity;
}

function poolIndexFromCursor(cursor: string | undefined): number {
  if (cursor === undefined) return START;
  return decodeCursor<RagPoolCursor>(cursor).poolIndex;
}

function paginate(pool: RagChunk[], start: number, limit: number): SearchPage<string> {
  const slice = pool.slice(start, start + limit);
  const nextIndex = start + slice.length;
  const nextCursor = nextIndex < pool.length ? encodeCursor<RagPoolCursor>({ poolIndex: nextIndex }) : null;
  return { items: slice.map((c) => c.content), limit, nextCursor };
}

async function rankedPoolOrThrow(
  ctx: Ctx,
  query: string,
  fetchPool: () => Promise<{ rows: RagChunk[]; error: string | null }>
): Promise<RagChunk[]> {
  const { rows, error } = await fetchPool();
  if (error !== null) throw new Error(error);
  return await rerankPool(ctx.client, query, rows);
}

async function doBm25(ctx: Ctx, tenantId: string, query: string, limit: number, cursor?: string): Promise<SearchPage<string>> {
  const pool = await rankedPoolOrThrow(ctx, query, async () =>
    await ftsPool(ctx.supabase, { storeId: ctx.storeId, tenantId, query, k: POOL_SIZE })
  );
  return paginate(pool, poolIndexFromCursor(cursor), limit);
}

async function doSemantic(ctx: Ctx, args: RagSearchArgs): Promise<SearchPage<string>> {
  const queryVector = await ctx.client.embed(args.query);
  const pool = await rankedPoolOrThrow(ctx, args.query, async () =>
    await semanticPool(ctx.supabase, {
      storeId: ctx.storeId,
      tenantId: args.tenantId,
      queryVector,
      k: POOL_SIZE,
      maxDistance: toMaxDistance(args.minSimilarity),
    })
  );
  return paginate(pool, poolIndexFromCursor(args.cursor), args.limit);
}

function mergeUnique(a: RagChunk[], b: RagChunk[]): RagChunk[] {
  const seen = new Set<string>();
  const out: RagChunk[] = [];
  for (const c of [...a, ...b]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

async function doHybrid(ctx: Ctx, args: RagSearchArgs): Promise<SearchPage<string>> {
  const queryVector = await ctx.client.embed(args.query);
  const [sem, fts] = await Promise.all([
    semanticPool(ctx.supabase, {
      storeId: ctx.storeId,
      tenantId: args.tenantId,
      queryVector,
      k: POOL_SIZE,
      maxDistance: toMaxDistance(args.minSimilarity),
    }),
    ftsPool(ctx.supabase, { storeId: ctx.storeId, tenantId: args.tenantId, query: args.query, k: POOL_SIZE }),
  ]);
  if (sem.error !== null) throw new Error(sem.error);
  if (fts.error !== null) throw new Error(fts.error);
  const pool = await rerankPool(ctx.client, args.query, mergeUnique(sem.rows, fts.rows));
  return paginate(pool, poolIndexFromCursor(args.cursor), args.limit);
}

async function doRegex(ctx: Ctx, args: RagRegexArgs): Promise<SearchPage<string>> {
  const re = compileRegex(args.pattern);
  const { rows, error } = await ftsPool(ctx.supabase, {
    storeId: ctx.storeId,
    tenantId: args.tenantId,
    query: args.pattern,
    k: POOL_SIZE,
  });
  if (error !== null) throw new Error(error);
  const matched = rows.filter((c) => re.test(c.content));
  const pool = await rerankPool(ctx.client, args.pattern, matched);
  return paginate(pool, poolIndexFromCursor(args.cursor), args.limit);
}

export function makeRagStoreService(
  supabase: SupabaseClient,
  storeId: string,
  client: InternalApiClient
): RagStoreServices {
  const ctx: Ctx = { supabase, storeId, client };
  return {
    storeId,
    searchBm25: async (tenantId, query, limit, cursor) => await doBm25(ctx, tenantId, query, limit, cursor),
    searchSemantic: async (args) => await doSemantic(ctx, args),
    searchHybrid: async (args) => await doHybrid(ctx, args),
    searchRegex: async (args) => await doRegex(ctx, args),
  };
}
```

Add to `packages/shared-store-services/src/index.ts`:

```ts
export { rerankPool } from './rag/rerank.js';
export { makeRagStoreService } from './rag/ragStoreService.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=ragStoreService`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-store-services/src/rag/rerank.ts packages/shared-store-services/src/rag/ragStoreService.ts packages/shared-store-services/src/index.ts packages/shared-store-services/src/__tests__/ragStoreService.test.ts
git commit -m "RU1: RAG factory — embed/pool/always-on-rerank/cursor-paginate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Forms + LeadScoring portable DB services

Move the conversation-metadata DB ops into the portable package. Both Forms and LeadScoring already have a **production DB path today** — the edge `toolBuilder.ts` reads/writes `conversations.metadata.{forms,lead_score}` jsonb directly via supabase-js (see `readFormDataFromMetadata` and `setLeadScoreOnConversation`). RU1 ports that exact pattern. The `metadata jsonb` column + its lead_score/forms indexes already exist (migrations `20260416100000`, `20260424000001`), so **RU1 adds no migration and uses no RPC**. Forms implements the read-only `FormsService.getFormData` (reads `metadata.forms[formId]`); LeadScoring implements `getLeadScore`/`setLeadScore` over `metadata.lead_score` via **read-merge-write** (preserving other metadata keys). Per spec §9 this makes them available wherever the factory is imported; the per-tool simulation behavior is RU3's seam.

**Files:**
- Create: `packages/shared-store-services/src/forms/formsService.ts`
- Create: `packages/shared-store-services/src/leadScoring/leadScoringService.ts`
- Modify: `packages/shared-store-services/src/index.ts`
- Test: `packages/shared-store-services/src/__tests__/leadScoringService.test.ts`

**Interfaces:**
- Consumes: `FormsService` from `@daviddh/llm-graph-runner`; `LeadScoringServices` from `@daviddh/llm-graph-runner`; `SupabaseClient`.
- Produces: `export function makeLeadScoringDbService(supabase: SupabaseClient, conversationId: string): LeadScoringServices` — `getLeadScore()` reads `conversations.metadata.lead_score`; `setLeadScore(score)` does a read-merge-write of `conversations.metadata` (preserving other keys), mirroring edge `setLeadScoreOnConversation`. **No RPC.**
- Produces: `export function makeFormsDbService(supabase: SupabaseClient): FormsService` — implements `getFormData(conversationId, formId)` by reading `conversations.metadata.forms[formId]` (mirroring edge `readFormDataFromMetadata`).

- [ ] **Step 1: Write the failing test**

Create `packages/shared-store-services/src/__tests__/leadScoringService.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { makeLeadScoringDbService } from '../leadScoring/leadScoringService.js';

function readStub(metadata: unknown): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data: { metadata }, error: null }),
  };
  return { from: () => builder, rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient;
}

describe('makeLeadScoringDbService', () => {
  it('reads lead_score from conversation metadata', async () => {
    const svc = makeLeadScoringDbService(readStub({ lead_score: 73 }), 'conv1');
    expect(await svc.getLeadScore()).toBe(73);
  });

  it('returns null when no lead_score is present', async () => {
    const svc = makeLeadScoringDbService(readStub({}), 'conv1');
    expect(await svc.getLeadScore()).toBeNull();
  });

  it('setLeadScore read-merge-writes metadata, preserving other keys', async () => {
    let written: unknown = null;
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { metadata: { forms: { a: 1 } } }, error: null }) }) }),
        update: (patch: unknown) => ({
          eq: async () => {
            written = patch;
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const svc = makeLeadScoringDbService(client, 'conv1');
    await svc.setLeadScore(88);
    expect(written).toEqual({ metadata: { forms: { a: 1 }, lead_score: 88 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=leadScoringService`
Expected: FAIL — `Cannot find module '../leadScoring/leadScoringService.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared-store-services/src/leadScoring/leadScoringService.ts`:

```ts
import type { LeadScoringServices } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

// DB-backed lead scoring over conversation metadata. Portable (supabase-js only).
// No RPC: read-merge-write the `metadata` jsonb (column exists since migration
// 20260416100000); RU1 introduces no migration. Mirrors edge `setLeadScoreOnConversation`.
function isMetadataRow(v: unknown): v is { metadata: Record<string, unknown> | null } {
  return typeof v === 'object' && v !== null && 'metadata' in v;
}

async function readScore(supabase: SupabaseClient, conversationId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  if (error !== null) throw new Error(error.message);
  if (!isMetadataRow(data) || data.metadata === null) return null;
  const raw = data.metadata['lead_score'];
  return typeof raw === 'number' ? raw : null;
}

async function writeScore(supabase: SupabaseClient, conversationId: string, score: number): Promise<void> {
  // Read-merge-write so we never clobber other metadata keys (e.g. forms).
  const { data, error: readErr } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  if (readErr !== null) throw new Error(readErr.message);
  const current = isMetadataRow(data) && data.metadata !== null ? data.metadata : {};
  const { error: writeErr } = await supabase
    .from('conversations')
    .update({ metadata: { ...current, lead_score: score } })
    .eq('id', conversationId);
  if (writeErr !== null) throw new Error(writeErr.message);
}

export function makeLeadScoringDbService(supabase: SupabaseClient, conversationId: string): LeadScoringServices {
  return {
    getLeadScore: async () => await readScore(supabase, conversationId),
    setLeadScore: async (score) => {
      await writeScore(supabase, conversationId, score);
    },
  };
}
```

Create `packages/shared-store-services/src/forms/formsService.ts` by porting `packages/web/app/lib/forms/formsQueries.ts` to an injected `SupabaseClient` (replace `await createClient()` with the passed client) wrapped in the `FormsService` shape. Keep the file under 300 lines; if it approaches the limit, split the four query helpers into `formsQueries.ts` and keep only the factory here. The factory:

```ts
import type { FormsService } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  applyFormFieldsAtomicQuery,
  queryFormData,
  queryFormsForAgent,
  recordFailedAttemptQuery,
} from './formsQueries.js';

export function makeFormsDbService(supabase: SupabaseClient): FormsService {
  return {
    getFormDefinitions: async (agentId) => await queryFormsForAgent(supabase, agentId),
    getFormData: async (conversationId, formId) => await queryFormData(supabase, conversationId, formId),
    applyFormFieldsAtomic: async (args) => await applyFormFieldsAtomicQuery(supabase, args),
    recordFailedAttempt: async (conversationId, formId, attempt) => {
      await recordFailedAttemptQuery(supabase, conversationId, formId, attempt);
    },
  };
}
```

Create `packages/shared-store-services/src/forms/formsQueries.ts` as the verbatim port of `packages/web/app/lib/forms/formsQueries.ts`, with these mechanical changes: (1) drop the `createClient` import and its calls; (2) add `supabase: SupabaseClient` as the first parameter of `queryFormsForAgent`, `queryFormData`, `applyFormFieldsAtomicQuery`, `recordFailedAttemptQuery`, and `callRpc`; (3) import `applyFormFields` and the form types from `@daviddh/llm-graph-runner` (already exported); (4) import `OutputSchemaField` from `@daviddh/graph-types`. Add `@daviddh/graph-types` to the package `dependencies` (`"@daviddh/graph-types": "*"`). The body otherwise stays identical to the source.

Add to `packages/shared-store-services/src/index.ts`:

```ts
export { makeLeadScoringDbService } from './leadScoring/leadScoringService.js';
export { makeFormsDbService } from './forms/formsService.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/shared-store-services -- --testPathPattern=leadScoringService`
Expected: PASS (3 tests). Then `npm run typecheck -w packages/shared-store-services` to confirm the Forms port compiles.
Expected: typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-store-services/src/forms/formsService.ts packages/shared-store-services/src/forms/formsQueries.ts packages/shared-store-services/src/leadScoring/leadScoringService.ts packages/shared-store-services/src/index.ts packages/shared-store-services/package.json package-lock.json packages/shared-store-services/src/__tests__/leadScoringService.test.ts
git commit -m "RU1: portable Forms + LeadScoring DB services

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: KV + RAG provider buildTools/descriptors — cursor params, drop total

Updates the LLM-facing tool schemas + descriptions: search inputs swap `offset` for `cursor`, and the response-shape copy moves from `{ total, offset, truncated }` to `{ limit, nextCursor }`. Tells the LLM to keep paging while `nextCursor != null`.

**Files:**
- Modify: `packages/api/src/providers/kv_store/buildTools.ts`
- Modify: `packages/api/src/providers/kv_store/descriptors.ts`
- Modify: `packages/api/src/providers/kv_store/descriptions.ts`
- Modify: `packages/api/src/providers/rag/buildTools.ts`
- Modify: `packages/api/src/providers/rag/descriptors.ts`
- Modify: `packages/api/src/providers/rag/descriptions.ts`
- Test: `packages/api/src/providers/kv_store/__tests__/buildTools.cursor.test.ts`

**Interfaces:**
- Consumes: updated `KvStoreServices`/`RagStoreServices` from Task 2 (`searchSubstring(args)` where args has `cursor?` not `offset`; `listKeys(tenantId, limit, cursor?)`).
- Produces: `CURSOR_DESC` and `NEXT_CURSOR_DESC` constants in both descriptions files; tool inputs accept optional `cursor: string`.

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/providers/kv_store/__tests__/buildTools.cursor.test.ts`:

```ts
import { buildKvTools } from '../buildTools.js';
import type { KvStoreServices, ProviderCtx } from '../../provider.js';

function fakeServices(): KvStoreServices {
  return {
    storeId: 's',
    listKeys: async (_t, limit, cursor) => ({ items: [cursor ?? 'first'], limit, nextCursor: null }),
    getValues: async () => ({}),
    searchSubstring: async (args) => ({ items: [{ key: args.cursor ?? 'k', value: 'v' }], limit: args.limit, nextCursor: null }),
    searchRegex: async (args) => ({ items: [], limit: args.limit, nextCursor: null }),
    updateValue: async () => ({ success: true }),
  };
}

function ctx(): ProviderCtx {
  return { tenantId: 't', services: () => fakeServices() } as unknown as ProviderCtx;
}

describe('KV search accepts a cursor and rejects offset', () => {
  it('threads cursor through to searchSubstring', async () => {
    const tools = await buildKvTools({ toolNames: ['search'], ctx: ctx() });
    const search = tools.search;
    expect(search).toBeDefined();
    const out = await search!.execute({ mode: 'substring', on: 'both', query: 'q', cursor: 'abc', limit: 5 });
    expect(out).toEqual({ items: [{ key: 'abc', value: 'v' }], limit: 5, nextCursor: null });
  });

  it('rejects an offset field (no longer in schema)', async () => {
    const tools = await buildKvTools({ toolNames: ['search'], ctx: ctx() });
    await expect(tools.search!.execute({ mode: 'substring', query: 'q', offset: 3, limit: 5 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=buildTools.cursor`
Expected: FAIL — the search schema still has `offset`/no `cursor`, so the cursor isn't threaded (or offset isn't rejected).

- [ ] **Step 3: Write minimal implementation**

In `packages/api/src/providers/kv_store/descriptions.ts`: remove `OFFSET_DESC`, `RESPONSE_TOTAL_DESC`, `RESPONSE_OFFSET_DESC`, `RESPONSE_TRUNCATED_DESC`. Add:

```ts
export const CURSOR_DESC =
  'Opaque continuation token. Omit on the first call. To get the next page, pass back the ' +
  '`nextCursor` value from the previous response verbatim — do not parse or construct it yourself.';

export const NEXT_CURSOR_DESC =
  'Opaque token for the next page, or `null` when there are no more matches. ' +
  'Keep calling with this value (as `cursor`) until it is `null` to page through all matches.';
```

Update `SEARCH_LIMIT_DESC` to say "max MATCHES per page" wording, and update `SEARCH_TOOL_DESC` to end with "Returns `{ items, limit, nextCursor }`; page by passing `nextCursor` back as `cursor` until it is `null`." Update `SEARCH_QUERY_DESC` unchanged.

In `packages/api/src/providers/kv_store/buildTools.ts`: replace the `OFFSET_DESC` import with `CURSOR_DESC`; in `listKeysInput` and `searchInput` replace the `offset: z.number()...` field with `cursor: z.string().optional().describe(CURSOR_DESC)`; remove the `OFFSET_MIN` constant if now unused. Update `executeListKeys` to `ctx.services.listKeys(ctx.tenantId, input.limit, input.cursor)`. Update `executeSearchSubstring`/`executeSearchRegex` to pass `cursor: input.cursor` instead of `offset: input.offset`.

In `packages/api/src/providers/kv_store/descriptors.ts`: replace `OFFSET_DESC` import with `CURSOR_DESC`; replace `offsetSchema` with `const cursorSchema: RawJsonSchema = { type: 'string', description: CURSOR_DESC };`; in `listKeysDescriptor` and `searchDescriptor` properties replace `offset: offsetSchema` with `cursor: cursorSchema`.

Apply the symmetric changes to the three RAG files: in `packages/api/src/providers/rag/descriptions.ts` remove `RAG_OFFSET_DESC`, `RAG_RESPONSE_TOTAL_DESC`, `RAG_RESPONSE_OFFSET_DESC`, `RAG_RESPONSE_TRUNCATED_DESC`; add `RAG_CURSOR_DESC` + `RAG_NEXT_CURSOR_DESC` (same copy as above); change the tool-level `RAG_SEARCH_TOOL_DESC` final line from `Returns paginated \`{ items: string[], total, offset, limit, truncated? }\`...` to `Returns \`{ items: string[], limit, nextCursor }\`; page by passing \`nextCursor\` back as \`cursor\` until it is \`null\`.`. In `rag/buildTools.ts` and `rag/descriptors.ts` replace `offset` with `cursor` (string, optional) exactly as for KV, and thread `cursor` through `executeBm25` (`searchBm25(tenantId, query, limit, cursor)`), `executeSemantic`, `executeHybrid`, `executeRegex`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=buildTools.cursor`
Expected: PASS (2 tests). Also run the existing KV/RAG provider suites to catch fallout: `npm run test -w packages/api -- --testPathPattern=providers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/kv_store/buildTools.ts packages/api/src/providers/kv_store/descriptors.ts packages/api/src/providers/kv_store/descriptions.ts packages/api/src/providers/rag/buildTools.ts packages/api/src/providers/rag/descriptors.ts packages/api/src/providers/rag/descriptions.ts packages/api/src/providers/kv_store/__tests__/buildTools.cursor.test.ts
git commit -m "RU1: KV/RAG tool schemas + descriptions — cursor params, drop total/offset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Backend + edge re-export shims

Repoint the backend and edge store-service factories at the new package so mid-migration callers are untouched, and remove the edge's `validateRegexPattern` usage (replaced by in-process re2js) while adding the edge rerank client. Backend gains the new dependency; native `re2` import leaves `kvStoreService.ts`.

**Files:**
- Modify: `packages/backend/src/services/kvStoreService.ts`
- Modify: `packages/backend/src/services/ragStoreService.ts`
- Modify: `packages/backend/package.json`
- Modify: `supabase/functions/execute-agent/kvStoreServices.ts`
- Modify: `supabase/functions/execute-agent/ragStoreServices.ts`
- Modify: `supabase/functions/execute-agent/internalApiClient.ts`
- Test: `packages/backend/src/services/kvStoreService.test.ts` (retarget to the re-export)

**Interfaces:**
- Consumes: `makeKvStoreService`, `makeRagStoreService`, `makeInternalApiClient` from `@openflow/shared-store-services`.
- Produces: backend `makeKvStoreService(supabase, storeId)` (unchanged signature), `makeRagStoreService(supabase, storeId)` — the backend wrapper constructs an internal-api client from env (`process.env.BACKEND_INTERNAL_URL`/`EDGE_FUNCTION_MASTER_KEY`) and passes it through.

- [ ] **Step 1: Write the failing test**

Replace the body of `packages/backend/src/services/kvStoreService.test.ts` with a shim-identity test (the deep behavior is now tested in the shared package):

```ts
import { makeKvStoreService as shared } from '@openflow/shared-store-services';

import { makeKvStoreService } from './kvStoreService.js';

describe('backend kvStoreService re-export shim', () => {
  it('re-exports the shared factory', () => {
    expect(makeKvStoreService).toBe(shared);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=kvStoreService`
Expected: FAIL — backend `makeKvStoreService` is still the local implementation, not the shared one.

- [ ] **Step 3: Write minimal implementation**

Add `"@openflow/shared-store-services": "*"` to `packages/backend/package.json` `dependencies` and remove the `"re2": "^1.24.1"` line. Run `npm install`.

Replace `packages/backend/src/services/kvStoreService.ts` entirely with:

```ts
// Re-export shim (RU1 transition). The implementation now lives in
// @openflow/shared-store-services so Node, Worker, and Deno share one copy.
// Old file deletion happens in RU6.
export { makeKvStoreService } from '@openflow/shared-store-services';
```

Replace `packages/backend/src/services/ragStoreService.ts` entirely with a shim that builds the internal client from env and binds it:

```ts
import {
  makeInternalApiClient,
  makeRagStoreService as makeShared,
} from '@openflow/shared-store-services';
import type { RagStoreServices } from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

function internalClient(): ReturnType<typeof makeInternalApiClient> {
  return makeInternalApiClient({
    baseUrl: process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:3001',
    masterKey: process.env.EDGE_FUNCTION_MASTER_KEY ?? '',
  });
}

export function makeRagStoreService(supabase: SupabaseClient, storeId: string): RagStoreServices {
  return makeShared(supabase, storeId, internalClient());
}
```

(If the backend currently calls Vertex in-process for embeddings rather than over `/internal/embed`, keep `BACKEND_INTERNAL_URL` pointing at the backend's own internal router — the route exists and is master-key-gated.) Update `packages/backend/src/services/ragStoreService.test.ts` similarly to assert it returns a `RagStoreServices` with `searchBm25` defined (it is no longer a pure identity since it injects a client).

For the edge: replace `supabase/functions/execute-agent/kvStoreServices.ts` and `ragStoreServices.ts` bodies with re-exports from the package (import map alias `@openflow/shared-store-services`; if the edge import map cannot resolve the workspace package, re-export via a relative path to the built `dist` or a Deno-friendly alias — match the existing `@daviddh/llm-graph-runner` resolution already used in these files):

```ts
export { makeKvStoreService } from '@openflow/shared-store-services';
```
```ts
export { makeRagStoreService } from '@openflow/shared-store-services';
```

In `supabase/functions/execute-agent/internalApiClient.ts`: remove `validateRegexPattern` and its `HTTP_BAD_REQUEST`/`ToolError` regex branch; add a `rerank(input)` function calling `POST /internal/rerank` mirroring `embedText`'s auth + error handling. Any remaining edge callers of `validateRegexPattern` (none remain once the store services re-export) are removed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=kvStoreService`
Expected: PASS. Then `npm run typecheck -w packages/backend`.
Expected: typecheck clean (no remaining `re2` import).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/kvStoreService.ts packages/backend/src/services/ragStoreService.ts packages/backend/src/services/kvStoreService.test.ts packages/backend/src/services/ragStoreService.test.ts packages/backend/package.json package-lock.json supabase/functions/execute-agent/kvStoreServices.ts supabase/functions/execute-agent/ragStoreServices.ts supabase/functions/execute-agent/internalApiClient.ts
git commit -m "RU1: backend + edge re-export shims; edge rerank client; drop edge regex-validate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: FE rerank-toggle removal + i18n + dashboard param removal

Removes the rerank checkbox from the dashboard RAG search (FE), its i18n keys, and the `rerank` param from `ragFiles.ts` + the BE dashboard handlers (`searchChunks.ts`/`hybridSearch.ts`). Rerank becomes unconditional in the dashboard path.

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagSearchBar.tsx`
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagTenantContent.tsx`
- Modify: `packages/web/app/lib/ragFiles.ts`
- Modify: `packages/web/messages/en.json`
- Modify: `packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts`
- Modify: `packages/backend/src/routes/ragStores/ragFiles/hybridSearch.ts`
- Test: `packages/backend/src/routes/ragStores/ragFiles/__tests__/searchChunks.rerank.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SearchParams` (in `searchChunks.ts`) no longer has a `rerank` field; `fetchTextPool`/`maybeRerankTextPool` always rerank.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/routes/ragStores/ragFiles/__tests__/searchChunks.rerank.test.ts`:

```ts
import type { SearchParams } from '../searchChunks.js';

describe('dashboard SearchParams drops the rerank flag', () => {
  it('has no rerank property', () => {
    const p: SearchParams = {
      storeId: 's',
      tenantId: 't',
      mode: 'semantic',
      query: 'q',
      k: 5,
      minSimilarity: 0.5,
      maxDistance: null,
    };
    // @ts-expect-error rerank was removed from SearchParams
    const r = p.rerank;
    expect(r).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=searchChunks.rerank`
Expected: FAIL — `SearchParams` still has `rerank`, so the `@ts-expect-error` directive is unused and compilation fails.

- [ ] **Step 3: Write minimal implementation**

In `packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts`: remove `rerank: boolean` from the `SearchParams` interface; remove the `parseBoolean` import if now unused and the `const rerank = parseBoolean(...)` line + `rerank` from the returned object in `parseParams`. In `fetchTextPool` replace `const poolSize = p.rerank ? RERANK_CANDIDATE_POOL : p.k;` with `const poolSize = RERANK_CANDIDATE_POOL;`. In `maybeRerankTextPool` remove the `if (!p.rerank) return pool;` guard so it always reranks; rename it to `rerankTextPool` (and update its caller in `runSemanticPipeline`). In `runSemanticSearch` remove `rerank=${String(p.rerank)}` from the log line.

In `packages/backend/src/routes/ragStores/ragFiles/hybridSearch.ts`: it imports `SearchParams` from `searchChunks.ts`; no `rerank` reference remains there (it already always reranks via `applyRerank`), so only confirm it still typechecks.

In `packages/web/app/lib/ragFiles.ts`: remove `rerank?: boolean;` from `SearchOptions`; remove `rerank: options.rerank,` from the `search()` body.

In `RagSearchBar.tsx`: delete the `RerankToggle` component + `RerankToggleProps` + `RERANK_MIN_K`; remove `rerank`, `onRerankChange` from `RagSearchBarProps` and `SearchControlsProps`; remove the `rerankAvailable`/`showRerankToggle`/`rerankForced` logic and the `<RerankToggle .../>` block in `SearchControls`; drop the `rerank`/`onRerankChange` props passed down from `RagSearchBar`.

In `RagTenantContent.tsx`: remove `rerank`/`setRerank` from `UseTenantSearchReturn` and `SearchParamsState`; remove `const [rerank, setRerank] = useState(false);`, `RERANK_MIN_K`, `effectiveRerank`; in `executeSearch` drop `rerank: params.rerank` from the `searchAction` options; in `useTenantSearch`'s return drop `rerank`/`setRerank`; in `submit` pass the params without `rerank`; remove `rerank={search.rerank}` and `onRerankChange={search.setRerank}` from the `<RagSearchBar>` render.

In `packages/web/messages/en.json`: delete the `"rerankLabel"` and `"rerankTooltip"` lines under `knowledgeBase.ragSearch`; reword `knowledgeBase.ragSearch.description.hybrid` to drop the cross-encoder/rerank mention, e.g. `"Mixes lexical and semantic candidates and merges them by relevance."`. Leave the unrelated `tools…extract.params.query` rerank string at line ~2191 untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=searchChunks.rerank`
Expected: PASS (1 test). Then `npm run typecheck -w packages/web` and `npm run lint -w packages/web`.
Expected: clean (no dangling `rerank` references).

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/orgs/[slug]/\(dashboard\)/knowledge-base/rag/[storeSlug]/RagSearchBar.tsx packages/web/app/orgs/[slug]/\(dashboard\)/knowledge-base/rag/[storeSlug]/RagTenantContent.tsx packages/web/app/lib/ragFiles.ts packages/web/messages/en.json packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts packages/backend/src/routes/ragStores/ragFiles/hybridSearch.ts packages/backend/src/routes/ragStores/ragFiles/__tests__/searchChunks.rerank.test.ts
git commit -m "RU1: remove FE rerank toggle + i18n; rerank always-on in dashboard path

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Replace native `re2` in shared-validation with re2js; final cleanup

Replaces the last native `re2` consumer (`shared-validation/kv/matcher.ts`) with re2js so the dependency can be removed repo-wide, and runs the full check to confirm no dangling `re2` / `regex/validate` references remain.

**Files:**
- Modify: `packages/shared-validation/src/kv/matcher.ts`
- Modify: `packages/shared-validation/package.json`
- Test: `packages/shared-validation/src/kv/__tests__/matcher.re2js.test.ts`

**Interfaces:**
- Consumes: `RE2JS` from `re2js`; `FilterMatcher`, `FilterOn`, `KvEntry` from `./filter.js` (unchanged).
- Produces: `filterByMatcher` unchanged signature; regex branch now linear-time.

- [ ] **Step 1: Write the failing test**

Create `packages/shared-validation/src/kv/__tests__/matcher.re2js.test.ts`:

```ts
import { filterByMatcher } from '../matcher.js';

const entries = [
  { key: 'order:1', value: 'foobar' },
  { key: 'order:2', value: 'baz' },
];

describe('filterByMatcher with re2js', () => {
  it('matches a regex on values', () => {
    const out = filterByMatcher(entries, 'values', { kind: 'regex', pattern: 'foo.*bar', flags: '' });
    expect(out.map((e) => e.key)).toEqual(['order:1']);
  });

  it('stays linear on a catastrophic pattern', () => {
    const start = Date.now();
    filterByMatcher([{ key: 'k', value: 'a'.repeat(40) + 'b' }], 'values', {
      kind: 'regex',
      pattern: '(a+)+$',
      flags: '',
    });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared-validation -- --testPathPattern=matcher.re2js`
Expected: FAIL initially only if re2js is not yet a dep; otherwise the native-re2 import path is still in place. (If it passes by accident before the edit, proceed — the edit makes the dependency removable.)

- [ ] **Step 3: Write minimal implementation**

In `packages/shared-validation/package.json`: replace `"re2": "^1.24.1"` with `"re2js": "^2.8.3"`. Run `npm install`.

In `packages/shared-validation/src/kv/matcher.ts`: replace `import RE2 from 're2';` with `import { RE2JS } from 're2js';`, update the header comment (it is now portable — no native addon; the FE-only restriction relaxes, but keep the subpath export to avoid pulling re2js into the FE bundle unnecessarily), and change the regex branch:

```ts
import { RE2JS } from 're2js';

import type { FilterMatcher, FilterOn, KvEntry } from './filter.js';

function matchSubstring(s: string, query: string, ci: boolean): boolean {
  if (query === '') return true;
  if (ci) return s.toLowerCase().includes(query.toLowerCase());
  return s.includes(query);
}

function applyMatch(entry: KvEntry, on: FilterOn, fn: (s: string) => boolean): boolean {
  if (on === 'keys') return fn(entry.key);
  if (on === 'values') return fn(entry.value);
  return fn(entry.key) || fn(entry.value);
}

function compileFlags(flags: string): number {
  return flags.includes('i') ? RE2JS.CASE_INSENSITIVE : 0;
}

export function filterByMatcher<T extends KvEntry>(entries: T[], on: FilterOn, matcher: FilterMatcher): T[] {
  if (matcher.kind === 'substring') {
    return entries.filter((e) =>
      applyMatch(e, on, (s) => matchSubstring(s, matcher.query, matcher.caseInsensitive))
    );
  }
  const re = RE2JS.compile(matcher.pattern, compileFlags(matcher.flags));
  return entries.filter((e) => applyMatch(e, on, (s) => re.test(s)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/shared-validation -- --testPathPattern=matcher.re2js`
Expected: PASS (2 tests). Then verify no native re2 / dead hop remains:

Run: `grep -rn "from 're2'" packages/ supabase/ ; grep -rn "regex/validate" packages/ supabase/ ; grep -rn '"re2":' packages/`
Expected: no output (only `re2js` should appear elsewhere). Finally:

Run: `npm run check`
Expected: format + lint + typecheck all green across every workspace.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-validation/src/kv/matcher.ts packages/shared-validation/package.json package-lock.json packages/shared-validation/src/kv/__tests__/matcher.re2js.test.ts
git commit -m "RU1: replace native re2 with re2js in shared-validation; remove re2 dependency

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

Spec-section → task coverage:

- **§2 / §4 New `packages/shared-store-services`** → Tasks 1, 3–6, 8, 9 (full package: pagination, kv queries/regex/factory, rag queries/client/factory, forms/leadscoring).
- **§2 / §6 KV regex via re2js + trigram-ILIKE prefilter + bounded keyset scan; drop native re2 + /internal/regex/validate** → Task 4 (re2js + literal extraction), Task 3 (ILIKE prefilter + keyset scan queries), Task 5 (prefilter/scan-fallback + row/byte budgets + forward progress), Task 7 (drop regex-validate route), Task 11 (drop edge regex-validate), Task 13 (drop native re2 dep).
- **§2 / §5 Uniform opaque-cursor, match-count pagination (offset/total dropped)** → Task 1 (codec + SearchPage), Task 2 (provider contract), Tasks 5 & 8 (per-mode cursors), Task 10 (tool schema + description copy).
- **§2 / §7 RAG embed→pool→always-on-rerank→cursor-paginate; new /internal/rerank; query embedding via /internal/embed** → Task 6 (embed/rerank client + rag queries), Task 7 (BE /internal/rerank), Task 8 (always-on rerank + pool→cursor→vector-continuation).
- **§2 / §8 Remove FE rerank toggle + i18n; drop rerank param from ragFiles/searchChunks/hybridSearch; rerank unconditional** → Task 12 (FE + i18n + dashboard handler param removal), Task 8 (agent path always reranks).
- **§9 Forms/LeadScoring portable extraction** → Task 9.
- **§10 Re-export shims during transition (backend + edge); native re2 removed; /internal/regex/validate + edge client usage removed** → Task 11 (backend + edge shims, edge regex-validate client removed), Task 7 (route removed), Task 13 (re2 dep removed). File deletions of old copies are explicitly RU6 (per §10) — out of scope here.
- **§11 Tests** → every task is TDD (failing test → impl → pass): parity/contract (Tasks 2, 9, 12), cursor pagination (Tasks 1, 5, 8, 10), KV regex dialect + literal soundness + ReDoS-safety + scan/byte budget + forward progress (Tasks 4, 5), RAG always-on rerank + pool/vector continuation (Task 8), portability (re2js used identically in shared-store-services and shared-validation, Tasks 4 & 13). Final `npm run check` green is the gate in Task 13.
- **§12 Risks** → tool-description guidance to keep paging while `nextCursor != null` (Task 10 `NEXT_CURSOR_DESC`); sparse-no-literal forward-progress (Task 5 test); `total` removal as a contract change (Tasks 2 & 10).

Type/signature consistency checks performed: `SearchPage<T>` shape identical in Tasks 1/2/5/8; `KvKeysetCursor`/`KvRegexScanCursor`/`RagPoolCursor` defined once in Task 1 and consumed by name in Tasks 5/8; `makeInternalApiClient` return type from Task 6 consumed by Task 8 (`InternalApiClient`) and Task 11; `makeRagStoreService(supabase, storeId, client)` 3-arg signature consistent across Tasks 8 & 11; `rerankRecords({ query, records, topN })` BE shape (Task 7) matches the client request body (Task 6) and the BE handler returns `{ records }` matching `parseReranked` (Task 6). No placeholders; every code step contains complete, real code with verified re2js/supabase-js signatures.

**Correction applied (the draft flagged this as uncertain — it was wrong).** Task 9's Forms/LeadScoring are **not** simulation-only and need **no** RPC and **no** migration. Verified against the code: production already persists `conversations.metadata.{lead_score,forms}` jsonb **directly** via supabase-js (edge `setLeadScoreOnConversation` / `readFormDataFromMetadata`), and the `metadata jsonb` column + indexes already exist (migrations `20260416100000`, `20260424000001`). Task 9 was corrected to port that exact read-merge-write pattern (no `write_conversation_lead_score` RPC). Every §2–§13 requirement maps to a task.
