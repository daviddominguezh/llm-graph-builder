# SP2 — Shared MCP transport resolver (implementation plan)

> For agentic workers: execute this plan with **superpowers:subagent-driven-development**. One `### Task` per subagent dispatch, in order. Each task is TDD (failing test → RED → implement → GREEN → commit). Do not start a task until the previous task is committed and `npm run check` is clean.

**Goal:** Collapse the four copy-pasted MCP `{{NAME}}` transport resolvers into ONE pure shared module in `@daviddh/graph-types`, fix the header/env substitution leak on the discovery + simulate paths (intended, tested), and migrate all four call sites to delegate to the shared module — each keeping its existing tests green.

**Architecture:** New pure module `packages/graph-types/src/mcpTransportResolver.ts` exports `MCP_VARIABLE_PATTERN`, `extractTemplateVariables(transport)`, `resolveTransport(transport, resolved)`, and `buildResolvedVars(variableValues, env)`. It imports only graph-types *types* (`McpTransport`, `McpServerConfig`, `VariableValue`) — no zod runtime, no I/O, no async. Re-exported from `src/index.ts` so web/backend/edge consume it through the existing `dist`. Value FETCHING/decryption stays per call site: web async per-id proxy (`resolveVariablesServer.ts`), backend pre-fetched decrypted maps (`executeHelpers`, `mcpToolService`, `simulateHelpers`).

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`, NodeNext ESM, `.js` import specifiers). Zod 4 (types only here). Jest 30 + ts-jest 29 ESM preset (backend/web/api already configured; graph-types gets a config in Task 1). ESLint `eslint-config-love` (strict). Prettier (single quotes, 2-space, 110 width, es5 trailing comma).

## Global Constraints

Binding on **every** task:

- **TS strict + `noUncheckedIndexedAccess`.** Never `any`. Never unsafe casts. `Record` index access yields `T | undefined` — handle it (`?? ''`, `?? \`{{${name}}}\``).
- **Never disable ESLint** (no `eslint-disable`, no config edits to dodge a rule). `eslint-config-love` specifics that bite here: name magic numbers as `const` (none expected in this plan — no literals beyond strings); `prefer-destructuring`; no non-null assertions; explicit return types on exported functions. Limits: **40** lines/function, **300** lines/file, **max-depth 2**. If a function nears 40 lines or depth 2, extract a named helper — do NOT compress onto single lines.
- **ESM:** all relative imports use `.js` specifiers, including within graph-types (e.g. `import type { McpTransport } from './types/index.js'`).
- **Prettier-clean:** every commit must pass `npm run check`. Run it before each commit.
- **graph-types is the shared package** importable by web, backend, AND the Deno edge. The new module must stay pure (types only) so no consumer's runtime graph changes. Confirm `dist` is rebuilt (`npm run build -w packages/graph-types`) before any check that crosses package `dist` boundaries.
- **Tests:**
  - graph-types: `cd packages/graph-types && NODE_OPTIONS='--experimental-vm-modules' npx jest`
  - backend: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern>`
  - web: `cd packages/web && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern>`
  - api: `npm run test -w packages/api`
- **Stage files explicitly** (`git add <path> ...`); never `git commit -a`/`-am`. End commit messages with the required `Co-Authored-By` trailer.

---

### Current code being unified (verified file:line — the four implementations)

- **#1 web (reference, full superset):** `packages/web/app/lib/resolveVariables.ts` — `VARIABLE_PATTERN = /\{\{(\w+)\}\}/g` (`:13`); `extractVariableNames` (`:15-22`); `replaceVariablesInString` (`:24-26`); `replaceInHeaders` (`:28-36`); `replaceInTransport` (`:38-56`, substitutes stdio `command`/`args`/**`env`** and http/sse `url`/**`headers`**). Local `VariableValue` union (`:3-11`). Async value layer `resolveVariablesServer.ts` — `resolveValues` (`:7-25`, `direct`→`value`, `env_ref`→`await getEnvVariableValue(id)`), `resolveTransportVariables` (`:27-33`).
- **#2 backend execute (reference, full superset):** `packages/backend/src/routes/execute/executeHelpers.ts` — `VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv` (`:68`); `replaceVarsInString` (`:70-72`); `replaceVarsInHeaders` (`:74-80`); `replaceStdioVars` (`:82-97`, substitutes `command`/`args`/`env`); `replaceVarsInTransport` (`:99-106`, http/sse `url`/`headers`); `buildResolvedVars(server, env)` (`:113-127`, `direct`→`value`, `env_ref`→`env.byId[id] ?? ''`, **undefined `variableValues`→`env.byName`**); `resolveServerTransport(server, envByName, envById)` (`:129-137`); `resolveMcpTransportVariables(graph, envByName, envById)` (`:139-147`).
- **#3 backend discovery (LEAKS env/headers):** `packages/backend/src/mcp-server/services/mcpToolService.ts` — `VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv` (`:40`); `replaceVars` (`:42-44`); `resolveTransportVars` (`:46-58`, stdio `command`/`args` + http/sse `url` only — **NO `env`, NO `headers`**); `resolveServerVars(server, envVars)` (`:60-74`, `direct`→`value`, `env_ref`→`envVars[id] ?? ''`, undefined→`envVars`); used in `openClient` (`:76-84`) called with `byId` only (`:80`).
- **#4 backend simulate (LEAKS env/headers):** `packages/backend/src/mcp-server/services/simulateHelpers.ts` — `VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv` (`:37`); `replaceVars` (`:39-41`); `resolveStdioTransport` (`:43-52`, `command`/`args`); `resolveTransportVars` (`:54-57`, http/sse `url` only — **NO `env`, NO `headers`**); `resolveServerVars` (`:59-76`, structural shape `{type:string; value?; envVariableId?}`, `direct && value!==undefined`→`value`, else `envVariableId!==undefined`→`envById[id] ?? ''`, undefined→`envById`); `resolveMcpEnvVars(graph, envById)` (`:78-88`).

**Two regexes verified:** plain `/\{\{(\w+)\}\}/g` (web, `resolveVariables.ts:13`) and named `/\{\{(?<name>\w+)\}\}/gv` (the three backend copies). Behaviorally identical for `\w` names; no caller reads `.groups.name`; the `/v` flag does not change `\w`. **Canonical = plain `/g` group 1.**

**VariableValue mapping the shared `buildResolvedVars` must preserve EXACTLY:** `direct` → `value` (by VALUE), `env_ref` → `byId[envVariableId] ?? ''` (by ID lookup), undefined `variableValues` → `byName` (the execute-path superset fallback). Source of truth: `executeHelpers.ts:113-127`. Type from graph-types: `VariableValue = {type:'direct'; value:string} | {type:'env_ref'; envVariableId:string}` (`packages/graph-types/src/schemas/mcp.schema.ts:3-6`; type via `z.infer` in `types/index.ts:41` region). The web hand-written copy (`resolveVariables.ts:3-11`) is identical and gets deleted.

---

### Task 1: Shared module + parity tests in graph-types

Lead task. Build the pure module and prove it reproduces #1/#2 exactly, reproduces #3/#4 except the documented `env`/`headers` superset cases, and that both regexes agree. No call site changes yet.

**Files:**
- `packages/graph-types/jest.config.js` (NEW — test infra; none exists today)
- `packages/graph-types/tsconfig.build.json` (EDIT — exclude `**/*.test.ts` from emitted `dist`)
- `packages/graph-types/src/mcpTransportResolver.ts` (NEW)
- `packages/graph-types/src/mcpTransportResolver.test.ts` (NEW)
- `packages/graph-types/src/index.ts` (EDIT — re-export the module)

**Interfaces (exact signatures — module is pure, no async, types-only imports):**

```ts
// packages/graph-types/src/mcpTransportResolver.ts
import type { McpServerConfig, McpTransport, VariableValue } from './types/index.js';

export const MCP_VARIABLE_PATTERN: RegExp; // = /\{\{(\w+)\}\}/g

export function extractTemplateVariables(transport: McpTransport): string[];

export function resolveTransport(
  transport: McpTransport,
  resolved: Record<string, string>
): McpTransport;

export interface EnvVarMaps {
  byName: Record<string, string>;
  byId: Record<string, string>;
}

export function buildResolvedVars(
  variableValues: Record<string, VariableValue> | undefined,
  env: EnvVarMaps
): Record<string, string>;
```

**Steps:**

- [ ] **Confirm test infra is absent** (so the jest-config add is justified):
  `ls packages/graph-types/jest.config.js 2>/dev/null; echo done`
  Expected: prints only `done` (no file). Also confirm hoisted deps exist:
  `node -e "require.resolve('ts-jest'); require.resolve('jest'); console.log('ok')"` → `ok`.

- [ ] **Add jest config** `packages/graph-types/jest.config.js` (ESM ts-jest, mirrors backend; uses the package's own `tsconfig.json`):
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
      '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json' }],
    },
    testMatch: ['**/src/**/*.test.ts'],
  };
  ```

- [ ] **Keep tests out of `dist`:** edit `packages/graph-types/tsconfig.build.json` so the emitted build excludes test files. Current file is:
  ```json
  { "extends": "./tsconfig.json", "exclude": ["node_modules", "dist"] }
  ```
  Change the `exclude` to:
  ```json
  { "extends": "./tsconfig.json", "exclude": ["node_modules", "dist", "src/**/*.test.ts"] }
  ```
  Verify after the build step below that `packages/graph-types/dist/mcpTransportResolver.test.js` does NOT exist.

- [ ] **RED — write parity tests first.** Create `packages/graph-types/src/mcpTransportResolver.test.ts`. Embed the four LEGACY impls verbatim as local fixtures (copied from the file:line refs above) so the assertions pin "new == old where it should, new != old for the leak". Include:
  ```ts
  import { describe, expect, it } from '@jest/globals';

  import type { McpServerConfig, McpTransport, VariableValue } from './types/index.js';
  import {
    MCP_VARIABLE_PATTERN,
    buildResolvedVars,
    extractTemplateVariables,
    resolveTransport,
  } from './mcpTransportResolver.js';

  /* ── legacy regexes (the two verified variants) ── */
  const LEGACY_PLAIN = /\{\{(\w+)\}\}/g;
  const LEGACY_NAMED = /\{\{(?<name>\w+)\}\}/gv;

  function matchGroup1(re: RegExp, s: string): string[] {
    return [...s.matchAll(re)].map((m) => m[1] ?? '');
  }

  /* ── legacy #3/#4 transport substitution (NO env/headers) ── */
  function legacyNarrowReplace(str: string, vars: Record<string, string>): string {
    return str.replace(LEGACY_NAMED, (_, name: string) => vars[name] ?? `{{${name}}}`);
  }
  function legacyNarrowTransport(t: McpTransport, vars: Record<string, string>): McpTransport {
    if (t.type === 'stdio') {
      return { ...t, command: legacyNarrowReplace(t.command, vars), args: t.args?.map((a) => legacyNarrowReplace(a, vars)) };
    }
    return { ...t, url: legacyNarrowReplace(t.url, vars) };
  }

  describe('regex parity (R-a)', () => {
    const corpus = ['{{A}}', '{{a_b1}}', '{{ }}', '{{a}}{{b}}', '{{{{x}}}}', 'no vars', '{{café}}'];
    it.each(corpus)('plain /g group1 === named /gv group1 for %p', (s) => {
      expect(matchGroup1(MCP_VARIABLE_PATTERN, s)).toEqual(matchGroup1(LEGACY_PLAIN, s));
      expect(matchGroup1(MCP_VARIABLE_PATTERN, s)).toEqual(matchGroup1(LEGACY_NAMED, s));
    });
  });

  describe('resolveTransport — full superset (R-c / D5)', () => {
    it('stdio: substitutes command, args AND env', () => {
      const t: McpTransport = { type: 'stdio', command: '{{CMD}}', args: ['{{A}}', 'x'], env: { K: '{{TOK}}' } };
      expect(resolveTransport(t, { CMD: 'npx', A: 'flag', TOK: 'secret' })).toEqual({
        type: 'stdio', command: 'npx', args: ['flag', 'x'], env: { K: 'secret' },
      });
    });
    it('http: substitutes url AND headers', () => {
      const t: McpTransport = { type: 'http', url: 'https://{{HOST}}', headers: { Authorization: 'Bearer {{TOK}}' } };
      expect(resolveTransport(t, { HOST: 'api.x', TOK: 'secret' })).toEqual({
        type: 'http', url: 'https://api.x', headers: { Authorization: 'Bearer secret' },
      });
    });
    it('sse: substitutes url AND headers', () => {
      const t: McpTransport = { type: 'sse', url: '{{U}}', headers: { X: '{{V}}' } };
      expect(resolveTransport(t, { U: 'u', V: 'v' })).toEqual({ type: 'sse', url: 'u', headers: { X: 'v' } });
    });
    it('leaves unmatched {{x}} literal', () => {
      const t: McpTransport = { type: 'http', url: '{{KNOWN}}/{{MISSING}}' };
      expect(resolveTransport(t, { KNOWN: 'a' })).toEqual({ type: 'http', url: 'a/{{MISSING}}' });
    });
    it('undefined args/env/headers pass through as undefined', () => {
      const t: McpTransport = { type: 'stdio', command: 'c' };
      expect(resolveTransport(t, {})).toEqual({ type: 'stdio', command: 'c', args: undefined, env: undefined });
    });
  });

  describe('resolveTransport — INTENDED divergence from legacy #3/#4 (the leak fix)', () => {
    it('http headers: new substitutes where legacy narrow leaked literal', () => {
      const t: McpTransport = { type: 'http', url: 'u', headers: { Authorization: 'Bearer {{TOK}}' } };
      const vars = { TOK: 'secret' };
      expect(legacyNarrowTransport(t, vars)).toEqual({ type: 'http', url: 'u', headers: { Authorization: 'Bearer {{TOK}}' } });
      expect(resolveTransport(t, vars)).toEqual({ type: 'http', url: 'u', headers: { Authorization: 'Bearer secret' } });
    });
    it('stdio env: new substitutes where legacy narrow leaked literal', () => {
      const t: McpTransport = { type: 'stdio', command: 'c', env: { K: '{{TOK}}' } };
      const vars = { TOK: 'secret' };
      expect(legacyNarrowTransport(t, vars)).toEqual({ type: 'stdio', command: 'c', args: undefined, env: { K: '{{TOK}}' } });
      expect(resolveTransport(t, vars)).toEqual({ type: 'stdio', command: 'c', args: undefined, env: { K: 'secret' } });
    });
    it('stdio command/args still match legacy exactly', () => {
      const t: McpTransport = { type: 'stdio', command: '{{C}}', args: ['{{A}}'] };
      const vars = { C: 'npx', A: 'flag' };
      const narrow = legacyNarrowTransport(t, vars);
      const unified = resolveTransport(t, vars);
      expect(unified.type === 'stdio' && unified.command).toBe(narrow.type === 'stdio' && narrow.command);
    });
  });

  describe('extractTemplateVariables', () => {
    it('dedups and preserves first-seen order across all fields (incl. env/headers)', () => {
      const t: McpTransport = { type: 'http', url: '{{B}}/{{A}}', headers: { H: '{{A}}', G: '{{C}}' } };
      expect(extractTemplateVariables(t)).toEqual(['B', 'A', 'C']);
    });
    it('reads stdio env vars', () => {
      const t: McpTransport = { type: 'stdio', command: '{{X}}', env: { K: '{{Y}}' } };
      expect(extractTemplateVariables(t)).toEqual(['X', 'Y']);
    });
  });

  describe('buildResolvedVars — preserves the direct/env_ref/fallback mapping exactly', () => {
    const env = { byName: { N1: 'n1' }, byId: { id1: 'v1' } };
    it('direct → value', () => {
      const vv: Record<string, VariableValue> = { T: { type: 'direct', value: 'd' } };
      expect(buildResolvedVars(vv, env)).toEqual({ T: 'd' });
    });
    it('env_ref hit → byId[id]', () => {
      const vv: Record<string, VariableValue> = { T: { type: 'env_ref', envVariableId: 'id1' } };
      expect(buildResolvedVars(vv, env)).toEqual({ T: 'v1' });
    });
    it('env_ref miss → empty string', () => {
      const vv: Record<string, VariableValue> = { T: { type: 'env_ref', envVariableId: 'nope' } };
      expect(buildResolvedVars(vv, env)).toEqual({ T: '' });
    });
    it('undefined variableValues → byName fallback (execute superset)', () => {
      expect(buildResolvedVars(undefined, env)).toEqual({ N1: 'n1' });
    });
  });

  /* sanity: McpServerConfig import is used so types are exercised */
  const _sample: McpServerConfig | undefined = undefined;
  void _sample;
  ```
  Run: `cd packages/graph-types && NODE_OPTIONS='--experimental-vm-modules' npx jest` → **RED** (module file does not exist yet: `Cannot find module './mcpTransportResolver.js'`).

- [ ] **GREEN — implement** `packages/graph-types/src/mcpTransportResolver.ts`. Keep each function ≤40 lines, depth ≤2; extract `replaceInString` / `replaceInRecord` / `resolveStdio` helpers to satisfy limits:
  ```ts
  import type { McpServerConfig, McpTransport, VariableValue } from './types/index.js';

  export const MCP_VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

  export interface EnvVarMaps {
    byName: Record<string, string>;
    byId: Record<string, string>;
  }

  function replaceInString(str: string, resolved: Record<string, string>): string {
    return str.replace(MCP_VARIABLE_PATTERN, (_, name: string) => resolved[name] ?? `{{${name}}}`);
  }

  function replaceInRecord(
    record: Record<string, string> | undefined,
    resolved: Record<string, string>
  ): Record<string, string> | undefined {
    if (record === undefined) return undefined;
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, replaceInString(v, resolved)]));
  }

  function resolveStdio(
    transport: Extract<McpTransport, { type: 'stdio' }>,
    resolved: Record<string, string>
  ): McpTransport {
    return {
      ...transport,
      command: replaceInString(transport.command, resolved),
      args: transport.args?.map((a) => replaceInString(a, resolved)),
      env: replaceInRecord(transport.env, resolved),
    };
  }

  export function resolveTransport(
    transport: McpTransport,
    resolved: Record<string, string>
  ): McpTransport {
    if (transport.type === 'stdio') return resolveStdio(transport, resolved);
    return {
      ...transport,
      url: replaceInString(transport.url, resolved),
      headers: replaceInRecord(transport.headers, resolved),
    };
  }

  export function extractTemplateVariables(transport: McpTransport): string[] {
    const json = JSON.stringify(transport);
    const names = new Set<string>();
    for (const match of json.matchAll(MCP_VARIABLE_PATTERN)) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }
    return [...names];
  }

  function resolveOneVar(value: VariableValue, env: EnvVarMaps): string {
    if (value.type === 'direct') return value.value;
    return env.byId[value.envVariableId] ?? '';
  }

  export function buildResolvedVars(
    variableValues: Record<string, VariableValue> | undefined,
    env: EnvVarMaps
  ): Record<string, string> {
    if (variableValues === undefined) return env.byName;
    const resolved: Record<string, string> = {};
    for (const [templateName, value] of Object.entries(variableValues)) {
      resolved[templateName] = resolveOneVar(value, env);
    }
    return resolved;
  }
  ```
  Note: `McpServerConfig` is imported only to keep the public surface forward-compatible / exercised by the test's `_sample`; if eslint flags it as unused, instead drop it from the import here AND from the test's `_sample` line. Prefer dropping over an eslint-disable.

- [ ] **Re-export from index.** Edit `packages/graph-types/src/index.ts`, appending:
  ```ts
  export {
    MCP_VARIABLE_PATTERN,
    buildResolvedVars,
    extractTemplateVariables,
    resolveTransport,
  } from './mcpTransportResolver.js';
  export type { EnvVarMaps } from './mcpTransportResolver.js';
  ```

- [ ] **GREEN — run tests:** `cd packages/graph-types && NODE_OPTIONS='--experimental-vm-modules' npx jest`
  Expected: all suites pass (regex parity, full-superset, intended-divergence, extract, buildResolvedVars).

- [ ] **Build + verify dist is clean of tests, then check.**
  `npm run build -w packages/graph-types` then `ls packages/graph-types/dist/mcpTransportResolver.js` (exists) and `ls packages/graph-types/dist/mcpTransportResolver.test.js 2>/dev/null; echo absent` (prints only `absent`).
  Then `npm run check` (full monorepo format+lint+typecheck) → exit 0.

- [ ] **Commit.** `git add packages/graph-types/jest.config.js packages/graph-types/tsconfig.build.json packages/graph-types/src/mcpTransportResolver.ts packages/graph-types/src/mcpTransportResolver.test.ts packages/graph-types/src/index.ts` then commit:
  ```
  feat(graph-types): add shared mcpTransportResolver (resolveTransport/extractTemplateVariables/buildResolvedVars)

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 2: Migrate web (resolveVariables + resolveVariablesServer + 2 components)

