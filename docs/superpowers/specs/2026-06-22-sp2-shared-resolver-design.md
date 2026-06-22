# Sub-project 2 — Shared MCP transport resolver refactor

**Date:** 2026-06-22
**Status:** Design FINAL (all open decisions resolved — see "Resolved decisions"). DESIGN only — no implementation. Implementation plan: `docs/superpowers/plans/2026-06-22-sp2-shared-resolver.md`. Depends on: SP0 (done).
**Intent (locked):** Consolidate the duplicated `{{placeholder}}`-substitution resolvers into ONE shared module so SP4's per-tenant resolution builds on a single implementation. **Refactor + one intended, tested behavior fix** (the header/env substitution leak on the discovery + simulate paths — see "Resolved decisions" D5).

---

## Problem

The `{{NAME}}` template-substitution logic for MCP server transports is copy-pasted across the codebase. The OVERVIEW (§ Sub-project 2 / §3) named **three** resolvers; exploration found **four** independent implementations plus two divergent regexes. Each has subtle, undocumented behavior drift (which transport fields get substituted, which regex flags). SP4 (per-tenant MCP values) must layer per-tenant value selection on top of substitution; doing that against four drifting copies would multiply the surface and risk per-tenant bugs. We consolidate first.

The substitution itself is pure and shareable. The thing that legitimately differs per call site is the **value-source layer** (how a `VariableValue` becomes a concrete string — async backend-proxy lookup in web vs. pre-fetched decrypted maps in backend). The design separates these two concerns.

---

## Resolved decisions (FINAL — user-chosen, settled)

These supersede the "Open decisions" section below (kept for rationale). Each maps to its open-decision letter.

- **R-a (was open (a)) — Regex.** Canonical `/\{\{(\w+)\}\}/g`, positional capture **group 1**. The named-group `/gv` variant is **dropped**. (Behaviorally identical for `\w` names; no caller reads `.groups.name`; the `/v` set-escaping is unused — proven in § "regex equivalence".)
- **R-b (was open (b)) — Module home/name.** `packages/graph-types/src/mcpTransportResolver.ts`, re-exported from the package index (`src/index.ts`). **Pure** — no zod runtime, no I/O, no async; imports only the `McpTransport` / `McpServerConfig` / `VariableValue` **types** already defined in graph-types. Adds no runtime dependency to any consumer (web, backend, edge).
- **R-c (was open (c)) — Scope.** Unify into the shared module: (1) the `{{}}` substitution (`resolveTransport`), (2) `extractTemplateVariables`, and (3) the **pure** `buildResolvedVars` (direct→value, env_ref→`byId[id] ?? ''`, undefined-`variableValues`→`byName` fallback) name→value mapping. Value **FETCHING / decryption** stays per call site (web = async per-id backend proxy; backend = pre-fetched decrypted maps). The shared `buildResolvedVars` is the **backend** mapping helper; web keeps its async `resolveValues` value layer and only adopts shared `resolveTransport` + the shared `VariableValue` type + shared `extractTemplateVariables`.
- **R-d (was open (d)) — Edge function.** OUT of scope. The Deno edge function performs **no** `{{}}` substitution (it consumes already-resolved transports); it imports graph-types `dist` for types only and inherits the unified module transitively once `dist` is rebuilt. No edge code change.
- **R-e — Web duplicate type + component call sites.** The hand-written `VariableValue`/`DirectValue`/`EnvRefValue` union in `packages/web/app/lib/resolveVariables.ts:3-11` is **deleted** and replaced by the graph-types `VariableValue` type (identical via `z.infer`). The two `extractVariableNames` component call sites — `PublishMcpDialog.tsx:185` and `LibraryServerFields.tsx:39` — migrate to the shared `extractTemplateVariables` (via a thin web re-export to minimize churn, see plan Task 2).

### FIX THE LEAK (D5, intended behavior change — confirmed)

