# Agent Runtime Data Fix (MCP + Skills) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `appType==='agent'` executions load their published **MCP servers** and **skills** at runtime — for top-level agents AND agents invoked as sub-agents (each agent keeps its own skills).

**Architecture:** Both bugs are "snapshotted but dropped". MCP rides the runtime graph: surface `graph_data.mcpServers` into `fetched.graph.mcpServers`; the existing pipeline handles the rest (no edge change). Skills ride `agentConfig`: read `graph_data.skills` (top-level via `fetchAgentConfig`, child via `buildConfigFromGraphData`), thread through the edge payload, and feed the already-built `buildSkillTool`/`buildSkillsPromptSuffix` mechanism (progressive disclosure). A shared `parseSnapshotSkills` validates skill rows in both readers.

**Tech Stack:** TypeScript (ESM, NodeNext), Zod, Jest (`NODE_OPTIONS='--experimental-vm-modules'`), Postgres migrations, Deno edge function.

## Global Constraints

- TypeScript strict; `noUncheckedIndexedAccess`; **never `any`**; **never disable ESLint** (limits: 40 lines/fn, 300/file, depth 2 — extract helpers).
- ESM — import paths end in `.js`.
- **Dev-only:** no live agents; no feature flag / blast-radius / republish-runbook needed.
- Resolution stays **agent-wide** (per-tenant is SP4). Do not touch `/simulate-agent` or tenant logic.
- **Do NOT apply/reset any DB** — write the migration file only.
- `McpServerConfigSchema` from `@daviddh/graph-types`; `SkillDefinition` from `@daviddh/llm-graph-runner` (both verified exported).
- Backend tests: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern>`. api tests: `npm run test -w packages/api`. Full check: `npm run check`.
- All runtime files are under `packages/backend/src/routes/execute/` unless noted.

---

## File Structure

- `…/execute/agentRuntimeGraph.ts` **(create)** — `buildAgentRuntimeGraph` + frozen `EMPTY_GRAPH` (MCP).
- `…/execute/snapshotSkills.ts` **(create)** — `parseSnapshotSkills(raw): SkillDefinition[]`, shared by both skill readers.
- `…/execute/executeFetcher.ts` **(modify)** — use `buildAgentRuntimeGraph`; extend `AgentConfig`/`AgentGraphData` with `skills`; read `graph_data.skills`.
- `…/execute/executeCoreHelpers.ts` **(modify)** — `resolveAgentConfig` returns `skills`.
- `…/execute/executeOverrideTypes.ts` **(modify)** — `OverrideAgentConfig.skills?`.
- `…/execute/executeCoreInlineDispatch.ts` **(modify)** — thread `skills` in `childConfigToRecord` + `extractChildConfig`.
- `…/execute/edgeFunctionClient.ts` **(modify)** — `ExecuteAgentParams.skills?`.
- `…/routes/simulateChildResolver.ts` **(modify)** — `ResolvedChildConfig.skills`, `PublishedAgentGraphData.skills`, populate in resolvers.
- `supabase/functions/execute-agent/toolBuilder.ts` **(modify)** — `ExecutePayload.skills?`.
- `supabase/functions/execute-agent/index.ts` **(modify)** — pass `skills` into `executeAgentLoop`.
- `supabase/migrations/20260620000000_agent_publish_mcp_fields.sql` **(create)**.
- `…/execute/executeAgentPath.ts` **(delete)**.
- Test files created alongside as noted per task.

---

## Task 1: `buildAgentRuntimeGraph` helper (MCP)

**Files:** Create `…/execute/agentRuntimeGraph.ts` + `agentRuntimeGraph.test.ts`.

**Interfaces:** Produces `export const EMPTY_GRAPH: RuntimeGraph` (frozen); `export function buildAgentRuntimeGraph(graphData: Record<string, unknown> | null): RuntimeGraph`.

- [ ] **Step 1: Write the failing test** — create `agentRuntimeGraph.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';
import { RuntimeGraphSchema } from '@daviddh/graph-types';

import { EMPTY_GRAPH, buildAgentRuntimeGraph } from './agentRuntimeGraph.js';

