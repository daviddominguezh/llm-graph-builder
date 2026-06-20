# Agent Runtime Data Fix (MCP + Skills) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `appType==='agent'` executions actually load their published **MCP servers** and **skills** at runtime (today both are snapshotted but silently dropped, so agents run with zero MCP tools and zero skills).

**Architecture:** Both bugs are the same shape — `publish_agent_version_tx` snapshots the data into `agent_versions.graph_data`, but the runtime reader drops it. MCP rides on the runtime graph: surface `graph_data.mcpServers` into `fetched.graph.mcpServers` and the existing pipeline (resolve → edge payload → `buildRegistry`) handles it, no edge change. Skills ride on `agentConfig`: read `graph_data.skills` into `AgentConfig`, thread through the edge payload, and feed the already-built `buildSkillTool`/`buildSkillsPromptSuffix` mechanism (progressive disclosure: a prompt menu of name+description + an on-demand `get_skill_content` tool).

**Tech Stack:** TypeScript (ESM, NodeNext), Zod (`@daviddh/graph-types`), Jest (`NODE_OPTIONS='--experimental-vm-modules'`), Supabase/Postgres migrations, Deno edge function (`supabase/functions/execute-agent`).

## Global Constraints

- TypeScript strict; `noUncheckedIndexedAccess`; **never use `any`** — explicit types only.
- **Never disable ESLint**; limits: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2. Extract helpers, don't compress.
- ESM only — import paths end in `.js`.
- **Dev-only:** there are no live agents. No feature flag, no blast-radius mitigation, no republish runbook needed. Re-publishing agents to repopulate snapshots with the widened MCP fields is normal dev flow.
- Resolution stays **agent-wide** — per-tenant is OUT OF SCOPE (SP4). Do not touch `/simulate-agent` or tenant logic.
- **Do NOT apply or reset any database** — write the migration file only; the user applies it.
- `McpServerConfigSchema` and `SkillDefinition` are exported from `@daviddh/graph-types` and `@daviddh/llm-graph-runner` respectively (verified).
- Backend tests: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern>`. Full check: `npm run check`.

---

## File Structure

- `packages/backend/src/routes/execute/agentRuntimeGraph.ts` **(create)** — pure helper `buildAgentRuntimeGraph(graphData)` + frozen `EMPTY_GRAPH`. Turns an agent snapshot's `graph_data` into a runtime graph carrying its MCP servers.
- `packages/backend/src/routes/execute/agentRuntimeGraph.test.ts` **(create)** — unit tests.
- `packages/backend/src/routes/execute/executeFetcher.ts` **(modify)** — use the helper in `fetchGraphAndKeys`; remove the local `EMPTY_GRAPH`; extend `AgentConfig`/`AgentGraphData` with `skills`; read `graph_data.skills` in `fetchAgentConfig`.
- `packages/backend/src/routes/execute/executeFetcher.test.ts` **(create)** — integration tests for `fetchGraphAndKeys` (agent + workflow) and `fetchAgentConfig` (skills).
- `packages/backend/src/routes/execute/edgeFunctionClient.ts` **(modify)** — add `skills?: SkillDefinition[]` to `ExecuteAgentParams`.
- `supabase/functions/execute-agent/toolBuilder.ts` **(modify)** — add `skills?: SkillDefinition[]` to `ExecutePayload`.
- `supabase/functions/execute-agent/index.ts` **(modify)** — pass `skills: payload.skills` into the `executeAgentLoop` config.
- `supabase/migrations/20260620000000_agent_publish_mcp_fields.sql` **(create)** — widen `publish_agent_version_tx` mcpServers fields.
- `packages/backend/src/routes/execute/executeAgentPath.ts` **(delete)** — dead code.

---

## Task 1: Pure helper — `buildAgentRuntimeGraph` (MCP)

**Files:**
- Create: `packages/backend/src/routes/execute/agentRuntimeGraph.ts`
- Test: `packages/backend/src/routes/execute/agentRuntimeGraph.test.ts`

**Interfaces:**
- Consumes: `RuntimeGraph`, `McpServerConfig`, `McpServerConfigSchema` from `@daviddh/graph-types`.
- Produces: `export const EMPTY_GRAPH: RuntimeGraph` (frozen); `export function buildAgentRuntimeGraph(graphData: Record<string, unknown> | null): RuntimeGraph` — returns `EMPTY_GRAPH` when no valid `mcpServers`; otherwise `{ ...EMPTY_GRAPH, mcpServers }` with only schema-valid servers. Never throws.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/routes/execute/agentRuntimeGraph.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';

import { EMPTY_GRAPH, buildAgentRuntimeGraph } from './agentRuntimeGraph.js';

const VALID_SERVER = {
  id: 'mcp-1',
  name: 'My MCP',
  transport: { type: 'http', url: 'https://example.com/mcp' },
  enabled: true,
};

describe('buildAgentRuntimeGraph', () => {
  it('returns EMPTY_GRAPH (no mcpServers) when graphData is null', () => {
    const graph = buildAgentRuntimeGraph(null);
    expect(graph).toBe(EMPTY_GRAPH);
    expect(graph.mcpServers).toBeUndefined();
  });

  it('returns EMPTY_GRAPH when graphData has no mcpServers', () => {
    expect(buildAgentRuntimeGraph({ systemPrompt: 'hi' }).mcpServers).toBeUndefined();
  });

  it('surfaces valid mcpServers onto the empty graph', () => {
    const graph = buildAgentRuntimeGraph({ mcpServers: [VALID_SERVER] });
    expect(graph.startNode).toBe('INITIAL_STEP');
    expect(graph.mcpServers).toHaveLength(1);
    expect(graph.mcpServers?.[0]?.id).toBe('mcp-1');
  });

  it('preserves libraryItemId and variableValues', () => {
    const server = {
      ...VALID_SERVER,
      libraryItemId: 'lib-9',
      variableValues: { TOKEN: { type: 'direct', value: 'abc' } },
    };
    const graph = buildAgentRuntimeGraph({ mcpServers: [server] });
    expect(graph.mcpServers?.[0]?.libraryItemId).toBe('lib-9');
    expect(graph.mcpServers?.[0]?.variableValues).toEqual({ TOKEN: { type: 'direct', value: 'abc' } });
  });

  it('drops invalid entries rather than throwing', () => {
    const graph = buildAgentRuntimeGraph({ mcpServers: [VALID_SERVER, { id: 'bad' }] });
    expect(graph.mcpServers).toHaveLength(1);
  });

  it('omits mcpServers entirely when none are valid', () => {
    expect(buildAgentRuntimeGraph({ mcpServers: [{ id: 'bad' }] }).mcpServers).toBeUndefined();
  });

  it('EMPTY_GRAPH is frozen (cannot be mutated by consumers)', () => {
    expect(Object.isFrozen(EMPTY_GRAPH)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest agentRuntimeGraph`
