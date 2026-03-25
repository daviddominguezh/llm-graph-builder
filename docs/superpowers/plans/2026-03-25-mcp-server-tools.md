# MCP Server Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 84 MCP server tools inside `packages/backend` that expose full OpenFlow platform control to AI agents, with a testable CSR architecture.

**Architecture:** MCP server mounted at `/mcp` on the Express backend (port 4000). Auth via execution keys (reusing existing `executeAuth` pattern). Three layers: Controller (MCP tool handlers) → Service (business logic wrappers) → Repository (existing `db/queries/` functions). Tests cover the service layer with mocked repositories.

**Tech Stack:** `@modelcontextprotocol/sdk` (StreamableHTTP transport), Express 5, Jest 30 (ESM), TypeScript strict mode, Zod validation.

---

## File Structure

```
packages/backend/
├── jest.config.js                          ← CREATE (Jest ESM config)
├── package.json                            ← MODIFY (add MCP SDK dep + test script)
├── tsconfig.json                           ← MODIFY (add jest types)
├── src/
│   ├── server.ts                           ← MODIFY (mount MCP endpoint)
│   ├── mcp-server/
│   │   ├── server.ts                       ← CREATE (McpServer setup + Express handler)
│   │   ├── auth.ts                         ← CREATE (execution key auth for MCP)
│   │   ├── types.ts                        ← CREATE (ServiceContext, shared types)
│   │   ├── helpers.ts                      ← CREATE (resolveAgentId, error formatting)
│   │   ├── tools/
│   │   │   ├── index.ts                    ← CREATE (registerAllTools)
│   │   │   ├── agentTools.ts               ← CREATE (tools 1-5)
│   │   │   ├── graphReadTools.ts           ← CREATE (tools 6-12)
│   │   │   ├── graphWriteTools.ts          ← CREATE (tools 13-20)
│   │   │   ├── agentDomainTools.ts         ← CREATE (tools 21-24)
│   │   │   ├── validationTools.ts          ← CREATE (tools 64-68)
│   │   │   ├── mcpManagementTools.ts       ← CREATE (tools 25-30)
│   │   │   ├── mcpLibraryTools.ts          ← CREATE (tools 31-32)
│   │   │   ├── mcpToolOpsTools.ts          ← CREATE (tools 33-34)
│   │   │   ├── outputSchemaTools.ts        ← CREATE (tools 35-39)
│   │   │   ├── contextPresetTools.ts       ← CREATE (tools 40-43)
│   │   │   ├── envVariableTools.ts         ← CREATE (tools 44-48)
│   │   │   ├── apiKeyTools.ts              ← CREATE (tools 49-53)
│   │   │   ├── executionKeyTools.ts        ← CREATE (tools 54-57)
│   │   │   ├── publishTools.ts             ← CREATE (tools 58-61)
│   │   │   ├── simulateTools.ts            ← CREATE (tool 62)
│   │   │   ├── promptTools.ts              ← CREATE (tool 63)
│   │   │   ├── modelTools.ts               ← CREATE (tool 69)
│   │   │   ├── agentIntelligenceTools.ts   ← CREATE (tools 70-72, Phase 2)
│   │   │   ├── nodeIntelligenceTools.ts    ← CREATE (tools 73-74, Phase 2)
│   │   │   ├── executionIntelTools.ts      ← CREATE (tools 75-77, Phase 2)
│   │   │   ├── graphConvenienceTools.ts    ← CREATE (tools 78-83, Phase 2)
│   │   │   └── versionIntelTools.ts        ← CREATE (tool 84, Phase 2)
│   │   └── services/
│   │       ├── agentService.ts             ← CREATE
│   │       ├── graphReadService.ts         ← CREATE
│   │       ├── graphWriteService.ts        ← CREATE
│   │       ├── agentDomainService.ts       ← CREATE
│   │       ├── validationService.ts        ← CREATE
│   │       ├── mcpManagementService.ts     ← CREATE
│   │       ├── mcpLibraryService.ts        ← CREATE
│   │       ├── mcpToolService.ts           ← CREATE
│   │       ├── outputSchemaService.ts      ← CREATE
│   │       ├── contextPresetService.ts     ← CREATE
│   │       ├── envVariableService.ts       ← CREATE
│   │       ├── apiKeyService.ts            ← CREATE
│   │       ├── executionKeyService.ts      ← CREATE
│   │       ├── publishService.ts           ← CREATE
│   │       ├── simulateService.ts          ← CREATE
│   │       ├── promptService.ts            ← CREATE
│   │       ├── modelService.ts             ← CREATE
│   │       ├── agentIntelligenceService.ts ← CREATE
│   │       ├── nodeIntelligenceService.ts  ← CREATE
│   │       ├── executionIntelService.ts    ← CREATE
│   │       ├── graphConvenienceService.ts  ← CREATE
│   │       └── versionIntelService.ts      ← CREATE
│   └── mcp-server/__tests__/
│       ├── auth.test.ts                    ← CREATE
│       ├── agentService.test.ts            ← CREATE
│       ├── graphReadService.test.ts        ← CREATE
│       ├── graphWriteService.test.ts       ← CREATE
│       ├── agentDomainService.test.ts      ← CREATE
│       ├── validationService.test.ts       ← CREATE
│       ├── mcpManagementService.test.ts    ← CREATE
│       ├── mcpLibraryService.test.ts       ← CREATE
│       ├── mcpToolService.test.ts          ← CREATE
│       ├── outputSchemaService.test.ts     ← CREATE
│       ├── contextPresetService.test.ts    ← CREATE
│       ├── envVariableService.test.ts      ← CREATE
│       ├── apiKeyService.test.ts           ← CREATE
│       ├── executionKeyService.test.ts     ← CREATE
│       ├── publishService.test.ts          ← CREATE
│       ├── simulateService.test.ts         ← CREATE
│       ├── promptService.test.ts           ← CREATE
│       ├── modelService.test.ts            ← CREATE
│       ├── agentIntelligenceService.test.ts ← CREATE
│       ├── nodeIntelligenceService.test.ts ← CREATE
│       ├── executionIntelService.test.ts   ← CREATE
│       ├── graphConvenienceService.test.ts ← CREATE
│       └── versionIntelService.test.ts     ← CREATE
```

---

## Canonical Patterns

### Pattern A: Service Function

Every service function follows this signature. The service never touches the DB directly — it calls existing query functions from `src/db/queries/`.