const VALID = { id: 'mcp-1', name: 'My MCP', transport: { type: 'http', url: 'https://x.com/mcp' }, enabled: true };

describe('buildAgentRuntimeGraph', () => {
  it('null → EMPTY_GRAPH', () => {
    expect(buildAgentRuntimeGraph(null)).toBe(EMPTY_GRAPH);
  });
  it('no mcpServers → no mcpServers', () => {
    expect(buildAgentRuntimeGraph({ systemPrompt: 'hi' }).mcpServers).toBeUndefined();
  });
  it('valid mcpServers surfaced', () => {
    const g = buildAgentRuntimeGraph({ mcpServers: [VALID] });
    expect(g.startNode).toBe('INITIAL_STEP');
    expect(g.mcpServers?.[0]?.id).toBe('mcp-1');
  });
  it('preserves libraryItemId + variableValues', () => {
    const g = buildAgentRuntimeGraph({
      mcpServers: [{ ...VALID, libraryItemId: 'lib-9', variableValues: { T: { type: 'direct', value: 'a' } } }],
    });
    expect(g.mcpServers?.[0]?.libraryItemId).toBe('lib-9');
    expect(g.mcpServers?.[0]?.variableValues).toEqual({ T: { type: 'direct', value: 'a' } });
  });
  it('drops invalid entries', () => {
    expect(buildAgentRuntimeGraph({ mcpServers: [VALID, { id: 'bad' }] }).mcpServers).toHaveLength(1);
  });
  it('all-invalid → no mcpServers', () => {
    expect(buildAgentRuntimeGraph({ mcpServers: [{ id: 'bad' }] }).mcpServers).toBeUndefined();
  });
  it('EMPTY_GRAPH is frozen and schema-valid', () => {
    expect(Object.isFrozen(EMPTY_GRAPH)).toBe(true);
    expect(RuntimeGraphSchema.safeParse(EMPTY_GRAPH).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest agentRuntimeGraph`): cannot find module.

- [ ] **Step 3: Implement** — create `agentRuntimeGraph.ts`:

```typescript
import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
import { McpServerConfigSchema } from '@daviddh/graph-types';

export const EMPTY_GRAPH: RuntimeGraph = Object.freeze({
  startNode: 'INITIAL_STEP',
  agents: [],
  nodes: [],
  edges: [],
  initialUserMessage: '',
});

function extractMcpServers(graphData: Record<string, unknown>): McpServerConfig[] {
  const raw = graphData.mcpServers;
  if (!Array.isArray(raw)) return [];
  const servers: McpServerConfig[] = [];
  for (const entry of raw) {
    const parsed = McpServerConfigSchema.safeParse(entry);
    if (parsed.success) servers.push(parsed.data);
  }
  return servers;
}

/** Builds the runtime graph for an agent app from its snapshot: frozen EMPTY_GRAPH
 *  plus any valid mcpServers. Never throws. */
export function buildAgentRuntimeGraph(graphData: Record<string, unknown> | null): RuntimeGraph {
  if (graphData === null) return EMPTY_GRAPH;
  const mcpServers = extractMcpServers(graphData);
  if (mcpServers.length === 0) return EMPTY_GRAPH;
  return { ...EMPTY_GRAPH, mcpServers };
}
```

- [ ] **Step 4: Run — expect PASS** (7 tests).
- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/agentRuntimeGraph.ts packages/backend/src/routes/execute/agentRuntimeGraph.test.ts
git commit -m "feat(execute): add buildAgentRuntimeGraph helper for agent MCP servers"
```

---

## Task 2: Wire `buildAgentRuntimeGraph` into `fetchGraphAndKeys`

**Files:** Modify `executeFetcher.ts` (remove local `EMPTY_GRAPH` lines 108-114; change line 176; add import). Create `executeFetcher.test.ts`.

- [ ] **Step 1: Write the failing test** — create `executeFetcher.test.ts`:

```typescript
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const mockGetPublishedGraphData = jest.fn<() => Promise<Record<string, unknown>>>();
const mockGetDecryptedApiKeyValue = jest.fn<() => Promise<string>>();
const mockGetDecryptedEnvVariables =
  jest.fn<() => Promise<{ byName: Record<string, string>; byId: Record<string, string> }>>();

jest.unstable_mockModule('../../db/queries/executionAuthQueries.js', () => ({
  getPublishedGraphData: mockGetPublishedGraphData,
  getDecryptedApiKeyValue: mockGetDecryptedApiKeyValue,
  getDecryptedEnvVariables: mockGetDecryptedEnvVariables,
}));

const { fetchGraphAndKeys } = await import('./executeFetcher.js');

const MCP = { id: 'mcp-1', name: 'My MCP', transport: { type: 'http', url: 'https://x.com/mcp' }, enabled: true };
function appTypeSupabase(appType: string): SupabaseClient {
  const single = jest.fn(async () => ({ data: { app_type: appType } }));
  return { from: jest.fn(() => ({ select: jest.fn(() => ({ eq: jest.fn(() => ({ single })) })) })) } as unknown as SupabaseClient;
}
const P = { agentId: 'a1', version: 2, orgId: 'o1', productionApiKeyId: 'k1' };

describe('fetchGraphAndKeys', () => {
  beforeEach(() => {
    mockGetDecryptedApiKeyValue.mockResolvedValue('api-key');
    mockGetDecryptedEnvVariables.mockResolvedValue({ byName: {}, byId: {} });
  });
  it('agent app-type surfaces mcpServers', async () => {
    mockGetPublishedGraphData.mockResolvedValue({ systemPrompt: 'hi', mcpServers: [MCP] });
    const r = await fetchGraphAndKeys({ supabase: appTypeSupabase('agent'), ...P });
    expect(r.appType).toBe('agent');
    expect(r.graph.mcpServers?.[0]?.id).toBe('mcp-1');
    expect(r.graph.nodes).toEqual([]);
  });
  it('agent without mcpServers → undefined', async () => {
    mockGetPublishedGraphData.mockResolvedValue({ systemPrompt: 'hi' });
    expect((await fetchGraphAndKeys({ supabase: appTypeSupabase('agent'), ...P })).graph.mcpServers).toBeUndefined();
  });
  it('workflow app-type uses full graph validation (regression)', async () => {
    mockGetPublishedGraphData.mockResolvedValue({ startNode: 'INITIAL_STEP', agents: [], nodes: [], edges: [], initialUserMessage: '' });
    const r = await fetchGraphAndKeys({ supabase: appTypeSupabase('workflow'), ...P });
    expect(r.appType).toBe('workflow');
    expect(r.graph.startNode).toBe('INITIAL_STEP');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx jest executeFetcher`): first test, `mcpServers` undefined.

- [ ] **Step 3: Implement** in `executeFetcher.ts`:
  - (a) after line 17 add: `import { buildAgentRuntimeGraph } from './agentRuntimeGraph.js';`
  - (b) delete the local `EMPTY_GRAPH` (lines 108-114). Do **not** import `EMPTY_GRAPH` here — nothing else references it; an unused import fails lint.
  - (c) line 176 → `const graph = appType === 'agent' ? buildAgentRuntimeGraph(graphData) : ensureGraphData(graphData);`

- [ ] **Step 4: Run — expect PASS** (3 tests).
- [ ] **Step 5: `npm run check`** — expect pass.
- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/execute/executeFetcher.ts packages/backend/src/routes/execute/executeFetcher.test.ts
git commit -m "fix(execute): load agent MCP servers from published snapshot at runtime"
```

---

## Task 3: Widen `publish_agent_version_tx` (MCP fields)

**Files:** Create `supabase/migrations/20260620000000_agent_publish_mcp_fields.sql`.

- [ ] **Step 1: Create the migration.** Copy the full `create or replace function public.publish_agent_version_tx(...) … end; $$;` from `supabase/migrations/20260618000000_publish_snapshot_with_locks.sql` (lines 174-285) verbatim, changing **only** the `mcpServers` block. Lead the file with:

```sql
-- Widen publish_agent_version_tx so the agent snapshot's mcpServers carry
-- libraryItemId + variableValues (parity with publish_version_tx). Needed so
-- agent runs resolve {{placeholder}} transports and library/OAuth MCPs.
-- NOTE: this mcpServers jsonb_build_object is duplicated in publish_version_tx
--   (20260618000000). Keep both in sync — SP4 (per-tenant MCP) edits both.
-- (Function body copied verbatim; only the mcpServers block changed.)
```

Change the block from (source ~249-256):

```sql
    'mcpServers', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', m.server_id,
        'name', m.name,
        'transport', jsonb_build_object('type', m.transport_type) || m.transport_config,
        'enabled', m.enabled
      )) from public.graph_mcp_servers m where m.agent_id = p_agent_id),
      '[]'::jsonb
    )