Expected: FAIL — cannot find module `./agentRuntimeGraph.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/backend/src/routes/execute/agentRuntimeGraph.ts`:

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

/**
 * Builds the runtime graph for an agent-type app from its published snapshot.
 * Agent graphs have no nodes/edges, but they DO carry mcpServers the runtime
 * must execute. Returns the frozen EMPTY_GRAPH when there are none, else a fresh
 * graph object carrying the valid mcpServers.
 */
export function buildAgentRuntimeGraph(graphData: Record<string, unknown> | null): RuntimeGraph {
  if (graphData === null) return EMPTY_GRAPH;
  const mcpServers = extractMcpServers(graphData);
  if (mcpServers.length === 0) return EMPTY_GRAPH;
  return { ...EMPTY_GRAPH, mcpServers };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest agentRuntimeGraph`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/agentRuntimeGraph.ts packages/backend/src/routes/execute/agentRuntimeGraph.test.ts
git commit -m "feat(execute): add buildAgentRuntimeGraph helper for agent MCP servers"
```

---

## Task 2: Wire `buildAgentRuntimeGraph` into `fetchGraphAndKeys`

**Files:**
- Modify: `packages/backend/src/routes/execute/executeFetcher.ts` (remove local `EMPTY_GRAPH` lines 108-114; change line 176; add import)
- Test: `packages/backend/src/routes/execute/executeFetcher.test.ts` (create)

**Interfaces:**
- Consumes: `buildAgentRuntimeGraph` from `./agentRuntimeGraph.js`.
- Produces: no signature change; `fetchGraphAndKeys(...).graph.mcpServers` is now populated for agents.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/routes/execute/executeFetcher.test.ts`:

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

const MCP_SERVER = {
  id: 'mcp-1',
  name: 'My MCP',
  transport: { type: 'http', url: 'https://example.com/mcp' },
  enabled: true,
};

function makeSupabase(appType: string): SupabaseClient {
  const single = jest.fn(async () => ({ data: { app_type: appType } }));
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  return { from } as unknown as SupabaseClient;
}

const PARAMS = { agentId: 'a1', version: 2, orgId: 'o1', productionApiKeyId: 'k1' };

describe('fetchGraphAndKeys', () => {
  beforeEach(() => {
    mockGetDecryptedApiKeyValue.mockResolvedValue('api-key');
    mockGetDecryptedEnvVariables.mockResolvedValue({ byName: {}, byId: {} });
  });

  it('surfaces mcpServers into the runtime graph for agent app-type', async () => {
    mockGetPublishedGraphData.mockResolvedValue({ systemPrompt: 'hi', mcpServers: [MCP_SERVER] });
    const result = await fetchGraphAndKeys({ supabase: makeSupabase('agent'), ...PARAMS });
    expect(result.appType).toBe('agent');
    expect(result.graph.mcpServers).toHaveLength(1);
    expect(result.graph.mcpServers?.[0]?.id).toBe('mcp-1');
    expect(result.graph.nodes).toEqual([]);
  });

  it('returns no mcpServers for an agent snapshot without them', async () => {
    mockGetPublishedGraphData.mockResolvedValue({ systemPrompt: 'hi' });
    const result = await fetchGraphAndKeys({ supabase: makeSupabase('agent'), ...PARAMS });
    expect(result.graph.mcpServers).toBeUndefined();
  });

  it('uses full graph validation for workflow app-type (regression)', async () => {
    mockGetPublishedGraphData.mockResolvedValue({
      startNode: 'INITIAL_STEP',
      agents: [],
      nodes: [],
      edges: [],
      initialUserMessage: '',
    });
    const result = await fetchGraphAndKeys({ supabase: makeSupabase('workflow'), ...PARAMS });
    expect(result.appType).toBe('workflow');
    expect(result.graph.startNode).toBe('INITIAL_STEP');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest executeFetcher`
Expected: FAIL — first test: `result.graph.mcpServers` is `undefined` (agent branch still uses bare `EMPTY_GRAPH`).

- [ ] **Step 3: Apply the implementation change**

In `packages/backend/src/routes/execute/executeFetcher.ts`:

(a) Add the import after line 17:

```typescript
import { buildAgentRuntimeGraph } from './agentRuntimeGraph.js';
```

(b) Delete the local `EMPTY_GRAPH` definition (lines 108-114) — it now lives in `agentRuntimeGraph.ts`. Do **not** import `EMPTY_GRAPH` into this file; nothing else here references it, and an unused import fails lint.

(c) Change line 176 from:

```typescript
  const graph = appType === 'agent' ? EMPTY_GRAPH : ensureGraphData(graphData);
```

to:

```typescript
  const graph = appType === 'agent' ? buildAgentRuntimeGraph(graphData) : ensureGraphData(graphData);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest executeFetcher`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check`
Expected: format, lint, typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/execute/executeFetcher.ts packages/backend/src/routes/execute/executeFetcher.test.ts
git commit -m "fix(execute): load agent MCP servers from published snapshot at runtime"
```

---

## Task 3: Widen the agent publish RPC to snapshot `libraryItemId` + `variableValues`

**Files:**
- Create: `supabase/migrations/20260620000000_agent_publish_mcp_fields.sql`

**Interfaces:**
- Consumes: nothing in TS. Changes `agent_versions.graph_data.mcpServers[]` produced by `publish_agent_version_tx` so the resolver gets `variableValues` and OAuth gets `libraryItemId`.

- [ ] **Step 1: Create the migration**

`publish_agent_version_tx` is last defined in `supabase/migrations/20260618000000_publish_snapshot_with_locks.sql` (lines 174-284). Copy that entire `create or replace function public.publish_agent_version_tx(...) ... end; $$;` definition verbatim into the new file, changing **only** the `mcpServers` block.

Create `supabase/migrations/20260620000000_agent_publish_mcp_fields.sql` starting with:

```sql
-- Widen publish_agent_version_tx so the agent snapshot's mcpServers carry
-- libraryItemId + variableValues (parity with publish_version_tx). Required so
-- agent-type runs can resolve {{placeholder}} transports and library/OAuth MCPs.
-- NOTE: this mcpServers jsonb_build_object is duplicated in publish_version_tx
--   (20260618000000). Keep them in sync — SP4 (per-tenant MCP) will edit both.
-- (Function body copied verbatim from 20260618000000_publish_snapshot_with_locks.sql;
--  only the mcpServers jsonb_build_object changed.)
```

Then the full copied function, with this block changed —

Before (source lines ~249-256):

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

After (note the trailing comma added after `m.enabled`):

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

Every other line of the function (signature, `language plpgsql`, `security definer`, the `selected_tools`/store-binding logic, skills block, version increment, key promotion) stays **identical** to the source.

- [ ] **Step 2: Verify the migration is well-formed (no DB apply)**

Per project policy, do **not** apply or reset the database. Confirm by inspection: exactly one `create or replace function public.publish_agent_version_tx`; the `mcpServers` block now includes `'libraryItemId', m.library_item_id` and `'variableValues', m.variable_values`; no other line differs from the source. Diff the function bodies:

```bash
git diff --no-index <(sed -n '174,284p' supabase/migrations/20260618000000_publish_snapshot_with_locks.sql) supabase/migrations/20260620000000_agent_publish_mcp_fields.sql || true
```

Expected: only added lines are the two new keys (+ the trailing comma on `'enabled', m.enabled` and the leading comment).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620000000_agent_publish_mcp_fields.sql
git commit -m "feat(db): snapshot libraryItemId+variableValues in agent publish RPC"
```

---

## Task 4: Skills — backend reads `graph_data.skills` into `AgentConfig`

**Files:**
- Modify: `packages/backend/src/routes/execute/executeFetcher.ts` (`AgentConfig`, `AgentGraphData`, `fetchAgentConfig`)
- Modify: `packages/backend/src/routes/execute/edgeFunctionClient.ts` (`ExecuteAgentParams`)
- Test: extend `packages/backend/src/routes/execute/executeFetcher.test.ts`

**Interfaces:**
- Consumes: `SkillDefinition` from `@daviddh/llm-graph-runner` (already imported alongside `Message`, `SelectedTool` at `executeFetcher.ts:3`).
- Produces: `AgentConfig.skills: SkillDefinition[]`; `ExecuteAgentParams.skills?: SkillDefinition[]`. `fetchAgentConfig` returns `skills`.

- [ ] **Step 1: Write the failing test (append to executeFetcher.test.ts)**

Add a mock for the `agent_versions` query path and a `fetchAgentConfig` test. Append:

```typescript
describe('fetchAgentConfig skills', () => {
  function makeVersionSupabase(graphData: unknown): SupabaseClient {
    const single = jest.fn(async () => ({ data: { graph_data: graphData } }));
    const eqVersion = jest.fn(() => ({ single }));
    const eqAgent = jest.fn(() => ({ eq: eqVersion }));
    const select = jest.fn(() => ({ eq: eqAgent }));
    const from = jest.fn(() => ({ select }));
    return { from } as unknown as SupabaseClient;
  }

  it('returns skills from graph_data', async () => {
    const { fetchAgentConfig } = await import('./executeFetcher.js');
    const supabase = makeVersionSupabase({
      systemPrompt: 'p',
      skills: [{ name: 'refund', description: 'Refund flow', content: 'do X', repoUrl: null, sortOrder: 0 }],
    });
    const cfg = await fetchAgentConfig(supabase, 'a1', 2);
    expect(cfg.skills).toHaveLength(1);
    expect(cfg.skills[0]?.name).toBe('refund');
    expect(cfg.skills[0]?.content).toBe('do X');
  });

  it('returns empty skills when absent', async () => {
    const { fetchAgentConfig } = await import('./executeFetcher.js');
    const cfg = await fetchAgentConfig(makeVersionSupabase({ systemPrompt: 'p' }), 'a1', 2);
    expect(cfg.skills).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest executeFetcher -t skills`
Expected: FAIL — `cfg.skills` is `undefined` (type error or runtime undefined).

- [ ] **Step 3: Apply the implementation change**

In `packages/backend/src/routes/execute/executeFetcher.ts`:

(a) Add `SkillDefinition` to the existing type import at line 3:

```typescript
import type { Message, SelectedTool, SkillDefinition } from '@daviddh/llm-graph-runner';
```

(b) Extend `AgentConfig` (lines 40-44):

```typescript
export interface AgentConfig {
  systemPrompt: string;
  context: string;
  maxSteps: number | null;
  skills: SkillDefinition[];
}
```

(c) Extend `AgentGraphData` (lines 234-238) and add a skill parser. Replace the interface with:

```typescript
interface AgentGraphData {
  systemPrompt?: string;
  maxSteps?: number | null;
  contextItems?: Array<{ sortOrder?: number; content: string }>;
  skills?: Array<{ name: string; description: string; content: string }>;
}

function toSkillDefinitions(
  skills: Array<{ name: string; description: string; content: string }> | undefined
): SkillDefinition[] {
  if (skills === undefined) return [];
  return skills.map((s) => ({ name: s.name, description: s.description, content: s.content }));
}
```

(d) Update the two `return` paths of `fetchAgentConfig` (lines 264-272) to include `skills`:

```typescript
  if (!isAgentGraphData(graphData)) {
    return { systemPrompt: '', context: '', maxSteps: null, skills: [] };
  }

  return {
    systemPrompt: graphData.systemPrompt ?? '',
    context: flattenContextItems(graphData.contextItems),
    maxSteps: graphData.maxSteps ?? null,
    skills: toSkillDefinitions(graphData.skills),
  };
```

In `packages/backend/src/routes/execute/edgeFunctionClient.ts`:

(e) Add `SkillDefinition` to its imports from `@daviddh/llm-graph-runner` (mirror however `SelectedTool` is imported there), then add to `ExecuteAgentParams` (after line 54):

```typescript
  skills?: SkillDefinition[];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest executeFetcher -t skills`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check`
Expected: pass. (The `{ ...base, ...fetched.agentConfig }` spread in `executeCoreHelpers.ts:107` now carries `skills` into the payload with no further change.)

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/execute/executeFetcher.ts packages/backend/src/routes/execute/edgeFunctionClient.ts packages/backend/src/routes/execute/executeFetcher.test.ts
git commit -m "fix(execute): read agent skills from published snapshot into AgentConfig"
```

---

## Task 5: Skills — edge function feeds `skills` to the agent loop

**Files:**
- Modify: `supabase/functions/execute-agent/toolBuilder.ts` (`ExecutePayload`)
- Modify: `supabase/functions/execute-agent/index.ts` (`executeAgentLoop` config)

**Interfaces:**
- Consumes: `ExecuteAgentParams.skills` (sent as `payload.skills`).
- Produces: `AgentLoopConfig.skills` is populated → the already-wired `buildSkillTool` (`agentLoop.ts:200`) and `buildSkillsPromptSuffix` (`agentLoopHelpers.ts:34`) fire.

- [ ] **Step 1: Add `skills` to `ExecutePayload`**

In `supabase/functions/execute-agent/toolBuilder.ts`, add `SkillDefinition` to the existing type import from `@daviddh/llm-graph-runner` (lines 9-24, where `SelectedTool` is imported), then add to `ExecutePayload` (after line 86, near `selectedTools`):

```typescript
  skills?: SkillDefinition[];
```

- [ ] **Step 2: Pass `skills` into the agent loop config**

In `supabase/functions/execute-agent/index.ts`, in the `executeAgentLoop({ ... })` config object (lines 190-198), add the `skills` field:

```typescript
      systemPrompt: payload.systemPrompt ?? '',
      context: payload.context ?? '',
      messages: payload.messages,
      apiKey: payload.apiKey,
      modelId: payload.modelId,
      maxSteps: payload.maxSteps ?? null,
      skills: payload.skills,
      tools,
      isChildAgent: payload.isChildAgent ?? false,
```

(`AgentLoopConfig.skills` is optional; `agentLoop.ts:199` early-returns when it's `undefined`/empty, so omitting it is safe and providing it activates skills.)

- [ ] **Step 3: Typecheck the edge function**

Run: `npm run typecheck`
Expected: pass — `ExecutePayload.skills` matches `AgentLoopConfig.skills` (both `SkillDefinition[] | undefined`).

- [ ] **Step 4: Verify the loop wiring is exercised (api package)**

The skill mechanism itself (`buildSkillTool` → `get_skill_content`, `buildSkillsPromptSuffix`) lives in `packages/api` and is already wired at `agentLoop.ts:199-201` / `agentLoopHelpers.ts:34`. Confirm existing api tests still pass:

Run: `npm run test -w packages/api`
Expected: pass. (If no test asserts "config.skills produces the get_skill_content tool", that mechanism predates this change and is unchanged; the new code path is the payload→config plumbing, type-checked in Step 3.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/execute-agent/toolBuilder.ts supabase/functions/execute-agent/index.ts
git commit -m "fix(execute-agent): pass agent skills into the loop config"
```

---

## Task 6: Delete dead `executeAgentPath.ts`

**Files:**
- Delete: `packages/backend/src/routes/execute/executeAgentPath.ts`

**Interfaces:** none — the file has zero external importers (`routeAgentExecution`/`createAgentMcpSession` are referenced only within it).

- [ ] **Step 1: Confirm no importers**

Run: `grep -rn "executeAgentPath\|routeAgentExecution\|createAgentMcpSession" packages/ supabase/ --include=*.ts | grep -v executeAgentPath.ts`
Expected: no output (no external references).

- [ ] **Step 2: Delete the file**

```bash
git rm packages/backend/src/routes/execute/executeAgentPath.ts
```

- [ ] **Step 3: Run the full check**

Run: `npm run check`
Expected: pass — nothing references the deleted file.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(execute): remove dead executeAgentPath.ts (zero callers)"
```

---

## Self-Review

**1. Spec coverage:**
- Fix A (MCP into runtime graph) → Tasks 1 + 2. ✓
- Fix B (widen agent publish RPC) → Task 3. ✓
- Fix C (skills: backend read + edge feed, progressive disclosure) → Tasks 4 + 5. ✓
- Fix D (delete dead code) → Task 6. ✓
- Scope boundary (agent-wide resolution; no per-tenant; no `/simulate-agent`) → respected; no task touches tenants/preview. ✓
- Error handling (absent/empty mcpServers+skills → no tools/skills, no crash) → Task 1 tests (null/none/invalid) + Task 4 tests (absent skills → `[]`). ✓
- Testing — workflow regression → Task 2 Step 1 third test. ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to". All code concrete. The Task 5 Step 4 note about possibly-absent api tests states a fact (mechanism predates change) rather than deferring work. ✓

**3. Type consistency:** `buildAgentRuntimeGraph`/`EMPTY_GRAPH: RuntimeGraph` defined in Task 1, consumed in Task 2. `AgentConfig.skills: SkillDefinition[]` (Task 4) flows via the `{...base, ...fetched.agentConfig}` spread (executeCoreHelpers.ts:107, unchanged) into `ExecuteAgentParams.skills?` (Task 4e) → `ExecutePayload.skills?` (Task 5) → `AgentLoopConfig.skills` (Task 5 Step 2). `SkillDefinition` is the single shared type from `@daviddh/llm-graph-runner` throughout. Backend `AgentConfig.skills` is required (`[]` default) while payload/loop fields are optional — consistent because `fetchAgentConfig` always returns an array and the spread copies it; the optional `?` on the wire types matches the loop's `undefined`-tolerant early-return. ✓