```typescript
import type { SupabaseClient } from '../db/queries/operationHelpers.js';

export interface ServiceContext {
  supabase: SupabaseClient;
  orgId: string;
}

// Agent-scoped service function
export async function listNodes(
  ctx: ServiceContext,
  agentId: string,
  filters: { agentDomain?: string; kind?: string; global?: boolean }
): Promise<NodeListItem[]> {
  // 1. Call existing query function(s)
  const graph = await assembleGraph(ctx.supabase, agentId);
  if (graph === null) throw new Error('Agent graph not found');

  // 2. Transform/filter the result
  let nodes = graph.nodes;
  if (filters.agentDomain !== undefined) {
    nodes = nodes.filter((n) => n.agent === filters.agentDomain);
  }
  // ... more filtering

  // 3. Return typed result
  return nodes.map(toNodeListItem);
}
```

### Pattern B: Test File

Tests mock the repository (query functions) and verify service behavior. Use `jest.unstable_mockModule` for ESM.

```typescript
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Mock the repository module BEFORE importing the service
const mockAssembleGraph = jest.fn();
jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

// Dynamic import AFTER mocking
const { listNodes } = await import('../services/graphReadService.js');

const mockCtx = { supabase: {} as SupabaseClient, orgId: 'org-1' };

describe('listNodes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns all nodes when no filters', async () => {
    mockAssembleGraph.mockResolvedValue({
      startNode: 'Start',
      nodes: [
        { id: 'A', text: 'Hello', kind: 'agent', agent: 'greet', global: false },
        { id: 'B', text: 'Bye', kind: 'agent_decision', agent: 'greet', global: false },
      ],
      edges: [], agents: [],
    });

    const result = await listNodes(mockCtx, 'agent-1', {});
    expect(result).toHaveLength(2);
    expect(mockAssembleGraph).toHaveBeenCalledWith(mockCtx.supabase, 'agent-1');
  });

  it('filters by agent domain', async () => {
    mockAssembleGraph.mockResolvedValue({
      startNode: 'Start',
      nodes: [
        { id: 'A', text: 'Hello', kind: 'agent', agent: 'greet', global: false },
        { id: 'B', text: 'Pay', kind: 'agent', agent: 'checkout', global: false },
      ],
      edges: [], agents: [],
    });

    const result = await listNodes(mockCtx, 'agent-1', { agentDomain: 'greet' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('A');
  });

  it('throws when graph not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);
    await expect(listNodes(mockCtx, 'agent-1', {})).rejects.toThrow('Agent graph not found');
  });
});
```

### Pattern C: Tool Registration

Tool files are thin controllers that parse MCP params, resolve the agent, call the service, and return the result. They use `server.tool()` from `@modelcontextprotocol/sdk`.

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContext } from '../types.js';
import { resolveAgentId } from '../helpers.js';
import { listNodes } from '../services/graphReadService.js';

export function registerGraphReadTools(
  server: McpServer,
  getContext: () => ServiceContext
): void {
  server.tool(
    'list_nodes',
    'List nodes in an agent graph, optionally filtered by domain, kind, or global flag',
    {
      agent_slug: z.string().describe('Agent slug'),
      agent_domain: z.string().optional().describe('Filter by agent domain key'),
      kind: z.enum(['agent', 'agent_decision']).optional(),
      global: z.boolean().optional(),
    },
    async ({ agent_slug, agent_domain, kind, global: isGlobal }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agent_slug);
      const result = await listNodes(ctx, agentId, {
        agentDomain: agent_domain,
        kind,
        global: isGlobal,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
```

### Pattern D: `resolveAgentId` helper

This helper is called by every agent-scoped tool. It resolves `agent_slug` to `agentId` and validates that the execution key has access to this agent.

```typescript
import { getAgentBySlugAndOrg, validateKeyAgentAccess } from '../../db/queries/executionAuthQueries.js';
import { getAgentsForKey } from '../../db/queries/executionKeyQueries.js';

export async function resolveAgentId(ctx: ServiceContext, agentSlug: string): Promise<string> {
  const agent = await getAgentBySlugAndOrg(ctx.supabase, agentSlug, ctx.orgId);
  if (agent === null) throw new McpError(ErrorCode.InvalidParams, `Agent not found: ${agentSlug}`);

  // Check if key has "all agents" access (no rows in join table = all access)
  if (ctx.keyId !== undefined) {
    const { result } = await getAgentsForKey(ctx.supabase, ctx.keyId);
    const hasAllAccess = result.length === 0;
    if (!hasAllAccess) {
      const hasAccess = await validateKeyAgentAccess(ctx.supabase, ctx.keyId, agent.id);
      if (!hasAccess) throw new McpError(ErrorCode.InvalidParams, `Access denied for agent: ${agentSlug}`);
    }
  }

  return agent.id;
}
```

---

## Tasks

### Task 1: Infrastructure Setup

**Files:**
- Modify: `packages/backend/package.json`
- Create: `packages/backend/jest.config.js`
- Modify: `packages/backend/tsconfig.json`

- [ ] **Step 1: Add MCP SDK dependency and test script**

```bash
cd packages/backend && npm install @modelcontextprotocol/sdk
```

Add to `package.json` scripts:
```json
"test": "NODE_OPTIONS='--experimental-vm-modules' npx jest",
"test:watch": "NODE_OPTIONS='--experimental-vm-modules' npx jest --watch"
```

- [ ] **Step 2: Create Jest config**

Create `packages/backend/jest.config.js`:
```javascript
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { useESM: true, tsconfig: 'tsconfig.json' },
    ],
  },
  testMatch: ['**/src/**/*.test.ts', '**/__tests__/**/*.test.ts'],
  collectCoverage: true,
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
};
```

- [ ] **Step 3: Update tsconfig.json — add jest types**

Add `"jest"` to the `types` array:
```json
"types": ["node", "jest"]
```

- [ ] **Step 4: Create folder structure**

```bash
mkdir -p packages/backend/src/mcp-server/{services,tools,__tests__}
```

- [ ] **Step 5: Verify Jest runs**

```bash
cd packages/backend && npm test -- --passWithNoTests
```

Expected: `No tests found` but exits 0.

- [ ] **Step 6: Create sanity test**

Create `packages/backend/src/mcp-server/__tests__/sanity.test.ts`:
```typescript
import { describe, expect, it } from '@jest/globals';

describe('MCP Server test setup', () => {
  it('runs', () => {
    expect(true).toBe(true);
  });
});
```

Run: `npm test -w packages/backend`
Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/package.json packages/backend/jest.config.js \
  packages/backend/tsconfig.json packages/backend/src/mcp-server/
git commit -m "feat(mcp-server): infrastructure setup — Jest, MCP SDK, folder structure"
```

---

### Task 2: MCP Auth Module

**Files:**
- Create: `packages/backend/src/mcp-server/types.ts`
- Create: `packages/backend/src/mcp-server/auth.ts`
- Create: `packages/backend/src/mcp-server/__tests__/auth.test.ts`

- [ ] **Step 1: Create shared types**

Create `packages/backend/src/mcp-server/types.ts`:
```typescript
import type { SupabaseClient } from '../db/queries/operationHelpers.js';

export interface ServiceContext {
  supabase: SupabaseClient;
  orgId: string;
  keyId: string;
}
```

- [ ] **Step 2: Write auth tests**

Create `packages/backend/src/mcp-server/__tests__/auth.test.ts`:

Test cases:
- `authenticateMcpKey` returns `{ orgId, keyId, supabase }` when key is valid
- `authenticateMcpKey` throws when no token provided
- `authenticateMcpKey` throws when key hash not found in DB
- `authenticateMcpKey` throws when key is expired

Mock `executionAuthQueries.validateExecutionKey` and `executionAuthQueries.createServiceClient`.

- [ ] **Step 3: Run tests — verify they fail**

```bash
npm test -w packages/backend -- --testPathPattern=auth
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement auth module**

Create `packages/backend/src/mcp-server/auth.ts`:

The auth function:
1. Takes the `Authorization` header value
2. Strips `Bearer ` prefix
3. Hashes the token with SHA-256
4. Calls `validateExecutionKey` from `executionAuthQueries`
5. Calls `updateKeyLastUsed` (fire-and-forget)
6. Returns `ServiceContext { supabase, orgId, keyId }`

Reuses: `createServiceClient`, `validateExecutionKey`, `updateKeyLastUsed` from `../../db/queries/executionAuthQueries.js`.

The hashing function (`createHash('sha256').update(token).digest('hex')`) is duplicated from `executeAuth.ts`. Refactor: extract `hashToken` to a shared util (`src/utils/hashToken.ts`) and import it in both places.

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -w packages/backend -- --testPathPattern=auth
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): auth module — execution key validation for MCP"
```

---

### Task 3: MCP Server Core + Helpers + Express Integration

**Files:**
- Create: `packages/backend/src/mcp-server/helpers.ts`
- Create: `packages/backend/src/mcp-server/server.ts`
- Create: `packages/backend/src/mcp-server/tools/index.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Create helpers module**

Create `packages/backend/src/mcp-server/helpers.ts`:

Contains:
- `resolveAgentId(ctx, agentSlug)` — resolves slug to agent UUID, validates key access (Pattern D above). Uses `getAgentBySlugAndOrg` + `getAgentsForKey` + `validateKeyAgentAccess`.
- `formatError(err)` — extracts error message string.
- `textResult(data)` — returns `{ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }`.

- [ ] **Step 2: Create tools index (empty for now)**

Create `packages/backend/src/mcp-server/tools/index.ts`:
```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContext } from '../types.js';