```

to (note the trailing comma after `m.enabled`):

```sql
    'mcpServers', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', m.server_id,
        'name', m.name,
        'transport', jsonb_build_object('type', m.transport_type) || m.transport_config,
        'enabled', m.enabled,
        'libraryItemId', m.library_item_id,
        'variableValues', m.variable_values
      )) from public.graph_mcp_servers m where m.agent_id = p_agent_id),
      '[]'::jsonb
    )
```

Every other line stays identical to source.

- [ ] **Step 2: Verify (no DB apply)** — `git diff --no-index <(sed -n '174,285p' supabase/migrations/20260618000000_publish_snapshot_with_locks.sql) supabase/migrations/20260620000000_agent_publish_mcp_fields.sql || true`. Expected: only the two added keys (+ trailing comma + leading comment) differ.
- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620000000_agent_publish_mcp_fields.sql
git commit -m "feat(db): snapshot libraryItemId+variableValues in agent publish RPC"
```

---

## Task 4: Skills — top-level reader + plumbing types + compile fix

**Files:** Create `snapshotSkills.ts`. Modify `executeFetcher.ts`, `executeCoreHelpers.ts`, `executeOverrideTypes.ts`, `edgeFunctionClient.ts`. Extend `executeFetcher.test.ts`; create `snapshotSkills.test.ts`.