Delete web's local substitution + duplicate `VariableValue` union; delegate to graph-types. Keep the async value layer. Migrate the two `extractVariableNames` component call sites.

**Files:**
- `packages/web/app/lib/resolveVariables.ts` (EDIT — becomes a thin re-export shim)
- `packages/web/app/lib/resolveVariablesServer.ts` (EDIT — use shared `resolveTransport`)
- `packages/web/app/components/panels/PublishMcpDialog.tsx` (EDIT — import path)
- `packages/web/app/components/panels/LibraryServerFields.tsx` (EDIT — import path)

**Interfaces (unchanged public signatures — only internals move):**
```ts
// resolveVariablesServer.ts (signatures preserved)
export async function resolveValues(variableValues: Record<string, VariableValue>): Promise<Record<string, string>>;
export async function resolveTransportVariables(transport: McpTransport, variableValues: Record<string, VariableValue>): Promise<McpTransport>;
```

**Steps:**

- [ ] **RED — confirm current web tests + add a behavior pin.** First locate existing web resolver tests: `cd packages/web && NODE_OPTIONS='--experimental-vm-modules' npx jest resolve 2>&1 | tail -20`. If none reference `resolveTransportVariables`, add `packages/web/app/lib/resolveVariablesServer.test.ts` mocking `./orgEnvVariables` so `env_ref` resolves, asserting the FULL superset now applies (this is the web reference path — it already did headers/env, so this is a regression pin, GREEN once shim is in):
  ```ts
  import { describe, expect, it, jest } from '@jest/globals';

  jest.unstable_mockModule('./orgEnvVariables', () => ({
    getEnvVariableValue: jest.fn(async (id: string) => ({ value: `secret-${id}` })),
  }));
  const { resolveTransportVariables } = await import('./resolveVariablesServer.js');

  describe('resolveTransportVariables (web)', () => {
    it('substitutes http headers via env_ref', async () => {
      const out = await resolveTransportVariables(
        { type: 'http', url: 'u', headers: { Authorization: 'Bearer {{TOK}}' } },
        { TOK: { type: 'env_ref', envVariableId: 'e1' } }
      );
      expect(out).toEqual({ type: 'http', url: 'u', headers: { Authorization: 'Bearer secret-e1' } });
    });
  });
  ```
  Run `cd packages/web && NODE_OPTIONS='--experimental-vm-modules' npx jest resolveVariablesServer` → may already pass with the current code (web already substitutes headers); that is fine — it becomes the parity pin across the refactor. Note any RED and treat per superpowers:systematic-debugging.

