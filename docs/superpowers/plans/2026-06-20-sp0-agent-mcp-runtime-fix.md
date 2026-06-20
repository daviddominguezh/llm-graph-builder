# Agent MCP Runtime Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `appType==='agent'` executions actually load and run their published MCP servers at runtime (today they silently run with zero MCP tools).

**Architecture:** The published agent snapshot (`agent_versions.graph_data`) already contains `mcpServers`, but the runtime discards them: the agent branch in `fetchGraphAndKeys` uses a bare `EMPTY_GRAPH`. The fix surfaces `graph_data.mcpServers` into the runtime graph for agents, so the existing downstream pipeline (`resolveMcpTransportVariables` → `resolveOAuthForExecution` → edge payload → `buildRegistry`) picks them up unchanged. A migration widens the agent publish RPC so the snapshot carries `libraryItemId`/`variableValues` (needed by the resolver). No edge-function changes.

**Tech Stack:** TypeScript (ESM, NodeNext), Zod (`@daviddh/graph-types`), Jest (`NODE_OPTIONS='--experimental-vm-modules'`), Supabase/Postgres migrations.

## Global Constraints

- TypeScript strict; `noUncheckedIndexedAccess` on; **never use `any`** — explicit types only.
- **Never disable ESLint** (no `eslint-disable`); limits: `max-lines-per-function` 40, `max-lines` 300, `max-depth` 2. Extract helpers, don't compress lines.
- ESM only (`"type": "module"`, NodeNext) — import paths end in `.js`.
- Per-tenant MCP config is **OUT OF SCOPE** here — resolution stays agent-wide (identical to the workflow path today).
- **Do NOT apply or reset any database** — write the migration file only; the user applies it.
- Run the full check after changes: `npm run check`.
- `McpServerConfigSchema` is exported from `@daviddh/graph-types` (verified, `packages/graph-types/src/schemas/index.ts:27`).
- Backend tests run with: `npm run test -w packages/api` is for the api package; backend tests run via `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest`.

---

## File Structure

- `packages/backend/src/routes/execute/agentRuntimeGraph.ts` **(create)** — pure helper `buildAgentRuntimeGraph(graphData)` that returns `EMPTY_GRAPH` extended with validated `mcpServers`. Single responsibility: turn an agent snapshot's `graph_data` into a runtime graph carrying its MCP servers. Exported `EMPTY_GRAPH` moves here so both the helper and `fetchGraphAndKeys` share one definition.
- `packages/backend/src/routes/execute/agentRuntimeGraph.test.ts` **(create)** — unit tests for the pure helper.
- `packages/backend/src/routes/execute/executeFetcher.ts` **(modify)** — import the helper; replace the agent branch in `fetchGraphAndKeys` (line 176) to use it; remove the now-duplicated local `EMPTY_GRAPH`.
- `packages/backend/src/routes/execute/executeFetcher.test.ts` **(create)** — integration test that `fetchGraphAndKeys` returns `graph.mcpServers` for agent app-type and leaves the workflow path unchanged.
- `supabase/migrations/20260620000000_agent_publish_mcp_fields.sql` **(create)** — `CREATE OR REPLACE` `publish_agent_version_tx` widening its `mcpServers` snapshot to include `libraryItemId` + `variableValues`.

---

## Task 1: Pure helper — `buildAgentRuntimeGraph`

**Files:**
- Create: `packages/backend/src/routes/execute/agentRuntimeGraph.ts`
- Test: `packages/backend/src/routes/execute/agentRuntimeGraph.test.ts`