export function registerAllTools(
  server: McpServer,
  getContext: () => ServiceContext
): void {
  // Tool registrations will be added here as each category is implemented
  void server;
  void getContext;
}
```

- [ ] **Step 3: Create MCP server module**

Create `packages/backend/src/mcp-server/server.ts`:

Uses `@modelcontextprotocol/sdk`:
- `McpServer` with `StreamableHTTPServerTransport`
- Creates the server with `name: 'openflow'`, `version: '1.0.0'`
- Exports an Express request handler `handleMcpRequest(req, res)` that:
  1. Calls `authenticateMcpKey(req.headers.authorization)` to get `ServiceContext`
  2. Creates `StreamableHTTPServerTransport` for the request
  3. Connects transport to server
  4. On auth failure → 403 JSON response

Reference: `@modelcontextprotocol/sdk` docs for `StreamableHTTPServerTransport` usage with Express.

- [ ] **Step 4: Mount in Express**

Modify `packages/backend/src/server.ts`:

Add import:
```typescript
import { handleMcpRequest } from './mcp-server/server.js';
```

Add route before the authenticated routes block:
```typescript
app.post('/mcp', handleMcpRequest);
app.get('/mcp', handleMcpRequest);
app.delete('/mcp', handleMcpRequest);
```

Note: MCP StreamableHTTP uses POST for messages, GET for SSE stream, DELETE for session termination.

- [ ] **Step 5: Verify typecheck passes**

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): MCP server core with StreamableHTTP transport and Express mount"
```

---

### Task 4: Agent Service (tools 1-5) — CANONICAL PATTERN

This task is the full canonical implementation. All subsequent tasks follow this exact pattern.

**Files:**
- Create: `packages/backend/src/mcp-server/services/agentService.ts`
- Create: `packages/backend/src/mcp-server/__tests__/agentService.test.ts`
- Create: `packages/backend/src/mcp-server/tools/agentTools.ts`
- Modify: `packages/backend/src/mcp-server/tools/index.ts`

#### Service: `agentService.ts`

**Tool → Query function mapping:**

| Tool | Service function | Query functions called |
|------|-----------------|----------------------|
| `list_agents` | `listAgents(ctx, search?)` | `agentQueries.getAgentsByOrg(supabase, orgId)` |
| `create_agent` | `createAgent(ctx, name, description)` | `slugQueries.generateSlug(name)` → `slugQueries.findUniqueSlug(supabase, slug, 'agents')` → `agentQueries.insertAgent(supabase, { org_id, name, slug, description })` |
| `get_agent` | `getAgent(ctx, agentSlug)` | `agentQueries.getAgentBySlug(supabase, slug)` |
| `update_agent` | `updateAgent(ctx, agentSlug, fields)` | `agentQueries.getAgentBySlug` then update via supabase directly (or add a new query if needed) |
| `delete_agent` | `deleteAgent(ctx, agentSlug)` | `agentQueries.getAgentBySlug` → `agentQueries.deleteAgent(supabase, agentId)` |

- [ ] **Step 1: Write failing tests for `listAgents`**

Test file: `packages/backend/src/mcp-server/__tests__/agentService.test.ts`

Mock `../../db/queries/agentQueries.js` using `jest.unstable_mockModule`.