- [ ] **GREEN — rewrite `resolveVariables.ts` as a re-export shim** so the 2 component imports and `resolveVariablesServer` keep working with zero churn. Replace the entire file with:
  ```ts
  export type { VariableValue } from '@daviddh/graph-types';
  export {
    extractTemplateVariables as extractVariableNames,
    resolveTransport as replaceInTransport,
  } from '@daviddh/graph-types';
  ```
  This deletes the hand-written `DirectValue`/`EnvRefValue`/`VariableValue` union (`:3-11`), `VARIABLE_PATTERN`, `extractVariableNames`, `replaceVariablesInString`, `replaceInHeaders`, `replaceInTransport` — all replaced by graph-types. (Note: web imports `McpTransport`/`VariableValue` from `@daviddh/graph-types` via `@/app/schemas/graph.schema`; here we import the *type* directly from `@daviddh/graph-types`, which web jest maps to `../graph-types/src/index.ts`.)

- [ ] **GREEN — `resolveVariablesServer.ts`** keeps `resolveValues` (async value layer — UNCHANGED) and only re-points the substitution. The existing import `import { replaceInTransport } from './resolveVariables'` now resolves to the shared `resolveTransport` via the shim, so **no change is strictly required**. For clarity, optionally import directly from graph-types instead of the shim:
  ```ts
  import { resolveTransport } from '@daviddh/graph-types';
  // ...and replace the call: return resolveTransport(transport, resolved);
  ```
  Either is acceptable; prefer the direct import and drop the `replaceInTransport` alias from the shim if nothing else uses it (`grep -rn "replaceInTransport" packages/web/app` to confirm — currently only `resolveVariablesServer.ts:5,32`).

