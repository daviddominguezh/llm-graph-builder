# Agent Tool Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-agent tool selection (checkbox UI + jsonb storage) to autonomous agents in OpenFlow so users can declare which tools their agent can call at runtime. Default: zero tools selected.

**Architecture:** New `agents.selected_tools` jsonb column stores `{ providerType, providerId, toolName }[]`. Backend exposes a PATCH route with `expectedUpdatedAt` precondition (409 on conflict). Frontend agent editor owns state with a 1.5 s debounced auto-save + saved-state indicator. ToolsPanel renders checkboxes only when editing an autonomous agent (`appType === 'agent'`); workflows use the existing read-only variant. Stale entries (selections referencing tools no longer in the registry) display with a Remove button.

**Tech Stack:** Postgres (Supabase), TypeScript (strict; `any`-forbidden), Express, Next.js (App Router) + shadcn/ui + Tailwind v4, Zod, sonner toasts, `use-debounce` (added in this plan).

**Spec:** `docs/superpowers/specs/2026-04-25-agent-tool-selection-design.md` (v2). Read it before starting.

**Project conventions:**
- ESLint enforces `max-lines-per-function: 40`, `max-lines: 300` per file, `max-depth: 2`. Never disable; refactor.
- Never use `any` — explicit types only.
- Always add translations.
- Use shadcn/ui components from `components/ui/`; do not handcraft.
- Run `npm run check` to validate before committing each task.

**Migration policy:** This codebase ships migration files only — the user applies them manually. Do not run `supabase db push` or similar.

---

## Phase 1: Schema & shared types

### Task 1: Database migration for `agents.selected_tools`

**Files:**
- Create: `supabase/migrations/20260426100000_agents_selected_tools.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Adds per-agent tool selection storage. Default: empty array (zero tools).
-- Shape: [{ providerType: 'builtin' | 'mcp', providerId: string, toolName: string }, ...]

ALTER TABLE public.agents
  ADD COLUMN selected_tools jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.agents
  ADD CONSTRAINT selected_tools_is_array
  CHECK (jsonb_typeof(selected_tools) = 'array');
```

- [ ] **Step 2: Verify the migration file is well-formed (syntax sanity)**

Run: `head -20 supabase/migrations/20260426100000_agents_selected_tools.sql`
Expected: prints the SQL above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260426100000_agents_selected_tools.sql
git commit -m "feat(agents): add selected_tools jsonb column migration"
```

> **Note:** Do not run `supabase db reset` or `db push`. The user applies migrations.

---

### Task 2: Shared `SelectedTool` type + builtin provider IDs in the api package

**Files:**
- Create: `packages/api/src/types/selectedTool.ts`
- Create: `packages/api/src/types/__tests__/selectedTool.test.ts`
- Modify: `packages/api/src/index.ts` (add exports)

- [ ] **Step 1: Write the failing test**

`packages/api/src/types/__tests__/selectedTool.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import {
  BUILTIN_PROVIDER_IDS,
  type SelectedTool,
  equalsSelectedTool,
} from '../selectedTool.js';