Tests:
- Returns formatted agent list when query succeeds
- Returns empty array when org has no agents
- Filters by search term (substring match on name/slug)
- Throws when query returns error

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -w packages/backend -- --testPathPattern=agentService
```

- [ ] **Step 3: Implement `agentService.ts`**

Follow Pattern A. Each function:
1. Calls the existing query function
2. Handles `{ result, error }` return pattern — throws on error
3. Transforms to the MCP tool's return type

- [ ] **Step 4: Write tests for `createAgent`, `getAgent`, `deleteAgent`**

Add to the same test file. Mock `slugQueries.generateSlug`, `slugQueries.findUniqueSlug`, `agentQueries.insertAgent`, etc.

- [ ] **Step 5: Implement remaining service functions**

- [ ] **Step 6: Run all tests — verify they pass**

```bash
npm test -w packages/backend -- --testPathPattern=agentService
```

- [ ] **Step 7: Create tool registrations**

Create `packages/backend/src/mcp-server/tools/agentTools.ts`:

Register 5 tools using `server.tool()` with Zod schemas (Pattern C). Each tool:
1. Calls `getContext()` to get `ServiceContext`
2. Calls the service function
3. Returns `textResult(data)`

- [ ] **Step 8: Wire into `tools/index.ts`**

Add `registerAgentTools(server, getContext)` call inside `registerAllTools`.

- [ ] **Step 9: Run typecheck + tests**

```bash
npm run typecheck -w packages/backend && npm test -w packages/backend
```

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(mcp-server): agent management tools (list, create, get, update, delete)"
```

---

### Task 5: Graph Read Service (tools 6-12)

**Files:**
- Create: `packages/backend/src/mcp-server/services/graphReadService.ts`
- Create: `packages/backend/src/mcp-server/__tests__/graphReadService.test.ts`
- Create: `packages/backend/src/mcp-server/tools/graphReadTools.ts`
- Modify: `packages/backend/src/mcp-server/tools/index.ts`

**Tool → Query function mapping:**

| Tool | Service function | Queries |
|------|-----------------|---------|
| `get_graph_summary` | `getGraphSummary(ctx, agentId)` | `assembleGraph` → compute summary from graph |
| `get_node` | `getNode(ctx, agentId, nodeId)` | `assembleGraph` → find node, count edges |
| `get_edges_from` | `getEdgesFrom(ctx, agentId, nodeId)` | `assembleGraph` → filter edges by `from` |
| `get_edges_to` | `getEdgesTo(ctx, agentId, nodeId)` | `assembleGraph` → filter edges by `to` |
| `list_nodes` | `listNodes(ctx, agentId, filters)` | `assembleGraph` → filter nodes |
| `search_nodes` | `searchNodes(ctx, agentId, query, limit)` | `assembleGraph` → fuzzy match on id/text/description |
| `get_subgraph` | `getSubgraph(ctx, agentId, nodeId, depth)` | `assembleGraph` → BFS from center |

All read tools call `assembleGraph` as the single data source. The service layer handles filtering, searching, and graph traversal.

**Key implementation notes:**
- `get_graph_summary`: Compute `nodeCountByAgent`, `nodeCountByKind`, `contextFlags` (scan all edges for context precondition strings), `warnings` (quick orphan/dead-end check), MCP server list, output schema list, etc.
- `search_nodes`: Simple substring matching on `id`, `text`, `description` — scored by match quality.
- `get_subgraph`: BFS traversal from `nodeId` up to `depth` hops in both directions.

TDD steps: same pattern as Task 4.

- [ ] **Step 1: Write failing tests for all 7 service functions**
- [ ] **Step 2: Run tests — verify they fail**
- [ ] **Step 3: Implement `graphReadService.ts`**
- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Create `graphReadTools.ts` with 7 tool registrations**
- [ ] **Step 6: Wire into `tools/index.ts`**
- [ ] **Step 7: Run typecheck + tests**
- [ ] **Step 8: Commit**

```bash
git commit -m "feat(mcp-server): graph read tools (summary, node, edges, list, search, subgraph)"
```

---

### Task 6: Graph Write Service (tools 13-20)

**Files:**
- Create: `packages/backend/src/mcp-server/services/graphWriteService.ts`
- Create: `packages/backend/src/mcp-server/__tests__/graphWriteService.test.ts`
- Create: `packages/backend/src/mcp-server/tools/graphWriteTools.ts`
- Modify: `packages/backend/src/mcp-server/tools/index.ts`

**Tool → Query function mapping:**

| Tool | Service function | Queries |
|------|-----------------|---------|
| `add_node` | `addNode(ctx, agentId, node)` | `executeOperationsBatch(supabase, agentId, [{ type: 'insertNode', data }])` |
| `update_node` | `updateNode(ctx, agentId, nodeId, fields)` | `executeOperationsBatch(supabase, agentId, [{ type: 'updateNode', data }])` |
| `delete_node` | `deleteNode(ctx, agentId, nodeId)` | `executeOperationsBatch(supabase, agentId, [{ type: 'deleteNode', nodeId }])` |
| `add_edge` | `addEdge(ctx, agentId, edge)` | `executeOperationsBatch(supabase, agentId, [{ type: 'insertEdge', data }])` |
| `update_edge` | `updateEdge(ctx, agentId, from, to, fields)` | `executeOperationsBatch(supabase, agentId, [{ type: 'updateEdge', data }])` |
| `delete_edge` | `deleteEdge(ctx, agentId, from, to)` | `executeOperationsBatch(supabase, agentId, [{ type: 'deleteEdge', from, to }])` |
| `set_start_node` | `setStartNode(ctx, agentId, nodeId)` | `executeOperationsBatch(supabase, agentId, [{ type: 'updateStartNode', startNode }])` |
| `batch_mutate` | `batchMutate(ctx, agentId, ops, validateAfter)` | `executeOperationsBatch(supabase, agentId, mappedOps)` then optionally `assembleGraph` + validation |

**Key notes:**
- All write tools go through `executeOperationsBatch` which provides snapshot-based rollback.
- `batch_mutate` maps the MCP tool's `MutationOp` format to the backend's `Operation` format (from `@daviddh/graph-types`).
- After writes, re-read the graph via `assembleGraph` to return the updated state.
- The `batch_mutate` tool's `validate_after` option runs the validation service on the result.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run tests — verify they fail**
- [ ] **Step 3: Implement `graphWriteService.ts`**
- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Create `graphWriteTools.ts`**
- [ ] **Step 6: Wire into `tools/index.ts`**
- [ ] **Step 7: Run typecheck + tests**
- [ ] **Step 8: Commit**

```bash
git commit -m "feat(mcp-server): graph write tools (add/update/delete node/edge, set_start_node, batch_mutate)"
```

---

### Task 7: Agent Domain Service (tools 21-24)

**Files:**
- Create: `packages/backend/src/mcp-server/services/agentDomainService.ts`
- Create: `packages/backend/src/mcp-server/__tests__/agentDomainService.test.ts`
- Create: `packages/backend/src/mcp-server/tools/agentDomainTools.ts`