The unified `resolveTransport` substitutes **ALL** transport fields on **ALL** paths: stdio `command` + `args` + **`env`**, and http/sse `url` + **`headers`**. Today `mcpToolService.ts` (`resolveTransportVars` `:46-58`) and `simulateHelpers.ts` (`resolveTransportVars` `:54-57`) **skip** `env` (stdio) and `headers` (http/sse), so `{{TOKEN}}` in a header or stdio env var leaks through literally — breaking header-authed and stdio-env-authed MCPs on the **tool-call** (discovery) and **preview** (simulate) paths. The **execute** path (`executeHelpers.ts:82-106`) and the **web** path (`resolveVariables.ts:38-56`) already substitute the full superset — they are the **correctness reference** for the parity tests. Unifying to the superset fixes #3/#4 (intended, tested, called out in PR).

## Decisions

- **D1.** One shared module exporting a canonical regex, `extractTemplateVariables(transport)`, and `resolveTransport(transport, resolved)` (where `resolved: Record<string,string>` is already-resolved name→value).
- **D2.** Home: a new file in **`@daviddh/graph-types`** — the only package importable by web, backend, AND the Deno edge function (verified below). No new dependency direction is introduced; the module is pure (uses only `McpTransport` types already defined there, no `zod` runtime).
- **D3.** SP2 unifies the **`{{}}` substitution + variable extraction** layer only. The `VariableValue` → string resolution (env_ref decryption) stays at each call site because env decryption is backend-only. SP2 *does* provide a shared, pure `buildResolvedVars(variableValues, byName, byId)` helper so the env_ref/direct mapping logic (currently triplicated and drifting) is also unified — but the **fetching/decryption** of env values remains caller-owned. (See Open decision (c).)
- **D4.** Canonical regex: `/\{\{(\w+)\}\}/g` (plain global, capture group 1). The named-group `/gv` variant is behaviorally identical for the real variable names in use (see § "regex equivalence"). (See Open decision (a).)
- **D5.** Behavior is unified to the **superset/most-complete** implementation: substitute `command`, `args`, `env` (stdio) and `url`, `headers` (http/sse). Two of the four copies silently skipped `env`/`headers` — this is a **bug-leaning divergence**; unifying to the complete behavior is the intended target, but because it is technically a behavior change for those two call sites, it is flagged explicitly (§ Risk, Open decision (c)).

---

## Current state (verified, file:line)

### Type definitions (`@daviddh/graph-types`)
- `McpTransport` = discriminated union `stdio | sse | http` — `packages/graph-types/src/schemas/mcp.schema.ts:27-31`. stdio has `command`, `args?`, `env?`; sse/http have `url`, `headers?` (`mcp.schema.ts:8-25`).
- `VariableValue` = `{type:'direct', value}` | `{type:'env_ref', envVariableId}` — `mcp.schema.ts:3-6` (Zod) and `packages/web/app/lib/resolveVariables.ts:3-11` (a **second, hand-written copy** of the same union in web).
- `McpServerConfig.variableValues?: Record<string, VariableValue>` — `mcp.schema.ts:33-40`.

