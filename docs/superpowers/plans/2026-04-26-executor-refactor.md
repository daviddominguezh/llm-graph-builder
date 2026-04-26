# Executor Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** v2 — staff-engineer + UX dual review of plan applied. See "Revisions" log at bottom.

**Realistic scope:** ~3–4 weeks of full-time staff-engineer work. Earlier estimates implied ~25 task-days; that was understated. Tasks 6–10 (one provider each) and Task 12 (MCP transport relocation) are the longest. Task 12 is itself a multi-day subproject — see the expanded breakdown there.

**Goal:** Replace the param-soup `injectSystemTools` pattern with a per-execution plugin registry. Workflows resolve tools lazily per `tool_call` node; autonomous agents resolve their full `selected_tools` set eagerly at execution start. The frontend tool catalog moves to a server endpoint backed by the same registry.

**Architecture:** A `Provider` interface owns its own auth/connection/tool-build logic. `composeRegistry` is a per-execution pure function that composes built-ins (static module exports) with per-org MCP providers. Workflows call `findToolByName` against `precondition.tool` (qualified ref); agents call `buildSelected` against `selected_tools`. A new `OpenFlowTool` adapter type insulates providers from AI SDK churn. Edge function payload is generalized (`oauth.byProvider`, `schemaVersion: 2`).

**Tech Stack:** TypeScript (strict; `any`-forbidden), Node/Express backend, Deno/Supabase Edge Function, Next.js (App Router), Zod, AI SDK `Tool` (adapted via `OpenFlowTool`).

**Spec:** `docs/superpowers/specs/2026-04-26-executor-refactor-design.md` (v2). Read it before starting.

**Depends on:** Sub-project A (selected_tools storage) — must be merged first.

**Project conventions:**
- ESLint enforces `max-lines-per-function: 40`, `max-lines: 300` per file, `max-depth: 2`. Never disable; refactor.
- Never use `any` — explicit types only.
- Do not run `supabase db reset` or migration apply. Migrations land as files; the user applies them.

**Critical reading order before starting:**
1. The v2 spec (above).
2. Sub-project A's spec (referenced for `SelectedTool` shape).
3. The existing `packages/api/src/tools/systemToolInjector.ts` (what's being deleted).
4. The existing `supabase/functions/execute-agent/index.ts` (the runtime that consumes the registry).

---

## Phase 1: New core types and primitives

### Task 1: `OpenFlowTool` adapter type + AI SDK conversion

**Files:**
- Create: `packages/api/src/providers/types.ts`
- Create: `packages/api/src/providers/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/api/src/providers/__tests__/types.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { type OpenFlowTool, toAiSdkTool } from '../types.js';

describe('toAiSdkTool', () => {
  it('maps an OpenFlowTool to an AI SDK Tool', () => {
    const inputSchema = z.object({ name: z.string() });
    const ofTool: OpenFlowTool = {
      description: 'Greet the user',
      inputSchema,
      execute: async (args: { name: string }) => `hello ${args.name}`,
    };
    const aiTool = toAiSdkTool(ofTool);
    expect(aiTool.description).toBe('Greet the user');
    expect(aiTool.inputSchema).toBeDefined();
    expect(typeof aiTool.execute).toBe('function');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=providers/__tests__/types`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the type module**

`packages/api/src/providers/types.ts`:

```ts
import type { Tool } from 'ai';
import { zodSchema } from 'ai';
import type { ZodTypeAny, z } from 'zod';

/**
 * Project-local tool shape. Decouples Provider implementations from the AI SDK's
 * `Tool` type so AI SDK breaking changes don't cascade across every provider.
 * Adapter `toAiSdkTool` is the only place that imports from 'ai'.
 */
export interface OpenFlowTool<Schema extends ZodTypeAny = ZodTypeAny, Output = unknown> {
  description: string;
  inputSchema: Schema;
  execute: (args: z.infer<Schema>) => Promise<Output> | Output;
}

export function toAiSdkTool<S extends ZodTypeAny, O>(t: OpenFlowTool<S, O>): Tool {
  return {
    description: t.description,
    inputSchema: zodSchema(t.inputSchema),
    execute: async (args: z.infer<S>) => await t.execute(args),
  };
}

export function toAiSdkToolDict(tools: Record<string, OpenFlowTool>): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(tools)) out[name] = toAiSdkTool(tool);
  return out;
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=providers/__tests__/types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/types.ts packages/api/src/providers/__tests__/types.test.ts
git commit -m "feat(api): add OpenFlowTool adapter type"
```

---

### Task 2: `ToolDescriptor` + `Provider` + `ProviderCtx` interfaces

**Files:**
- Create: `packages/api/src/providers/provider.ts`

- [ ] **Step 1: Write the file**

`packages/api/src/providers/provider.ts`:

```ts
import type { McpTransportConfig } from '@daviddh/graph-types';

import type { Logger } from '../utils/logger.js';
import type { OpenFlowTool } from './types.js';

export type ProviderType = 'builtin' | 'mcp';

export interface OAuthTokenBundle {
  accessToken: string;
  expiresAt: number;
  scopes?: string[];
  tokenIssuedAt: number;
}

/**
 * Per-execution context. Universal fields only. Provider-specific runtime
 * dependencies (forms list, lead-scoring service, dispatch credentials, etc.)
 * are accessed via `services<T>(providerId)` so adding a new built-in provider
 * does not require editing this type.
 */
export interface ProviderCtx {
  readonly orgId: string;
  readonly agentId: string;
  readonly isChildAgent: boolean;
  readonly logger: Logger;

  readonly conversationId?: string;
  readonly contextData?: Readonly<Record<string, unknown>>;

  readonly oauthTokens: ReadonlyMap<string, OAuthTokenBundle>;
  readonly mcpTransports: ReadonlyMap<string, McpTransportConfig>;

  readonly services: <T>(providerId: string) => T | undefined;
}

export interface ToolDescriptor {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Provider {
  type: ProviderType;
  id: string;
  displayName: string;
  description?: string;

  describeTools(ctx: ProviderCtx): Promise<ToolDescriptor[]>;
  buildTools(args: { toolNames: string[]; ctx: ProviderCtx }): Promise<Record<string, OpenFlowTool>>;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w @daviddh/llm-graph-runner`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/providers/provider.ts
git commit -m "feat(api): add Provider, ProviderCtx, ToolDescriptor interfaces"
```

---

### Task 3: Graph schema migration — `tool_call` precondition uses qualified ref

**Files:**
- Modify: `packages/graph-types/src/schemas/edge.schema.ts`
- Modify: `packages/graph-types/src/schemas/edge.schema.test.ts` (or whatever the existing test file is)

- [ ] **Step 1: Read the existing schema**

Run: `cat packages/graph-types/src/schemas/edge.schema.ts`

- [ ] **Step 2: Replace `PreconditionSchema` with a discriminated union**

In `packages/graph-types/src/schemas/edge.schema.ts`, replace the existing single `PreconditionSchema` definition with:

```ts
import { z } from 'zod';

const SelectedToolRefSchema = z.object({
  providerType: z.enum(['builtin', 'mcp']),
  providerId: z.string().min(1).max(100),
  toolName: z.string().min(1).max(100),
});

export type ToolFieldValue =
  | { type: 'fixed'; value: string }
  | { type: 'reference'; nodeId: string; path: string; fallbacks?: ToolFieldValue[] };

const FixedFieldValueSchema = z.object({ type: z.literal('fixed'), value: z.string() });

export const ToolFieldValueSchema: z.ZodType<ToolFieldValue> = z.lazy(() =>
  z.union([
    FixedFieldValueSchema,
    z.object({
      type: z.literal('reference'),
      nodeId: z.string(),
      path: z.string(),
      fallbacks: z.array(ToolFieldValueSchema).optional(),
    }),
  ])
);

export const PreconditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user_said'),
    value: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('agent_decision'),
    value: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('tool_call'),
    tool: SelectedToolRefSchema,
    description: z.string().optional(),
    toolFields: z.record(z.string(), ToolFieldValueSchema).optional(),
  }),
]);

export const PreconditionTypeSchema = z.enum(['user_said', 'agent_decision', 'tool_call']);

const EMPTY_LENGTH = 0;
const FIRST_INDEX = 0;

type PreconditionInput = z.infer<typeof PreconditionSchema>;

const allSameType = (preconditions: PreconditionInput[]): boolean => {
  if (preconditions.length === EMPTY_LENGTH) return true;
  const firstType = preconditions[FIRST_INDEX]?.type;
  return preconditions.every((p) => p.type === firstType);
};

const SAME_TYPE_MESSAGE =
  'All preconditions in an edge must have the same type (user_said, agent_decision, or tool_call)';

export const PreconditionsArraySchema = z
  .array(PreconditionSchema)
  .refine(allSameType, { message: SAME_TYPE_MESSAGE });

export const ContextPreconditionsSchema = z.object({
  preconditions: z.array(z.string()),
  jumpTo: z.string().optional(),
});

export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  preconditions: PreconditionsArraySchema.optional(),
  contextPreconditions: ContextPreconditionsSchema.optional(),
});