- [ ] **GREEN — migrate components** to the shared name directly (per R-e). In `PublishMcpDialog.tsx` change `import { extractVariableNames } from '@/app/lib/resolveVariables';` → `import { extractTemplateVariables } from '@daviddh/graph-types';` and the call at `:185` to `extractTemplateVariables(server.transport)`. Same in `LibraryServerFields.tsx` (`:5` import, `:39` call). If you prefer to keep the shim alias to minimize diff, leave the `extractVariableNames` re-export in `resolveVariables.ts`; but R-e says migrate the call sites, so update both files. After migrating, if nothing imports `extractVariableNames`/`replaceInTransport` from the shim, delete the shim file entirely and update `resolveVariablesServer.ts` to import `VariableValue` + `resolveTransport` from `@daviddh/graph-types`. Confirm with `grep -rn "from '@/app/lib/resolveVariables'" packages/web/app` → no matches before deleting.

- [ ] **GREEN — run web tests + typecheck.**
  `cd packages/web && NODE_OPTIONS='--experimental-vm-modules' npx jest resolve` → pass.
  `npm run typecheck -w packages/web` → exit 0. `npm run lint -w packages/web` → exit 0.

- [ ] **Full check + commit.** `npm run check` → exit 0. Stage explicitly: the edited/deleted lib files, both components, the new test. (`git add packages/web/app/lib/resolveVariablesServer.ts packages/web/app/components/panels/PublishMcpDialog.tsx packages/web/app/components/panels/LibraryServerFields.tsx packages/web/app/lib/resolveVariablesServer.test.ts` and `git add -u packages/web/app/lib/resolveVariables.ts` if deleted.) Commit:
  ```
  refactor(web): delegate MCP variable substitution to shared graph-types resolver

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 3: Migrate backend execute (executeHelpers)

The execute path is already the full superset — pure refactor, zero behavior change. Existing execute tests must stay green.

**Files:** `packages/backend/src/routes/execute/executeHelpers.ts` (EDIT)

**Interfaces (preserved exactly — call sites `executeCoreHelpers.ts:59`, `getRegistry.ts:84` must not change):**
```ts
export function resolveServerTransport(server: McpServerConfig, envByName: Record<string, string>, envById: Record<string, string>): McpServerConfig;
export function resolveMcpTransportVariables(graph: RuntimeGraph, envByName: Record<string, string>, envById: Record<string, string>): RuntimeGraph;
```

**Steps:**

- [ ] **RED/baseline — run existing execute tests** to capture green baseline:
  `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest executeHelpers getRegistry executeCore 2>&1 | tail -20`. Record which suites cover `resolveServerTransport`/`resolveMcpTransportVariables`. If coverage is thin, add a focused test `packages/backend/src/routes/execute/executeHelpers.resolver.test.ts` asserting `resolveServerTransport` substitutes http headers via `env_ref` (proves parity post-refactor). Run it → GREEN against current code (execute already does this).

- [ ] **GREEN — delete the local substitution + mapping** in `executeHelpers.ts`: remove `VARIABLE_PATTERN` (`:68`), `replaceVarsInString` (`:70-72`), `replaceVarsInHeaders` (`:74-80`), `replaceStdioVars` (`:82-97`), `replaceVarsInTransport` (`:99-106`), the local `EnvVarMaps` interface (`:108-111`), and `buildResolvedVars` (`:113-127`). Add to the top-of-file graph-types import (currently `import type { McpServerConfig, McpTransport, RuntimeGraph } from '@daviddh/graph-types';`) a value import:
  ```ts
  import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
  import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';
  ```
  (Drop `McpTransport` from the type import if no longer referenced — `grep -n "McpTransport" packages/backend/src/routes/execute/executeHelpers.ts`; it is used by the deleted helpers, so it likely becomes unused.) Rewrite `resolveServerTransport` to use the shared helpers (note shared `buildResolvedVars` takes `variableValues`, not `server`):
  ```ts
  export function resolveServerTransport(
    server: McpServerConfig,
    envByName: Record<string, string>,
    envById: Record<string, string>
  ): McpServerConfig {
    const vars = buildResolvedVars(server.variableValues, { byName: envByName, byId: envById });
    return { ...server, transport: resolveTransport(server.transport, vars) };
  }
  ```
  Leave `resolveMcpTransportVariables` (`:139-147`) unchanged.

- [ ] **GREEN — run tests + typecheck.**
  `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest executeHelpers getRegistry executeCore executeAgentRecord agentRuntimeGraph` → all pass.
  `npm run typecheck -w packages/backend` → exit 0.

- [ ] **Full check + commit.** `npm run check` → exit 0. `git add packages/backend/src/routes/execute/executeHelpers.ts` (+ the new resolver test if added). Commit:
  ```
  refactor(backend): execute path delegates to shared graph-types resolver

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 4: Migrate backend discovery (mcpToolService) — fixes the env/headers leak