**Tool → Query function mapping:**

| Tool | Service function | Queries |
|------|-----------------|---------|
| `list_agent_domains` | `listAgentDomains(ctx, agentId)` | `assembleGraph` → extract `agents` array + count nodes per domain |
| `add_agent_domain` | `addAgentDomain(ctx, agentId, key, description)` | `executeOperationsBatch([{ type: 'insertAgent', data: { agentKey, description } }])` |
| `update_agent_domain` | `updateAgentDomain(ctx, agentId, key, description)` | `executeOperationsBatch([{ type: 'updateAgent', data: { agentKey, description } }])` |
| `delete_agent_domain` | `deleteAgentDomain(ctx, agentId, key)` | Check no nodes reference this domain via `assembleGraph`, then `executeOperationsBatch([{ type: 'deleteAgent', agentKey }])` |

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Implement service**
- [ ] **Step 3: Run tests — verify they pass**
- [ ] **Step 4: Create tools + wire**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mcp-server): agent domain tools (list, add, update, delete)"
```

---

### Task 8: Validation Service (tools 64-68)

**Files:**
- Create: `packages/backend/src/mcp-server/services/validationService.ts`
- Create: `packages/backend/src/mcp-server/__tests__/validationService.test.ts`
- Create: `packages/backend/src/mcp-server/tools/validationTools.ts`

**Tool → Implementation:**

| Tool | Service function | Logic |
|------|-----------------|-------|
| `validate_graph` | `validateGraph(ctx, agentId)` | `assembleGraph` → run violation checks (orphans, dead ends, missing preconditions, etc.) |
| `get_reachability` | `getReachability(ctx, agentId, fromNode, maxDepth)` | `assembleGraph` → BFS from `fromNode` |
| `find_path` | `findPath(ctx, agentId, from, to)` | `assembleGraph` → BFS shortest path |
| `get_dead_ends` | `getDeadEnds(ctx, agentId)` | `assembleGraph` → nodes with no outbound edges that aren't terminals |
| `get_orphans` | `getOrphans(ctx, agentId)` | `assembleGraph` → BFS from startNode, return unreached |

**Key notes:**
- `validateGraph` is the most complex — implement each violation type as a pure function that takes a `Graph` and returns `Violation[]`. This makes testing straightforward.
- BFS/DFS functions are pure graph algorithms operating on `Graph.nodes` and `Graph.edges`.

Violation checkers to implement as pure functions:
- `checkOrphanNodes(graph)` — BFS from startNode
- `checkDeadEnds(graph)` — nodes with no outbound edges and `nextNodeIsUser !== true` and `global !== true`
- `checkMissingPreconditions(graph)` — edges from `agent_decision` nodes must have `agent_decision` preconditions
- `checkUnknownAgents(graph)` — node.agent must be in graph.agents
- `checkDuplicateEdges(graph)` — same from/to/preconditions
- `checkBrokenJumps(graph)` — contextPreconditions.jumpTo must reference existing node
- `checkDanglingSchemas(graph)` — node.outputSchemaId must reference existing schema
- `checkDanglingFallbacks(graph)` — node.fallbackNodeId must reference existing node
- `checkGlobalNodeTools(graph)` — global nodes must have exactly one outbound tool_call edge

- [ ] **Step 1: Write tests for each violation checker (pure functions)**
- [ ] **Step 2: Implement violation checkers**
- [ ] **Step 3: Write tests for BFS/reachability/path-finding**
- [ ] **Step 4: Implement graph traversal functions**
- [ ] **Step 5: Run tests — verify all pass**
- [ ] **Step 6: Create tools + wire**
- [ ] **Step 7: Commit**

```bash
git commit -m "feat(mcp-server): validation & analysis tools (validate, reachability, path, dead ends, orphans)"
```

---

### Task 9: MCP Management Service (tools 25-30)

**Files:**
- Create: `packages/backend/src/mcp-server/services/mcpManagementService.ts`
- Create: `packages/backend/src/mcp-server/__tests__/mcpManagementService.test.ts`
- Create: `packages/backend/src/mcp-server/tools/mcpManagementTools.ts`

**Tool → Query function mapping:**

| Tool | Service function | Queries |
|------|-----------------|---------|
| `list_mcp_servers` | `listMcpServers(ctx, agentId)` | `assembleGraph` → extract `mcpServers` |
| `get_mcp_server` | `getMcpServer(ctx, agentId, serverId)` | `assembleGraph` → find server by id |
| `add_mcp_server` | `addMcpServer(ctx, agentId, server)` | `executeOperationsBatch([{ type: 'insertMcpServer', data }])` |
| `update_mcp_server` | `updateMcpServer(ctx, agentId, serverId, fields)` | `executeOperationsBatch([{ type: 'updateMcpServer', data }])` |
| `remove_mcp_server` | `removeMcpServer(ctx, agentId, serverId)` | `executeOperationsBatch([{ type: 'deleteMcpServer', serverId }])` |
| `install_mcp_from_library` | `installFromLibrary(ctx, agentId, libraryItemId, variableValues)` | `mcpLibraryQueries.getLibraryItemById` → build `McpServerConfig` → `executeOperationsBatch([{ type: 'insertMcpServer', data }])` + `mcpLibraryQueries.incrementInstallations` |

- [ ] **Step 1-5: TDD cycle** (same pattern)
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): MCP server management tools (list, get, add, update, remove, install from library)"
```

---

### Task 10: MCP Library Service (tools 31-32)

**Tool → Query mapping:**

| Tool | Queries |
|------|---------|
| `browse_mcp_library` | `mcpLibraryQueries.browseLibrary(supabase, { q, category, limit, offset })` |
| `get_mcp_library_item` | `mcpLibraryQueries.getLibraryItemById(supabase, id)` |

- [ ] **Step 1-5: TDD cycle**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): MCP library tools (browse, get item)"
```

---

### Task 11: MCP Tool Operations Service (tools 33-34)

**Tool → Implementation:**

| Tool | Implementation |
|------|---------------|
| `discover_mcp_tools` | `assembleGraph` → find server by ID → resolve variables via `getDecryptedEnvVariables` → `connectMcpClient(transport)` → `client.listTools()` → `client.close()` |
| `call_mcp_tool` | Same setup → `tool.execute(args)` → `client.close()` |

Reuses: `mcp/client.ts:connectMcpClient`, `mcp/lifecycle.ts` patterns, `executionAuthQueries.getDecryptedEnvVariables`.

**Key note:** Variable resolution (replacing `{{VAR}}` placeholders in transport config) must reuse the existing `resolveMcpTransportVariables` function from the execute pipeline. If it's not exported, refactor it to be importable.

- [ ] **Step 1-5: TDD cycle**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): MCP tool operation tools (discover, call)"
```