export const RuntimeEdgeSchema = EdgeSchema.extend({
  label: z.string().optional(),
});
```

- [ ] **Step 3: Run existing graph-types tests**

Run: `npm run test -w packages/graph-types` (or the equivalent for graph-types).
Expected: existing tests now fail wherever they construct a tool_call precondition with `value: string`. **This is expected** — they need to be updated to use `tool: {...}`.

- [ ] **Step 4: Update affected tests + any seed data parsers**

Run: `grep -rn "type: 'tool_call'" packages/ --include='*.ts' --include='*.tsx' --include='*.json' 2>/dev/null | grep -v node_modules`

For each match, convert from `value: 'check_availability'` to `tool: { providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' }`. Built-in providerIds: `calendar`, `forms`, `lead_scoring`, `composition`. Otherwise, MCP — pass the MCP server's UUID.

- [ ] **Step 4a: Enumerate and update `precondition.value` consumers** *(added after engineer review #B3)*

The schema change above breaks any code that reads `precondition.value` for `tool_call` preconditions. Existing consumers identified:

```bash
grep -rn "precondition.value\|preconditions\[0\].value" packages/api/src --include='*.ts' | grep -v node_modules
```

Known sites that must be updated:

1. **`packages/api/src/tools/dummyTools.ts`** — currently does `toolNames.add(precondition.value)` for tool_call preconditions. Update to:

   ```ts
   if (precondition.type === 'tool_call') {
     toolNames.add(precondition.tool.toolName);
   }
   ```

2. **`packages/api/src/stateMachine/format/index.ts`** — formats `precondition.value` for prompt construction. Update to:

   ```ts
   const displayValue = precondition.type === 'tool_call' ? precondition.tool.toolName : precondition.value;
   ```

   (This preserves the prompt-format behaviour: the LLM sees the tool name, not the qualified ref.)

3. Any other location surfaced by the grep above. **Do not skip this step** — the discriminated-union schema change makes these compile errors, but only after typecheck. If a runtime path executes pre-typecheck, it silently produces `undefined`.

- [ ] **Step 4b: Run typecheck to surface remaining call sites**

Run: `npm run typecheck -ws`
Expected: any unfixed `precondition.value` access on `tool_call` preconditions surfaces as a TypeScript error. Address each.

- [ ] **Step 5: Run all tests**

Run: `npm run test -ws`
Expected: pass (or only failures from incomplete later tasks).

- [ ] **Step 6: Commit**

```bash
git add packages/graph-types/ packages/web/app/data/ # any other touched paths
git commit -m "feat(graph): tool_call preconditions use qualified ref"
```

---

## Phase 2: Provider registry composition

### Task 4: `buildToolIndex` helper (built-in wins on collision)

**Files:**
- Create: `packages/api/src/providers/buildToolIndex.ts`
- Create: `packages/api/src/providers/__tests__/buildToolIndex.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/api/src/providers/__tests__/buildToolIndex.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';

import { buildToolIndex } from '../buildToolIndex.js';
import type { Provider, ToolDescriptor } from '../provider.js';

function fakeProvider(type: 'builtin' | 'mcp', id: string, descriptors: ToolDescriptor[]): Provider {
  return {
    type,
    id,
    displayName: id,
    describeTools: async () => descriptors,
    buildTools: async () => ({}),
  };
}

const td = (toolName: string): ToolDescriptor => ({
  toolName,
  description: `${toolName} desc`,
  inputSchema: { type: 'object' },
});

describe('buildToolIndex', () => {
  it('indexes tools across providers', async () => {
    const builtin = fakeProvider('builtin', 'calendar', [td('check_availability'), td('list_calendars')]);
    const mcp = fakeProvider('mcp', 'mcp-1', [td('hubspot_create_deal')]);
    const ctx = {} as never;
    const index = await buildToolIndex([builtin, mcp], ctx, console as never);
    expect(index.size).toBe(3);
    expect(index.get('check_availability')?.provider.id).toBe('calendar');
  });

  it('built-in wins on collision; mcp tool dropped + counter incremented', async () => {
    const counter = jest.fn();
    const builtin = fakeProvider('builtin', 'calendar', [td('shared_name')]);
    const mcp = fakeProvider('mcp', 'mcp-1', [td('shared_name')]);
    const logger = { warn: jest.fn() } as unknown as { warn: () => void };
    const ctx = {} as never;
    const index = await buildToolIndex([builtin, mcp], ctx, logger as never, counter);
    expect(index.get('shared_name')?.provider.type).toBe('builtin');
    expect(counter).toHaveBeenCalledWith({ inBuiltin: 'calendar', inMcp: 'mcp-1', toolName: 'shared_name' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=providers/__tests__/buildToolIndex`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

`packages/api/src/providers/buildToolIndex.ts`:

```ts
import type { Logger } from '../utils/logger.js';
import type { Provider, ProviderCtx, ToolDescriptor } from './provider.js';

export interface IndexEntry {
  provider: Provider;
  descriptor: ToolDescriptor;
}

export type ConflictReporter = (conflict: { inBuiltin: string; inMcp: string; toolName: string }) => void;

export async function buildToolIndex(
  providers: ReadonlyArray<Provider>,
  ctx: ProviderCtx,
  logger: Logger,
  reportConflict: ConflictReporter = () => undefined
): Promise<ReadonlyMap<string, IndexEntry>> {
  const index = new Map<string, IndexEntry>();
  for (const provider of providers) {
    const descriptors = await provider.describeTools(ctx);
    for (const descriptor of descriptors) {
      const existing = index.get(descriptor.toolName);
      if (existing === undefined) {
        index.set(descriptor.toolName, { provider, descriptor });
        continue;
      }
      // Collision: built-in wins
      const builtin = existing.provider.type === 'builtin' ? existing.provider : provider;
      const mcp = existing.provider.type === 'builtin' ? provider : existing.provider;
      reportConflict({ inBuiltin: builtin.id, inMcp: mcp.id, toolName: descriptor.toolName });
      logger.warn?.(`tool name collision: ${descriptor.toolName} (built-in ${builtin.id} wins; mcp ${mcp.id} dropped)`);
      index.set(descriptor.toolName, existing.provider.type === 'builtin' ? existing : { provider, descriptor });
    }
  }
  return index;
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=providers/__tests__/buildToolIndex`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/buildToolIndex.ts packages/api/src/providers/__tests__/buildToolIndex.test.ts
git commit -m "feat(api): add buildToolIndex with built-in-wins collision handling"
```

---

### Task 5: `composeRegistry` + `Registry` interface (no I/O on compose)

**Files:**
- Create: `packages/api/src/providers/registry.ts`
- Create: `packages/api/src/providers/__tests__/composeRegistry.test.ts`

- [ ] **Step 1: Write the failing test (must include "no I/O" assertion)**

`packages/api/src/providers/__tests__/composeRegistry.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';
import type { SelectedTool } from '@daviddh/llm-graph-runner';

import type { Provider, ProviderCtx } from '../provider.js';
import { composeRegistry } from '../registry.js';

function fakeProvider(type: 'builtin' | 'mcp', id: string): Provider {
  return {
    type,
    id,
    displayName: id,
    describeTools: jest.fn().mockResolvedValue([]),
    buildTools: jest.fn().mockResolvedValue({}),
  };
}

const ctx = {} as ProviderCtx;
const logger = { warn: () => undefined } as never;

describe('composeRegistry', () => {
  it('performs no I/O at compose time', () => {
    const builtin = fakeProvider('builtin', 'calendar');
    composeRegistry({ builtIns: new Map([['calendar', builtin]]), orgMcpServers: [], logger });
    expect(builtin.describeTools).not.toHaveBeenCalled();
    expect(builtin.buildTools).not.toHaveBeenCalled();
  });

  it('does not eagerly call buildMcpProvider closures (no I/O on compose)', () => {
    // *Amended after engineer review (test-coverage-gap-1)*: explicitly verify that the
    // mcpProviders.map(buildMcpProvider) step at compose time does no network/DB activity.
    // Spy on a fake transport and assert zero calls.
    const spyTransport = { initialize: jest.fn(), toolsList: jest.fn(), toolsCall: jest.fn() };
    const fakeMcpServer = {
      id: 'mcp-1',
      name: 'fake-mcp',
      url: 'https://fake.example/mcp',
      transport: spyTransport,
    };
    composeRegistry({
      builtIns: new Map(),
      orgMcpServers: [fakeMcpServer as never],
      logger,
    });
    expect(spyTransport.initialize).not.toHaveBeenCalled();
    expect(spyTransport.toolsList).not.toHaveBeenCalled();
    expect(spyTransport.toolsCall).not.toHaveBeenCalled();
  });

  it('returns an immutable provider list', () => {
    const builtin = fakeProvider('builtin', 'calendar');
    const registry = composeRegistry({ builtIns: new Map([['calendar', builtin]]), orgMcpServers: [], logger });
    expect(() => (registry.providers as unknown as Provider[]).push(builtin)).toThrow();
  });

  it('buildSelected groups by provider and returns merged tools', async () => {
    // Build a fake provider that returns tools for the requested names
    const provider: Provider = {
      type: 'builtin',
      id: 'calendar',
      displayName: 'calendar',
      describeTools: async () => [],
      buildTools: jest.fn().mockResolvedValue({
        check_availability: { description: '', inputSchema: {}, execute: async () => null },
      }),
    };
    const registry = composeRegistry({ builtIns: new Map([['calendar', provider]]), orgMcpServers: [], logger });
    const refs: SelectedTool[] = [{ providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' }];
    const result = await registry.buildSelected({ refs, ctx });
    expect(result.tools.check_availability).toBeDefined();
    expect(result.staleRefs).toEqual([]);
  });

  it('buildSelected returns staleRefs for unknown providerId', async () => {
    const registry = composeRegistry({ builtIns: new Map(), orgMcpServers: [], logger });
    const refs: SelectedTool[] = [{ providerType: 'builtin', providerId: 'nope', toolName: 'x' }];
    const result = await registry.buildSelected({ refs, ctx });
    expect(result.tools).toEqual({});
    expect(result.staleRefs).toEqual(refs);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=composeRegistry`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the registry**

`packages/api/src/providers/registry.ts`:

```ts
import type { McpServerConfig, SelectedTool } from '@daviddh/llm-graph-runner';

import type { Logger } from '../utils/logger.js';
import { buildToolIndex, type IndexEntry } from './buildToolIndex.js';
import { buildMcpProvider } from './mcp/buildMcpProvider.js';
import type { Provider, ProviderCtx, ToolDescriptor } from './provider.js';
import type { OpenFlowTool } from './types.js';

export interface RegistryBuildResult {
  tools: Record<string, OpenFlowTool>;
  staleRefs: SelectedTool[];
  failedProviders: Array<{
    providerType: 'builtin' | 'mcp';
    providerId: string;
    reason: 'auth_failed' | 'timeout' | 'protocol_error' | 'unknown';
    detail: string;
  }>;
}

export interface Registry {
  readonly providers: ReadonlyArray<Provider>;
  findToolByName(toolName: string): IndexEntry | null;
  buildSelected(args: { refs: SelectedTool[]; ctx: ProviderCtx }): Promise<RegistryBuildResult>;
  describeAll(ctx: ProviderCtx): Promise<Array<{ provider: Provider; tools: ToolDescriptor[]; error?: { reason: string; detail: string } }>>;
}

export interface ComposeRegistryArgs {
  builtIns: ReadonlyMap<string, Provider>;
  orgMcpServers: McpServerConfig[];
  logger: Logger;
}

export function composeRegistry(args: ComposeRegistryArgs): Registry {
  const mcpProviders = args.orgMcpServers.map(buildMcpProvider);
  const allProviders = Object.freeze([...args.builtIns.values(), ...mcpProviders]) as ReadonlyArray<Provider>;

  // Tool index built lazily on first findToolByName call (one I/O round trip in worst case).
  let toolIndex: ReadonlyMap<string, IndexEntry> | null = null;
  let toolIndexCtx: ProviderCtx | null = null;
  const ensureIndex = async (ctx: ProviderCtx) => {
    if (toolIndex !== null && toolIndexCtx === ctx) return toolIndex;
    toolIndex = await buildToolIndex(allProviders, ctx, args.logger);
    toolIndexCtx = ctx;
    return toolIndex;
  };

  return Object.freeze<Registry>({
    providers: allProviders,
    // *Amended after engineer review (#B4)*: findToolByName is now async. The previous
    // sync version would silently return null when called before describeAll had warmed
    // the index — and the only consumer (resolveToolsForCurrentNode) bypassed it anyway.
    // Async eliminates the foot-gun.
    async findToolByName(toolName: string, ctx: ProviderCtx): Promise<IndexEntry | null> {
      const index = await ensureIndex(ctx);
      return index.get(toolName) ?? null;
    },
    async describeAll(ctx) {
      const items: Array<{ provider: Provider; tools: ToolDescriptor[]; error?: { reason: string; detail: string } }> = [];
      await Promise.all(
        allProviders.map(async (p) => {
          try {
            const tools = await p.describeTools(ctx);
            items.push({ provider: p, tools });
          } catch (err) {
            items.push({
              provider: p,
              tools: [],
              error: { reason: 'unknown', detail: err instanceof Error ? err.message : String(err) },
            });
          }
        })
      );
      void ensureIndex(ctx);   // warm the index for subsequent findToolByName
      return items;
    },
    async buildSelected({ refs, ctx }) {
      return await buildSelectedImpl(allProviders, refs, ctx);
    },
  });
}

async function buildSelectedImpl(
  providers: ReadonlyArray<Provider>,
  refs: SelectedTool[],
  ctx: ProviderCtx
): Promise<RegistryBuildResult> {
  const byProvider = new Map<string, { provider: Provider; toolNames: string[] }>();
  const stale: SelectedTool[] = [];
  for (const ref of refs) {
    const provider = providers.find((p) => p.type === ref.providerType && p.id === ref.providerId);
    if (provider === undefined) {
      stale.push(ref);
      continue;
    }
    const key = `${ref.providerType}:${ref.providerId}`;
    const existing = byProvider.get(key);
    if (existing === undefined) byProvider.set(key, { provider, toolNames: [ref.toolName] });
    else existing.toolNames.push(ref.toolName);
  }

  const tools: Record<string, OpenFlowTool> = {};
  const failed: RegistryBuildResult['failedProviders'] = [];
  await Promise.all(
    Array.from(byProvider.values()).map(async ({ provider, toolNames }) => {
      try {
        const built = await provider.buildTools({ toolNames, ctx });
        Object.assign(tools, built);
      } catch (err) {
        failed.push({
          providerType: provider.type,
          providerId: provider.id,
          reason: classifyError(err),
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );
  return { tools, staleRefs: stale, failedProviders: failed };
}

function classifyError(err: unknown): RegistryBuildResult['failedProviders'][number]['reason'] {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('auth') || msg.includes('401') || msg.includes('403')) return 'auth_failed';
  if (msg.includes('timeout') || msg.includes('etimedout')) return 'timeout';
  if (msg.includes('protocol') || msg.includes('invalid response')) return 'protocol_error';
  return 'unknown';
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=composeRegistry`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/registry.ts packages/api/src/providers/__tests__/composeRegistry.test.ts
git commit -m "feat(api): add composeRegistry with frozen providers and lazy index"
```

---

## Phase 3: Built-in providers (move + adapt)

### Task 6: `calendar` provider

**Files:**
- Create: `packages/api/src/providers/calendar/index.ts`
- Create: `packages/api/src/providers/calendar/descriptors.ts`
- Create: `packages/api/src/providers/calendar/buildTools.ts`
- Modify: `packages/api/src/index.ts` (export calendarProvider)

- [ ] **Step 1: Write descriptors**

`packages/api/src/providers/calendar/descriptors.ts`:

```ts
import type { ToolDescriptor } from '../provider.js';

export const CALENDAR_DESCRIPTORS: ToolDescriptor[] = [
  // Copy from existing packages/api/src/tools/calendarToolsDescription.ts contents.
  // For each of the 7 calendar tool names, build a ToolDescriptor with the existing
  // description string + the corresponding input schema as JSON Schema.
  // Concrete entries:
  {
    toolName: 'list_calendars',
    description: 'List all calendars accessible by the connected Google account.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    toolName: 'check_availability',
    description: 'Find available time slots within a date range, returning up to 3.',
    inputSchema: {
      type: 'object',
      required: ['startIso', 'endIso', 'durationMinutes'],
      properties: {
        startIso: { type: 'string' },
        endIso: { type: 'string' },
        durationMinutes: { type: 'number' },
      },
    },
  },
  // ... repeat for list_events, get_event, book_appointment, update_event, cancel_appointment
  // Use the existing zodSchema(...) input schemas in calendarToolSchemas.ts as the JSON
  // Schema source — convert each via `zodToJsonSchema` (add the dep if not present) or
  // hand-author the JSON Schema for each (7 tools, ~5 minutes each).
];
```

- [ ] **Step 2: Write buildTools — adapter over the existing service factory**

`packages/api/src/providers/calendar/buildTools.ts`:

```ts
import type { CalendarService } from '../../services/calendarService.js';
import { createCalendarTools } from '../../tools/calendarTools.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

interface CalendarServices {
  service: CalendarService;
  calendarId: string;
}

export async function buildCalendarTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const services = args.ctx.services<CalendarServices>('calendar');
  if (services === undefined) return {};
  const allTools = createCalendarTools({
    services: services.service,
    orgId: args.ctx.orgId,
    calendarId: services.calendarId,
  });
  // Filter to requested toolNames + adapt AI SDK Tool back to OpenFlowTool
  // (transition adapter — to be removed once createCalendarTools returns OpenFlowTool natively).
  const filtered: Record<string, OpenFlowTool> = {};
  for (const name of args.toolNames) {
    const aiTool = allTools[name];
    if (aiTool === undefined) continue;
    filtered[name] = {
      description: aiTool.description ?? '',
      inputSchema: aiTool.inputSchema as never,   // already a Zod schema in source
      execute: async (input: unknown) => await (aiTool.execute as (i: unknown) => unknown)(input),
    };
  }
  return filtered;
}
```

- [ ] **Step 3: Write the provider entry**

`packages/api/src/providers/calendar/index.ts`:

```ts
import type { Provider } from '../provider.js';
import { buildCalendarTools } from './buildTools.js';
import { CALENDAR_DESCRIPTORS } from './descriptors.js';

export const calendarProvider: Provider = {
  type: 'builtin',
  id: 'calendar',
  displayName: 'OpenFlow/Calendar',
  description: 'Read availability and manage events on a connected Google Calendar.',
  describeTools: async () => CALENDAR_DESCRIPTORS,
  buildTools: buildCalendarTools,
};
```

- [ ] **Step 4: Add tests**

`packages/api/src/providers/calendar/__tests__/calendar.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import { calendarProvider } from '../index.js';

describe('calendarProvider', () => {
  it('describes 7 tools', async () => {
    const tools = await calendarProvider.describeTools({} as never);
    expect(tools.length).toBeGreaterThanOrEqual(7);
  });

  it('returns empty when no calendar service in ctx', async () => {
    const ctx = { services: () => undefined } as never;
    const built = await calendarProvider.buildTools({ toolNames: ['check_availability'], ctx });
    expect(built).toEqual({});
  });
});
```

- [ ] **Step 5: Run tests + lint**

Run: `npm run check -w @daviddh/llm-graph-runner`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/providers/calendar/
git commit -m "feat(api): add calendar built-in Provider"
```

---

### Task 7: `forms` provider

**Files:**
- Create: `packages/api/src/providers/forms/{index,descriptors,buildTools}.ts`

- [ ] **Step 1: Write descriptors**

`packages/api/src/providers/forms/descriptors.ts` — copy the form tool descriptions from `packages/api/src/tools/formsTools.ts` into ToolDescriptor[] entries for `set_form_fields` and `get_form_field`.

- [ ] **Step 2: Write buildTools**

`packages/api/src/providers/forms/buildTools.ts`:

```ts
import { createFormsTools } from '../../tools/formsTools.js';
import type { FormsService } from '../../services/formsService.js';
import type { FormDefinition } from '../../types/forms.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

interface FormsServices {
  service: FormsService;
  forms: FormDefinition[];
}

export async function buildFormsTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const formsServices = args.ctx.services<FormsServices>('forms');
  if (formsServices === undefined || args.ctx.conversationId === undefined) return {};
  const allTools = createFormsTools({
    forms: formsServices.forms,
    services: formsServices.service,
    conversationId: args.ctx.conversationId,
  });
  return filterAndAdapt(allTools, args.toolNames);
}

function filterAndAdapt(all: Record<string, unknown>, toolNames: string[]): Record<string, OpenFlowTool> {
  // Same shape as calendar — see buildCalendarTools. Extract to a shared helper if desired.
  // ... (identical adapter pattern)
  return {};   // implement same as calendar
}
```

(Use the same filter+adapt pattern as `buildCalendarTools` in Task 6.)

- [ ] **Step 3: Write provider entry**

`packages/api/src/providers/forms/index.ts`:

```ts
import type { Provider } from '../provider.js';
import { buildFormsTools } from './buildTools.js';
import { FORMS_DESCRIPTORS } from './descriptors.js';

export const formsProvider: Provider = {
  type: 'builtin',
  id: 'forms',
  displayName: 'OpenFlow/Forms',
  description: 'Read and write structured form fields scoped to the current conversation.',
  describeTools: async () => FORMS_DESCRIPTORS,
  buildTools: buildFormsTools,
};
```

- [ ] **Step 4: Test + lint + commit**

```bash
npm run check -w @daviddh/llm-graph-runner
git add packages/api/src/providers/forms/
git commit -m "feat(api): add forms built-in Provider"
```

---

### Task 8: `lead_scoring` provider

**Files:**
- Create: `packages/api/src/providers/lead_scoring/{index,descriptors,buildTools}.ts`

- [ ] **Step 1: Write all three files**

Same shape as `forms`: import `createLeadScoringTools`, declare descriptors for `set_lead_score` + `get_lead_score`, adapt to `OpenFlowTool`. The provider's `buildTools` reads `ctx.services<LeadScoringServices>('lead_scoring')` and `ctx.contextData`.

- [ ] **Step 2: Test + lint + commit**

```bash
npm run check -w @daviddh/llm-graph-runner
git add packages/api/src/providers/lead_scoring/
git commit -m "feat(api): add lead_scoring built-in Provider"
```

---

### Task 9: `composition` provider (dispatch tools + finish-on-child)

**Files:**
- Create: `packages/api/src/providers/composition/{index,descriptors,buildTools}.ts`

- [ ] **Step 1: Write descriptors for `create_agent`, `invoke_agent`, `invoke_workflow` (NOT `finish` — it's never selectable)**

`packages/api/src/providers/composition/descriptors.ts`:

```ts
import type { ToolDescriptor } from '../provider.js';

export const COMPOSITION_DESCRIPTORS: ToolDescriptor[] = [
  // Same JSON Schemas as the existing tools/dispatchTools.ts produces, but expressed
  // declaratively. Three entries: create_agent, invoke_agent, invoke_workflow.
];
```

- [ ] **Step 2: Write buildTools — selectable dispatches + auto-injected `finish` for child agents**

`packages/api/src/providers/composition/buildTools.ts`:

```ts
import { createAgentTool, invokeAgentTool, invokeWorkflowTool } from '../../tools/dispatchTools.js';
import { createFinishTool } from '../../tools/finishTool.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

const FINISH_TOOL_NAME = 'finish';

export async function buildCompositionTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const out: Record<string, OpenFlowTool> = {};
  // Selectable dispatch tools — included only if the user's selected_tools list them.
  const all: Record<string, unknown> = {
    create_agent: createAgentTool(),
    invoke_agent: invokeAgentTool(),
    invoke_workflow: invokeWorkflowTool(),
  };
  for (const name of args.toolNames) {
    if (name === FINISH_TOOL_NAME) continue;   // never user-selectable
    const tool = all[name];
    if (tool !== undefined) out[name] = adaptToolToOpenFlow(tool);
  }
  // finish is auto-injected only for child agents, regardless of selection
  if (args.ctx.isChildAgent) out[FINISH_TOOL_NAME] = adaptToolToOpenFlow(createFinishTool());
  return out;
}

function adaptToolToOpenFlow(tool: unknown): OpenFlowTool {
  // Same adapter pattern as the other built-ins
  const t = tool as { description?: string; inputSchema: unknown; execute: (i: unknown) => unknown };
  return {
    description: t.description ?? '',
    inputSchema: t.inputSchema as never,
    execute: async (input: unknown) => await t.execute(input),
  };
}
```

- [ ] **Step 3: Provider entry**

`packages/api/src/providers/composition/index.ts`:

```ts
import type { Provider } from '../provider.js';
import { buildCompositionTools } from './buildTools.js';
import { COMPOSITION_DESCRIPTORS } from './descriptors.js';

export const compositionProvider: Provider = {
  type: 'builtin',
  id: 'composition',
  displayName: 'OpenFlow/Composition',
  description: 'Dispatch sub-agents, invoke other agents/workflows.',
  describeTools: async () => COMPOSITION_DESCRIPTORS,
  buildTools: buildCompositionTools,
};
```

- [ ] **Step 4: Test the finish-only-for-children rule**

`packages/api/src/providers/composition/__tests__/composition.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import { compositionProvider } from '../index.js';

const ctxBase = {
  orgId: 'o',
  agentId: 'a',
  isChildAgent: false,
  logger: { warn: () => undefined },
  oauthTokens: new Map(),
  mcpTransports: new Map(),
  services: () => undefined,
} as const;

describe('compositionProvider', () => {
  it('does not include finish for non-child agents', async () => {
    const built = await compositionProvider.buildTools({ toolNames: ['invoke_agent'], ctx: ctxBase as never });
    expect(built.invoke_agent).toBeDefined();
    expect(built.finish).toBeUndefined();
  });

  it('always includes finish for child agents regardless of selection', async () => {
    const built = await compositionProvider.buildTools({
      toolNames: [],
      ctx: { ...ctxBase, isChildAgent: true } as never,
    });
    expect(built.finish).toBeDefined();
  });

  it('ignores finish in user-selected tools (never user-gated)', async () => {
    const built = await compositionProvider.buildTools({
      toolNames: ['finish'],
      ctx: ctxBase as never,
    });
    expect(built.finish).toBeUndefined();
  });
});
```

- [ ] **Step 5: Test + lint + commit**

```bash
npm run check -w @daviddh/llm-graph-runner
git add packages/api/src/providers/composition/
git commit -m "feat(api): add composition built-in Provider with finish auto-inject for children"
```

---

### Task 10: `packages/api/src/providers/index.ts` — built-ins map

**Files:**
- Create: `packages/api/src/providers/index.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Write the built-ins map**

`packages/api/src/providers/index.ts`:

```ts
import type { Provider } from './provider.js';
import { calendarProvider } from './calendar/index.js';
import { compositionProvider } from './composition/index.js';
import { formsProvider } from './forms/index.js';
import { leadScoringProvider } from './lead_scoring/index.js';

export const builtInProviders: ReadonlyMap<string, Provider> = new Map([
  ['calendar', calendarProvider],
  ['forms', formsProvider],
  ['lead_scoring', leadScoringProvider],
  ['composition', compositionProvider],
]);

export type { Provider, ProviderCtx, ToolDescriptor, ProviderType, OAuthTokenBundle } from './provider.js';
export type { OpenFlowTool } from './types.js';
export { toAiSdkTool, toAiSdkToolDict } from './types.js';
export { composeRegistry, type Registry, type RegistryBuildResult, type ComposeRegistryArgs } from './registry.js';
```

- [ ] **Step 2: Add public re-exports**

In `packages/api/src/index.ts`, near the existing exports, add:

```ts
export {
  builtInProviders,
  composeRegistry,
  toAiSdkTool,
  toAiSdkToolDict,
} from './providers/index.js';
export type {
  Provider,
  ProviderCtx,
  ProviderType,
  ToolDescriptor,
  Registry,
  RegistryBuildResult,
  ComposeRegistryArgs,
  OpenFlowTool,
  OAuthTokenBundle,
} from './providers/index.js';
```

- [ ] **Step 3: Build api package**

Run: `npm run build -w packages/api`
Expected: clean — new exports compile.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/providers/index.ts packages/api/src/index.ts
git commit -m "feat(api): export builtInProviders and registry surface"
```

---

## Phase 4: MCP provider

### Task 11: `buildMcpProvider` (lifts existing MCP transport into Provider shape)

**Files:**
- Create: `packages/api/src/providers/mcp/buildMcpProvider.ts`
- Create: `packages/api/src/providers/mcp/__tests__/buildMcpProvider.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/api/src/providers/mcp/__tests__/buildMcpProvider.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import { buildMcpProvider } from '../buildMcpProvider.js';

describe('buildMcpProvider', () => {
  it('produces a Provider with the server's UUID as id and given name', () => {
    const server = {
      id: '9d3a-2b71-...',
      name: 'HubSpot',
      description: 'CRM',
      transport: { type: 'http', url: 'https://example.com/mcp' },
    };
    const provider = buildMcpProvider(server as never);
    expect(provider.type).toBe('mcp');
    expect(provider.id).toBe('9d3a-2b71-...');
    expect(provider.displayName).toBe('HubSpot');
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=buildMcpProvider`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder**

`packages/api/src/providers/mcp/buildMcpProvider.ts`:

```ts
import type { McpServerConfig } from '@daviddh/graph-types';

import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

export function buildMcpProvider(server: McpServerConfig): Provider {
  return {
    type: 'mcp',
    id: server.id,
    displayName: server.name,
    description: server.description,
    describeTools: async (ctx) => await describeMcpTools(server, ctx),
    buildTools: async ({ toolNames, ctx }) => await buildMcpTools({ server, toolNames, ctx }),
  };
}

async function describeMcpTools(server: McpServerConfig, ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  // 1. Initialize MCP session (or use cached). Pre-E: per-execution; post-E: Redis-cached.
  // 2. Call tools/list. Map response to ToolDescriptor[].
  // Implementation note: reuse the existing `createMcpSession` / `validateAndConnectMcpServers`
  // logic from packages/backend/src/mcp/lifecycle.ts. For now, in-memory cache of the session
  // for the lifetime of this provider instance (per-execution).
  void server;
  void ctx;
  return [];   // placeholder to be replaced with the actual MCP transport call
}

async function buildMcpTools(args: {
  server: McpServerConfig;
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  // 1. Ensure session
  // 2. For each toolName in args.toolNames, build an OpenFlowTool whose execute calls tools/call.
  // 3. inputSchema comes from the cached tools/list descriptor.
  void args;
  return {};
}
```

> Note: this task implements the Provider *shape*. The body of `describeMcpTools` and `buildMcpTools` reuses the existing MCP transport (`createMcpSession`, etc.). The full implementation is straightforward but spans this and Task 12 (which is now broken into 12a–12e). For Task 11 we get the public surface compiling and tested; Task 12 fills in the bodies *and* moves the transport.

- [ ] **Step 4: Run test, confirm it passes**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=buildMcpProvider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/mcp/buildMcpProvider.ts packages/api/src/providers/mcp/__tests__/buildMcpProvider.test.ts
git commit -m "feat(api): add buildMcpProvider scaffold"
```

---

### Task 12: Implement MCP `describeTools` and `buildTools` bodies

> **Scope warning** *(amended after engineer review)*: this is a multi-day relocation, not a single task. The existing MCP transport in `packages/backend/src/mcp/` is consumed by other backend code (simulation, `/mcp/discover`, `/mcp/tools/call`) and has its own auth, retry, and error semantics. Lifting it cleanly is a 3–5 day subproject. Treat this as Phase 4a–4d below.

**Files (across sub-tasks):**
- Create: `packages/api/src/providers/mcp/mcpTransport.ts` (the lifted transport core)
- Modify: `packages/api/src/providers/mcp/buildMcpProvider.ts` (consumes the lifted transport)
- Modify: `packages/backend/src/mcp/lifecycle.ts`, `packages/backend/src/mcp/discover.ts`, `packages/backend/src/routes/toolCall.ts` — switch to importing from the api-package transport
- Delete: legacy code paths in `packages/backend/src/mcp/` once all callers use the new location

#### Task 12a: Inventory existing MCP transport callers

- [ ] **Step 1: Map all MCP transport call sites in `packages/backend`**

Run: `grep -rn "tools/list\|tools/call\|initialize\|McpClient\|createMcpSession" packages/backend/src/ --include='*.ts' | grep -v node_modules`

- [ ] **Step 2: Document the transport's public surface**

For each call site found, record:
- What does it pass in (auth, transport config)?
- What does it return?
- What error semantics does the caller expect (throw vs result type)?

Capture as a markdown comment block at the top of the new `mcpTransport.ts` file.

- [ ] **Step 3: Commit the inventory**

```bash
git add packages/api/src/providers/mcp/mcpTransport.ts   # the comment-block scaffold
git commit -m "docs(api): inventory existing MCP transport surface"
```

#### Task 12b: Lift transport core into api package

- [ ] **Step 1: Copy (don't move yet) the MCP transport functions**

Copy `createMcpSession`, the `tools/list` and `tools/call` HTTP/SSE wrappers, and any auth helpers from `packages/backend/src/mcp/lifecycle.ts` into `packages/api/src/providers/mcp/mcpTransport.ts`. **Don't delete the originals yet** — backend callers still need them.

- [ ] **Step 2: Update imports in the new file**

The lifted transport may use Node-specific APIs (`createMcpSession` likely uses `@ai-sdk/mcp` which works in Deno via npm specifier; verify). Replace any `node:`-only imports with cross-runtime equivalents.

- [ ] **Step 3: Add unit tests for the lifted transport**

Use a fake fetch to drive the HTTP path. Cover: successful initialize, successful `tools/list`, successful `tools/call`, 401 retry semantics, session-expired re-init.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/providers/mcp/mcpTransport.ts packages/api/src/providers/mcp/__tests__/mcpTransport.test.ts
git commit -m "feat(api): lift MCP transport core into api package (parallel path)"
```

#### Task 12c: Switch backend callers to api-package transport

- [ ] **Step 1: For each backend caller identified in Task 12a, update imports**

Replace `from '../../mcp/lifecycle.js'` (or similar) with `from '@daviddh/llm-graph-runner'` (the api package's exported transport). Run typecheck after each file's update.

- [ ] **Step 2: Run all backend tests**

Run: `npm run test -w @daviddh/graph-runner-backend`
Expected: pass.

- [ ] **Step 3: Commit per file or in one batch**

```bash
git add packages/backend/src/mcp/discover.ts packages/backend/src/routes/toolCall.ts # etc.
git commit -m "refactor(backend): consume MCP transport from api package"
```

#### Task 12d: Implement `describeMcpTools` and `buildMcpTools` against the lifted transport

- [ ] **Step 1: Wire `describeMcpTools`**

In `buildMcpProvider.ts`:

```ts
import { initMcpSession, mcpToolsList } from './mcpTransport.js';

async function describeMcpTools(server: McpServerConfig, ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  const transport = ctx.mcpTransports.get(server.id);
  if (transport === undefined) throw new Error(`MCP transport for ${server.id} missing in ctx`);
  const oauth = ctx.oauthTokens.get(server.id);
  const client = await initMcpSession(transport, oauth);
  const list = await client.toolsList();
  return list.tools.map((t) => ({
    toolName: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema as Record<string, unknown>,
  }));
}
```

- [ ] **Step 2: Wire `buildMcpTools`**

```ts
import { mcpToolsCall } from './mcpTransport.js';

async function buildMcpTools(args: { server: McpServerConfig; toolNames: string[]; ctx: ProviderCtx }): Promise<Record<string, OpenFlowTool>> {
  const transport = args.ctx.mcpTransports.get(args.server.id);
  if (transport === undefined) throw new Error(`MCP transport for ${args.server.id} missing in ctx`);
  const oauth = args.ctx.oauthTokens.get(args.server.id);
  const client = await initMcpSession(transport, oauth);
  const list = await client.toolsList();
  const wanted = new Set(args.toolNames);
  const out: Record<string, OpenFlowTool> = {};
  for (const t of list.tools) {
    if (!wanted.has(t.name)) continue;
    out[t.name] = {
      description: t.description ?? '',
      inputSchema: t.inputSchema as never,
      execute: async (input: unknown) => await client.toolsCall(t.name, input),
    };
  }
  return out;
}
```

- [ ] **Step 3: Integration test against fake transport**

`packages/api/src/providers/mcp/__tests__/buildMcpProvider.integration.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';

import { buildMcpProvider } from '../buildMcpProvider.js';

describe('mcp provider end-to-end (fake transport)', () => {
  it('describeTools maps tools/list output', async () => {
    const fakeClient = {
      toolsList: jest.fn().mockResolvedValue({
        tools: [
          { name: 'create_deal', description: 'create a deal', inputSchema: { type: 'object' } },
        ],
      }),
      toolsCall: jest.fn(),
    };
    // Inject the fake via a transport mock — see Task 12b's mcpTransport.ts surface.
    // Specifically: ctx.mcpTransports must produce a transport that initMcpSession can consume.
    // Use a TestTransport class exported from mcpTransport.ts for this purpose.
    const ctx = {
      orgId: 'o', agentId: 'a', isChildAgent: false, logger: console as never,
      conversationId: undefined, contextData: undefined,
      oauthTokens: new Map(), mcpTransports: new Map([['mcp-1', { _testFake: fakeClient } as never]]),
      services: () => undefined,
    } as never;
    const provider = buildMcpProvider({ id: 'mcp-1', name: 'fake', url: 'https://fake.example/mcp', transport: {} } as never);
    const descriptors = await provider.describeTools(ctx);
    expect(descriptors).toEqual([
      { toolName: 'create_deal', description: 'create a deal', inputSchema: { type: 'object' } },
    ]);
  });
});
```

> The `_testFake` escape hatch is a transport-level test helper. Define it explicitly in `mcpTransport.ts` so production code paths can ignore it. Avoids needing real HTTP fakes.

- [ ] **Step 4: Run all tests**

Run: `npm run test -ws`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/mcp/buildMcpProvider.ts packages/api/src/providers/mcp/__tests__/buildMcpProvider.integration.test.ts
git commit -m "feat(api): MCP provider describeTools + buildTools against lifted transport"
```

#### Task 12e: Delete legacy MCP code in packages/backend

- [ ] **Step 1: Verify no remaining backend imports**

Run: `grep -rn "from.*backend/src/mcp/" packages/ --include='*.ts' | grep -v node_modules`
Expected: empty result.

- [ ] **Step 2: Delete the original transport files**

```bash
git rm packages/backend/src/mcp/lifecycle.ts # etc., per the inventory in 12a
git commit -m "refactor(backend): remove legacy MCP transport (consumed by api package)"
```

> If the inventory in 12a surfaced unexpected callers (e.g. tests, docs, scripts outside the obvious `mcp/` directory), this delete will fail. Resolve and re-run.

- [ ] **Step 3: Implement `describeMcpTools`**

In `buildMcpProvider.ts`, fill in the body:

```ts
async function describeMcpTools(server: McpServerConfig, ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  const transport = ctx.mcpTransports.get(server.id);
  if (transport === undefined) throw new Error(`MCP transport for ${server.id} missing in ctx`);
  const oauth = ctx.oauthTokens.get(server.id);
  const client = await initMcpSession(transport, oauth);
  const list = await client.toolsList();
  return list.tools.map((t) => ({
    toolName: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema as Record<string, unknown>,
  }));
}
```

- [ ] **Step 4: Implement `buildMcpTools`**

```ts
async function buildMcpTools(args: { server: McpServerConfig; toolNames: string[]; ctx: ProviderCtx }): Promise<Record<string, OpenFlowTool>> {
  const transport = args.ctx.mcpTransports.get(args.server.id);
  if (transport === undefined) throw new Error(`MCP transport for ${args.server.id} missing in ctx`);
  const oauth = args.ctx.oauthTokens.get(args.server.id);
  const client = await initMcpSession(transport, oauth);
  const list = await client.toolsList();
  const wanted = new Set(args.toolNames);
  const out: Record<string, OpenFlowTool> = {};
  for (const t of list.tools) {
    if (!wanted.has(t.name)) continue;
    out[t.name] = {
      description: t.description ?? '',
      inputSchema: t.inputSchema as never,
      execute: async (input: unknown) => await client.toolsCall(t.name, input),
    };
  }
  return out;
}
```

- [ ] **Step 5: Cover with an integration test using a fake MCP transport**

`packages/api/src/providers/mcp/__tests__/buildMcpProvider.integration.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import { buildMcpProvider } from '../buildMcpProvider.js';

describe('mcp provider end-to-end (fake transport)', () => {
  it('describeTools maps tools/list output', async () => {
    // Fake transport injected via ctx.mcpTransports
    // ... construct ctx with a fake transport that returns a known tools/list response
    // ... call provider.describeTools(ctx)
    // ... assert returned descriptors match
    expect(true).toBe(true);   // placeholder; fill in with concrete fake transport
  });
});
```

(Placeholder is intentional pending the fake-transport harness; flesh out as part of this task once `mcpTransport.ts` is settled.)

- [ ] **Step 6: Test + lint + commit**

```bash
npm run check -w @daviddh/llm-graph-runner
git add packages/api/src/providers/mcp/
git commit -m "feat(api): implement MCP provider describeTools + buildTools"
```

---

## Phase 5: Edge function payload generalization

### Task 13: Extend `ExecuteAgentParams` (backend) with new fields

**Files:**
- Modify: `packages/backend/src/routes/execute/edgeFunctionClient.ts`

- [ ] **Step 1: Read current type**

Run: `grep -n 'ExecuteAgentParams\|googleCalendar' packages/backend/src/routes/execute/edgeFunctionClient.ts`

- [ ] **Step 2: Re-export `OAuthTokenBundle` from the api package; do NOT redefine**

*Amended after engineer review (#X1, #17)*: the previous plan defined `OAuthTokenBundle` in three places (provider.ts, edgeFunctionClient.ts, edge function index.ts). They will drift on the next field add. Single source of truth: the api package.

In `packages/backend/src/routes/execute/edgeFunctionClient.ts`:

```ts
import type { OAuthTokenBundle, SelectedTool } from '@daviddh/llm-graph-runner';

export interface ExecuteAgentParams {
  // existing fields...
  schemaVersion: 2;
  selectedTools?: SelectedTool[];                                     // for agent mode only
  oauth?: { byProvider: Record<string, OAuthTokenBundle> };
  // googleCalendar?: removed — calendar's token now lives at oauth.byProvider['calendar'].
}
```

The api-package `OAuthTokenBundle` (from Task 2) is the authoritative shape. Edge function (Task 15) also imports from `@daviddh/llm-graph-runner` via npm specifier — same source.

- [ ] **Step 3: Verify no remaining references to `googleCalendar`**

Run: `grep -rn 'googleCalendar' packages/backend/src/ packages/web/app/ --include='*.ts' --include='*.tsx' | grep -v node_modules`
Expected: only references inside this file (or none, after Task 14).

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck -w @daviddh/graph-runner-backend`
Expected: failures wherever the old `googleCalendar` field was set; fix as part of Task 14.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/edgeFunctionClient.ts
git commit -m "refactor(backend): generalize ExecuteAgentParams (schemaVersion: 2 + oauth.byProvider)"
```

---

### Task 14: Resolve all OAuth tokens for `selected_tools` providers in `executeCoreHelpers`

**Files:**
- Modify: `packages/backend/src/routes/execute/executeCoreHelpers.ts`
- Modify: `packages/backend/src/routes/execute/executeCore.ts`

- [ ] **Step 1: Replace `resolveGoogleCalendarPayload` with `resolveOAuthBundle`**

```ts
import type { OAuthTokenBundle, SelectedTool } from '@daviddh/llm-graph-runner';
import { BUILTIN_PROVIDER_IDS } from '@daviddh/llm-graph-runner';

export async function resolveOAuthBundle(args: {
  supabase: SupabaseClient;
  orgId: string;
  selectedTools: SelectedTool[];
  mcpServers: McpServerConfig[];
}): Promise<Record<string, OAuthTokenBundle>> {
  const out: Record<string, OAuthTokenBundle> = {};
  // Built-in providers that need OAuth (today: just calendar)
  const calendarUsed = args.selectedTools.some(
    (s) => s.providerType === 'builtin' && s.providerId === 'calendar'
  );
  if (calendarUsed) {
    const bundle = await resolveCalendarToken(args.supabase, args.orgId);
    if (bundle !== null) out.calendar = bundle;
  }
  // Per-server MCP OAuth — only resolve if at least one selected tool references the server.
  const usedMcpIds = new Set(
    args.selectedTools
      .filter((s) => s.providerType === 'mcp')
      .map((s) => s.providerId)
  );
  for (const server of args.mcpServers) {
    if (!usedMcpIds.has(server.id)) continue;
    const bundle = await resolveMcpToken(args.supabase, args.orgId, server.id);
    if (bundle !== null) out[server.id] = bundle;
  }
  return out;
}

async function resolveCalendarToken(supabase: SupabaseClient, orgId: string): Promise<OAuthTokenBundle | null> {
  // Wrap the existing resolveGoogleAccessTokenOptional + add expiresAt/scopes/tokenIssuedAt
  // ... implementation (read oauth_connections row, decrypt, refresh if needed, return bundle)
  void supabase;
  void orgId;
  return null;   // fill in concretely with the existing token resolver
}

async function resolveMcpToken(supabase: SupabaseClient, orgId: string, mcpServerId: string): Promise<OAuthTokenBundle | null> {
  // For OAuth-protected MCPs only. Not all MCPs require OAuth.
  void supabase;
  void orgId;
  void mcpServerId;
  return null;
}
```

- [ ] **Step 2: Update `runAgent` in `executeCore.ts` to call `resolveOAuthBundle`**

Replace the existing `resolveGoogleCalendarPayload` call with:

```ts
const oauthByProvider = await resolveOAuthBundle({
  supabase: params.supabase,
  orgId: params.input.orgId,
  selectedTools: params.fetched.agentRecord.selected_tools ?? [],
  mcpServers: params.fetched.graph.mcpServers ?? [],
});
```

Update the edge params build:

```ts
const buildOptions: BuildCoreParamsOptions = {
  vfsPayload,
  overrideAgentConfig: params.override ?? params.input.overrideAgentConfig,
  conversationId: params.conversationId ?? undefined,
  oauthByProvider,
  selectedTools: params.fetched.agentRecord.selected_tools ?? [],
};
```

- [ ] **Step 3: Update `buildCoreExecuteParams` signature + body to include the new fields**

In `executeCoreHelpers.ts`, extend `BuildCoreParamsOptions`:

```ts
export interface BuildCoreParamsOptions {
  vfsPayload: VfsEdgeFunctionPayload | undefined;
  overrideAgentConfig?: OverrideAgentConfig;
  conversationId?: string;
  oauthByProvider?: Record<string, OAuthTokenBundle>;
  selectedTools?: SelectedTool[];
}
```

And in the params construction, add:

```ts
const base: ExecuteAgentParams = {
  // existing fields...
  schemaVersion: 2,
  selectedTools: options.selectedTools,
  oauth: options.oauthByProvider !== undefined ? { byProvider: options.oauthByProvider } : undefined,
};
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `npm run check -w @daviddh/graph-runner-backend`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/
git commit -m "refactor(backend): resolveOAuthBundle for all selected providers"
```

---

### Task 15: Edge function — accept `schemaVersion: 2`, build registry, route to handlers

**Files:**
- Modify: `supabase/functions/execute-agent/index.ts`

- [ ] **Step 1: Import `OAuthTokenBundle` from the api package (don't redefine)**

```ts
// edge function — packages can be imported via npm specifier
import type { OAuthTokenBundle, SelectedTool } from 'npm:@daviddh/llm-graph-runner';

interface ExecutePayload {
  schemaVersion: 1 | 2;   // *Amended after engineer review (#X6, #14)*: accept both during deploy transition
  // ... existing fields
  selectedTools?: SelectedTool[];
  oauth?: { byProvider: Record<string, OAuthTokenBundle> };
  // googleCalendar still accepted when schemaVersion === 1 (deprecated; remove after backend deploy)
}
```

Accept both schema versions during the deploy transition:

```ts
// *Amended after engineer review (#X6)*: previously rejected schemaVersion !== 2 outright.
// That breaks the deploy window when backend deploys ahead of edge function (or vice versa).
// Accept both during transition; deprecate v1 in a follow-up edge-function deploy after
// backend has fully rolled out v2.
if (payload.schemaVersion !== 1 && payload.schemaVersion !== 2) {
  return new Response(JSON.stringify({ error: `unsupported schemaVersion: ${payload.schemaVersion}` }), { status: 400 });
}

// When schemaVersion === 1: legacy behavior, ignores selectedTools + oauth.byProvider,
// uses googleCalendar field instead. Document this clearly so the rollout owner knows
// when to delete the v1 branch.
const isLegacyPayload = payload.schemaVersion === 1;
```

The follow-up edge-function deploy (after backend v2 is fully rolled out) drops the `=== 1` branch. Track as a release-notes item; do not let it linger.

- [ ] **Step 2: Build `ProviderCtx` from the payload**

```ts
import { builtInProviders, composeRegistry } from '@daviddh/llm-graph-runner';

function buildProviderCtx(payload: ExecutePayload): ProviderCtx {
  const oauthEntries: Array<[string, OAuthTokenBundle]> = Object.entries(payload.oauth?.byProvider ?? {});
  const transportEntries: Array<[string, McpTransportConfig]> = (payload.graph.mcpServers ?? []).map(
    (s) => [s.id, s.transport],
  );
  return {
    orgId: payload.tenantID,
    agentId: payload.sessionID,
    isChildAgent: payload.isChildAgent ?? false,
    logger: runnerLogger,
    conversationId: payload.conversationId,
    contextData: payload.data,
    oauthTokens: Object.freeze(new Map(oauthEntries)),
    mcpTransports: Object.freeze(new Map(transportEntries)),
    services: serviceFactoryFromPayload(payload),
  };
}

function serviceFactoryFromPayload(payload: ExecutePayload) {
  return <T,>(providerId: string): T | undefined => {
    if (providerId === 'forms') return /* build FormsServices from payload */ undefined as T | undefined;
    if (providerId === 'lead_scoring') return /* build LeadScoringServices */ undefined;
    if (providerId === 'calendar') return /* build CalendarServices using oauthTokens */ undefined;
    if (providerId === 'composition') return /* build composition services (apiKey, modelId) */ undefined;
    return undefined;
  };
}
```

> Each branch fleshes out the corresponding service. For forms/lead_scoring, lift the existing `buildLeadScoringServices` / `buildFormsBundle` adapters from inside the edge function. For calendar, instantiate the existing `createGoogleCalendarServiceFromToken` using `payload.oauth.byProvider['calendar']`.

- [ ] **Step 3: Compose the registry**

```ts
const registry = composeRegistry({
  builtIns: builtInProviders,
  orgMcpServers: payload.graph.mcpServers ?? [],
  logger: runnerLogger,
});
```

- [ ] **Step 4: Replace the existing `injectSystemTools(...)` calls with registry-driven resolution**

```ts
// *Amended after engineer review (#B5, #10)*: include toAiSdkToolDict + composeRegistry
// + builtInProviders in the imports.
import {
  buildAgentToolsAtStart,
  builtInProviders,
  composeRegistry,
  toAiSdkToolDict,
} from 'npm:@daviddh/llm-graph-runner';
```

For agent mode (`runAgentExecution`):

```ts
const ctx = buildProviderCtx(payload);
const built = await buildAgentToolsAtStart(registry, ctx, payload.selectedTools ?? []);
const tools = toAiSdkToolDict(built.tools);
```

For workflow mode (`runWorkflowExecution`): the executor (`executeWithCallbacks`) needs to call into the registry per node — that's wired in Task 16/17. For now, pass the registry through `Context` and let downstream code handle it.

- [ ] **Step 5: Test the edge function locally** (optional manual smoke; defer the real e2e to Task 22)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/execute-agent/index.ts
git commit -m "refactor(edge): consume schemaVersion 2 + composeRegistry"
```

---

## Phase 6: Workflow path (lazy per-node)

### Task 16: `resolveToolsForCurrentNode` helper

**Files:**
- Create: `packages/api/src/core/resolveToolsForCurrentNode.ts`
- Create: `packages/api/src/core/__tests__/resolveToolsForCurrentNode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, jest } from '@jest/globals';

import { resolveToolsForCurrentNode } from '../resolveToolsForCurrentNode.js';

describe('resolveToolsForCurrentNode', () => {
  it('returns empty when no tool_call edge', async () => {
    const result = await resolveToolsForCurrentNode({
      registry: { providers: [] } as never,
      ctx: {} as never,
      currentNodeOutgoingEdges: [],
    });
    expect(result.tools).toEqual({});
    expect(result.toolName).toBeNull();
  });

  it('throws when tool_call references unknown provider', async () => {
    const registry = { providers: [] } as never;
    const edges = [{
      preconditions: [{
        type: 'tool_call' as const,
        tool: { providerType: 'builtin' as const, providerId: 'nonexistent', toolName: 'x' },
      }],
    }] as never;
    await expect(resolveToolsForCurrentNode({ registry, ctx: {} as never, currentNodeOutgoingEdges: edges })).rejects.toThrow();
  });

  it('builds and returns the single tool when found', async () => {
    const fakeProvider = {
      type: 'builtin', id: 'calendar', displayName: 'cal',
      describeTools: async () => [],
      buildTools: jest.fn().mockResolvedValue({ check_availability: { description: '', inputSchema: {}, execute: async () => null } }),
    };
    const registry = { providers: [fakeProvider] } as never;
    const edges = [{
      preconditions: [{
        type: 'tool_call' as const,
        tool: { providerType: 'builtin' as const, providerId: 'calendar', toolName: 'check_availability' },
      }],
    }] as never;
    const result = await resolveToolsForCurrentNode({ registry, ctx: {} as never, currentNodeOutgoingEdges: edges });
    expect(result.toolName).toBe('check_availability');
    expect(result.tools.check_availability).toBeDefined();
  });
});
```

- [ ] **Step 2: Write the helper**

`packages/api/src/core/resolveToolsForCurrentNode.ts`:

```ts
import type { Edge } from '@daviddh/graph-types';

import type { ProviderCtx } from '../providers/provider.js';
import type { Registry } from '../providers/registry.js';
import type { OpenFlowTool } from '../providers/types.js';

export interface ResolveToolsArgs {
  registry: Registry;
  ctx: ProviderCtx;
  currentNodeOutgoingEdges: Edge[];
}

export interface ResolveToolsResult {
  tools: Record<string, OpenFlowTool>;
  toolName: string | null;
}

export async function resolveToolsForCurrentNode(args: ResolveToolsArgs): Promise<ResolveToolsResult> {
  const toolCallEdge = args.currentNodeOutgoingEdges.find(
    (e) => e.preconditions?.[0]?.type === 'tool_call'
  );
  if (toolCallEdge === undefined) return { tools: {}, toolName: null };

  const precondition = toolCallEdge.preconditions?.[0];
  if (precondition === undefined || precondition.type !== 'tool_call') return { tools: {}, toolName: null };
  const ref = precondition.tool;
  const provider = args.registry.providers.find(
    (p) => p.type === ref.providerType && p.id === ref.providerId
  );
  if (provider === undefined) {
    throw new Error(
      `Workflow tool_call references provider that is not in the registry: ${ref.providerType}:${ref.providerId}:${ref.toolName}`
    );
  }
  const built = await provider.buildTools({ toolNames: [ref.toolName], ctx: args.ctx });
  return { tools: built, toolName: ref.toolName };
}
```

- [ ] **Step 3: Run test, confirm it passes**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=resolveToolsForCurrentNode`
Expected: PASS.

- [ ] **Step 4: Export from api index**

In `packages/api/src/index.ts`:

```ts
export { resolveToolsForCurrentNode } from './core/resolveToolsForCurrentNode.js';
export type { ResolveToolsArgs, ResolveToolsResult } from './core/resolveToolsForCurrentNode.js';
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/core/resolveToolsForCurrentNode.ts packages/api/src/core/__tests__/
git commit -m "feat(api): add resolveToolsForCurrentNode helper for workflow path"
```

---

### Task 17: Wire `resolveToolsForCurrentNode` into the state machine + `executeWithCallbacks`

**Files:**
- Modify: `packages/api/src/stateMachine/...` (the prompt-formatting / step-execution layer)
- Modify: `packages/api/src/index.ts` (`execute`, `executeWithCallbacks`)

- [ ] **Step 1: Find the state machine's per-step LLM call site**

Run: `grep -n 'callAgentStep\|executeSingleStep\|callAgent' packages/api/src/stateMachine/ packages/api/src/core/ 2>/dev/null | head -10`

- [ ] **Step 2: Add a `Context.registry` field that callers populate**

Modify `packages/api/src/types/tools.ts` (or wherever `Context` is defined) to include:

```ts
import type { Registry } from '../providers/registry.js';

export interface Context {
  // existing fields...
  registry?: Registry;
}
```

- [ ] **Step 3: At the per-step call, resolve tools just-in-time when the current node has a tool_call edge**

In whichever module orchestrates per-step LLM calls (likely `core/index.ts`'s `callAgentStep` or `stateMachine/...`), insert the resolution before the LLM call:

```ts
import { resolveToolsForCurrentNode } from './resolveToolsForCurrentNode.js';

// ... inside the function that does the LLM call:
const outgoingEdges = currentNodeOutgoingEdges;   // existing variable name
let toolsForLLM: Record<string, Tool> = {};
if (context.registry !== undefined) {
  const resolved = await resolveToolsForCurrentNode({
    registry: context.registry,
    ctx: providerCtxFromContext(context),
    currentNodeOutgoingEdges: outgoingEdges,
  });
  toolsForLLM = toAiSdkToolDict(resolved.tools);
}
// pass toolsForLLM to the LLM call
```

- [ ] **Step 4: Implement the `providerCtxFromContext` adapter**

*Amended after engineer review (#B2)*: previously deferred with "implement same as ...". Concrete body:

In `packages/api/src/core/providerCtxFromContext.ts` (new file):

```ts
import type { Context } from '../types/tools.js';
import type { ProviderCtx, OAuthTokenBundle } from '../providers/provider.js';
import type { McpTransportConfig } from '@daviddh/graph-types';

import { consoleLogger } from '../utils/logger.js';

export function providerCtxFromContext(context: Context): ProviderCtx {
  // Context carries org/agent IDs and per-execution data. The registry-bound fields
  // (oauthTokens, mcpTransports, services) are populated by the executor entry point
  // before passing Context downstream. If they're missing, fall back to empty Maps —
  // the registry is allowed to fail gracefully on missing transport.
  return {
    orgId: context.orgId ?? '',
    agentId: context.agentId ?? '',
    isChildAgent: context.isChildAgent ?? false,
    logger: context.logger ?? consoleLogger,
    conversationId: context.conversationId,
    contextData: context.contextData,
    oauthTokens: (context.oauthTokens ?? Object.freeze(new Map<string, OAuthTokenBundle>())) as ReadonlyMap<string, OAuthTokenBundle>,
    mcpTransports: (context.mcpTransports ?? Object.freeze(new Map<string, McpTransportConfig>())) as ReadonlyMap<string, McpTransportConfig>,
    services: context.services ?? (() => undefined),
  };
}
```

Update `Context` type (`packages/api/src/types/tools.ts`) to declare the new fields:

```ts
export interface Context {
  // existing fields...
  orgId?: string;
  agentId?: string;
  isChildAgent?: boolean;
  conversationId?: string;
  contextData?: Readonly<Record<string, unknown>>;
  oauthTokens?: ReadonlyMap<string, OAuthTokenBundle>;
  mcpTransports?: ReadonlyMap<string, McpTransportConfig>;
  services?: <T>(providerId: string) => T | undefined;
  registry?: Registry;
  logger?: Logger;
}
```

Callers that build a Context (simulation entry, edge function entry) populate these fields from the request payload.

- [ ] **Step 5: Test + lint**

Run: `npm run check -w @daviddh/llm-graph-runner`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/stateMachine/ packages/api/src/core/ packages/api/src/types/tools.ts packages/api/src/index.ts
git commit -m "feat(api): wire registry-backed tool resolution into per-step LLM calls"
```

---

## Phase 7: Agent path (eager full set)

### Task 18: `buildAgentToolsAtStart` helper

**Files:**
- Create: `packages/api/src/core/buildAgentToolsAtStart.ts`
- Create: `packages/api/src/core/__tests__/buildAgentToolsAtStart.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import type { SelectedTool } from '@daviddh/llm-graph-runner';

import { buildAgentToolsAtStart } from '../buildAgentToolsAtStart.js';

describe('buildAgentToolsAtStart', () => {
  it('returns empty result for empty selected_tools without invoking registry', async () => {
    const fakeRegistry = { buildSelected: jest.fn() } as never;
    const result = await buildAgentToolsAtStart(fakeRegistry, {} as never, []);
    expect(result.tools).toEqual({});
    expect(fakeRegistry.buildSelected).not.toHaveBeenCalled();
  });

  it('passes refs through to registry.buildSelected', async () => {
    const refs: SelectedTool[] = [{ providerType: 'builtin', providerId: 'calendar', toolName: 'list_calendars' }];
    const fakeRegistry = {
      buildSelected: jest.fn().mockResolvedValue({ tools: { list_calendars: {} }, staleRefs: [], failedProviders: [] }),
    } as never;
    const result = await buildAgentToolsAtStart(fakeRegistry, {} as never, refs);
    expect(fakeRegistry.buildSelected).toHaveBeenCalledWith({ refs, ctx: {} });
    expect(result.tools.list_calendars).toBeDefined();
  });
});
```

- [ ] **Step 2: Write the helper**

`packages/api/src/core/buildAgentToolsAtStart.ts`:

```ts
import type { SelectedTool } from '../types/selectedTool.js';
import type { ProviderCtx } from '../providers/provider.js';
import type { Registry, RegistryBuildResult } from '../providers/registry.js';

export async function buildAgentToolsAtStart(
  registry: Registry,
  ctx: ProviderCtx,
  selectedTools: SelectedTool[]
): Promise<RegistryBuildResult> {
  if (selectedTools.length === 0) {
    return { tools: {}, staleRefs: [], failedProviders: [] };
  }
  const result = await registry.buildSelected({ refs: selectedTools, ctx });
  for (const stale of result.staleRefs) {
    ctx.logger.warn?.(`agent_tools.stale_drop: ${stale.providerType}:${stale.providerId}:${stale.toolName}`);
  }
  for (const failed of result.failedProviders) {
    ctx.logger.warn?.(`provider.build_tools.failure: ${failed.providerType}:${failed.providerId} ${failed.reason}`);
  }
  return result;
}
```

- [ ] **Step 3: Run test, confirm it passes**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=buildAgentToolsAtStart`
Expected: PASS.

- [ ] **Step 4: Export**

In `packages/api/src/index.ts`:

```ts
export { buildAgentToolsAtStart } from './core/buildAgentToolsAtStart.js';
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/core/buildAgentToolsAtStart.ts packages/api/src/core/__tests__/
git commit -m "feat(api): add buildAgentToolsAtStart helper"
```

---

### Task 19: Wire registry into edge function agent + workflow paths (drop `injectSystemTools`)

**Files:**
- Modify: `supabase/functions/execute-agent/index.ts`

- [ ] **Step 1: Replace `runAgentExecution` body**

```ts
// *Amended after engineer review (#B5)*: include all required imports.
import {
  buildAgentToolsAtStart,
  builtInProviders,
  composeRegistry,
  toAiSdkToolDict,
} from 'npm:@daviddh/llm-graph-runner';

async function runAgentExecution(payload: ExecutePayload, write: WriteEvent): Promise<void> {
  const ctx = buildProviderCtx(payload);
  const registry = composeRegistry({
    builtIns: builtInProviders,
    orgMcpServers: payload.graph.mcpServers ?? [],
    logger: runnerLogger,
  });
  const built = await buildAgentToolsAtStart(registry, ctx, payload.selectedTools ?? []);
  const tools = toAiSdkToolDict(built.tools);

  const result = await executeAgentLoop(
    {
      systemPrompt: payload.systemPrompt ?? '',
      context: payload.context ?? '',
      messages: payload.messages,
      apiKey: payload.apiKey,
      modelId: payload.modelId,
      maxSteps: payload.maxSteps ?? null,
      tools,
      isChildAgent: payload.isChildAgent ?? false,
    },
    /* callbacks unchanged */ ...,
    runnerLogger
  );

  // emit agent_response event as before
}
```

Drop the previous `injectSystemTools(...)` call inside `runAgentExecution`.

- [ ] **Step 2: Replace `runWorkflowExecution` body**

```ts
async function runWorkflowExecution(payload: ExecutePayload, write: WriteEvent): Promise<void> {
  const ctx = buildProviderCtx(payload);
  const registry = composeRegistry({
    builtIns: builtInProviders,
    orgMcpServers: payload.graph.mcpServers ?? [],
    logger: runnerLogger,
  });
  const result = await executeWithCallbacks({
    context: { ...buildContext(payload), registry, providerCtx: ctx },
    logger: runnerLogger,
    messages: payload.messages,
    currentNode: payload.currentNodeId,
    structuredOutputs: payload.structuredOutputs,
    onNodeVisited: ...,
    onNodeProcessed: ...,
  });
  // emit response event
}
```

The `executeWithCallbacks` runtime now reads `context.registry` and `context.providerCtx` and resolves tools per node via Task 17's wiring.

- [ ] **Step 3: Drop `injectSystemTools` import (it's gone in a later task)**

Remove the line `import { injectSystemTools } from '@daviddh/llm-graph-runner';`.

- [ ] **Step 4: Drop now-dead helpers**

Inside the edge function: `buildLeadScoringServices`, `buildFormsBundle`, `buildCalendarBundle` are no longer called directly by the run* functions — their logic moves into the `services` factory inside `buildProviderCtx`. Inline them or delete the redundant ones.

- [ ] **Step 5: Run + lint + commit**

```bash
git add supabase/functions/execute-agent/index.ts
git commit -m "refactor(edge): replace injectSystemTools with registry composition"
```

---

### Task 20: Update simulation paths to use registry

**Files:**
- Modify: `packages/backend/src/routes/simulateHandler.ts`
- Modify: `packages/backend/src/routes/simulationOrchestrator.ts`

- [ ] **Step 1: simulateHandler — replace `injectSystemTools` with registry composition**

```ts
import { buildAgentToolsAtStart, builtInProviders, composeRegistry, resolveToolsForCurrentNode, toAiSdkToolDict } from '@daviddh/llm-graph-runner';

// Replace the existing tool-resolution block with:
const ctx = buildProviderCtx(body);   // adapter from SimulateRequest body
const registry = composeRegistry({
  builtIns: builtInProviders,
  orgMcpServers: body.graph.mcpServers ?? [],
  logger: consoleLogger,
});
// For agent mode: buildAgentToolsAtStart; for workflow mode: pass registry into context
```

- [ ] **Step 2: simulationOrchestrator — same pattern**

Replace the existing `injectSystemTools(...)` call with `composeRegistry(...)` + `buildAgentToolsAtStart(...)` for agent mode, or pass the registry through `Context` for workflow mode.

- [ ] **Step 3: Run + lint + commit**

```bash
git add packages/backend/src/routes/simulateHandler.ts packages/backend/src/routes/simulationOrchestrator.ts
git commit -m "refactor(backend): simulation paths use composeRegistry"
```

---

## Phase 8: Frontend tool catalog endpoint

### Task 21: `GET /agents/:agentId/registry` route

**Files:**
- Create: `packages/backend/src/routes/agents/getRegistry.ts`
- Modify: `packages/backend/src/routes/agents/agentRouter.ts`

- [ ] **Step 1: Write the handler**

`packages/backend/src/routes/agents/getRegistry.ts`:

```ts
import type { Request } from 'express';
import { builtInProviders, composeRegistry } from '@daviddh/llm-graph-runner';

import { getAgentBySlug } from '../../db/queries/agentQueries.js';   // *Amended after review (#5)*: function is named getAgentBySlug, not fetchAgentBySlug
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_OK, getAgentId } from '../routeHelpers.js';
import { consoleLogger } from '../../logger.js';

const HTTP_NOT_FOUND = 404;

export async function handleGetAgentRegistry(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agentId required' });
    return;
  }
  const { supabase }: AuthenticatedLocals = res.locals;
  const agent = await getAgentBySlug(supabase, agentId);   // by-id, gated by RLS
  if (agent === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agent not found' });
    return;
  }
  const registry = composeRegistry({
    builtIns: builtInProviders,
    orgMcpServers: agent.graph?.mcpServers ?? [],
    logger: consoleLogger,
  });
  // Build a minimal ProviderCtx — no OAuth tokens (describeTools is auth-free for built-ins;
  // most MCPs allow tools/list without auth).
  const ctx = buildMinimalProviderCtx({ orgId: agent.org_id, agentId });
  const items = await registry.describeAll(ctx);
  const providers = items.map((item) => ({
    type: item.provider.type,
    id: item.provider.id,
    displayName: item.provider.displayName,
    description: item.provider.description,
    tools: item.tools,
    error: item.error,
  }));
  res.status(HTTP_OK).json({ providers });
}

function buildMinimalProviderCtx(args: { orgId: string; agentId: string }) {
  return {
    orgId: args.orgId,
    agentId: args.agentId,
    isChildAgent: false,
    logger: consoleLogger,
    oauthTokens: Object.freeze(new Map()),
    mcpTransports: Object.freeze(new Map()),
    services: () => undefined,
  } as never;
}
```

- [ ] **Step 2: Mount the route**

In `agentRouter.ts`:

```ts
import { handleGetAgentRegistry } from './getRegistry.js';

agentRouter.get('/:agentId/registry', handleGetAgentRegistry);
```

- [ ] **Step 3: Test + lint + commit**

```bash
npm run check -w @daviddh/graph-runner-backend
git add packages/backend/src/routes/agents/getRegistry.ts packages/backend/src/routes/agents/agentRouter.ts
git commit -m "feat(backend): add GET /agents/:agentId/registry endpoint"
```

---

### Task 22: Frontend `useAgentRegistry` hook with three states

**Files:**
- Create: `packages/web/app/hooks/useAgentRegistry.ts`
- Modify: `packages/web/app/lib/toolRegistry.ts` (DELETE the old client-side computation; replace with a simple type re-export)

- [ ] **Step 1: Write the hook**

`packages/web/app/hooks/useAgentRegistry.ts`:

```ts
'use client';

import useSWR from 'swr';

import { fetchFromBackend } from '@/app/lib/backendProxy';
import type { ToolGroup } from '@/app/lib/toolRegistryTypes';

export type RegistryState =
  | { kind: 'loading' }
  | { kind: 'loaded'; groups: ToolGroup[] }
  | { kind: 'partial-failure'; groups: ToolGroup[]; failedProviders: string[] }
  | { kind: 'total-failure'; reason: string };

interface RegistryResponse {
  providers: Array<{
    type: 'builtin' | 'mcp';
    id: string;
    displayName: string;
    description?: string;
    tools: Array<{ toolName: string; description: string; inputSchema: Record<string, unknown> }>;
    error?: { reason: string; detail: string };
  }>;
}

async function fetcher(url: string): Promise<RegistryResponse> {
  const data = await fetchFromBackend('GET', url);
  return data as RegistryResponse;
}

export function useAgentRegistry(agentId: string): RegistryState {
  const { data, error, isLoading } = useSWR<RegistryResponse>(
    `/agents/${encodeURIComponent(agentId)}/registry`,
    fetcher,
    { revalidateOnMount: true, dedupingInterval: 300_000 }
  );

  if (isLoading) return { kind: 'loading' };
  if (error !== undefined || data === undefined) {
    return { kind: 'total-failure', reason: error instanceof Error ? error.message : 'unknown' };
  }
  // *Amended after engineer + UX review (#X2)*: map server response directly. ToolGroup
  // gains optional providerType/providerId fields; the legacy `sourceId` is kept for
  // backwards-compat with Plan A's pre-B+C+D ToolsPanel render path, but the canonical
  // pair is the source of truth. The `__sentinel__` wrapping survives only as a
  // deprecated alias and goes away once Plan A's transitional adapter is removed.
  const groups: ToolGroup[] = data.providers.map((p) => ({
    groupName: p.displayName,
    providerType: p.type,
    providerId: p.id,
    tools: p.tools.map((t) => ({
      sourceId: p.type === 'builtin' ? `__${p.id}__` : p.id,   // legacy alias
      providerType: p.type,
      providerId: p.id,
      group: p.displayName,
      name: t.toolName,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));
  const failed = data.providers.filter((p) => p.error !== undefined).map((p) => p.id);
  if (failed.length > 0) return { kind: 'partial-failure', groups, failedProviders: failed };
  return { kind: 'loaded', groups };
}
```

- [ ] **Step 2: Delete the old toolRegistry.ts compute path**

Replace `packages/web/app/lib/toolRegistry.ts` body with:

```ts
export type { RegistryTool, ToolGroup } from './toolRegistryTypes';
```

(Delete `buildToolRegistry`, the static `SYSTEM_TOOLS` arrays, etc. The catalog endpoint is now the source of truth.)

- [ ] **Step 3: Update consumers**

Run: `grep -rn 'buildToolRegistry\|useToolRegistry\b' packages/web/app/ --include='*.ts' --include='*.tsx' | grep -v node_modules`

For each match, switch to the new `useAgentRegistry(agentId)` hook. The `ToolRegistryProvider` component likely wraps the editor — convert it to consume `useAgentRegistry` and provide the `RegistryState` to children.

- [ ] **Step 4: Run check**

Run: `npm run check -w web`
Expected: pre-existing errors only.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/hooks/useAgentRegistry.ts packages/web/app/lib/toolRegistry.ts packages/web/app/components/ToolRegistryProvider.tsx
git commit -m "feat(web): replace static tool registry with /registry endpoint hook"
```

---

### Task 23: ToolsPanel renders three states + per-provider error rows + asymmetric note

**Files:**
- Modify: `packages/web/app/components/panels/ToolsPanel.tsx`

- [ ] **Step 1: Read the current panel structure**

Run: `cat packages/web/app/components/panels/ToolsPanel.tsx | head -100`

- [ ] **Step 2: Switch on `registryState.kind`**

```tsx
const registryState = useAgentRegistry(agentId);

if (registryState.kind === 'loading') {
  return <PanelLoadingState />;
}
if (registryState.kind === 'total-failure') {
  return <PanelTotalFailureState reason={registryState.reason} onRetry={() => mutate(...)} />;
}
const groups = registryState.groups;
const failedProviders = registryState.kind === 'partial-failure' ? registryState.failedProviders : [];
```

- [ ] **Step 3: For each provider header, render error UI when failed**

In the per-group rendering, check whether `failedProviders.includes(group.providerId)` and render:

```tsx
{isFailedProvider && (
  <div className="px-3 py-1 text-[11px] text-destructive flex items-center gap-2">
    <AlertTriangle className="size-3" />
    <span>{t('agentTools.providerError')}</span>
    <button onClick={retry} className="underline">{t('agentTools.retry')}</button>
  </div>
)}
```

In agent mode, additionally render the inline note:

```tsx
{isFailedProvider && agent !== undefined && (
  <p className="text-[10px] text-muted-foreground px-3 pb-1">
    {t('agentTools.providerErrorAgentNote')} {/* "Workflows using this provider will fail at runtime." */}
  </p>
)}
```

In workflow mode, render the inverse:

```tsx
{isFailedProvider && agent === undefined && (
  <p className="text-[10px] text-muted-foreground px-3 pb-1">
    {t('agentTools.providerErrorWorkflowNote')} {/* "Agents using this provider will degrade silently." */}
  </p>
)}
```

- [ ] **Step 4: When in partial-failure, suspend save and stale-diff against failed providers' previously-selected tools**

*Amended after UX review (#19)*: extend Plan A's `SaveState` union to include `'disabled-by-failure'` and clarify the precedence between save-state and registry-state.

```ts
// In packages/web/app/components/panels/SaveStateIndicator.tsx (Plan A Task 13):
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'disabled-by-failure';
```

In the AgentEditor's debounced save path (Plan A Task 19), guard the save call:

```ts
// *Amended after UX review (#19)*: precedence rule — when registry catalog is in
// total-failure, save is paused. The indicator displays 'disabledByFailure' translation.
const saveDisabled = registryState.kind === 'total-failure';

const handleToolsChange = useCallback((next: SelectedTool[]) => {
  setSelectedTools(next);
  if (saveDisabled) {
    setSaveState('disabled-by-failure');
    return;   // don't fire the debounced save
  }
  debouncedSave(next);
}, [debouncedSave, saveDisabled]);
```

For the stale-entries diff in agent mode, exclude tools whose providerId is in `failedProviders` (don't promote temporarily-unavailable to stale). Plan A's `findStaleSelections` already accepts `failedProviders` (per Plan A v2 amendment).

The `SaveStateIndicator` placement during `total-failure`: the panel body is replaced with `<PanelTotalFailureState />`, but the indicator continues to render in the panel header (the search-row block, where it lives in Plan A Task 18). Since the search input is also disabled during total-failure, the indicator and the disabled input together communicate the state without requiring extra UI.

- [ ] **Step 5: Add new translations**

In `packages/web/messages/en.json`'s `agentTools` namespace. *Amended after UX review (#20, #21)* for tone consistency and clearer asymmetric notes:

```json
"providerError": "Couldn't load tools — retry",
"retry": "retry",
"providerErrorAgentNote": "Workflows that call this tool will fail at runtime — fix the provider first.",
"providerErrorWorkflowNote": "Agents will run without these tools and may improvise.",
"registryTotalFailure": "Couldn't load tool catalog. Refresh to retry.",
"lastRefreshedAt": "Updated {when}"
```

The notes are reworded to:
- Be plain about the consequence (workflow fails / agent improvises) — "degrade silently" was vague.
- Use the same "Couldn't <verb>" pattern as Plan A's translations.

In Plan A's `agentTools.saveStates`:

```json
"disabledByFailure": "Save paused — tool catalog couldn't load"
```

(already added in Plan A v2 amendment).

- [ ] **Step 6: Run check + commit**

```bash
npm run check -w web
git add packages/web/app/components/panels/ToolsPanel.tsx packages/web/messages/en.json
git commit -m "feat(web): three-state ToolsPanel + per-provider error rows"
```

---

## Phase 9: Cleanup

### Task 24: Delete obsolete code

**Files (DELETE):**
- `packages/api/src/tools/calendarTools.ts`
- `packages/api/src/tools/calendarToolsExecute.ts`
- `packages/api/src/tools/calendarToolsDescription.ts`
- `packages/api/src/tools/calendarToolSchemas.ts` (if its contents are now in providers/calendar/descriptors.ts)
- `packages/api/src/tools/formsTools.ts`
- `packages/api/src/tools/formsToolsExecute.ts`
- `packages/api/src/tools/formsToolsDescription.ts`
- `packages/api/src/tools/leadScoringTools.ts`
- `packages/api/src/tools/dispatchTools.ts`
- `packages/api/src/tools/finishTool.ts`
- `packages/api/src/tools/systemToolInjector.ts`
- `packages/backend/src/routes/execute/executeAgentPath.ts` (confirmed dead code)

- [ ] **Step 1: Verify each is unused before deleting**

For each file: `grep -rn "from.*<filename>" packages/ --include='*.ts' --include='*.tsx' | grep -v node_modules`
Expected: no remaining imports.

- [ ] **Step 2: Delete them**

```bash
git rm packages/api/src/tools/calendarTools.ts \
       packages/api/src/tools/calendarToolsExecute.ts \
       packages/api/src/tools/calendarToolsDescription.ts \
       packages/api/src/tools/formsTools.ts \
       packages/api/src/tools/formsToolsExecute.ts \
       packages/api/src/tools/formsToolsDescription.ts \
       packages/api/src/tools/leadScoringTools.ts \
       packages/api/src/tools/dispatchTools.ts \
       packages/api/src/tools/finishTool.ts \
       packages/api/src/tools/systemToolInjector.ts \
       packages/backend/src/routes/execute/executeAgentPath.ts
```

- [ ] **Step 3: Update `packages/api/src/index.ts` to drop the now-deleted exports**

Remove any export lines pointing at the deleted files.

- [ ] **Step 4: Run check**

Run: `npm run check`
Expected: clean (or only pre-existing failures unrelated to this work).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove injectSystemTools and per-feature tool factories"
```

---

### Task 25: Final smoke + check

- [ ] **Step 1: Run all tests**

Run: `npm run test -ws`
Expected: pass.

- [ ] **Step 2: Run full check**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3: Manual smoke (optional)**

Start dev servers; open an agent in the editor; verify ToolsPanel loads via `/registry` endpoint; toggle tools; run a simulation. Confirm calendar/forms/composition tools still work.

- [ ] **Step 4: Mark plan complete**

```bash
git log --oneline -30
```

Expected: ~25 commits matching task order.

---

## Self-review checklist

| Spec section | Plan task(s) covering it |
|---|---|
| OpenFlowTool adapter (#10 follow-up) | Task 1 |
| Provider / ProviderCtx / ToolDescriptor interfaces | Task 2 |
| Workflow `tool_call` schema → qualified ref | Task 3 |
| `buildToolIndex` + collision handling (built-in wins, no throw) | Task 4 |
| `composeRegistry` no-I/O + frozen + `findToolByName` + `buildSelected` + `describeAll` | Task 5 |
| Built-in providers (calendar, forms, lead_scoring, composition) | Tasks 6, 7, 8, 9 |
| `composition`: dispatch tools selectable + `finish` auto-injected for children | Task 9 |
| `builtInProviders` map + public exports | Task 10 |
| MCP provider (scaffold + bodies) | Tasks 11, 12 |
| Edge function payload `schemaVersion: 2` + `oauth.byProvider` (#9 follow-up) | Tasks 13, 14, 15 |
| Backend pre-resolves OAuth for selected providers | Task 14 |
| Workflow per-node lazy resolution | Tasks 16, 17 |
| Agent eager full-set resolution | Tasks 18, 19 |
| Simulation paths use registry | Task 20 |
| Catalog endpoint `GET /agents/:id/registry` | Task 21 |
| Frontend `useAgentRegistry` hook with 4-state discriminated union | Task 22 |
| ToolsPanel three states + per-provider error rows + asymmetric notes | Task 23 |
| Delete `injectSystemTools` + obsolete files | Task 24 |
| Stale-entry handling at runtime | Task 18 (logged via ctx.logger) |

**Required follow-ups deferred per spec (NOT in this plan):**

- #1 OAuth providers beyond calendar — OF-6 work.
- #2 Workflow publish-time validation — graph editor follow-up.
- #3 Redis caching — sub-project E.
- #4 Circuit-breaker for misbehaving MCPs — sub-project E.
- #5 MCP `tools/list` cache invalidation — sub-project E.
- #6 Cutover policy — release-time concern.
- #7 Templates / examples — implementation-time follow-up.
- #8 Per-MCP rate limiting — sub-project E adjacent work.

These are intentionally out of scope; cross-referenced in the spec's "Required follow-ups" section.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-26-executor-refactor.md`.**

---

## Revisions

### v2 — 2026-04-26 (post-dual-review of plans)

Bugs and gaps fixed in this pass:

- **`fetchAgentBySlug` → `getAgentBySlug`** (Task 21): the actual function name. Same fix applied to E Task 13 in that plan.
- **`precondition.value` consumers enumerated and updated** (Task 3): `dummyTools.ts:12` and `stateMachine/format/index.ts:16-17` were the silent failure points. Step 4a + Step 4b now make this explicit.
- **`findToolByName` is async** (Task 5): previously a sync method that returned null until `describeAll` was called first — a foot-gun the only consumer bypassed. Async eliminates the latent bug.
- **`composeRegistry` no-I/O test** (Task 5): verifies `buildMcpProvider` itself does no eager I/O via a fake transport spy.
- **Task 12 (MCP transport relocation) broken into Tasks 12a–12e**: this is a multi-day subproject (inventory existing callers → lift transport → switch backend imports → wire describe/build → delete legacy). Was previously a single hand-wave task.
- **`OAuthTokenBundle` defined once in api package** (Tasks 13, 15): edge function and backend both `import type` from `@daviddh/llm-graph-runner`. No drift across three definitions.
- **Edge function accepts both `schemaVersion: 1` and `2` during deploy transition** (Task 15): rejecting v1 outright would break any deploy where the edge function lands ahead of the backend (or vice versa). v1 branch is deprecated and removed in a follow-up edge-function deploy.
- **`toAiSdkToolDict` imported at all consumer sites** (Tasks 15, 19, 20): previously missing from the edge function's import block.
- **`providerCtxFromContext` body provided** (Task 17): central integration point of the workflow path; previously deferred. Concrete adapter + `Context` type extension added.
- **Catalog endpoint returns canonical provider IDs directly** (Task 22): no `__sentinel__` wrapping in the response. Plan A's transitional boundary helper becomes obsolete once B+C+D ships. Added `providerType`/`providerId` to `ToolGroup` and `RegistryTool`; `sourceId` retained as legacy alias.
- **Asymmetric error notes reworded** (Task 23): "degrade silently" was vague; replaced with "agent will improvise" / "workflow will fail at runtime — fix the provider first." Same "Couldn't <verb>" tone as Plan A.
- **`SaveState` extended with `'disabled-by-failure'`** (Task 23): documents precedence between save-state and registry-state when catalog endpoint is in total-failure. Plan A's `SaveStateIndicator` already includes the new variant.

**Realistic scope updated**: ~3–4 weeks of staff-engineer work. Originally 25 task-days; that was understated. Task 12 alone is now correctly scoped as 5 sub-tasks worth ~3–5 days.