**Behavior change (intended, D5):** discovery now substitutes stdio `env` and http/sse `headers`. Prior fallback (no `variableValues` → `byId`) is preserved by passing `{ byName: {}, byId }`.

**Files:** `packages/backend/src/mcp-server/services/mcpToolService.ts` (EDIT)

**Steps:**

- [ ] **RED — add a test pinning the fix.** In `packages/backend/src/mcp-server/__tests__/mcpToolService.test.ts` (existing — mocks `assembleGraph`/`connectMcp`/`createTransport`/`getDecryptedEnvVariables`), add a case: a server with an `http` transport whose header is `Authorization: 'Bearer {{TOK}}'` and `variableValues: { TOK: { type: 'env_ref', envVariableId: 'e1' } }`, with `mockGetDecryptedEnvVariables.mockResolvedValue({ byName: {}, byId: { e1: 'secret' } })`. Assert `mockCreateTransport` was called with a transport whose `headers.Authorization === 'Bearer secret'`. Run `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest mcpToolService` → **RED** (current code leaks `{{TOK}}` because it skips headers).

- [ ] **GREEN — delete local impl, delegate.** In `mcpToolService.ts` remove `VARIABLE_PATTERN` (`:40`), `replaceVars` (`:42-44`), `resolveTransportVars` (`:46-58`), `resolveServerVars` (`:60-74`). Add value imports to the existing `@daviddh/graph-types` type import:
  ```ts
  import type { Graph, McpServerConfig } from '@daviddh/graph-types';
  import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';
  ```
  (Drop `McpTransport` from the type import — confirm it is now unused via grep.) Rewrite the substitution inside `openClient` (`:76-84`), preserving the exact prior `byId`-only fallback by passing empty `byName`:
  ```ts
  async function openClient(ctx: ServiceContext, agentId: string, serverId: string): Promise<McpClientHandle> {
    const graph = requireGraph(await assembleGraph(ctx.supabase, agentId), agentId);
    const server = requireServer(graph, serverId);
    const { byId } = await getDecryptedEnvVariables(ctx.supabase, ctx.orgId);
    const vars = buildResolvedVars(server.variableValues, { byName: {}, byId });
    const transport = resolveTransport(server.transport, vars);
    const wireTransport = createTransport({ ...server, transport });
    return await connectMcp({ transport: wireTransport });
  }
  ```