describe('SelectedTool helpers', () => {
  const a: SelectedTool = { providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' };
  const b: SelectedTool = { providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' };
  const c: SelectedTool = { providerType: 'builtin', providerId: 'forms', toolName: 'set_form_fields' };

  it('returns true for structurally equal SelectedTools', () => {
    expect(equalsSelectedTool(a, b)).toBe(true);
  });

  it('returns false for different toolName', () => {
    expect(equalsSelectedTool(a, c)).toBe(false);
  });

  it('returns false for different providerType', () => {
    const mcp: SelectedTool = { providerType: 'mcp', providerId: 'calendar', toolName: 'check_availability' };
    expect(equalsSelectedTool(a, mcp)).toBe(false);
  });

  it('exposes the four canonical builtin provider IDs', () => {
    expect(BUILTIN_PROVIDER_IDS).toEqual(['calendar', 'forms', 'lead_scoring', 'composition']);
  });
});
```

- [ ] **Step 2: Run test, confirm it fails (module not found)**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=selectedTool`
Expected: FAIL — `Cannot find module '../selectedTool.js'`.

- [ ] **Step 3: Write the type module**

`packages/api/src/types/selectedTool.ts`:

```ts
export type ProviderType = 'builtin' | 'mcp';

export interface SelectedTool {
  providerType: ProviderType;
  providerId: string;
  toolName: string;
}

/**
 * Canonical built-in provider IDs. These are part of the public contract — renaming
 * any of these requires a data migration of every agent's selected_tools.
 */
export const BUILTIN_PROVIDER_IDS = ['calendar', 'forms', 'lead_scoring', 'composition'] as const;
export type BuiltinProviderId = (typeof BUILTIN_PROVIDER_IDS)[number];

export function equalsSelectedTool(a: SelectedTool, b: SelectedTool): boolean {
  return (
    a.providerType === b.providerType &&
    a.providerId === b.providerId &&
    a.toolName === b.toolName
  );
}
```

- [ ] **Step 4: Add exports to the api package index**

In `packages/api/src/index.ts`, add the export block near the other type exports (e.g., right after the calendar exports):

```ts
export type { SelectedTool, ProviderType, BuiltinProviderId } from './types/selectedTool.js';
export { BUILTIN_PROVIDER_IDS, equalsSelectedTool } from './types/selectedTool.js';
```

- [ ] **Step 5: Run test, confirm it passes**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=selectedTool`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Build the api package so backend can resolve types**

Run: `npm run build -w packages/api`
Expected: Clean exit; new exports compiled into `packages/api/dist/`.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/types/selectedTool.ts packages/api/src/types/__tests__/selectedTool.test.ts packages/api/src/index.ts
git commit -m "feat(api): add SelectedTool type + BUILTIN_PROVIDER_IDS"
```

---

### Task 3: Zod schema for the PATCH body (shared between web + backend)

**Files:**
- Create: `packages/api/src/types/selectedToolSchema.ts`
- Create: `packages/api/src/types/__tests__/selectedToolSchema.test.ts`
- Modify: `packages/api/src/index.ts` (add export)

- [ ] **Step 1: Write the failing test**

`packages/api/src/types/__tests__/selectedToolSchema.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import {
  MAX_SELECTED_TOOLS,
  PatchSelectedToolsBodySchema,
  SelectedToolSchema,
} from '../selectedToolSchema.js';

describe('SelectedToolSchema', () => {
  it('accepts a valid SelectedTool', () => {
    expect(() =>
      SelectedToolSchema.parse({ providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' })
    ).not.toThrow();
  });

  it('rejects empty providerId', () => {
    expect(() =>
      SelectedToolSchema.parse({ providerType: 'builtin', providerId: '', toolName: 'check_availability' })
    ).toThrow();
  });

  it('rejects unknown providerType', () => {
    expect(() => SelectedToolSchema.parse({ providerType: 'plugin', providerId: 'x', toolName: 'y' })).toThrow();
  });
});

describe('PatchSelectedToolsBodySchema', () => {
  it('accepts a body with a small array + ISO updatedAt', () => {
    const body = {
      tools: [{ providerType: 'builtin', providerId: 'calendar', toolName: 'list_calendars' }],
      expectedUpdatedAt: '2026-04-26T10:00:00.000Z',
    };
    expect(() => PatchSelectedToolsBodySchema.parse(body)).not.toThrow();
  });

  it('exposes the cap as 100', () => {
    expect(MAX_SELECTED_TOOLS).toBe(100);
  });

  it('rejects more than MAX_SELECTED_TOOLS entries', () => {
    const tools = Array.from({ length: 101 }, (_, i) => ({
      providerType: 'builtin' as const,
      providerId: 'calendar',
      toolName: `tool_${String(i)}`,
    }));
    expect(() =>
      PatchSelectedToolsBodySchema.parse({ tools, expectedUpdatedAt: '2026-04-26T10:00:00.000Z' })
    ).toThrow();
  });

  it('rejects a non-ISO expectedUpdatedAt', () => {
    expect(() =>
      PatchSelectedToolsBodySchema.parse({ tools: [], expectedUpdatedAt: 'not-a-date' })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=selectedToolSchema`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema module**

`packages/api/src/types/selectedToolSchema.ts`:

```ts
import { z } from 'zod';

const MAX_PROVIDER_ID_LEN = 100;
const MAX_TOOL_NAME_LEN = 100;
export const MAX_SELECTED_TOOLS = 100;

export const SelectedToolSchema = z.object({
  providerType: z.enum(['builtin', 'mcp']),
  providerId: z.string().min(1).max(MAX_PROVIDER_ID_LEN),
  toolName: z.string().min(1).max(MAX_TOOL_NAME_LEN),
});

export const PatchSelectedToolsBodySchema = z.object({
  tools: z.array(SelectedToolSchema).max(MAX_SELECTED_TOOLS),
  expectedUpdatedAt: z.iso.datetime(),
});

export type PatchSelectedToolsBody = z.infer<typeof PatchSelectedToolsBodySchema>;
```

- [ ] **Step 4: Add exports**

Append to `packages/api/src/index.ts`:

```ts
export {
  MAX_SELECTED_TOOLS,
  PatchSelectedToolsBodySchema,
  SelectedToolSchema,
} from './types/selectedToolSchema.js';
export type { PatchSelectedToolsBody } from './types/selectedToolSchema.js';
```

- [ ] **Step 5: Run test, confirm it passes**

Run: `npm run test -w @daviddh/llm-graph-runner -- --testPathPattern=selectedToolSchema`
Expected: PASS — 6 tests pass.

- [ ] **Step 6: Rebuild api**

Run: `npm run build -w packages/api`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/types/selectedToolSchema.ts packages/api/src/types/__tests__/selectedToolSchema.test.ts packages/api/src/index.ts
git commit -m "feat(api): add Zod schema for PatchSelectedTools body"
```

---

## Phase 2: Backend read path

### Task 4: Extend agent fetch to include `selected_tools` and `updated_at`

**Files:**
- Modify: `packages/backend/src/routes/execute/executeFetcher.ts`

- [ ] **Step 1: Read the file to find the SELECT projection for agents**

Run: `grep -n "select\|SELECT\|.from('agents'\|agents'.*select" packages/backend/src/routes/execute/executeFetcher.ts | head -10`
Expected: locate the agent-row SELECT.

- [ ] **Step 2: Identify the AgentRow type (or equivalent)**

Run: `grep -n 'interface AgentRow\|type AgentRow\|AgentConfig' packages/backend/src/routes/execute/executeFetcher.ts | head -5`

- [ ] **Step 3: Add `selected_tools` and `updated_at` to the SELECT and the row type**

In the file, locate the `.from('agents').select(...)` call and add the two columns. Add to the row type:

```ts
selected_tools: SelectedTool[];
updated_at: string;
```

Import `SelectedTool` from `@daviddh/llm-graph-runner` at the top of the file.

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck -w @daviddh/graph-runner-backend`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/executeFetcher.ts
git commit -m "feat(backend): include selected_tools + updated_at in agent fetch"
```

---

## Phase 3: Backend PATCH route

### Task 5: DB query helper for the PATCH (with expectedUpdatedAt precondition)

**Files:**
- Create: `packages/backend/src/db/queries/selectedToolsOperations.ts`
- Create: `packages/backend/src/db/queries/__tests__/selectedToolsOperations.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/backend/src/db/queries/__tests__/selectedToolsOperations.test.ts`:

```ts
import { describe, expect, it, jest } from '@jest/globals';
import type { SelectedTool } from '@daviddh/llm-graph-runner';

import { updateSelectedToolsWithPrecondition } from '../selectedToolsOperations.js';

interface FakeBuilder {
  update: jest.Mock;
  eq: jest.Mock;
  select: jest.Mock;
  single: jest.Mock;
}

function makeSupabase(returnedRow: { selected_tools: SelectedTool[]; updated_at: string } | null, error: { code: string } | null = null) {
  const builder = {} as FakeBuilder;
  builder.update = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.select = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn().mockResolvedValue({ data: returnedRow, error });
  return { from: jest.fn().mockReturnValue(builder), _builder: builder };
}

describe('updateSelectedToolsWithPrecondition', () => {
  it('returns updated row on success', async () => {
    const row = { selected_tools: [], updated_at: '2026-04-26T10:00:00.000Z' };
    const sb = makeSupabase(row);
    const tools: SelectedTool[] = [];
    const result = await updateSelectedToolsWithPrecondition(sb as never, {
      agentId: 'a1',
      tools,
      expectedUpdatedAt: '2026-04-26T09:00:00.000Z',
    });
    expect(result).toEqual({ kind: 'ok', row });
  });

  it('returns conflict when no row matches the precondition', async () => {
    const sb = makeSupabase(null, { code: 'PGRST116' });
    const result = await updateSelectedToolsWithPrecondition(sb as never, {
      agentId: 'a1',
      tools: [],
      expectedUpdatedAt: '2026-04-26T09:00:00.000Z',
    });
    expect(result).toEqual({ kind: 'conflict' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=selectedToolsOperations`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the operation**

`packages/backend/src/db/queries/selectedToolsOperations.ts`:

```ts
import type { SelectedTool } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from './operationHelpers.js';

export interface UpdateSelectedToolsArgs {
  agentId: string;
  tools: SelectedTool[];
  expectedUpdatedAt: string;
}

export interface UpdateSelectedToolsRow {
  selected_tools: SelectedTool[];
  updated_at: string;
}

export type UpdateSelectedToolsResult =
  | { kind: 'ok'; row: UpdateSelectedToolsRow }
  | { kind: 'conflict' };

export async function updateSelectedToolsWithPrecondition(
  supabase: SupabaseClient,
  args: UpdateSelectedToolsArgs
): Promise<UpdateSelectedToolsResult> {
  const result = await supabase
    .from('agents')
    .update({ selected_tools: args.tools, updated_at: new Date().toISOString() })
    .eq('id', args.agentId)
    .eq('updated_at', args.expectedUpdatedAt)
    .select('selected_tools, updated_at')
    .single();

  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return { kind: 'conflict' };
    throw new Error(`updateSelectedToolsWithPrecondition: ${result.error.message}`);
  }
  return { kind: 'ok', row: result.data as UpdateSelectedToolsRow };
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=selectedToolsOperations`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/selectedToolsOperations.ts packages/backend/src/db/queries/__tests__/selectedToolsOperations.test.ts
git commit -m "feat(backend): add updateSelectedToolsWithPrecondition query"
```

---

### Task 6: PATCH route handler

**Files:**
- Create: `packages/backend/src/routes/agents/updateSelectedTools.ts`

- [ ] **Step 1: Write the handler**

`packages/backend/src/routes/agents/updateSelectedTools.ts`:

```ts
import type { Request } from 'express';
import { PatchSelectedToolsBodySchema } from '@daviddh/llm-graph-runner';

import {
  type UpdateSelectedToolsResult,
  updateSelectedToolsWithPrecondition,
} from '../../db/queries/selectedToolsOperations.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_BAD_REQUEST, HTTP_OK, getAgentId } from '../routeHelpers.js';

const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

function sendBadRequest(res: AuthenticatedResponse, message: string): void {
  res.status(HTTP_BAD_REQUEST).json({ error: message });
}

function sendConflict(res: AuthenticatedResponse): void {
  res.status(HTTP_CONFLICT).json({ error: 'conflict' });
}

function sendOk(res: AuthenticatedResponse, result: Extract<UpdateSelectedToolsResult, { kind: 'ok' }>): void {
  res.status(HTTP_OK).json({ selected_tools: result.row.selected_tools, updated_at: result.row.updated_at });
}

export async function handleUpdateSelectedTools(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    sendBadRequest(res, 'agentId required');
    return;
  }

  const parse = PatchSelectedToolsBodySchema.safeParse(req.body);
  if (!parse.success) {
    sendBadRequest(res, parse.error.message);
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;
  try {
    const result = await updateSelectedToolsWithPrecondition(supabase, {
      agentId,
      tools: parse.data.tools,
      expectedUpdatedAt: parse.data.expectedUpdatedAt,
    });
    if (result.kind === 'conflict') {
      sendConflict(res);
      return;
    }
    sendOk(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    res.status(HTTP_INTERNAL).json({ error: message });
  }
  // Note: 404 handled implicitly — if the agent doesn't exist or user lacks org membership,
  //       Supabase RLS will produce 0 rows and the precondition check returns 'conflict'.
  void HTTP_NOT_FOUND;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w @daviddh/graph-runner-backend`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/agents/updateSelectedTools.ts
git commit -m "feat(backend): add PATCH /agents/:id/selected-tools handler"
```

---

### Task 7: Mount the route in `agentRouter`

**Files:**
- Modify: `packages/backend/src/routes/agents/agentRouter.ts`

- [ ] **Step 1: Add the import + route**

Add the import near other route handler imports:

```ts
import { handleUpdateSelectedTools } from './updateSelectedTools.js';
```

Add the route mount alongside the other PATCH routes (e.g., after `handleUpdateMetadata`):

```ts
agentRouter.patch('/:agentId/selected-tools', handleUpdateSelectedTools);
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w @daviddh/graph-runner-backend`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/agents/agentRouter.ts
git commit -m "feat(backend): mount PATCH /agents/:id/selected-tools route"
```

---

### Task 8: Add per-org rate limit middleware (30 req/min)

**Files:**
- Create: `packages/backend/src/middleware/rateLimitPerOrg.ts`
- Create: `packages/backend/src/middleware/__tests__/rateLimitPerOrg.test.ts`
- Modify: `packages/backend/src/routes/agents/agentRouter.ts` (apply to selected-tools route)

- [ ] **Step 1: Write the failing test**

`packages/backend/src/middleware/__tests__/rateLimitPerOrg.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';

import { createPerOrgRateLimiter } from '../rateLimitPerOrg.js';

function makeReq(orgId: string): Request {
  return { headers: { 'x-org-id': orgId } } as unknown as Request;
}

interface FakeRes {
  statusCode?: number;
  body?: unknown;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
}

function makeRes(): FakeRes {
  const res = {
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
  } as FakeRes;
  return res;
}

describe('createPerOrgRateLimiter', () => {
  it('allows up to the limit and rejects above', async () => {
    const limit = 3;
    const limiter = createPerOrgRateLimiter({ limit, windowMs: 60_000 });
    let next = 0;
    const callNext = () => { next += 1; };

    for (let i = 0; i < limit; i += 1) {
      const res = makeRes();
      await limiter(makeReq('org-a'), res as never, callNext);
      expect(res.statusCode).toBeUndefined();
    }
    expect(next).toBe(limit);

    const overRes = makeRes();
    await limiter(makeReq('org-a'), overRes as never, callNext);
    expect(overRes.statusCode).toBe(429);
    expect(next).toBe(limit);
  });

  it('counts orgs independently', async () => {
    const limiter = createPerOrgRateLimiter({ limit: 1, windowMs: 60_000 });
    let next = 0;
    const callNext = () => { next += 1; };

    await limiter(makeReq('org-a'), makeRes() as never, callNext);
    await limiter(makeReq('org-b'), makeRes() as never, callNext);
    expect(next).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=rateLimitPerOrg`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the middleware**

`packages/backend/src/middleware/rateLimitPerOrg.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';

const HTTP_TOO_MANY = 429;

export interface PerOrgRateLimitOptions {
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  windowStartedAt: number;
}

function readOrgId(req: Request): string {
  const header = req.headers['x-org-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  // Fall back to body.orgId for routes that include it
  const body = req.body as { orgId?: string } | undefined;
  return body?.orgId ?? 'anonymous';
}

export function createPerOrgRateLimiter(opts: PerOrgRateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const orgId = readOrgId(req);
    const now = Date.now();
    const existing = buckets.get(orgId);
    if (existing === undefined || now - existing.windowStartedAt > opts.windowMs) {
      buckets.set(orgId, { count: 1, windowStartedAt: now });
      next();
      return;
    }
    if (existing.count >= opts.limit) {
      res.status(HTTP_TOO_MANY).json({ error: 'rate limited', retryAfterMs: opts.windowMs - (now - existing.windowStartedAt) });
      return;
    }
    existing.count += 1;
    next();
  };
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npm run test -w @daviddh/graph-runner-backend -- --testPathPattern=rateLimitPerOrg`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Apply the limiter to the new route**

In `packages/backend/src/routes/agents/agentRouter.ts`, add the import:

```ts
import { createPerOrgRateLimiter } from '../../middleware/rateLimitPerOrg.js';
```

Then update the route mount line to:

```ts
const selectedToolsLimiter = createPerOrgRateLimiter({ limit: 30, windowMs: 60_000 });
agentRouter.patch('/:agentId/selected-tools', selectedToolsLimiter, handleUpdateSelectedTools);
```

- [ ] **Step 6: Verify check**

Run: `npm run check -w @daviddh/graph-runner-backend`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/middleware/rateLimitPerOrg.ts packages/backend/src/middleware/__tests__/rateLimitPerOrg.test.ts packages/backend/src/routes/agents/agentRouter.ts
git commit -m "feat(backend): add per-org rate limiter to selected-tools route (30/min)"
```

---

## Phase 4: Frontend server action + dependency

### Task 9: Add `use-debounce` dependency

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Install the dependency**

Run: `npm install -w packages/web use-debounce@^11`
Expected: package added to `packages/web/package.json` dependencies; lockfile updated.

- [ ] **Step 2: Confirm install**

Run: `grep '"use-debounce"' packages/web/package.json`
Expected: line `"use-debounce": "^11....",`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json package-lock.json
git commit -m "chore(web): add use-debounce dependency"
```

---

### Task 10: Server action `updateAgentSelectedToolsAction`

**Files:**
- Create: `packages/web/app/actions/agentSelectedTools.ts`

- [ ] **Step 1: Write the action**

`packages/web/app/actions/agentSelectedTools.ts`:

```ts
'use server';

import type { SelectedTool } from '@daviddh/llm-graph-runner';

import { fetchFromBackend } from '@/app/lib/backendProxy';

export type UpdateSelectedToolsResult =
  | { ok: true; updatedAt: string; tools: SelectedTool[] }
  | { ok: false; kind: 'validation' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'transient'; message: string; conflict?: { currentUpdatedAt: string; currentTools: SelectedTool[] } };

interface SuccessBody {
  selected_tools: SelectedTool[];
  updated_at: string;
}

interface ConflictBody {
  current_updated_at: string;
  current_tools: SelectedTool[];
}

function parseSuccess(data: unknown): SuccessBody | null {
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (!Array.isArray(rec.selected_tools) || typeof rec.updated_at !== 'string') return null;
  return { selected_tools: rec.selected_tools as SelectedTool[], updated_at: rec.updated_at };
}

function parseConflict(data: unknown): ConflictBody | null {
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.current_updated_at !== 'string' || !Array.isArray(rec.current_tools)) return null;
  return { current_updated_at: rec.current_updated_at, current_tools: rec.current_tools as SelectedTool[] };
}

export async function updateAgentSelectedToolsAction(
  agentId: string,
  tools: SelectedTool[],
  expectedUpdatedAt: string
): Promise<UpdateSelectedToolsResult> {
  try {
    const data = await fetchFromBackend(
      'PATCH',
      `/agents/${encodeURIComponent(agentId)}/selected-tools`,
      { tools, expectedUpdatedAt }
    );
    const success = parseSuccess(data);
    if (success === null) return { ok: false, kind: 'transient', message: 'Malformed response' };
    return { ok: true, updatedAt: success.updated_at, tools: success.selected_tools };
  } catch (err) {
    return mapToFailure(err);
  }
}

function mapToFailure(err: unknown): UpdateSelectedToolsResult {
  const message = err instanceof Error ? err.message : 'unknown';
  if (/^409/.test(message)) {
    // fetchFromBackend prefixes the status; rough heuristic until shaped errors are first-class
    return { ok: false, kind: 'conflict', message };
  }
  if (/^429/.test(message)) return { ok: false, kind: 'rate_limited', message };
  if (/^4(0[03]|04)/.test(message)) {
    if (message.startsWith('400')) return { ok: false, kind: 'validation', message };
    if (message.startsWith('403')) return { ok: false, kind: 'forbidden', message };
    return { ok: false, kind: 'not_found', message };
  }
  return { ok: false, kind: 'transient', message };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/web && npx tsc --noEmit && cd -`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/actions/agentSelectedTools.ts
git commit -m "feat(web): add updateAgentSelectedToolsAction server action"
```

---

## Phase 5: Frontend utilities & translations

### Task 11: Translations for `agentTools` namespace

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add the namespace**

In `packages/web/messages/en.json`, add the following block (placement: alphabetically ordered with sibling top-level keys, e.g. before `apiKeys`):

```json
"agentTools": {
  "selectAll": "Select all",
  "clear": "Clear",
  "countOfTotal": "{n} of {total}",
  "countOfTotalVisible": "{n} of {visible} visible · {total} total",
  "allSelected": "all",
  "noToolsHint": "No tools enabled. This agent can only converse.",
  "staleHeader": "Stale entries (provider removed)",
  "removeStale": "Remove",
  "runInProgressNote": "Changes apply to the next run.",
  "saveStates": {
    "saving": "Saving…",
    "saved": "Saved",
    "error": "Failed — retry",
    "conflict": "Conflict — refreshing"
  },
  "saveError": "Couldn't save tool selection. Please try again."
},
```

- [ ] **Step 2: Verify the file is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/web/messages/en.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat(web): add agentTools translations"
```

---

### Task 12: Frontend `agentTools` utility lib (tri-state, equality, registry helpers)

**Files:**
- Create: `packages/web/app/lib/agentTools.ts`
- Create: `packages/web/app/lib/__tests__/agentTools.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/app/lib/__tests__/agentTools.test.ts`:

```ts
import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { describe, expect, it } from '@jest/globals';

import {
  type GroupHeaderState,
  computeHeaderState,
  findStaleSelections,
  isToolSelected,
  toggleTool,
} from '../agentTools';

const calA: SelectedTool = { providerType: 'builtin', providerId: 'calendar', toolName: 'check_availability' };
const calB: SelectedTool = { providerType: 'builtin', providerId: 'calendar', toolName: 'list_calendars' };

describe('agentTools', () => {
  it('toggleTool adds when missing', () => {
    expect(toggleTool([], calA)).toEqual([calA]);
  });

  it('toggleTool removes when present', () => {
    expect(toggleTool([calA, calB], calA)).toEqual([calB]);
  });

  it('isToolSelected works', () => {
    expect(isToolSelected([calA], calA)).toBe(true);
    expect(isToolSelected([calA], calB)).toBe(false);
  });

  it('computeHeaderState classifies all/none/partial', () => {
    const groupTools: SelectedTool[] = [calA, calB];
    expect(computeHeaderState({ groupTools, selected: [] })).toEqual<GroupHeaderState>('unchecked');
    expect(computeHeaderState({ groupTools, selected: [calA] })).toEqual<GroupHeaderState>('indeterminate');
    expect(computeHeaderState({ groupTools, selected: [calA, calB] })).toEqual<GroupHeaderState>('checked');
  });

  it('findStaleSelections returns refs absent from registry', () => {
    const registry: SelectedTool[] = [calA];
    const sel: SelectedTool[] = [calA, calB];
    expect(findStaleSelections({ selections: sel, registry })).toEqual([calB]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx jest --testPathPattern=agentTools && cd -`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the lib**

`packages/web/app/lib/agentTools.ts`:

```ts
import { type SelectedTool, equalsSelectedTool } from '@daviddh/llm-graph-runner';

export type GroupHeaderState = 'checked' | 'unchecked' | 'indeterminate';

export function isToolSelected(selected: SelectedTool[], tool: SelectedTool): boolean {
  return selected.some((s) => equalsSelectedTool(s, tool));
}

export function toggleTool(selected: SelectedTool[], tool: SelectedTool): SelectedTool[] {
  if (isToolSelected(selected, tool)) {
    return selected.filter((s) => !equalsSelectedTool(s, tool));
  }
  return [...selected, tool];
}

export interface ComputeHeaderArgs {
  groupTools: SelectedTool[];
  selected: SelectedTool[];
}

export function computeHeaderState(args: ComputeHeaderArgs): GroupHeaderState {
  if (args.groupTools.length === 0) return 'unchecked';
  const present = args.groupTools.filter((t) => isToolSelected(args.selected, t)).length;
  if (present === 0) return 'unchecked';
  if (present === args.groupTools.length) return 'checked';
  return 'indeterminate';
}

export interface FindStaleArgs {
  selections: SelectedTool[];
  registry: SelectedTool[];
}

export function findStaleSelections(args: FindStaleArgs): SelectedTool[] {
  return args.selections.filter((s) => !args.registry.some((r) => equalsSelectedTool(r, s)));
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `cd packages/web && npx jest --testPathPattern=agentTools && cd -`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/agentTools.ts packages/web/app/lib/__tests__/agentTools.test.ts
git commit -m "feat(web): add agentTools utility lib (tri-state, toggle, stale)"
```

---

## Phase 6: Frontend small components

### Task 13: `SaveStateIndicator` component

**Files:**
- Create: `packages/web/app/components/panels/SaveStateIndicator.tsx`

- [ ] **Step 1: Write the component**

`packages/web/app/components/panels/SaveStateIndicator.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface SaveStateIndicatorProps {
  state: SaveState;
  onRetry?: () => void;
}

export function SaveStateIndicator({ state, onRetry }: SaveStateIndicatorProps): React.JSX.Element | null {
  const t = useTranslations('agentTools.saveStates');
  if (state === 'idle') return null;
  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="text-[11px] text-destructive hover:underline"
      >
        {t('error')}
      </button>
    );
  }
  return (
    <span className="text-[11px] text-muted-foreground">
      {state === 'saving' && t('saving')}
      {state === 'saved' && t('saved')}
      {state === 'conflict' && t('conflict')}
    </span>
  );
}
```

- [ ] **Step 2: Lint the file**

Run: `cd packages/web && npx eslint app/components/panels/SaveStateIndicator.tsx && cd -`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/SaveStateIndicator.tsx
git commit -m "feat(web): add SaveStateIndicator component"
```

---

### Task 14: `EmptyToolsHint` component

**Files:**
- Create: `packages/web/app/components/panels/EmptyToolsHint.tsx`

- [ ] **Step 1: Write the component**

`packages/web/app/components/panels/EmptyToolsHint.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

export function EmptyToolsHint(): React.JSX.Element {
  const t = useTranslations('agentTools');
  return (
    <p className="text-muted-foreground text-xs bg-muted py-2 px-3 mx-1 mt-2 rounded-md">
      {t('noToolsHint')}
    </p>
  );
}
```

- [ ] **Step 2: Lint**

Run: `cd packages/web && npx eslint app/components/panels/EmptyToolsHint.tsx && cd -`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/EmptyToolsHint.tsx
git commit -m "feat(web): add EmptyToolsHint component"
```

---

### Task 15: `StaleEntriesGroup` component

**Files:**
- Create: `packages/web/app/components/panels/StaleEntriesGroup.tsx`

- [ ] **Step 1: Write the component**

`packages/web/app/components/panels/StaleEntriesGroup.tsx`:

```tsx
'use client';

import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface StaleEntriesGroupProps {
  staleEntries: SelectedTool[];
  onRemove: (entry: SelectedTool) => void;
}

export function StaleEntriesGroup({ staleEntries, onRemove }: StaleEntriesGroupProps): React.JSX.Element | null {
  const t = useTranslations('agentTools');
  if (staleEntries.length === 0) return null;
  return (
    <div className="px-2 pt-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-1.5">
        <AlertTriangle className="size-3 text-yellow-600 dark:text-yellow-500" />
        {t('staleHeader')}
      </div>
      <ul className="flex flex-col gap-1">
        {staleEntries.map((entry) => (
          <li
            key={`${entry.providerType}:${entry.providerId}:${entry.toolName}`}
            className="flex items-center justify-between text-xs px-2 py-1 rounded-sm bg-card"
          >
            <span className="font-mono text-muted-foreground truncate">
              {entry.providerType}:{entry.providerId}:{entry.toolName}
            </span>
            <Button variant="ghost" size="icon-xs" onClick={() => onRemove(entry)}>
              {t('removeStale')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `cd packages/web && npx eslint app/components/panels/StaleEntriesGroup.tsx && cd -`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/StaleEntriesGroup.tsx
git commit -m "feat(web): add StaleEntriesGroup component"
```

---

### Task 16: `ProviderHeader` component (tri-state checkbox)

**Files:**
- Create: `packages/web/app/components/panels/ProviderHeader.tsx`

- [ ] **Step 1: Confirm shadcn Checkbox is available**

Run: `ls packages/web/components/ui/checkbox.tsx`
Expected: file exists.

- [ ] **Step 2: Write the component**

`packages/web/app/components/panels/ProviderHeader.tsx`:

```tsx
'use client';

import type { GroupHeaderState } from '@/app/lib/agentTools';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslations } from 'next-intl';

interface ProviderHeaderProps {
  groupName: string;
  description?: string;
  state: GroupHeaderState;
  selectedInGroup: number;
  totalInGroup: number;
  visibleInGroup: number;
  searchActive: boolean;
  onToggle: () => void;
}

function formatCount(args: {
  state: GroupHeaderState;
  selected: number;
  total: number;
  visible: number;
  searchActive: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): string {
  if (args.state === 'unchecked') return '';
  if (args.state === 'checked' && !args.searchActive) return `(${args.t('allSelected')})`;
  if (args.searchActive) {
    return `(${args.t('countOfTotalVisible', { n: args.selected, visible: args.visible, total: args.total })})`;
  }
  return `(${args.t('countOfTotal', { n: args.selected, total: args.total })})`;
}

export function ProviderHeader(props: ProviderHeaderProps): React.JSX.Element {
  const t = useTranslations('agentTools');
  const checkedValue = props.state === 'checked' ? true : props.state === 'indeterminate' ? 'indeterminate' : false;
  const count = formatCount({
    state: props.state,
    selected: props.selectedInGroup,
    total: props.totalInGroup,
    visible: props.visibleInGroup,
    searchActive: props.searchActive,
    t,
  });
  return (
    <div className="sticky top-0 z-10 bg-background flex items-center gap-2 px-2 pt-2 pb-1.5">
      <Checkbox checked={checkedValue} onCheckedChange={props.onToggle} aria-label={t('selectAll')} />
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <span>{props.groupName}</span>
          {count !== '' && <span className="lowercase">{count}</span>}
        </div>
        {props.description !== undefined && (
          <span className="text-[10px] text-muted-foreground truncate" title={props.description}>
            {props.description}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint**

Run: `cd packages/web && npx eslint app/components/panels/ProviderHeader.tsx && cd -`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/panels/ProviderHeader.tsx
git commit -m "feat(web): add ProviderHeader with tri-state checkbox + count"
```

---

### Task 17: `ToolRow` component (selectable variant)

**Files:**
- Create: `packages/web/app/components/panels/ToolRow.tsx`

- [ ] **Step 1: Write the component**

`packages/web/app/components/panels/ToolRow.tsx`:

```tsx
'use client';

import type { RegistryTool } from '@/app/lib/toolRegistryTypes';
import { Checkbox } from '@/components/ui/checkbox';
import { useRef } from 'react';

import { FloatingSchema, type ToolSchema } from './ToolSchemaPopover';

interface ToolRowProps {
  tool: RegistryTool;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onCollapse: () => void;
}

export function ToolRow({
  tool,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
  onCollapse,
}: ToolRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <li className="flex flex-col w-[calc(50%_-_(var(--spacing)*2))] shrink-0 bg-card rounded-sm py-1.5">
      <div
        ref={rowRef}
        className="group/tool flex w-full items-start gap-1.5 px-1 py-0 text-left text-xs cursor-pointer border-l-2 border-ring hover:border-accent"
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
          aria-label={tool.name}
        />
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 flex-col text-left cursor-pointer"
        >
          <span className="font-medium">{tool.name}</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {tool.description ?? tool.group}
          </span>
        </button>
      </div>
      {expanded && tool.inputSchema !== undefined && (
        <FloatingSchema
          description={tool.description}
          anchorRef={rowRef}
          schema={tool.inputSchema as ToolSchema}
          onClose={onCollapse}
        />
      )}
    </li>
  );
}
```

- [ ] **Step 2: Lint**

Run: `cd packages/web && npx eslint app/components/panels/ToolRow.tsx && cd -`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/ToolRow.tsx
git commit -m "feat(web): add selectable ToolRow component"
```

---

## Phase 7: ToolsPanel + AgentEditor integration

### Task 18: Extend `ToolsPanel` with controlled agent-mode rendering

**Files:**
- Modify: `packages/web/app/components/panels/ToolsPanel.tsx`

- [ ] **Step 1: Add the new props to the interface**

Find `interface ToolsPanelProps` and extend it:

```ts
import type { SelectedTool } from '@daviddh/llm-graph-runner';
import type { SaveState } from './SaveStateIndicator';

interface AgentModeProps {
  agentId: string;
  selectedTools: SelectedTool[];
  staleEntries: SelectedTool[];
  saveState: SaveState;
  onChange: (next: SelectedTool[]) => void;
  onRemoveStale: (entry: SelectedTool) => void;
  onRetrySave?: () => void;
}

interface ToolsPanelProps {
  mcp: McpProps;
  open: boolean;
  onClose: () => void;
  agent?: AgentModeProps;   // present iff editing an autonomous agent
}
```

- [ ] **Step 2: Add a helper for the registry → SelectedTool[] mapping**

Inside `ToolsPanel.tsx`, near the top (above the components):

```ts
function registryToolToSelectedTool(t: RegistryTool): SelectedTool {
  const isBuiltin = t.sourceId.startsWith('__');
  return {
    providerType: isBuiltin ? 'builtin' : 'mcp',
    providerId: isBuiltin ? t.sourceId.replaceAll('_', '') : t.sourceId,
    toolName: t.name,
  };
}
```

> Note: The current registry uses `__system__` / `__forms__` / etc. sentinels. This helper translates to the new `{providerType, providerId, toolName}` shape. Once B+C+D lands (which renames sentinels to clean slugs), this helper simplifies. For sub-project A, this adapter is correct.

- [ ] **Step 3: Render the agent-mode variant**

Replace the existing `ToolsList` invocation block (around line 312 of the existing file) with a conditional. When `agent !== undefined`, render the new components in this order:

```tsx
import { EmptyToolsHint } from './EmptyToolsHint';
import { ProviderHeader } from './ProviderHeader';
import { SaveStateIndicator } from './SaveStateIndicator';
import { StaleEntriesGroup } from './StaleEntriesGroup';
import { ToolRow as SelectableToolRow } from './ToolRow';
import {
  computeHeaderState,
  isToolSelected,
  toggleTool,
} from '@/app/lib/agentTools';
```

Then in the `tools` tab body, replace the current ToolsList with:

```tsx
{agent !== undefined ? (
  <AgentModeBody
    agent={agent}
    groups={filteredGroups}
    searchActive={query !== ''}
    expandedTool={expandedTool}
    onToggleTool={(key) => setExpandedTool((prev) => (prev === key ? null : key))}
    onCollapseTool={() => setExpandedTool(null)}
  />
) : (
  <ToolsList
    groups={filteredGroups}
    totalCount={totalCount}
    expandedTool={expandedTool}
    onToggleTool={(key) => setExpandedTool((prev) => (prev === key ? null : key))}
    onCollapseTool={() => setExpandedTool(null)}
    onTestTool={tt.openTest}
  />
)}
```

And add the `AgentModeBody` component lower in the same file:

```tsx
interface AgentModeBodyProps {
  agent: AgentModeProps;
  groups: ToolGroup[];
  searchActive: boolean;
  expandedTool: string | null;
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
}

function AgentModeBody({ agent, groups, searchActive, expandedTool, onToggleTool, onCollapseTool }: AgentModeBodyProps) {
  const showEmpty = agent.selectedTools.length === 0 && agent.staleEntries.length === 0;
  return (
    <div className="flex-1 overflow-y-auto p-1 pt-0">
      <StaleEntriesGroup staleEntries={agent.staleEntries} onRemove={agent.onRemoveStale} />
      {showEmpty && <EmptyToolsHint />}
      {groups.map((group) => (
        <AgentModeGroup
          key={group.groupName}
          group={group}
          agent={agent}
          searchActive={searchActive}
          expandedTool={expandedTool}
          onToggleTool={onToggleTool}
          onCollapseTool={onCollapseTool}
        />
      ))}
    </div>
  );
}

interface AgentModeGroupProps {
  group: ToolGroup;
  agent: AgentModeProps;
  searchActive: boolean;
  expandedTool: string | null;
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
}

function AgentModeGroup({ group, agent, searchActive, expandedTool, onToggleTool, onCollapseTool }: AgentModeGroupProps) {
  const groupTools = group.tools.map(registryToolToSelectedTool);
  const headerState = computeHeaderState({ groupTools, selected: agent.selectedTools });
  const selectedInGroup = groupTools.filter((t) => isToolSelected(agent.selectedTools, t)).length;
  const onHeaderToggle = () => {
    const allChecked = headerState === 'checked';
    let next = agent.selectedTools;
    for (const t of groupTools) {
      const present = isToolSelected(next, t);
      if (allChecked && present) next = toggleTool(next, t);
      else if (!allChecked && !present) next = toggleTool(next, t);
    }
    agent.onChange(next);
  };
  return (
    <div>
      <ProviderHeader
        groupName={group.groupName}
        state={headerState}
        selectedInGroup={selectedInGroup}
        totalInGroup={groupTools.length}
        visibleInGroup={group.tools.length}
        searchActive={searchActive}
        onToggle={onHeaderToggle}
      />
      <ul className="flex flex-row gap-2 gap-y-3 flex-wrap pl-1">
        {group.tools.map((tool) => {
          const ref = registryToolToSelectedTool(tool);
          const key = `${tool.group}-${tool.name}`;
          return (
            <SelectableToolRow
              key={key}
              tool={tool}
              selected={isToolSelected(agent.selectedTools, ref)}
              expanded={expandedTool === key}
              onToggleSelected={() => agent.onChange(toggleTool(agent.selectedTools, ref))}
              onToggleExpanded={() => onToggleTool(key)}
              onCollapse={onCollapseTool}
            />
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Add the SaveStateIndicator next to the search input**

In the search-row block, append the indicator on the right:

```tsx
<div className="flex items-center gap-2 px-3 py-2 border-b">
  <Search className="size-3.5 text-muted-foreground shrink-0" />
  <Input ... />
  {agent !== undefined && (
    <SaveStateIndicator state={agent.saveState} onRetry={agent.onRetrySave} />
  )}
</div>
```

- [ ] **Step 5: Verify ToolsPanel.tsx is still under 300 lines**

Run: `wc -l packages/web/app/components/panels/ToolsPanel.tsx`
Expected: ≤ 300. If over, extract `AgentModeBody` and `AgentModeGroup` to their own file `ToolsPanelAgentMode.tsx` (same shape, separate file).

- [ ] **Step 6: Lint + typecheck**

Run: `npm run check -w web`
Expected: clean (or report only pre-existing failures unrelated to this change).

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/components/panels/ToolsPanel.tsx
git commit -m "feat(web): render agent-mode ToolsPanel with checkboxes + save state"
```

---

### Task 19: Hoist `selectedTools` state into `AgentEditor` with debounced save

**Files:**
- Modify: `packages/web/app/components/agent-editor/AgentEditor.tsx`

- [ ] **Step 1: Find the existing state shape and the ToolsPanel render site**

Run: `grep -n 'ToolsPanel\|selectedTools\|appType' packages/web/app/components/agent-editor/AgentEditor.tsx | head -20`

- [ ] **Step 2: Add the new state, debounced save, and revert logic at the top of the component**

Insert near the existing useState hooks:

```ts
import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { updateAgentSelectedToolsAction } from '@/app/actions/agentSelectedTools';
import { useDebouncedCallback } from 'use-debounce';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

// ... inside the component (assuming `agent` is the loaded record)
const tAgentTools = useTranslations('agentTools');
const [selectedTools, setSelectedTools] = useState<SelectedTool[]>(agent.selectedTools ?? []);
const [updatedAt, setUpdatedAt] = useState<string>(agent.updatedAt);
const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
const lastSavedRef = useRef<{ tools: SelectedTool[]; updatedAt: string }>({
  tools: agent.selectedTools ?? [],
  updatedAt: agent.updatedAt,
});

const performSave = useCallback(async (next: SelectedTool[]) => {
  setSaveState('saving');
  const result = await updateAgentSelectedToolsAction(agent.id, next, lastSavedRef.current.updatedAt);
  if (result.ok) {
    lastSavedRef.current = { tools: result.tools, updatedAt: result.updatedAt };
    setUpdatedAt(result.updatedAt);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2000);
    return;
  }
  if (result.kind === 'conflict' && result.conflict !== undefined) {
    lastSavedRef.current = {
      tools: result.conflict.currentTools,
      updatedAt: result.conflict.currentUpdatedAt,
    };
    setSelectedTools(result.conflict.currentTools);
    setUpdatedAt(result.conflict.currentUpdatedAt);
    setSaveState('conflict');
    setTimeout(() => setSaveState('idle'), 1000);
    return;
  }
  if (result.kind === 'transient' || result.kind === 'rate_limited') {
    // Single retry after a short backoff
    await new Promise((r) => setTimeout(r, 2000));
    const retry = await updateAgentSelectedToolsAction(agent.id, next, lastSavedRef.current.updatedAt);
    if (retry.ok) {
      lastSavedRef.current = { tools: retry.tools, updatedAt: retry.updatedAt };
      setUpdatedAt(retry.updatedAt);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      return;
    }
  }
  toast.error(tAgentTools('saveError'));
  setSelectedTools(lastSavedRef.current.tools);
  setSaveState('error');
}, [agent.id, tAgentTools]);

const debouncedSave = useDebouncedCallback(performSave, 1500);

useEffect(() => {
  return () => { debouncedSave.flush(); };
}, [debouncedSave]);

const handleToolsChange = useCallback((next: SelectedTool[]) => {
  setSelectedTools(next);
  debouncedSave(next);
}, [debouncedSave]);

const handleRemoveStale = useCallback((entry: SelectedTool) => {
  const next = selectedTools.filter((s) =>
    !(s.providerType === entry.providerType && s.providerId === entry.providerId && s.toolName === entry.toolName)
  );
  handleToolsChange(next);
}, [selectedTools, handleToolsChange]);

const handleRetrySave = useCallback(() => {
  debouncedSave.flush();
  void performSave(selectedTools);
}, [debouncedSave, performSave, selectedTools]);
```

- [ ] **Step 3: Wire the agent props into the ToolsPanel render**

Find the `<ToolsPanel mcp={...} open={...} onClose={...} />` render site and update to:

```tsx
<ToolsPanel
  mcp={...}
  open={...}
  onClose={...}
  agent={agent.appType === 'agent' ? {
    agentId: agent.id,
    selectedTools,
    staleEntries: findStaleSelections({ selections: selectedTools, registry: registryFlatten(allGroups) }),
    saveState,
    onChange: handleToolsChange,
    onRemoveStale: handleRemoveStale,
    onRetrySave: handleRetrySave,
  } : undefined}
/>
```

Add helper imports/utilities:

```ts
import { findStaleSelections } from '@/app/lib/agentTools';

function registryFlatten(groups: ToolGroup[]): SelectedTool[] {
  return groups.flatMap((g) => g.tools.map((t) => ({
    providerType: t.sourceId.startsWith('__') ? 'builtin' as const : 'mcp' as const,
    providerId: t.sourceId.startsWith('__') ? t.sourceId.replaceAll('_', '') : t.sourceId,
    toolName: t.name,
  })));
}
```

- [ ] **Step 4: Run check**

Run: `npm run check -w web`
Expected: clean (or only pre-existing failures).

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/agent-editor/AgentEditor.tsx
git commit -m "feat(web): hoist selectedTools state with debounced save in AgentEditor"
```

---

### Task 20: Surface `selected_tools` and `updated_at` in the agent fetch on the web side

**Files:**
- Modify: `packages/web/app/lib/agentFetcher.ts` (or wherever the agent record is fetched for the editor — verify with grep)

- [ ] **Step 1: Locate the agent fetch site**

Run: `grep -rn "getAgentBySlug\|fetchAgent\|loadAgent" packages/web/app/lib/ packages/web/app/orgs/ 2>/dev/null | grep -v node_modules | head -10`

- [ ] **Step 2: Extend the typed agent shape and SELECT projection**

Add `selectedTools: SelectedTool[]` and `updatedAt: string` to the Agent type used by the editor. Pull both fields from the backend response. (The backend's `executeFetcher` already exposes them; the web's fetch path likely just needs to surface them.)

If the editor reads from a different route (`/agents/by-slug/:slug` for example), confirm that route's response shape includes these fields (verify by hitting `grep` for the route handler in `packages/backend`); if not, extend it to include them.

- [ ] **Step 3: Run check**

Run: `npm run check -w web`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/agentFetcher.ts  # or whatever file(s) you actually modified
git commit -m "feat(web): expose selectedTools + updatedAt on agent fetch"
```

---

## Phase 8: Seeds + verification

### Task 21: Curate `selectedTools` in seed JSON files

**Files:**
- Modify: `packages/web/app/data/*.json` (only seeds whose demos require tools to function)

- [ ] **Step 1: Identify seeds that need tools**

Run: `ls packages/web/app/data/`
Expected: list of JSON files (e.g., `ecommerce.json`, `airline.json`).

For each seed file: open it, check if it's an autonomous agent (`appType === 'agent'`). If yes and the demo needs tools (e.g., it references calendar booking, form filling), add a top-level `selectedTools` array. Otherwise leave it empty.

- [ ] **Step 2: Add `selectedTools` arrays for the demos that need them**

Example pattern for a demo that books appointments:

```json
{
  "id": "...",
  "name": "Medical Receptionist Demo",
  "appType": "agent",
  "selectedTools": [
    { "providerType": "builtin", "providerId": "calendar", "toolName": "check_availability" },
    { "providerType": "builtin", "providerId": "calendar", "toolName": "book_appointment" }
  ]
}
```

- [ ] **Step 3: Verify all seed JSON parses**

Run: `for f in packages/web/app/data/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'));" && echo "$f ok"; done`
Expected: each seed prints `<path> ok`.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/data/
git commit -m "feat(seeds): curate selectedTools for demo agents"
```

---

### Task 22: End-to-end smoke (manual)

**Files:** None.

- [ ] **Step 1: Apply the migration manually**

Tell the user: "Apply migration `20260426100000_agents_selected_tools.sql` before testing." (Do not run automated DB ops.)

- [ ] **Step 2: Start dev servers**

Run: `npm run dev -w packages/web` (in one terminal)
Run: `npm run dev -w packages/backend` (in another)

- [ ] **Step 3: Verify the editor**

In a browser, open an autonomous agent in the editor.
Expected: the ToolsPanel shows checkboxes (initially unchecked); empty hint visible at top of the list when no tools selected; sticky provider headers with tri-state checkboxes.

- [ ] **Step 4: Toggle a tool**

Click a single tool checkbox.
Expected: indicator transitions `idle → saving → saved → idle`. Reload the page; the selection persists.

- [ ] **Step 5: Toggle a provider header**

Click the calendar provider header checkbox.
Expected: all calendar tools become checked; indicator shows save cycle.

- [ ] **Step 6: Workflow mode unchanged**

Open a workflow agent. ToolsPanel renders without checkboxes (read-only).

> **If any of these fail**: do not mark Task 22 complete. File the failure as a follow-up commit.

---

### Task 23: Final `npm run check` from the repo root

**Files:** None.

- [ ] **Step 1: Run the full check**

Run: `npm run check`
Expected: format + lint + typecheck pass for `packages/api`, `packages/backend`, `packages/web`. Pre-existing failures unrelated to this work (e.g., other branches' files) are out of scope — note them for the user but do not fix here.

- [ ] **Step 2: If clean, mark the plan complete**

```bash
git log --oneline -25
```

Expected: 22 commits roughly matching the task order, ready for review or PR.

---

## Self-review checklist

| Spec section | Plan task(s) covering it |
|---|---|
| Migration: `selected_tools jsonb DEFAULT '[]' + CHECK` | Task 1 |
| Shared `SelectedTool` type + builtin constants + `equalsSelectedTool` | Task 2 |
| Zod schema (`SelectedToolSchema`, `PatchSelectedToolsBodySchema`, MAX 100) | Task 3 |
| Agent fetch projection (`selected_tools`, `updated_at`) | Task 4, Task 20 |
| `updateSelectedToolsWithPrecondition` | Task 5 |
| PATCH `/agents/:id/selected-tools` handler | Task 6 |
| Mount route | Task 7 |
| Per-org rate limit (30/min) | Task 8 |
| Server action with discriminated result | Task 10 |
| `agentTools` translation namespace | Task 11 |
| `agentTools` lib (tri-state, toggle, stale, equality) | Task 12 |
| `SaveStateIndicator` component | Task 13 |
| `EmptyToolsHint` component | Task 14 |
| `StaleEntriesGroup` component | Task 15 |
| `ProviderHeader` component | Task 16 |
| `ToolRow` component | Task 17 |
| `ToolsPanel` agent-mode rendering + save indicator | Task 18 |
| AgentEditor: hoist state, 1.5 s debounce, flush-on-unmount, retry, conflict resolution | Task 19 |
| Seed curation | Task 21 |

**Out-of-scope follow-ups (mentioned in spec for sub-projects D / future work — NOT built here):**

- Stale-entry handling in the runtime executor — that's sub-project D. The editor side (StaleEntriesGroup) is in this plan; the runtime side is not.
- The "subtle dot" on the toolbar Tools button when `selectedTools.length === 0`. This requires touching the toolbar/button component, which is outside the agent editor's surface as currently scoped. Add as a small follow-up if quick to land; otherwise defer.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-26-agent-tool-selection.md`.**