**Interfaces:** `parseSnapshotSkills(raw: unknown): SkillDefinition[]`; `AgentConfig.skills: SkillDefinition[]`; `OverrideAgentConfig.skills?: SkillDefinition[]`; `ExecuteAgentParams.skills?: SkillDefinition[]`.

- [ ] **Step 1: Write failing tests** — create `snapshotSkills.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';
import { parseSnapshotSkills } from './snapshotSkills.js';

describe('parseSnapshotSkills', () => {
  it('parses valid rows and strips extra fields', () => {
    const out = parseSnapshotSkills([{ name: 'r', description: 'd', content: 'c', repoUrl: null, sortOrder: 0 }]);
    expect(out).toEqual([{ name: 'r', description: 'd', content: 'c' }]);
  });
  it('drops invalid rows', () => {
    expect(parseSnapshotSkills([{ name: 'r', description: 'd', content: 'c' }, { name: 'x' }])).toHaveLength(1);
  });
  it('non-array → []', () => {
    expect(parseSnapshotSkills(undefined)).toEqual([]);
  });
});
```

Append to `executeFetcher.test.ts`:

```typescript
describe('fetchAgentConfig skills', () => {
  function versionSupabase(graphData: unknown): SupabaseClient {
    const single = jest.fn(async () => ({ data: { graph_data: graphData } }));
    const eqVersion = jest.fn(() => ({ single }));
    const eqAgent = jest.fn(() => ({ eq: eqVersion }));
    return { from: jest.fn(() => ({ select: jest.fn(() => ({ eq: eqAgent })) })) } as unknown as SupabaseClient;
  }
  it('returns validated skills from graph_data', async () => {
    const { fetchAgentConfig } = await import('./executeFetcher.js');
    const cfg = await fetchAgentConfig(
      versionSupabase({ systemPrompt: 'p', skills: [{ name: 'refund', description: 'd', content: 'x', repoUrl: null, sortOrder: 0 }] }),
      'a1', 2
    );
    expect(cfg.skills).toEqual([{ name: 'refund', description: 'd', content: 'x' }]);
  });
  it('absent skills → []', async () => {
    const { fetchAgentConfig } = await import('./executeFetcher.js');
    expect((await fetchAgentConfig(versionSupabase({ systemPrompt: 'p' }), 'a1', 2)).skills).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx jest snapshotSkills executeFetcher`).