**Interfaces:**
- Consumes: `RuntimeGraph`, `McpServerConfig`, `McpServerConfigSchema` from `@daviddh/graph-types`.
- Produces:
  - `export const EMPTY_GRAPH: RuntimeGraph`
  - `export function buildAgentRuntimeGraph(graphData: Record<string, unknown> | null): RuntimeGraph` — returns `EMPTY_GRAPH` when no valid `mcpServers` present; otherwise `{ ...EMPTY_GRAPH, mcpServers }` where `mcpServers` is the subset that passes `McpServerConfigSchema`. Never throws.

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
    expect(graph).toEqual(EMPTY_GRAPH);
    expect(graph.mcpServers).toBeUndefined();
  });

  it('returns EMPTY_GRAPH when graphData has no mcpServers', () => {
    const graph = buildAgentRuntimeGraph({ systemPrompt: 'hi' });
    expect(graph.mcpServers).toBeUndefined();
  });

  it('surfaces valid mcpServers from graphData onto the empty graph', () => {
    const graph = buildAgentRuntimeGraph({ mcpServers: [VALID_SERVER] });
    expect(graph.startNode).toBe('INITIAL_STEP');
    expect(graph.mcpServers).toHaveLength(1);
    expect(graph.mcpServers?.[0]?.id).toBe('mcp-1');
  });

  it('preserves libraryItemId and variableValues when present', () => {
    const server = {
      ...VALID_SERVER,
      libraryItemId: 'lib-9',
      variableValues: { TOKEN: { type: 'direct', value: 'abc' } },
    };
    const graph = buildAgentRuntimeGraph({ mcpServers: [server] });
    expect(graph.mcpServers?.[0]?.libraryItemId).toBe('lib-9');
    expect(graph.mcpServers?.[0]?.variableValues).toEqual({ TOKEN: { type: 'direct', value: 'abc' } });
  });

  it('drops invalid mcpServers entries rather than throwing', () => {
    const graph = buildAgentRuntimeGraph({ mcpServers: [VALID_SERVER, { id: 'bad' }] });
    expect(graph.mcpServers).toHaveLength(1);
    expect(graph.mcpServers?.[0]?.id).toBe('mcp-1');
  });

  it('omits mcpServers entirely when none are valid', () => {
    const graph = buildAgentRuntimeGraph({ mcpServers: [{ id: 'bad' }] });
    expect(graph.mcpServers).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest agentRuntimeGraph -t buildAgentRuntimeGraph`
Expected: FAIL — cannot find module `./agentRuntimeGraph.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/backend/src/routes/execute/agentRuntimeGraph.ts`:

```typescript
import type { McpServerConfig, RuntimeGraph } from '@daviddh/graph-types';
import { McpServerConfigSchema } from '@daviddh/graph-types';

export const EMPTY_GRAPH: RuntimeGraph = {
  startNode: 'INITIAL_STEP',
  agents: [],
  nodes: [],
  edges: [],
  initialUserMessage: '',
};

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
 * Agent graphs have no nodes/edges, but they DO carry mcpServers that the
 * runtime must execute. Returns EMPTY_GRAPH plus any valid mcpServers.
 */
export function buildAgentRuntimeGraph(graphData: Record<string, unknown> | null): RuntimeGraph {
  if (graphData === null) return EMPTY_GRAPH;
  const mcpServers = extractMcpServers(graphData);
  if (mcpServers.length === 0) return EMPTY_GRAPH;
  return { ...EMPTY_GRAPH, mcpServers };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest agentRuntimeGraph -t buildAgentRuntimeGraph`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/execute/agentRuntimeGraph.ts packages/backend/src/routes/execute/agentRuntimeGraph.test.ts
git commit -m "feat(execute): add buildAgentRuntimeGraph helper to surface agent MCP servers"
```

---

## Task 2: Wire the helper into `fetchGraphAndKeys`

**Files:**
- Modify: `packages/backend/src/routes/execute/executeFetcher.ts` (remove local `EMPTY_GRAPH` at lines 108-114; change agent branch at line 176; add import)
- Test: `packages/backend/src/routes/execute/executeFetcher.test.ts` (create)

**Interfaces:**
- Consumes: `buildAgentRuntimeGraph`, `EMPTY_GRAPH` from `./agentRuntimeGraph.js`; existing `getPublishedGraphData`, `fetchAppType`.
- Produces: no signature change to `fetchGraphAndKeys` — its returned `graph.mcpServers` is now populated for agents.

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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest executeFetcher`
Expected: FAIL — `result.graph.mcpServers` is `undefined` in the first test (agent branch still uses bare `EMPTY_GRAPH`).

- [ ] **Step 3: Apply the implementation change**

In `packages/backend/src/routes/execute/executeFetcher.ts`:

(a) Add the import near the other local imports (after line 17):

```typescript
import { EMPTY_GRAPH, buildAgentRuntimeGraph } from './agentRuntimeGraph.js';
```

(b) Delete the local `EMPTY_GRAPH` definition (lines 108-114) — it now lives in `agentRuntimeGraph.ts`.

(c) Change the agent branch in `fetchGraphAndKeys` (line 176) from:

```typescript
  const graph = appType === 'agent' ? EMPTY_GRAPH : ensureGraphData(graphData);
```

to:

```typescript
  const graph = appType === 'agent' ? buildAgentRuntimeGraph(graphData) : ensureGraphData(graphData);
```

(`EMPTY_GRAPH` is still imported because other code in this module / package may reference it; keeping the import avoids an unused-symbol churn if so. If `npm run lint` reports `EMPTY_GRAPH` as unused after this change, drop it from the import to satisfy the linter.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest executeFetcher`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check`
Expected: format, lint, and typecheck all pass. (If lint flags an unused `EMPTY_GRAPH` import, remove it and re-run.)

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
- Consumes: nothing in TS. Changes the shape of `agent_versions.graph_data.mcpServers[]` produced by `publish_agent_version_tx` so the runtime resolver (`resolveMcpTransportVariables`, which reads `variableValues`) and OAuth resolution (which reads `libraryItemId`) work for newly published agent versions.

- [ ] **Step 1: Create the migration**

The current `publish_agent_version_tx` is defined in `supabase/migrations/20260618000000_publish_snapshot_with_locks.sql` (lines 174-284). Copy that entire `create or replace function public.publish_agent_version_tx(...) ... end; $$;` definition verbatim into the new migration file, changing **only** the `mcpServers` `jsonb_build_object` so it matches the workflow RPC.

Create `supabase/migrations/20260620000000_agent_publish_mcp_fields.sql` with a leading comment, then the full copied function. The single content change inside that copied function is this block —

Before (current, lines ~249-256 of the source migration):

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

After (add the two fields, matching `publish_version_tx`):

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

Begin the file with:

```sql
-- Widen publish_agent_version_tx so the agent snapshot's mcpServers carry
-- libraryItemId + variableValues (parity with publish_version_tx). Required so
-- agent-type runs can resolve {{placeholder}} transports and library/OAuth MCPs.
-- (Function body copied from 20260618000000_publish_snapshot_with_locks.sql;
--  only the mcpServers jsonb_build_object changed.)
```

Leave every other line of the function (signature, `language plpgsql`, `security definer`, the `selected_tools` / store-binding logic, version increment, key promotion) **identical** to the source — only the two new keys are added.

- [ ] **Step 2: Verify the migration is well-formed (no DB apply)**

Per project policy, do **not** apply or reset the database. Confirm by inspection:
- The file contains exactly one `create or replace function public.publish_agent_version_tx`.
- The `mcpServers` block now includes `'libraryItemId', m.library_item_id` and `'variableValues', m.variable_values`.
- No other line differs from the source definition.

Run a quick textual diff of just the function bodies to confirm the only change is the two added lines:

```bash
git diff --no-index <(sed -n '174,284p' supabase/migrations/20260618000000_publish_snapshot_with_locks.sql) supabase/migrations/20260620000000_agent_publish_mcp_fields.sql || true
```

Expected: the only added lines are `'libraryItemId', m.library_item_id,` and `'variableValues', m.variable_values` (plus the leading comment and any trailing-comma adjustment on the `'enabled', m.enabled` line).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620000000_agent_publish_mcp_fields.sql
git commit -m "feat(db): snapshot libraryItemId+variableValues in agent publish RPC"
```

- [ ] **Step 4: Note for the user (manual apply + republish)**

Surface to the user after the plan completes:
- Apply `20260620000000_agent_publish_mcp_fields.sql` (you apply migrations, not the agent).
- **Existing published agent versions** must be **re-published** to pick up MCP execution (their snapshots predate this fix and lack `mcpServers` values). Newly published versions work automatically.
- **Behavioral change:** agents that already have MCP servers + selected `mcp` tools will now actually invoke them after republish. Mention in release notes.

---

## Self-Review

**1. Spec coverage:**
- Spec §Fix.1 (surface snapshot mcpServers into agent runtime graph) → Tasks 1 + 2. ✓
- Spec §Fix.2 (widen `publish_agent_version_tx` with `libraryItemId`/`variableValues`) → Task 3. ✓
- Spec §Fix.3 (`selected_tools` already carries `mcp` refs — verified, no change) → no task needed; spec states it's sufficient. Regression coverage: the integration assertion that an agent snapshot's `mcpServers` reach `fetched.graph.mcpServers` (Task 2) is the achievable unit; full edge-function tool-callability is integration-level and is left to manual verification per the spec's "republish + behavioral change" note (Task 3 Step 4). ✓
- Spec §Scope boundary (per-tenant out of scope; tenantID hardening deferred to SP4) → respected; no task touches per-tenant config or `/simulate-agent`. ✓
- Spec §Error handling (absent/empty mcpServers → no tools, no crash) → Task 1 tests (null / no mcpServers / all-invalid → `EMPTY_GRAPH`). ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to" — all code is concrete. ✓

**3. Type consistency:** `buildAgentRuntimeGraph(graphData: Record<string, unknown> | null): RuntimeGraph` and `EMPTY_GRAPH: RuntimeGraph` are defined identically in Task 1 and consumed in Task 2. `McpServerConfig`/`McpServerConfigSchema`/`RuntimeGraph` come from `@daviddh/graph-types` (verified exported). `fetchGraphAndKeys` signature unchanged. ✓