### Resolver #1 — web (discovery proxy + simulate + tool call)
`packages/web/app/lib/resolveVariables.ts` (pure) + `resolveVariablesServer.ts` (async value layer).
Regex `resolveVariables.ts:13`: `const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;`
Substitutes stdio `command`/`args`/**`env`** and http/sse `url`/**`headers`** (`resolveVariables.ts:38-56`). `extractVariableNames` stringifies the whole transport and `matchAll`-es it (`resolveVariables.ts:15-22`).
Value layer (`resolveVariablesServer.ts:7-33`): `resolveValues` maps each `VariableValue` to a string — `direct`→`value`; `env_ref`→**async** `getEnvVariableValue(envVariableId)` which proxies to the backend (`packages/web/app/lib/orgEnvVariables.ts:59-63`, `GET /secrets/env-vars/:id/value`). Then `replaceInTransport`.
Call sites: `app/api/simulate/route.ts:36`, `app/api/mcp/tools/call/route.ts:47`, `app/api/mcp/discover/route.ts:45` (all via `resolveTransportVariables`); `extractVariableNames` used in `components/panels/PublishMcpDialog.tsx:185` and `components/panels/LibraryServerFields.tsx:39`.

### Resolver #2 — backend execute / runtime
`packages/backend/src/routes/execute/executeHelpers.ts`.
Regex `executeHelpers.ts:68`: `const VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv;` (named group, unicode-sets).
Substitutes stdio `command`/`args`/**`env`** and http/sse `url`/**`headers`** (`executeHelpers.ts:82-106`) — same field coverage as web.
Value layer `buildResolvedVars(server, {byName, byId})` (`executeHelpers.ts:113-127`): `direct`→`value`; `env_ref`→`byId[envVariableId] ?? ''`; **if `variableValues` is undefined, returns `env.byName`** (whole env map by name — a fallback the web copy lacks). `resolveServerTransport` (`:129-137`), `resolveMcpTransportVariables(graph,…)` over `graph.mcpServers` (`:139-147`).
Call sites: `routes/execute/executeCoreHelpers.ts:59` (`resolveMcpTransportVariables`); `routes/agents/getRegistry.ts:84` (`resolveServerTransport`).

### Resolver #3 — backend discovery (mcpToolService)
`packages/backend/src/mcp-server/services/mcpToolService.ts`.
Regex `mcpToolService.ts:40`: `const VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv;` (named, `/gv`).
`resolveTransportVars` (`:46-58`): substitutes stdio `command`/`args` and http/sse `url` — **does NOT substitute stdio `env` nor http/sse `headers`** (spreads them through unchanged). Divergence vs #1/#2.
`resolveServerVars(server, envVars)` (`:60-74`): `direct`→`value`; `env_ref`→`envVars[envVariableId] ?? ''`; if no `variableValues`, returns `envVars` (the by-id map) directly. Called with `byId` only (`:79-81`).

### Resolver #4 — backend simulate (simulateHelpers) — MISSED BY OVERVIEW
`packages/backend/src/mcp-server/services/simulateHelpers.ts`.
Regex `simulateHelpers.ts:37`: `/\{\{(?<name>\w+)\}\}/gv;`
`resolveTransportVars` (`:54-57`, via `resolveStdioTransport` `:43-52`): substitutes stdio `command`/`args` and http/sse `url` — **also skips `env` and `headers`** (same gap as #3).
`resolveServerVars` (`:59-76`): structurally typed against a loose inline shape `{type:string, value?, envVariableId?}`; `direct && value!==undefined`→`value`; else `envVariableId!==undefined`→`envById[..] ?? ''`. Exported as `resolveMcpEnvVars(graph, envById)` (`:78-88`).

### Field-coverage divergence summary
| Impl | regex | stdio env | http/sse headers | no-vars fallback |
|------|-------|-----------|------------------|------------------|
| #1 web | `/g` plain | yes | yes | none (empty map) |
| #2 execute | `/gv` named | yes | yes | `byName` |
| #3 mcpToolService | `/gv` named | **no** | **no** | `byId` |
| #4 simulate | `/gv` named | **no** | **no** | `byId` |

### regex equivalence
`/\{\{(\w+)\}\}/g` vs `/\{\{(?<name>\w+)\}\}/gv`: identical match set. `\w` = `[A-Za-z0-9_]` in both modes (the `v` unicode-sets flag does not change `\w` semantics; it only affects set/class syntax like `[\p{...}--[...]]`, none of which is used). The named group `(?<name>…)` is the same capture as group 1; **no caller reads `match.groups.name`** — all four use the positional `(_, name)` replacer arg or `match[1]`. So the named group is decorative. The `v` flag is irrelevant for `\w`. Canonical choice is therefore free; recommend plain `/g` with group 1 (simplest, matches the web copy and avoids the `/v` flag's stricter escaping rules inside the pattern).

### Package boundaries (verified)
- `@daviddh/graph-types` (`packages/graph-types/package.json`) exports `dist/index.js`; `index.ts` re-exports schemas (runtime) + types. Imported by web (`@/app/schemas` re-exports it; also direct in backend) and by the edge function via import map `supabase/functions/execute-agent/deno.json:3` → `../../../packages/graph-types/dist/index.js` (and `execute-tool/deno.json:3`).
- web ↛ backend (no path/alias; web uses `fetchFromBackend` proxy). graph-types is the only common dependency. Confirmed: a pure resolver in graph-types is importable by all three runtimes.
- **Edge function has NO `{{}}` substitution** — `grep '\{\{' supabase/functions/` returns nothing. The edge consumes **already-resolved** transports (substitution happens upstream in backend `executeCoreHelpers`/`resolveMcpTransportVariables` before the payload is sent). `toolBuilder.ts:8,64` imports `McpServerConfig`/`RuntimeGraph` types only. So the edge is **out of scope** for substitution unification; it will automatically benefit when backend resolution is unified (it imports the same `dist`). (See Open decision (d).)

---

## Architecture

### Shared module — `packages/graph-types/src/mcpTransportResolver.ts`
Pure, no I/O, no async, no zod-runtime. Exported from `index.ts`.

```ts
// canonical regex (D4)
export const MCP_VARIABLE_PATTERN: RegExp; // new instance per call site is NOT needed; export a factory or use String.replace which resets lastIndex via the literal — see note

export function extractTemplateVariables(transport: McpTransport): string[];
//   = current web extractVariableNames: JSON.stringify + matchAll(group1), dedup, ordered.

export function resolveTransport(
  transport: McpTransport,
  resolved: Record<string, string>,
): McpTransport;
//   = the substitution. Covers stdio command/args/env AND http/sse url/headers (D5).
//   Unmatched {{x}} (no key in `resolved`) is left literal: `{{x}}` (all four impls already do this).

export function buildResolvedVars(
  variableValues: Record<string, VariableValue> | undefined,
  env: { byName: Record<string, string>; byId: Record<string, string> },
): Record<string, string>;
//   Unifies the direct/env_ref mapping (D3). direct→value; env_ref→byId[id] ?? '';
//   undefined variableValues → env.byName (the execute-path fallback, the superset).
```

Note on regex statefulness: a `/g` regex used with `String.prototype.replace` is safe (replace resets `lastIndex`); `matchAll` creates its own iteration. Keep the pattern as a module-level `const` literal; do not share a `RegExp` object across `.exec` loops. (Current code is already safe this way.)

### Call-site migrations
1. **web** `resolveVariables.ts` / `resolveVariablesServer.ts`:
   - Delete local `VARIABLE_PATTERN`, `extractVariableNames`, `replaceVariablesInString`, `replaceInHeaders`, `replaceInTransport`.
   - Re-export / re-point: `extractVariableNames` → `extractTemplateVariables` from graph-types (update the 2 component imports, or keep a thin re-export to minimize churn).
   - The local `VariableValue`/`DirectValue`/`EnvRefValue` union (`resolveVariables.ts:3-11`) → import `VariableValue` from graph-types (it already has the identical type via `z.infer`). Removes the duplicate type.
   - `resolveVariablesServer.resolveTransportVariables` keeps its **async value layer** (`resolveValues` → backend proxy fetch) and calls shared `resolveTransport(transport, resolved)`. The async env_ref fetch stays here (web cannot decrypt). `resolveValues` may optionally adopt shared `buildResolvedVars` only if it pre-fetches a `byId` map — but web fetches per-id lazily, so leave `resolveValues` as-is (it is the value layer, out of D3's pure scope).
2. **backend execute** `executeHelpers.ts`: delete `VARIABLE_PATTERN`, `replaceVarsInString/Headers/Transport`, `replaceStdioVars`, `buildResolvedVars`. `resolveServerTransport` becomes `{...server, transport: resolveTransport(server.transport, buildResolvedVars(server.variableValues, env))}`. `resolveMcpTransportVariables` unchanged in signature. Call sites (`executeCoreHelpers.ts:59`, `getRegistry.ts:84`) unchanged.
3. **backend mcpToolService** `mcpToolService.ts`: delete local `VARIABLE_PATTERN`, `replaceVars`, `resolveTransportVars`, `resolveServerVars`. `openClient` (`:80-81`) uses `buildResolvedVars(server.variableValues, {byName:{}, byId})` + `resolveTransport`. **Behavior change:** now substitutes `env`/`headers` (D5) — see Risk.
4. **backend simulateHelpers** `simulateHelpers.ts`: delete local `VARIABLE_PATTERN`, `replaceVars`, `resolveStdioTransport`, `resolveTransportVars`, `resolveServerVars`. `resolveMcpEnvVars` (`:78-88`) maps each server via `buildResolvedVars` + `resolveTransport`. Same `env`/`headers` behavior change.

---

## Risk: behavior-preservation + how tested

- **Regex:** zero risk for ASCII `\w` names (proven equivalent). The only theoretical difference (`/v` set-escaping) is unused. Parity tests assert identical match/replace output across a corpus.
- **Field coverage (D5):** real behavior change for impls #3 (mcpToolService discovery) and #4 (simulate) — they will now substitute stdio `env` and http/sse `headers` where before `{{x}}` leaked through literally. This is the *correct* behavior (matches #1/#2, and matches what runtime execution already does), so a transport that worked at execute-time but failed/leaked at discovery/simulate-time is fixed, not broken. Mitigation: (a) explicitly call out in PR; (b) parity tests pin BOTH the old per-impl output AND the new unified output so the diff is visible and intentional; (c) Open decision (c) lets the reviewer choose "unify to superset" vs "keep two narrow + two wide" (NOT recommended — perpetuates drift).
- **no-vars fallback:** unified to `byName` (execute-path superset). For mcpToolService/simulate (previously `byId`), passing `{byName:{}, byId}` preserves their exact prior fallback (empty byName → same as before since they only had byId). Verified safe by constructing the `env` arg per call site to match its old fallback.
- **Async preservation (web):** the env_ref→backend-proxy fetch is untouched; only the pure substitution moves. No new sync/async boundary.

---

## Testing (parity tests proving identical output)

**Test-infra note (verified):** graph-types currently has **no jest config and no test files**; its `build` runs `tsc -p tsconfig.build.json` over `src/**/*.ts`, so a co-located `src/*.test.ts` would be emitted into `dist`. The plan therefore (Task 1) adds a `packages/graph-types/jest.config.js` (ts-jest ESM preset, like backend's) AND excludes `**/*.test.ts` from the build's `include` (via `tsconfig.build.json`) so `dist` stays test-free. `jest` + `ts-jest` + `@types/jest` are already hoisted root devDeps. Parity tests live at `packages/graph-types/src/mcpTransportResolver.test.ts`, run with `cd packages/graph-types && NODE_OPTIONS='--experimental-vm-modules' npx jest`.

New test file in graph-types (`packages/graph-types/src/mcpTransportResolver.test.ts`) covering:
1. **Regex parity:** for a corpus of strings (`{{A}}`, `{{a_b1}}`, `{{ }}` (no match), `{{a}}{{b}}`, nested-ish `{{{{x}}}}`, unmatched `{{x}}`, unicode letters like `{{café}}` → `\w` excludes accented, both regexes agree), assert `match(plain) === match(named/gv)` for capture-1.
2. **`resolveTransport` parity per transport type:** stdio (command/args/env), http (url/headers), sse (url/headers); assert output equals a literal expected object. Unmatched var stays `{{x}}`.
3. **`extractTemplateVariables`:** dedup + ordering preserved; reads across all transport fields (it stringifies, so env/headers are covered).
4. **`buildResolvedVars`:** direct, env_ref (hit + miss→`''`), undefined-variableValues→byName fallback.
5. **Golden parity vs. OLD impls:** snapshot the four removed implementations' outputs (copy them into the test as `legacy_*` fixtures) and assert the new module reproduces #1/#2 exactly, and reproduces #3/#4 **except** the documented env/headers superset cases (those get their own "intended change" assertions).
6. Each call site: existing tests (execute, simulate, discovery routes) must stay green — run `npm run test -w packages/backend` and web route tests; `npm run check` (format+lint+typecheck across all packages, incl. graph-types build so edge `dist` is current).

---

## Out of scope

- Per-tenant value selection / `tenants.id`-keyed resolution — that is **SP4** (this module is its foundation).
- Env-variable **decryption / fetching** (`getDecryptedEnvVariables`, `getEnvVariableValue` proxy, OAuth token injection `resolveOAuthForExecution`) — stays per call site; only the pure substitution + the pure direct/env_ref mapping move.
- SSRF / discovery-error redaction — **SP3**.
- Edge function — no substitution exists there; benefits transitively via the rebuilt graph-types `dist`. No edge change.

---

## Open decisions — ALL RESOLVED (rationale retained; see "Resolved decisions" for the settled answers)

> (a)→R-a plain `/g` group 1; (b)→R-b `graph-types/src/mcpTransportResolver.ts`; (c)→R-c option (ii) + D5 superset adopted; (d)→R-d edge out of scope.

**(a) Canonical regex.** Plain `/\{\{(\w+)\}\}/g` (group 1) vs named-group `/\{\{(?<name>\w+)\}\}/gv`. Proven behaviorally identical for `\w` names; no caller uses `.groups.name`; the `/v` (unicode-sets) flag is irrelevant to `\w` and unused.
> **Recommendation:** plain `/g` with capture group 1. Simplest, avoids `/v`'s stricter in-pattern escaping rules, matches the web copy. Unicode-sets mode does NOT matter here.

**(b) Module home + name.** New file in `@daviddh/graph-types` — the only package shared by web + backend + edge.
> **Recommendation:** `packages/graph-types/src/mcpTransportResolver.ts`, re-exported from `index.ts`. Pure (no zod-runtime, no I/O), so it adds no dependency weight to consumers.

**(c) Scope of unification.** Three options: (i) unify ONLY `{{}}` substitution + extraction; (ii) ALSO unify the pure `direct`/`env_ref`→string mapping (`buildResolvedVars`); (iii) also try to unify the value *fetching* (impossible — env decryption is backend-only, web uses async proxy). Sub-question: accept the D5 superset behavior change (substitute `env`/`headers` in discovery/simulate) or preserve each impl's exact field coverage?
> **Recommendation:** (ii) — unify substitution + extraction + the pure `buildResolvedVars` mapping (all four copies of the mapping have drifted); leave value-fetching per call site. AND adopt the D5 superset (substitute env/headers everywhere): it's a correctness fix, the discovery/simulate gaps are latent bugs, and parity tests make the change explicit. If the reviewer wants strictly zero behavior change, fall back to two field-coverage variants — but that perpetuates the exact drift SP2 exists to kill (not recommended).

**(d) Edge function in scope?** It has no `{{}}` substitution (consumes pre-resolved transports); imports graph-types `dist`.
> **Recommendation:** out of scope. No edge change needed; it inherits the unified module transitively once graph-types is rebuilt. Just ensure `npm run build` regenerates `packages/graph-types/dist` before edge deploys.