- [ ] **Step 3: Implement.**

Create `snapshotSkills.ts`:

```typescript
import type { SkillDefinition } from '@daviddh/llm-graph-runner';
import { z } from 'zod';

const SkillSnapshotSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
});

/** Validates skill rows from a published snapshot, dropping malformed entries
 *  and stripping non-runtime fields (repoUrl, sortOrder). */
export function parseSnapshotSkills(raw: unknown): SkillDefinition[] {
  if (!Array.isArray(raw)) return [];
  const skills: SkillDefinition[] = [];
  for (const entry of raw) {
    const parsed = SkillSnapshotSchema.safeParse(entry);
    if (parsed.success) skills.push(parsed.data);
  }
  return skills;
}
```

In `executeFetcher.ts`:
  - line 3 → `import type { Message, SelectedTool, SkillDefinition } from '@daviddh/llm-graph-runner';`
  - add `import { parseSnapshotSkills } from './snapshotSkills.js';` near other imports.
  - extend `AgentConfig` (lines 40-44): add `skills: SkillDefinition[];`
  - extend `AgentGraphData` (lines 234-238): add `skills?: unknown;` (raw — validated by `parseSnapshotSkills`).
  - both `fetchAgentConfig` returns (lines 264-272): add `skills` —
    - not-agent-graph branch: `return { systemPrompt: '', context: '', maxSteps: null, skills: [] };`
    - main branch: `skills: parseSnapshotSkills(graphData.skills),`

In `executeOverrideTypes.ts`: add to `OverrideAgentConfig`:

```typescript
  skills?: SkillDefinition[];
```

(import `SkillDefinition` type from `@daviddh/llm-graph-runner`.)

In `executeCoreHelpers.ts` `resolveAgentConfig` (lines 40-43), override branch:

```typescript
    const { systemPrompt, context, maxSteps, skills } = overrideAgentConfig;
    return Promise.resolve({ systemPrompt, context, maxSteps, skills: skills ?? [] });
```

In `edgeFunctionClient.ts`: add `SkillDefinition` to the existing `@daviddh/llm-graph-runner` type import, and add to `ExecuteAgentParams` (after line 54): `skills?: SkillDefinition[];`

- [ ] **Step 4: Run — expect PASS** (`npx jest snapshotSkills executeFetcher`).
- [ ] **Step 5: `npm run check`** — expect pass (the `{ ...base, ...fetched.agentConfig }` spread at `executeCoreHelpers.ts:107` now carries `skills`).
- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/execute/snapshotSkills.ts packages/backend/src/routes/execute/snapshotSkills.test.ts packages/backend/src/routes/execute/executeFetcher.ts packages/backend/src/routes/execute/executeFetcher.test.ts packages/backend/src/routes/execute/executeCoreHelpers.ts packages/backend/src/routes/execute/executeOverrideTypes.ts packages/backend/src/routes/execute/edgeFunctionClient.ts
git commit -m "fix(execute): read top-level agent skills from snapshot into AgentConfig"
```

---

## Task 5: Skills — child agents carry their own skills

**Files:** Modify `simulateChildResolver.ts`, `executeCoreInlineDispatch.ts`. Create `simulateChildResolver.test.ts` (or extend existing).

**Interfaces:** `ResolvedChildConfig.skills: SkillDefinition[]`; `extractChildConfig` preserves `skills` into `OverrideAgentConfig`.

- [ ] **Step 1: Write failing tests** — create `simulateChildResolver.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';
import { buildConfigFromGraphData } from './simulateChildResolver.js';

describe('buildConfigFromGraphData skills', () => {
  it("sources the child's own skills from its graph_data", () => {
    const cfg = buildConfigFromGraphData(
      { systemPrompt: 's', skills: [{ name: 'y', description: 'd', content: 'c', repoUrl: null, sortOrder: 0 }] },
      {}
    );
    expect(cfg.skills).toEqual([{ name: 'y', description: 'd', content: 'c' }]);
  });
  it('no skills → []', () => {
    expect(buildConfigFromGraphData({ systemPrompt: 's' }, {}).skills).toEqual([]);
  });
});
```

Create/extend an `executeCoreInlineDispatch.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';
import { extractChildConfig } from './executeCoreInlineDispatch.js';