---

### Task 12: Output Schema Service (tools 35-39)

**Tool → Query mapping:**

| Tool | Queries |
|------|---------|
| `list_output_schemas` | `assembleGraph` → extract `outputSchemas` + find which nodes reference each |
| `get_output_schema` | `assembleGraph` → find schema by id |
| `add_output_schema` | `executeOperationsBatch([{ type: 'insertOutputSchema', data }])` |
| `update_output_schema` | `executeOperationsBatch([{ type: 'updateOutputSchema', data }])` |
| `delete_output_schema` | `assembleGraph` (check references) → `executeOperationsBatch([{ type: 'deleteOutputSchema', schemaId }])` |

- [ ] **Step 1-5: TDD cycle**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): output schema tools (list, get, add, update, delete)"
```

---

### Task 13: Context Preset Service (tools 40-43)

**Tool → Query mapping:**

| Tool | Queries |
|------|---------|
| `list_context_presets` | `assembleGraph` → extract context presets (need to add `contextPresets` to graph assembly or read directly from `graph_context_presets` table) |
| `add_context_preset` | `executeOperationsBatch([{ type: 'insertContextPreset', data }])` |
| `update_context_preset` | `executeOperationsBatch([{ type: 'updateContextPreset', data }])` |
| `delete_context_preset` | `executeOperationsBatch([{ type: 'deleteContextPreset', name }])` |

**Note:** Check if `assembleGraph` already includes context presets. If not, add a fetcher for `graph_context_presets` table (this would be a small refactor of `graphQueries.ts`/`graphFetchers.ts`). If context presets are not in the `Graph` type, read them directly from the table.

- [ ] **Step 1-5: TDD cycle**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): context preset tools (list, add, update, delete)"
```

---

### Task 14: Environment Variable Service (tools 44-48)

**Tool → Query mapping:**

| Tool | Queries |
|------|---------|
| `list_env_variables` | `envVariableQueries.getEnvVariablesByOrg(supabase, orgId)` |
| `create_env_variable` | `envVariableQueries.createEnvVariable(supabase, { orgId, name, value, isSecret, userId: '' })` |
| `update_env_variable` | `envVariableQueries.updateEnvVariable(supabase, variableId, updates)` |
| `delete_env_variable` | `envVariableQueries.deleteEnvVariable(supabase, variableId)` |
| `get_env_variable_value` | `envVariableQueries.getEnvVariableValue(supabase, variableId)` |

**Note:** These are org-scoped — no `agent_slug` needed. The `userId` for `createEnvVariable` can be empty string since MCP keys don't have a user context. Check if the RPC requires it — if so, pass a sentinel like `'mcp-api'`.

- [ ] **Step 1-5: TDD cycle**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): environment variable tools (list, create, update, delete, get value)"
```

---

### Task 15: API Key Service (tools 49-53)

**Tool → Query mapping:**

| Tool | Queries |
|------|---------|
| `list_api_keys` | `apiKeyQueries.getApiKeysByOrg(supabase, orgId)` |
| `create_api_key` | `apiKeyQueries.createApiKey(supabase, orgId, name, keyValue)` |
| `delete_api_key` | `apiKeyQueries.deleteApiKey(supabase, keyId)` |
| `set_agent_staging_key` | `resolveAgentId` → `agentQueries.updateStagingKeyId(supabase, agentId, keyId)` |
| `set_agent_production_key` | `resolveAgentId` → `agentQueries.updateProductionKeyId(supabase, agentId, keyId)` |

- [ ] **Step 1-5: TDD cycle**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): API key tools (list, create, delete, set staging/production)"
```

---

### Task 16: Execution Key Service (tools 54-57)

**Tool → Query mapping:**

| Tool | Queries |
|------|---------|
| `list_execution_keys` | `executionKeyQueries.getExecutionKeysByOrg(supabase, orgId)` + for each key: `executionKeyQueries.getAgentsForKey(supabase, keyId)` |
| `create_execution_key` | `executionKeyMutations.createExecutionKey(supabase, { orgId, name, agentIds, expiresAt })` |
| `update_execution_key` | `executionKeyMutations.updateExecutionKeyAgents` and/or `updateExecutionKeyName` |
| `delete_execution_key` | `executionKeyMutations.deleteExecutionKey(supabase, keyId)` |

- [ ] **Step 1-5: TDD cycle**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): execution key tools (list, create, update, delete)"
```

---

### Task 17: Publishing Service (tools 58-61)

**Tool → Query mapping:**

| Tool | Queries |
|------|---------|
| `publish_agent` | `resolveAgentId` → `versionQueries.publishVersion(supabase, agentId)` |
| `list_versions` | `resolveAgentId` → `versionQueries.listVersions(supabase, agentId)` |
| `get_version` | `resolveAgentId` → `versionQueries.getVersionSnapshot(supabase, agentId, version)` |
| `restore_version` | `resolveAgentId` → `versionRestore.restoreVersion(supabase, agentId, version)` |

- [ ] **Step 1-5: TDD cycle**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mcp-server): publishing tools (publish, list versions, get version, restore)"
```

---

### Task 18: Simulation Service (tool 62)

**Files:**
- Create: `packages/backend/src/mcp-server/services/simulateService.ts`
- Create: `packages/backend/src/mcp-server/__tests__/simulateService.test.ts`
- Create: `packages/backend/src/mcp-server/tools/simulateTools.ts`

**Implementation:**

`simulate_agent` is the most complex tool. It must:

1. `resolveAgentId(ctx, agentSlug)` → get agentId
2. `assembleGraph(ctx.supabase, agentId)` → get the draft graph
3. `getAgentBySlug(ctx.supabase, slug)` → get `staging_api_key_id`
4. `getDecryptedApiKeyValue(ctx.supabase, stagingKeyId)` → get API key
5. `getDecryptedEnvVariables(ctx.supabase, ctx.orgId)` → get env vars
6. Resolve MCP transport variables (reuse `resolveMcpTransportVariables` from execute pipeline)
7. `createMcpSession(graph.mcpServers)` → connect MCP servers
8. `executeWithCallbacks(context, messages, currentNode, ...)` → run the agent
9. Collect `NodeProcessedEvent` data into the trace
10. `closeMcpSession(session)` → cleanup
11. Return `SimulationResult` with full trace