- [ ] **GREEN — run tests + typecheck.**
  `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest mcpToolService` → all pass (incl. the new header case).
  `npm run typecheck -w packages/backend` → exit 0.

- [ ] **Full check + commit.** `npm run check` → exit 0. `git add packages/backend/src/mcp-server/services/mcpToolService.ts packages/backend/src/mcp-server/__tests__/mcpToolService.test.ts`. Commit:
  ```
  fix(backend): discovery substitutes MCP env/headers via shared resolver

  Header- and stdio-env-authed MCPs no longer leak {{VAR}} on the tool-call path.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 5: Migrate backend simulate (simulateHelpers) — fixes the env/headers leak

**Behavior change (intended, D5):** simulate/preview now substitutes stdio `env` and http/sse `headers`. The loose structural `resolveServerVars` is replaced by the typed shared `buildResolvedVars` — output is identical for well-typed values (`direct.value` is always a string; `env_ref.envVariableId` always present). Prior fallback (no `variableValues` → `envById`) preserved via `{ byName: {}, byId: envById }`.

**Files:** `packages/backend/src/mcp-server/services/simulateHelpers.ts` (EDIT)

**Interfaces (preserved — call site `simulateService.ts:36` must not change):**
```ts
export function resolveMcpEnvVars(graph: Graph, envById: Record<string, string>): Graph;
```

**Steps:**

- [ ] **RED — add a test pinning the fix.** Locate the simulate test (`packages/backend/src/mcp-server/__tests__/simulateService.test.ts`); add or create a focused unit test for `resolveMcpEnvVars` (it is a pure exported function, easy to test directly). New file `packages/backend/src/mcp-server/services/simulateHelpers.resolver.test.ts`:
  ```ts
  import type { Graph } from '@daviddh/graph-types';
  import { describe, expect, it } from '@jest/globals';

  import { resolveMcpEnvVars } from './simulateHelpers.js';

  const baseGraph: Omit<Graph, 'mcpServers'> = {
    startNode: 'Start',
    agents: [{ id: 'main', description: 'm' }],
    nodes: [{ id: 'Start', text: 'h', kind: 'agent', agent: 'main', global: false, description: '' }],
    edges: [],
  };

  describe('resolveMcpEnvVars (simulate)', () => {
    it('substitutes http headers via env_ref (leak fix)', () => {
      const graph: Graph = {
        ...baseGraph,
        mcpServers: [{
          id: 's1', name: 's1', enabled: true,
          transport: { type: 'http', url: 'u', headers: { Authorization: 'Bearer {{TOK}}' } },
          variableValues: { TOK: { type: 'env_ref', envVariableId: 'e1' } },
        }],
      };
      const out = resolveMcpEnvVars(graph, { e1: 'secret' });
      const server = out.mcpServers?.[0];
      expect(server?.transport).toEqual({ type: 'http', url: 'u', headers: { Authorization: 'Bearer secret' } });
    });
  });
  ```
  Run `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest simulateHelpers.resolver` → **RED** (current simulate skips headers).

- [ ] **GREEN — delete local impl, delegate.** In `simulateHelpers.ts` remove `VARIABLE_PATTERN` (`:37`), `replaceVars` (`:39-41`), `resolveStdioTransport` (`:43-52`), `resolveTransportVars` (`:54-57`), `resolveServerVars` (`:59-76`). Update imports:
  ```ts
  import type { Graph } from '@daviddh/graph-types';
  import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';
  ```
  (Drop `McpTransport` from the type import — confirm unused.) Rewrite `resolveMcpEnvVars` (`:78-88`), preserving the prior `byId`-only fallback via empty `byName`:
  ```ts
  export function resolveMcpEnvVars(graph: Graph, envById: Record<string, string>): Graph {
    const { mcpServers: servers } = graph;
    if (servers === undefined) return graph;
    return {
      ...graph,
      mcpServers: servers.map((s) => {
        const vars = buildResolvedVars(s.variableValues, { byName: {}, byId: envById });
        return { ...s, transport: resolveTransport(s.transport, vars) };
      }),
    };
  }
  ```
  Keep `map` callback ≤40 lines / depth ≤2 (it is). The structural-shape change (`s` is now the typed `McpServerConfig` from `Graph.mcpServers`, not the inline loose shape) is safe — `s.variableValues` is `Record<string, VariableValue> | undefined`, exactly what `buildResolvedVars` expects.

- [ ] **GREEN — run tests + typecheck.**
  `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest simulate` → all pass (incl. the new resolver test and existing `simulateService`).
  `npm run typecheck -w packages/backend` → exit 0.

- [ ] **Full check + commit.** `npm run check` → exit 0. `git add packages/backend/src/mcp-server/services/simulateHelpers.ts packages/backend/src/mcp-server/services/simulateHelpers.resolver.test.ts`. Commit:
  ```
  fix(backend): simulate substitutes MCP env/headers via shared resolver

  Preview path now matches execute/discovery; {{VAR}} no longer leaks in headers/env.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 6: Final cross-package verification + edge dist rebuild