describe('extractChildConfig skills', () => {
  it('preserves skills array into the override', () => {
    const skills = [{ name: 'y', description: 'd', content: 'c' }];
    expect(extractChildConfig({ systemPrompt: 's', skills }).skills).toEqual(skills);
  });
  it('non-array skills → []', () => {
    expect(extractChildConfig({ systemPrompt: 's' }).skills).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx jest simulateChildResolver executeCoreInlineDispatch`): `buildConfigFromGraphData` not exported / `skills` undefined.

- [ ] **Step 3: Implement.**

In `simulateChildResolver.ts`:
  - import `SkillDefinition` (type) from `@daviddh/llm-graph-runner` and `parseSnapshotSkills` from `./execute/snapshotSkills.js`.
  - add `skills: SkillDefinition[];` to `ResolvedChildConfig` (after `mcpServers`, line 12).
  - add `skills?: unknown;` to `PublishedAgentGraphData` (line 37-42).
  - **export** `buildConfigFromGraphData` (change `function` → `export function`) and add `skills: parseSnapshotSkills(gd.skills),` to its return (after `mcpServers`).
  - `resolveCreateAgent` return: add `skills: [],` (dynamic agents have no published skills).
  - `resolveInvokeWorkflow` return: add `skills: parseSnapshotSkills(gd.skills),`.

In `executeCoreInlineDispatch.ts`:
  - `childConfigToRecord` (line 37-44): add `skills: config.skills,` to the record.
  - `extractChildConfig` (line 16-24): add `skills: Array.isArray(config.skills) ? (config.skills as SkillDefinition[]) : [],` to the returned `OverrideAgentConfig` (import `SkillDefinition` type).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: `npm run check`** — expect pass.
- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/simulateChildResolver.ts packages/backend/src/routes/simulateChildResolver.test.ts packages/backend/src/routes/execute/executeCoreInlineDispatch.ts packages/backend/src/routes/execute/executeCoreInlineDispatch.test.ts
git commit -m "fix(execute): child agents carry their own published skills"
```

---

## Task 6: Skills — edge function feeds `skills` to the agent loop

**Files:** Modify `supabase/functions/execute-agent/toolBuilder.ts`, `index.ts`.

- [ ] **Step 1: `ExecutePayload.skills`** — in `toolBuilder.ts`, add `SkillDefinition` to the `@daviddh/llm-graph-runner` type import (lines 9-24), and add to `ExecutePayload` (near `selectedTools`, ~line 86): `skills?: SkillDefinition[];`

- [ ] **Step 2: Feed the loop** — in `index.ts`, in the `executeAgentLoop({ ... })` config (lines 190-198), add: `skills: payload.skills,` (alongside `maxSteps`). `AgentLoopConfig.skills` is optional; `agentLoop.ts:199` early-returns on empty, so absent is safe.

- [ ] **Step 3: Verify the edge function compiles.** `npm run typecheck` does NOT cover `supabase/functions` (not in the `tsc` project graph). Run a real Deno check if available:

Run: `cd supabase/functions/execute-agent && deno check index.ts`
Expected: PASS. If `deno` is unavailable in this environment, instead inspect that `ExecutePayload.skills` and `AgentLoopConfig.skills` are both `SkillDefinition[] | undefined` (same type, same package) and that `index.ts` passes `payload.skills` unchanged — type-identity guarantees compatibility; do **not** rely on `npm run typecheck` here (it would falsely pass).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/execute-agent/toolBuilder.ts supabase/functions/execute-agent/index.ts
git commit -m "fix(execute-agent): pass agent skills into the loop config"
```

---

## Task 7: Payoff tests (api package) — prove skills fire and MCP is callable

**Files:** Create `packages/api/src/agentLoop/__tests__/skillsPayoff.test.ts` (adjust dir to match repo convention).

**Interfaces:** consumes `buildSkillTool`, `buildSkillsPromptSuffix` (`skillTool.ts`), `buildSystemMessage` (`agentLoopHelpers.ts`), `buildAgentToolsAtStart` + `composeRegistry` (runner exports).

- [ ] **Step 1: Write the tests** (skills fire + empty produces no header; MCP ref → callable):

```typescript
import { describe, expect, it } from '@jest/globals';
import { buildSkillTool } from '../skillTool.js';
import { buildSystemMessage } from '../agentLoopHelpers.js';

const SKILL = { name: 'refund', description: 'Refund flow', content: 'do X' };
const baseCfg = { systemPrompt: 'sys', context: '', messages: [], apiKey: 'k', modelId: 'm', maxSteps: null };

describe('skills payoff', () => {
  it('non-empty skills add the get_skill_content tool', () => {
    expect(Object.keys(buildSkillTool([SKILL]))).toContain('get_skill_content');
  });
  it('non-empty skills add the "## Available Skills" prompt section', () => {
    const msg = buildSystemMessage({ ...baseCfg, skills: [SKILL] });
    expect(String(msg.content)).toContain('## Available Skills');
    expect(String(msg.content)).toContain('refund');
  });
  it('empty skills do NOT pollute the prompt with a header', () => {
    const msg = buildSystemMessage({ ...baseCfg, skills: [] });
    expect(String(msg.content)).not.toContain('## Available Skills');
  });
});
```

(If `buildSystemMessage` isn't exported, export it from `agentLoopHelpers.ts` — it's a pure function. For the MCP-callable assertion, add a test using `composeRegistry` + `buildAgentToolsAtStart` with a `{providerType:'mcp', providerId:'mcp-1', toolName:'…'}` ref → tool present, and `[]` → none; mirror the existing `buildAgentToolsAtStart.test.ts` setup.)

- [ ] **Step 2: Run — expect FAIL then implement any needed export, then PASS.**

Run: `npm run test -w packages/api`
Expected: PASS (skills fire; empty → no header; MCP ref → callable).

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/agentLoop
git commit -m "test(api): assert skills fire (and empty stays silent) + mcp tool callable"
```

---

## Task 8: Delete dead `executeAgentPath.ts`

- [ ] **Step 1: Confirm no importers** — `grep -rn "executeAgentPath\|routeAgentExecution\|createAgentMcpSession" packages/ supabase/ --include=*.ts | grep -v executeAgentPath.ts` → no output.
- [ ] **Step 2: Delete** — `git rm packages/backend/src/routes/execute/executeAgentPath.ts`
- [ ] **Step 3: `npm run check`** — expect pass.
- [ ] **Step 4: Commit**

```bash
git commit -m "chore(execute): remove dead executeAgentPath.ts (zero callers)"
```

---

## Self-Review

**1. Spec coverage:** A (MCP graph) → T1,T2; B (publish RPC) → T3; C1 (top-level skills) → T4; C2 (override/compile fix) → T4; C3 (child skills, per-agent identity) → T5; C4 (edge feed + empty-no-header) → T6 + T7; D (delete dead code) → T8. Payoff/empty-skills tests → T7. Workflow regression → T2. Scope boundary respected (no tenant/preview changes). ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to". Task 6 Step 3 states the `npm run typecheck` limitation explicitly rather than asserting false confidence. Task 7's "if not exported, export it" is a concrete conditional action, not deferred work. ✓

**3. Type consistency:** `SkillDefinition` (single type, `@daviddh/llm-graph-runner`) flows: `parseSnapshotSkills` → `AgentConfig.skills`/`ResolvedChildConfig.skills` → `OverrideAgentConfig.skills?` → `ExecuteAgentParams.skills?` → `ExecutePayload.skills?` → `AgentLoopConfig.skills`. `AgentConfig.skills` is required (always `[]`-defaulted by `fetchAgentConfig` and the override branch); wire/loop fields are optional (undefined-tolerant) — consistent. `buildAgentRuntimeGraph`/`EMPTY_GRAPH: RuntimeGraph` (T1) consumed in T2. `buildConfigFromGraphData` exported in T5 for its test. ✓