**Key note:** This tool calls `@daviddh/llm-graph-runner`'s `executeWithCallbacks` directly (like `simulateHandler.ts` does). It collects all events synchronously into an array instead of streaming.

**Testing:** Mock `assembleGraph`, `getDecryptedApiKeyValue`, `getDecryptedEnvVariables`, `createMcpSession`, `executeWithCallbacks`, `closeMcpSession`. Verify the service correctly wires everything together and returns the expected result shape.

- [ ] **Step 1: Write tests for the simulation flow**
- [ ] **Step 2: Implement `simulateService.ts`**
- [ ] **Step 3: Run tests — verify they pass**
- [ ] **Step 4: Create tool + wire**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mcp-server): simulate_agent tool with full debug trace"
```

---

### Task 19: Prompt Inspection Service (tool 63)

**Implementation:**

`get_node_prompt` must dry-run prompt assembly for a given node. This requires calling functions from `@daviddh/llm-graph-runner`'s state machine module.

Reuses:
- `assembleGraph` → get graph
- `buildNextAgentConfig` from `@daviddh/llm-graph-runner` (stateMachine module) — this is the function that computes routing options, prompt text, output format
- `convertEdgesToStr` — formats edges as numbered options

**Key note:** Check if `buildNextAgentConfig` and `convertEdgesToStr` are exported from `@daviddh/llm-graph-runner`. If not, they need to be exported (small refactor of `packages/api/src/stateMachine/index.ts`).

The service assembles the prompt components and returns them as structured data (system prompt, options, fallback, output format, template variables).

- [ ] **Step 1: Check exports from `@daviddh/llm-graph-runner`, refactor if needed**
- [ ] **Step 2: Write tests**
- [ ] **Step 3: Implement `promptService.ts`**
- [ ] **Step 4: Create tool + wire**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mcp-server): get_node_prompt tool for prompt inspection"
```

---

### Task 20: Models Service (tool 69)

**Implementation:**

`list_available_models` reuses the cached OpenRouter models.

Reuses: `fetchAndCacheModels` / model cache from `src/openrouter/` (the same cache used by `GET /openrouter/models`).

- [ ] **Step 1: Write test**
- [ ] **Step 2: Implement `modelService.ts`**
- [ ] **Step 3: Create tool + wire**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mcp-server): list_available_models tool"
```

---

### Task 21: Agent Intelligence Service (tools 70-72, Phase 2)

**Implementation:**

| Tool | Composed from |
|------|--------------|
| `get_agent_overview` | `getAgent` + `getGraphSummary` + `getAgentHealth` + `listMcpServers` + `listOutputSchemas` + `listVersions` + dashboard `getAgentSummary` |
| `get_agent_health` | `validateGraph` + `getOrphans` + `getDeadEnds` + config checks (staging key? production key? disabled MCP servers? empty domains?) |
| `explain_agent_flow` | `assembleGraph` → walk graph from startNode, group by domain, describe entry/exit points |

These are composition tools — they call other service functions and combine the results.

- [ ] **Step 1: Write tests (mock other service functions)**
- [ ] **Step 2: Implement `agentIntelligenceService.ts`**
- [ ] **Step 3: Create tools + wire**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mcp-server): agent intelligence tools (overview, health, flow explanation)"
```

---

### Task 22: Node Intelligence Service (tools 73-74, Phase 2)

**Implementation:**

| Tool | Composed from |
|------|--------------|
| `get_node_full_context` | `getNode` + `getNodePrompt` + `getEdgesFrom/To` + schema resolution + reachability check |
| `explain_edge` | `assembleGraph` → find edge → generate human-readable explanation from preconditions/context |

- [ ] **Step 1-4: TDD cycle + commit**

```bash
git commit -m "feat(mcp-server): node intelligence tools (full context, explain edge)"
```

---

### Task 23: Execution Intelligence Service (tools 75-77, Phase 2)

**Tool → Query mapping:**

| Tool | Queries |
|------|---------|
| `get_execution_history` | `dashboardQueries.getAgentSummary(supabase, orgId, params)` + `dashboardQueries.getSessionsByAgent(supabase, orgId, agentId, params)` |
| `get_session_detail` | `dashboardQueries.getSessionDetail(supabase, sessionId)` + `dashboardQueries.getExecutionsForSession(supabase, sessionId)` |
| `get_execution_trace` | `dashboardQueries.getNodeVisitsForExecution(supabase, executionId)` |

- [ ] **Step 1-4: TDD cycle + commit**

```bash
git commit -m "feat(mcp-server): execution intelligence tools (history, session detail, trace)"
```

---

### Task 24: Graph Convenience Service (tools 78-83, Phase 2)

**Implementation:**

| Tool | Implementation |
|------|---------------|
| `clone_node` | `assembleGraph` → find source → `executeOperationsBatch([insertNode(copy)])` + optionally clone outbound edges |
| `insert_node_between` | `executeOperationsBatch([deleteEdge, insertNode, insertEdge×2])` — atomic, inherits preconditions |
| `swap_edge_target` | `executeOperationsBatch([deleteEdge(from, oldTo), insertEdge(from, newTo, preservedPreconditions)])` |
| `list_context_flags` | `assembleGraph` → scan all edges for `contextPreconditions.preconditions` → group by flag |
| `get_mcp_tool_usage` | `assembleGraph` → scan tool_call edges → map to MCP servers via `discover` |
| `scaffold_agent_domain` | `executeOperationsBatch` with generated nodes + edges based on `pattern` |

- [ ] **Step 1-4: TDD cycle + commit**

```bash
git commit -m "feat(mcp-server): graph convenience tools (clone, insert between, swap, flags, usage, scaffold)"
```

---

### Task 25: Version Intelligence Service (tool 84, Phase 2)

**Implementation:**

`diff_versions`:
1. Fetch both graphs (`assembleGraph` for draft, `getVersionSnapshot` for published versions)
2. Diff nodes (added/removed/modified by comparing IDs and field values)
3. Diff edges (added/removed/modified)
4. Diff agent domains, MCP servers, output schemas
5. Check start node change
6. Generate summary string

This is a pure comparison function operating on two `Graph` objects.

- [ ] **Step 1-4: TDD cycle + commit**

```bash
git commit -m "feat(mcp-server): diff_versions tool for version comparison"
```

---

### Task 26: Integration + Full Check

**Files:**
- Verify: `packages/backend/src/mcp-server/tools/index.ts` has all 22 `register*Tools` calls
- Verify: `packages/backend/src/server.ts` has `/mcp` route

- [ ] **Step 1: Verify all tools are registered in `tools/index.ts`**

Count tool registrations — should total 84 tools across all register functions.