No code change beyond rebuilding `dist` so the edge function inherits the unified module transitively (R-d).

**Steps:**

- [ ] **Confirm no local resolver remnants remain.** `grep -rn "VARIABLE_PATTERN\|/gv" packages/backend/src packages/web/app` → no matches (the canonical pattern lives only in graph-types, named `MCP_VARIABLE_PATTERN`). `grep -rn "replaceInTransport\|replaceVarsInTransport\|resolveTransportVars\|resolveServerVars" packages/backend/src packages/web/app` → no matches.
- [ ] **Confirm the shared module is the single source.** `grep -rln "from '@daviddh/graph-types'" packages/web/app packages/backend/src | xargs grep -l "resolveTransport\|extractTemplateVariables\|buildResolvedVars" | sort` → lists exactly the migrated files.
- [ ] **Rebuild all dist (edge consumes graph-types `dist`).** `npm run build -w packages/graph-types && npm run build` → exit 0. Confirm `packages/graph-types/dist/mcpTransportResolver.js` exists and `...test.js` does not.
- [ ] **Full monorepo gate.** `npm run check` → exit 0. Backend full suite: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest` → green. api suite: `npm run test -w packages/api` → green. web suite: `cd packages/web && NODE_OPTIONS='--experimental-vm-modules' npx jest` → green.
- [ ] No new commit unless `dist` artifacts are tracked in this repo (check `git status --porcelain packages/*/dist` — if dist is gitignored, nothing to commit; if tracked, `git add` the rebuilt graph-types dist and commit `chore: rebuild graph-types dist for shared resolver`).

---

## Self-Review

**Spec coverage (every resolved decision → task):**
- R-a (plain `/g` group 1): Task 1 `MCP_VARIABLE_PATTERN = /\{\{(\w+)\}\}/g`; regex-parity test asserts equality with both legacy variants.
- R-b (home `graph-types/src/mcpTransportResolver.ts`, pure, re-exported): Task 1 module + index re-export; imports types only; jest-config + tsconfig.build exclude keep `dist` clean.
- R-c (unify substitution + extraction + pure `buildResolvedVars`; fetching stays per call site): Task 1 implements all three; Tasks 2-5 keep value fetching local (web async `resolveValues`; backend pre-fetched `byId`/`byName`).
- R-d (edge out of scope): Task 6 rebuilds `dist`; no edge code touched (verified: no `{{}}` in `supabase/functions`).
- R-e (web duplicate `VariableValue` deleted; both component call sites migrated): Task 2.
- D5 leak fix (env/headers on discovery + simulate): Tasks 4 + 5, each with a RED test pinning the corrected output; web (Task 2) + execute (Task 3) are the unchanged reference superset.

**Placeholders:** none. Every step has actual code, exact commands, and expected output. The only conditional is "delete the shim file if nothing imports it" (Task 2) — resolved by an explicit `grep` gate.

**Type/name consistency:**
- Shared `buildResolvedVars(variableValues, env)` takes `variableValues` (not `server`) — Tasks 3/4/5 all pass `server.variableValues` / `s.variableValues`. The old execute helper's `(server, env)` form is intentionally NOT preserved; callers updated accordingly.
- `EnvVarMaps { byName; byId }` exported from graph-types; backend execute's local `EnvVarMaps` deleted (Task 3) to avoid a duplicate name.
- Fallback parity: execute kept `byName`; discovery/simulate previously fell back to `byId` only — preserved by passing `{ byName: {}, byId }` (empty `byName` ⇒ undefined-`variableValues` returns `{}`-merged-nothing ⇒ identical to prior `byId`-direct behavior, since those paths never had a `byName` map). Verified in Tasks 4/5 step notes.
- `VariableValue` type sourced from `@daviddh/graph-types` everywhere; web's hand-written union removed (Task 2). simulate's loose structural shape replaced by the typed union (Task 5) — identical output for valid data.
- All relative imports use `.js` specifiers; value-vs-type imports split (`import type` for types, `import` for the resolver functions).
