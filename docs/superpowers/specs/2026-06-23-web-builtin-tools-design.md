# `openflow/web` builtin tool group — design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Author:** David Domínguez (with Claude)

## Goal

Give agent builders a builtin group of web tools (`openflow/web`) — web search,
content extraction, site crawl, and site map — modeled exactly on Tavily's tool
schemas, but **wrapped behind our own abstraction** so we own the connection. We
can swap Tavily for another provider, or our own web-search infrastructure,
later by reimplementing one service module — no change to the agent-facing
contract or the rest of the system.

## Scope

### In scope

Four tools, exposed under provider id `web`:

| Agent-facing tool | LLM-facing name | Tavily REST endpoint |
| --- | --- | --- |
| `search`  | `web__search`  | `POST /search`  |
| `extract` | `web__extract` | `POST /extract` |
| `crawl`   | `web__crawl`   | `POST /crawl`   |
| `map`     | `web__map`     | `POST /map`     |

### Out of scope (deferred)

- **`research`** — Tavily's `/research` endpoint is private-beta / waitlist-only
  ([deepresearch.tavily.com](https://deepresearch.tavily.com/)) and is
  **asynchronous** (submit → poll status / stream by `request_id`). It does not
  fit a synchronous tool call and is not available on a standard key. Add later
  as a distinct async tool once beta access is granted.
- A per-org / per-tenant API key. For now a single platform key is used.
- A backend `/internal/web/*` route. Not needed — see "Connection" below.

## Key decisions

1. **Wrap, don't passthrough-MCP.** We do **not** connect agents to Tavily's MCP
   endpoint. We call Tavily's **REST API** directly. The MCP is not involved at
   runtime at all.
2. **Agent-facing input schemas = Tavily's MCP tool schemas** (the curated
   subset Tavily designed for agent use), with the `tavily_` prefix stripped.
   These are a strict subset of the REST parameters, so they map straight
   through. This keeps the LLM surface tight (vs. dumping all ~20 REST params).
3. **Outputs are passed through verbatim.** The tool `result` is Tavily's REST
   JSON response, unmodified.
4. **Always request usage/cost.** The service **unconditionally injects
   `include_usage: true`** into every outgoing REST body. This is *not* an
   agent-facing parameter — the LLM cannot set or unset it. Every Tavily
   response therefore carries a `usage` object (credits consumed), which we
   return in the result and log for cost tracking. See "Cost tracking".
5. **Connection lives in the edge function**, mirroring the existing `calendar`
   builtin (which calls Google directly). Plain `fetch` to `api.tavily.com`;
   `TAVILY_API_KEY` read from `Deno.env` (set as a Supabase secret).
6. **The swap-seam is the `WebSearchService` interface** in `packages/api`. To
   change provider, reimplement that interface; nothing else changes.

## Architecture

```
agent step
  → tool web__search  (registry, packages/api/src/providers/web)
    → execute(args)                       // zod-validate against MCP-derived schema
      → ctx.services('web').search(args)  // WebSearchService (the swap-seam)
        → edge preparer impl: fetch POST https://api.tavily.com/search
            Authorization: Bearer <TAVILY_API_KEY from Deno.env>
            body: { ...args, include_usage: true }   // usage always on
          → return parsed JSON verbatim
      → { result: <tavily json> }         // includes `usage`
```

Three layers, each independently understandable and testable:

- **`packages/api/src/providers/web/`** — the provider: tool descriptors
  (schemas), descriptions, and `buildTools` (zod parse → call service → wrap
  result). Knows nothing about Tavily or HTTP. Depends only on the
  `WebSearchService` interface via `ctx.services('web')`.
- **`WebSearchService` interface** (`packages/api`) — the contract:
  `search/extract/crawl/map`, each `(args) => Promise<unknown>`. The swap point.
- **Edge preparer** (`supabase/functions/execute-agent/`) — the only place that
  knows it's Tavily: constructs a `WebSearchService` backed by `fetch` to
  `api.tavily.com`, injecting auth + `include_usage`.

## Components & files

### A. API package — the provider (new)

Follows the `kv_store` / `lead_scoring` pattern exactly.

- `packages/api/src/providers/web/descriptions.ts` — LLM-facing description
  strings for each tool and parameter (sourced from the Tavily MCP descriptions
  in the appendix).
- `packages/api/src/providers/web/descriptors.ts` — tool-name constants
  (`WEB_SEARCH_TOOL_NAME = 'search'`, etc.) and the `ToolDescriptor[]`
  (`inputSchema` = the JSON schemas in the appendix, de-`tavily_`'d).
- `packages/api/src/providers/web/buildTools.ts` — zod input schemas mirroring
  the descriptors, `execute` handlers that parse args, call the resolved
  `WebSearchService`, and return `{ result }`. Exports `buildWebTools` and the
  `WebSearchServices` bundle type. Resolves the service via
  `ctx.services('web')` with a runtime shape check (like `lead_scoring`).
- `packages/api/src/providers/web/index.ts` — exports `webProvider:
  BuiltinProvider<'web', typeof TOOL_NAMES>` with `displayName`
  `'OpenFlow/Web'`, `describeTools`, `buildTools`.

> File-size note: ESLint caps files at 300 lines and functions at 40. Search
> alone has 15 params. Keep `descriptors.ts` lean by factoring shared param
> schemas (e.g. `select_paths`, `select_domains`, `format`, `extract_depth`,
> `max_depth/breadth/limit` shared by crawl+map) into small reusable consts. If
> a file approaches the limit, split per-tool (e.g. `descriptors/search.ts`).

### B. API package — registry wiring (edits)

- `packages/api/src/providers/bundles.ts`:
  - add `'web'` to the `BuiltinProviderId` union,
  - add `'web'` to `BUILTIN_PROVIDER_IDS`,
  - add `web: WebSearchServices | undefined` to `BuiltinBundles`.
- `packages/api/src/providers/index.ts`: import `webProvider` and add
  `['web', webProvider]` to `builtInEntries`.

### C. Edge function — service implementation (new + edits)

- New `supabase/functions/execute-agent/webServices.ts`:
  `makeWebSearchService()` returning an object implementing `WebSearchService`.
  Each method: `fetch` POST to `https://${TAVILY_HOST}/<endpoint>` with
  `Authorization: Bearer ${Deno.env.get('TAVILY_API_KEY')}`, body =
  `{ ...args, include_usage: true }`, parse JSON, log `usage`, return JSON.
  Throw `ToolError` on non-2xx (consistent with `internalApiClient.ts`).
- `supabase/functions/execute-agent/toolBuilder.ts`: add `prepareWebBundle`
  (returns `undefined` if `TAVILY_API_KEY` unset, else the service) and register
  it in the `PREPARERS` map under `web`.

### D. Web package — translations (edit)

- `packages/web/messages/en.json`: add a `toolCatalog.web` block —
  `groupName`, and for each of the four tools a `description` plus a
  `params.<paramName>` entry for every parameter. **Required** — the existing
  `toolCatalog.test.ts` fails CI if any provider/tool/param translation is
  missing. (No UI/component changes: `ToolsPanel`/`ToolCombobox` render the
  registry generically; `__web__` source-id encoding is automatic.)

### E. Config / secrets

- `TAVILY_API_KEY` — set as a Supabase Edge Function secret. Read via
  `Deno.env.get('TAVILY_API_KEY')`.
- Optional `TAVILY_API_BASE_URL` (default `https://api.tavily.com`) to ease
  future swapping / testing.

## Cost tracking

- `include_usage: true` is injected on every call (not agent-controllable), so
  every response includes Tavily's `usage` object (e.g. `{ credits: N }`).
- The service logs usage per call via `ctx.logger` (the edge runner logger),
  e.g. `logger.info('[web] tavily <tool> usage', { credits, request_id })`, so
  consumption is observable in logs immediately.
- The raw `usage` is also returned inside the tool `result`.
- **Deferred:** persisting usage to a per-org accounting table. Logging +
  passthrough is sufficient for now; persistence is a follow-up.

## Error handling

- Input validation: zod parse in `execute` (invalid args → validation error).
- Service: non-2xx from Tavily → `ToolError` with a provider-neutral message
  (do not leak the API key; do surface Tavily's `error`/status). Network/timeout
  errors → `ToolError`.
- Missing `TAVILY_API_KEY`: `prepareWebBundle` returns `undefined`, so
  `buildWebTools` returns `{}` (tools simply don't materialize), matching how
  `lead_scoring`/`calendar` degrade when their bundle is absent.

## Testing

- **API package (Jest):** `buildWebTools` — given a fake `WebSearchService` in
  `ctx.services`, asserts each tool validates args, forwards the parsed args,
  and wraps the response as `{ result }`. Assert unknown/absent service →
  `{}`. Assert the descriptor tuple matches `describeTools` (the existing
  backstop test already enforces tuple↔descriptor parity).
- **Service unit test:** `makeWebSearchService` with a stubbed `fetch` —
  asserts correct URL/method/auth header, that `include_usage: true` is always
  present in the body, verbatim passthrough of the JSON, and `ToolError` on
  non-2xx.
- **Translations:** existing `toolCatalog.test.ts` covers presence; just make it
  pass by adding the `toolCatalog.web` block.
- **`npm run check`** (format + lint + typecheck) must pass.

## Appendix — agent-facing input schemas (de-`tavily_`'d)

Names are the Tavily MCP tool schemas with the `tavily_` prefix removed.
Descriptions are carried over verbatim. `include_usage` is intentionally absent
here — it is injected by the service, not exposed to the agent.

### `search`  (required: `query`)

`query: string`, `max_results: int = 5`,
`search_depth: enum(basic|advanced|fast|ultra-fast) = basic`,
`topic: const "general"`, `time_range: enum(day|week|month|year)|null = null`,
`include_images: bool = false`, `include_image_descriptions: bool = false`,
`include_raw_content: bool = false`, `include_domains: string[] = []`,
`exclude_domains: string[] = []`, `country: string = ""`,
`include_favicon: bool = false`, `start_date: string(YYYY-MM-DD) = ""`,
`end_date: string(YYYY-MM-DD) = ""`, `exact_match: bool|null = null`.

### `extract`  (required: `urls`)

`urls: string[]`, `extract_depth: enum(basic|advanced) = basic`,
`include_images: bool = false`, `format: enum(markdown|text) = markdown`,
`include_favicon: bool = false`, `query: string = ""`.

### `crawl`  (required: `url`)

`url: string`, `max_depth: int>=1 = 1`, `max_breadth: int>=1 = 20`,
`limit: int>=1 = 50`, `instructions: string = ""`,
`select_paths: string[] = []`, `select_domains: string[] = []`,
`allow_external: bool = true`, `extract_depth: enum(basic|advanced) = basic`,
`format: enum(markdown|text) = markdown`, `include_favicon: bool = false`.

### `map`  (required: `url`)

`url: string`, `max_depth: int>=1 = 1`, `max_breadth: int>=1 = 20`,
`limit: int>=1 = 50`, `instructions: string = ""`,
`select_paths: string[] = []`, `select_domains: string[] = []`,
`allow_external: bool = true`.

> The full canonical JSON Schemas (with descriptions) were extracted from
> Tavily's MCP `tools/list` (`tavily-mcp` v3.3.1) and are the source of truth for
> the descriptors. All four declare `outputSchema: { type: object,
> additionalProperties: true }`; the builtin framework's `ToolDescriptor` carries
> only `inputSchema`, so outputs are passed through untyped.