- [ ] **Step 2: Run full test suite**

```bash
npm test -w packages/backend
```

Expected: All tests pass.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 4: Run full monorepo check**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mcp-server): integration complete — all 84 tools registered and tested"
```

---

## Service → Query Function Reference Table

Complete mapping of every service function to the existing query functions it wraps.

### Org-Scoped Services (no agent resolution needed)

| Service | Function | Existing Query |
|---------|----------|---------------|
| envVariable | `listEnvVariables` | `envVariableQueries.getEnvVariablesByOrg` |
| envVariable | `createEnvVariable` | `envVariableQueries.createEnvVariable` |
| envVariable | `updateEnvVariable` | `envVariableQueries.updateEnvVariable` |
| envVariable | `deleteEnvVariable` | `envVariableQueries.deleteEnvVariable` |
| envVariable | `getEnvVariableValue` | `envVariableQueries.getEnvVariableValue` |
| apiKey | `listApiKeys` | `apiKeyQueries.getApiKeysByOrg` |
| apiKey | `createApiKey` | `apiKeyQueries.createApiKey` |
| apiKey | `deleteApiKey` | `apiKeyQueries.deleteApiKey` |
| executionKey | `listExecutionKeys` | `executionKeyQueries.getExecutionKeysByOrg` + `getAgentsForKey` |
| executionKey | `createExecutionKey` | `executionKeyMutations.createExecutionKey` |
| executionKey | `updateExecutionKey` | `executionKeyMutations.updateExecutionKeyAgents` / `updateExecutionKeyName` |
| executionKey | `deleteExecutionKey` | `executionKeyMutations.deleteExecutionKey` |
| mcpLibrary | `browseLibrary` | `mcpLibraryQueries.browseLibrary` |
| mcpLibrary | `getLibraryItem` | `mcpLibraryQueries.getLibraryItemById` |
| model | `listModels` | `openrouter/modelCache` (cached model list) |

### Agent-Scoped Services (require `resolveAgentId` first)

| Service | Function | Existing Query |
|---------|----------|---------------|
| agent | `listAgents` | `agentQueries.getAgentsByOrg` |
| agent | `createAgent` | `slugQueries.generateSlug` + `findUniqueSlug` + `agentQueries.insertAgent` |
| agent | `getAgent` | `agentQueries.getAgentBySlug` |
| agent | `deleteAgent` | `agentQueries.deleteAgent` |
| apiKey | `setStagingKey` | `agentQueries.updateStagingKeyId` |
| apiKey | `setProductionKey` | `agentQueries.updateProductionKeyId` |
| graphRead | `getGraphSummary` | `graphQueries.assembleGraph` → compute |
| graphRead | `getNode` | `graphQueries.assembleGraph` → find |
| graphRead | `getEdgesFrom/To` | `graphQueries.assembleGraph` → filter |
| graphRead | `listNodes` | `graphQueries.assembleGraph` → filter |
| graphRead | `searchNodes` | `graphQueries.assembleGraph` → search |
| graphRead | `getSubgraph` | `graphQueries.assembleGraph` → BFS |
| graphWrite | `addNode` | `operationExecutor.executeOperationsBatch` |
| graphWrite | `updateNode` | `operationExecutor.executeOperationsBatch` |
| graphWrite | `deleteNode` | `operationExecutor.executeOperationsBatch` |
| graphWrite | `addEdge` | `operationExecutor.executeOperationsBatch` |
| graphWrite | `updateEdge` | `operationExecutor.executeOperationsBatch` |
| graphWrite | `deleteEdge` | `operationExecutor.executeOperationsBatch` |
| graphWrite | `setStartNode` | `operationExecutor.executeOperationsBatch` |
| graphWrite | `batchMutate` | `operationExecutor.executeOperationsBatch` |
| agentDomain | `list/add/update/delete` | `assembleGraph` + `executeOperationsBatch` |
| mcpManagement | `list/get` | `assembleGraph` → extract mcpServers |
| mcpManagement | `add/update/remove` | `executeOperationsBatch` |
| mcpManagement | `installFromLibrary` | `mcpLibraryQueries.getLibraryItemById` + `executeOperationsBatch` + `incrementInstallations` |
| mcpTool | `discover` | `assembleGraph` + resolve vars + `connectMcpClient` + `listTools` |
| mcpTool | `call` | `assembleGraph` + resolve vars + `connectMcpClient` + `tool.execute` |
| outputSchema | `list/get` | `assembleGraph` → extract outputSchemas |
| outputSchema | `add/update/delete` | `executeOperationsBatch` |
| contextPreset | `list/add/update/delete` | `executeOperationsBatch` (or direct table read) |
| validation | `validate` | `assembleGraph` → pure violation checks |
| validation | `reachability/path/deadEnds/orphans` | `assembleGraph` → pure graph algorithms |
| publish | `publish` | `versionQueries.publishVersion` |
| publish | `listVersions` | `versionQueries.listVersions` |
| publish | `getVersion` | `versionQueries.getVersionSnapshot` |
| publish | `restoreVersion` | `versionRestore.restoreVersion` |
| simulate | `simulate` | `assembleGraph` + `getDecryptedApiKeyValue` + `getDecryptedEnvVariables` + `createMcpSession` + `executeWithCallbacks` + `closeMcpSession` |
| prompt | `getNodePrompt` | `assembleGraph` + `buildNextAgentConfig` (from llm-graph-runner) |
| dashboard | `getHistory` | `dashboardQueries.getAgentSummary` + `getSessionsByAgent` |
| dashboard | `getSessionDetail` | `dashboardQueries.getSessionDetail` + `getExecutionsForSession` |
| dashboard | `getTrace` | `dashboardQueries.getNodeVisitsForExecution` |

---

## Potential Refactors Required

During implementation, these existing files may need small refactors to export internal functions:

1. **`src/routes/execute/executeAuth.ts`** — Extract `hashToken` to `src/utils/hashToken.ts` (shared with MCP auth)
2. **`src/routes/execute/executeHelpers.ts`** — If `resolveMcpTransportVariables` is defined here, ensure it's exported for use by `simulateService` and `mcpToolService`
3. **`packages/api/src/stateMachine/index.ts`** — Export `buildNextAgentConfig` and `convertEdgesToStr` for use by `promptService`
4. **`src/db/queries/graphQueries.ts`** — If context presets need to be read for `list_context_presets`, may need to add a fetcher (or read directly from the table in the service)
5. **`src/openrouter/`** — Ensure the model cache/list is importable for `modelService`

These are minimal, focused refactors — just making existing internal functions importable.
