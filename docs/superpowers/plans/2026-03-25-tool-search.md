# Tool Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `search_tools` and `get_tool_schema` to the MCP server so LLMs can discover tools on demand instead of loading all 84 schemas upfront.

**Architecture:** A `ToolCatalogBuilder` collects metadata during tool registration. Each `register*Tools` function receives the builder alongside the McpServer and registers catalog entries. After all tools are registered, the catalog is finalized and passed to `search_tools` / `get_tool_schema`. Search uses multi-field ranked scoring across name, description, category, and parameter metadata.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Zod v4 (`z.toJSONSchema`), Jest (ESM)

---

## File Structure

```
packages/backend/src/mcp-server/
├── services/
│   ├── toolCatalogBuilder.ts    ← CREATE (CatalogEntry type, ToolCatalogBuilder class)
│   └── toolSearchService.ts     ← CREATE (searchTools, getToolSchemas)
├── tools/
│   ├── toolSearchTools.ts       ← CREATE (register search_tools + get_tool_schema)
│   ├── index.ts                 ← MODIFY (add catalog builder param, wire search tools)
│   ├── agentTools.ts            ← MODIFY (add catalog param)
│   ├── agentDomainTools.ts      ← MODIFY
│   ├── graphReadTools.ts        ← MODIFY
│   ├── graphWriteTools.ts       ← MODIFY
│   ├── graphWriteToolsNodes.ts  ← MODIFY
│   ├── graphWriteToolsEdges.ts  ← MODIFY
│   ├── graphWriteToolsBatch.ts  ← MODIFY
│   ├── validationTools.ts       ← MODIFY
│   ├── mcpManagementTools.ts    ← MODIFY
│   ├── mcpLibraryTools.ts       ← MODIFY
│   ├── mcpToolOpsTools.ts       ← MODIFY
│   ├── outputSchemaTools.ts     ← MODIFY
│   ├── contextPresetTools.ts    ← MODIFY
│   ├── envVariableTools.ts      ← MODIFY
│   ├── apiKeyTools.ts           ← MODIFY
│   ├── executionKeyTools.ts     ← MODIFY
│   ├── publishTools.ts          ← MODIFY
│   ├── simulateTools.ts         ← MODIFY
│   ├── promptTools.ts           ← MODIFY
│   ├── modelTools.ts            ← MODIFY
│   ├── agentIntelligenceTools.ts ← MODIFY
│   ├── nodeIntelligenceTools.ts  ← MODIFY
│   ├── executionIntelTools.ts    ← MODIFY
│   ├── graphConvenienceTools.ts  ← MODIFY
│   └── versionIntelTools.ts      ← MODIFY
├── server.ts                     ← MODIFY (create builder, pass through, wire search)
├── __tests__/
│   ├── toolCatalogBuilder.test.ts ← CREATE
│   └── toolSearchService.test.ts  ← CREATE
└── scripts/
    └── test-tool-search.ts        ← CREATE (E2E test script)
```

---

### Task 1: ToolCatalogBuilder + Types

**Files:**
- Create: `packages/backend/src/mcp-server/services/toolCatalogBuilder.ts`
- Create: `packages/backend/src/mcp-server/__tests__/toolCatalogBuilder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/mcp-server/__tests__/toolCatalogBuilder.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from '@jest/globals';

import { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';

describe('ToolCatalogBuilder', () => {
  let builder: ToolCatalogBuilder;

  beforeEach(() => {
    builder = new ToolCatalogBuilder();
  });

  it('registers an entry and builds the catalog', () => {
    builder.register({
      name: 'list_agents',
      description: 'List all agents',
      category: 'agent_management',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Filter query' },
        },
      },
    });

    const catalog = builder.build();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.name).toBe('list_agents');
    expect(catalog[0]?.category).toBe('agent_management');
    expect(catalog[0]?.parameterNames).toEqual(['search']);
    expect(catalog[0]?.parameterDescriptions).toEqual(['Filter query']);
  });

  it('build is idempotent — returns same array on repeated calls', () => {
    builder.register({
      name: 'test_tool',
      description: 'Test',
      category: 'agent_management',
      inputSchema: { type: 'object', properties: {} },
    });
    const first = builder.build();
    const second = builder.build();
    expect(first).toBe(second);
  });

  it('extracts parameter names and descriptions from JSON Schema properties', () => {
    builder.register({
      name: 'add_node',
      description: 'Add a node',
      category: 'graph_write',
      inputSchema: {
        type: 'object',
        properties: {
          agentSlug: { type: 'string', description: 'Agent slug' },
          id: { type: 'string', description: 'Node ID' },
          text: { type: 'string', description: 'Node text' },
        },
      },
    });

    const catalog = builder.build();
    expect(catalog[0]?.parameterNames).toEqual(['agentSlug', 'id', 'text']);
    expect(catalog[0]?.parameterDescriptions).toEqual([
      'Agent slug',
      'Node ID',
      'Node text',
    ]);
  });

  it('handles empty properties gracefully', () => {
    builder.register({
      name: 'no_params',
      description: 'No params',
      category: 'models',
      inputSchema: { type: 'object' },
    });

    const catalog = builder.build();
    expect(catalog[0]?.parameterNames).toEqual([]);
    expect(catalog[0]?.parameterDescriptions).toEqual([]);
  });

  it('silently skips registration after build', () => {
    builder.build();
    builder.register({
      name: 'late_tool',
      description: 'Too late',
      category: 'models',
      inputSchema: { type: 'object' },
    });
    const catalog = builder.build();
    expect(catalog.every((e) => e.name !== 'late_tool')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -w packages/backend -- --testPathPattern=toolCatalogBuilder
```

- [ ] **Step 3: Implement ToolCatalogBuilder**

Create `packages/backend/src/mcp-server/services/toolCatalogBuilder.ts`:

```typescript
export type ToolCategory =
  | 'agent_management'
  | 'graph_read'
  | 'graph_write'
  | 'agent_domain'
  | 'validation'
  | 'mcp_management'
  | 'mcp_library'
  | 'mcp_tool_ops'
  | 'output_schema'
  | 'context_preset'
  | 'env_variable'
  | 'api_key'
  | 'execution_key'
  | 'publishing'
  | 'simulation'
  | 'prompt_inspection'
  | 'models'
  | 'agent_intelligence'
  | 'node_intelligence'
  | 'execution_intelligence'
  | 'graph_convenience'
  | 'version_intelligence';

export interface CatalogEntry {
  name: string;
  description: string;
  category: ToolCategory;
  parameterNames: string[];
  parameterDescriptions: string[];
  inputSchema: Record<string, unknown>;
}

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, { description?: string; [k: string]: unknown }>;
}

interface RegisterInput {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: Record<string, unknown>;
}

function extractParams(schema: Record<string, unknown>): {
  names: string[];
  descriptions: string[];
} {
  const typed = schema as JsonSchemaObject;
  const props = typed.properties ?? {};
  const names = Object.keys(props);
  const descriptions = names.map((n) => {
    const prop = props[n];
    return typeof prop?.description === 'string' ? prop.description : '';
  });
  return { names, descriptions };
}

export class ToolCatalogBuilder {
  private entries: CatalogEntry[] = [];
  private frozen = false;
  private built: CatalogEntry[] | null = null;

  register(input: RegisterInput): void {
    if (this.frozen) return; // silently skip after build (supports per-request re-registration)
    const { names, descriptions } = extractParams(input.inputSchema);
    this.entries.push({
      name: input.name,
      description: input.description,
      category: input.category,
      parameterNames: names,
      parameterDescriptions: descriptions,
      inputSchema: input.inputSchema,
    });
  }

  build(): CatalogEntry[] {
    if (this.built !== null) return this.built;
    this.frozen = true;
    this.built = [...this.entries];
    return this.built;
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -w packages/backend -- --testPathPattern=toolCatalogBuilder
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp-server/services/toolCatalogBuilder.ts \
  packages/backend/src/mcp-server/__tests__/toolCatalogBuilder.test.ts
git commit -m "feat(mcp-server): ToolCatalogBuilder for tool search catalog

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Search Algorithm + Schema Retrieval

**Files:**
- Create: `packages/backend/src/mcp-server/services/toolSearchService.ts`
- Create: `packages/backend/src/mcp-server/__tests__/toolSearchService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/mcp-server/__tests__/toolSearchService.test.ts`:

```typescript
import { describe, expect, it } from '@jest/globals';

import type { CatalogEntry } from '../services/toolCatalogBuilder.js';
import { searchTools, getToolSchemas } from '../services/toolSearchService.js';

const fixture: CatalogEntry[] = [
  {
    name: 'list_agents',
    description: 'List all agents in the organization',
    category: 'agent_management',
    parameterNames: ['search'],
    parameterDescriptions: ['Filter by name or slug substring'],
    inputSchema: { type: 'object', properties: { search: { type: 'string' } } },
  },
  {
    name: 'create_agent',
    description: 'Create a new agent in the organization',
    category: 'agent_management',
    parameterNames: ['name', 'description'],
    parameterDescriptions: ['Agent name', 'Agent description'],
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } },
  },
  {
    name: 'add_node',
    description: 'Create a new node in an agents graph',
    category: 'graph_write',
    parameterNames: ['agentSlug', 'id', 'text', 'kind'],
    parameterDescriptions: ['Agent slug', 'Node ID', 'Node text', 'Node kind'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'validate_graph',
    description: 'Run all violation-detection rules on the graph',
    category: 'validation',
    parameterNames: ['agentSlug'],
    parameterDescriptions: ['Agent slug'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_mcp_servers',
    description: 'List MCP servers configured on an agents graph',
    category: 'mcp_management',
    parameterNames: ['agentSlug'],
    parameterDescriptions: ['Agent slug'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'publish_agent',
    description: 'Publish the current draft as a new version',
    category: 'publishing',
    parameterNames: ['agentSlug'],
    parameterDescriptions: ['Agent slug'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'simulate_agent',
    description: 'Run the agent with messages and get a full debug trace',
    category: 'simulation',
    parameterNames: ['agentSlug', 'messages'],
    parameterDescriptions: ['Agent slug', 'Conversation messages'],
    inputSchema: { type: 'object', properties: {} },
  },
];

describe('searchTools', () => {
  it('exact name match scores highest', () => {
    const results = searchTools(fixture, 'list_agents');
    expect(results[0]?.name).toBe('list_agents');
  });

  it('name-contains match works with underscores as spaces', () => {
    const results = searchTools(fixture, 'add node');
    expect(results[0]?.name).toBe('add_node');
  });

  it('category match works', () => {
    const results = searchTools(fixture, 'validation');
    expect(results[0]?.name).toBe('validate_graph');
  });

  it('description match works', () => {
    const results = searchTools(fixture, 'violation');
    expect(results[0]?.name).toBe('validate_graph');
  });

  it('parameter name match works', () => {
    const results = searchTools(fixture, 'messages');
    expect(results[0]?.name).toBe('simulate_agent');
  });

  it('multi-term query combines scores', () => {
    const results = searchTools(fixture, 'create agent');
    expect(results[0]?.name).toBe('create_agent');
  });

  it('returns max 5 results', () => {
    const results = searchTools(fixture, 'agent');
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('empty query returns empty array', () => {
    const results = searchTools(fixture, '');
    expect(results).toEqual([]);
  });

  it('no-match query returns empty array', () => {
    const results = searchTools(fixture, 'xyznonexistent');
    expect(results).toEqual([]);
  });

  it('results contain name, description, category only', () => {
    const results = searchTools(fixture, 'list_agents');
    expect(results[0]).toEqual({
      name: 'list_agents',
      description: 'List all agents in the organization',
      category: 'agent_management',
    });
    expect(results[0]).not.toHaveProperty('inputSchema');
  });
});

describe('getToolSchemas', () => {
  it('returns schemas for valid names', () => {
    const results = getToolSchemas(fixture, ['list_agents', 'add_node']);
    expect(results).toHaveLength(2);
    expect(results[0]?.name).toBe('list_agents');
    expect(results[0]?.inputSchema).toBeDefined();
    expect(results[1]?.name).toBe('add_node');
  });

  it('silently skips unknown names', () => {
    const results = getToolSchemas(fixture, ['list_agents', 'nonexistent']);
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('list_agents');
  });

  it('returns empty array for empty input', () => {
    const results = getToolSchemas(fixture, []);
    expect(results).toEqual([]);
  });

  it('result includes name, description, category, and inputSchema', () => {
    const results = getToolSchemas(fixture, ['list_agents']);
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).toHaveProperty('description');
    expect(results[0]).toHaveProperty('category');
    expect(results[0]).toHaveProperty('inputSchema');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -w packages/backend -- --testPathPattern=toolSearchService
```

- [ ] **Step 3: Implement search algorithm**

Create `packages/backend/src/mcp-server/services/toolSearchService.ts`:

```typescript
import type { CatalogEntry } from './toolCatalogBuilder.js';

const MAX_RESULTS = 5;
const EXACT_NAME_SCORE = 100;
const NAME_CONTAINS_SCORE = 50;
const CATEGORY_SCORE = 40;
const DESCRIPTION_SCORE = 30;
const PARAM_NAME_SCORE = 20;
const PARAM_DESC_SCORE = 10;
const MIN_SCORE = 0;

export interface SearchResult {
  name: string;
  description: string;
  category: string;
}

export interface SchemaResult {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, unknown>;
}

function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/_/g, ' ');
}

function scoreTermAgainstEntry(term: string, entry: CatalogEntry): number {
  let score = MIN_SCORE;
  const normalizedName = normalizeForSearch(entry.name);
  const normalizedDesc = normalizeForSearch(entry.description);
  const normalizedCategory = normalizeForSearch(entry.category);

  if (normalizedName.includes(term)) score += NAME_CONTAINS_SCORE;
  if (normalizedCategory.includes(term)) score += CATEGORY_SCORE;
  if (normalizedDesc.includes(term)) score += DESCRIPTION_SCORE;

  for (const pName of entry.parameterNames) {
    if (normalizeForSearch(pName).includes(term)) {
      score += PARAM_NAME_SCORE;
      break;
    }
  }

  for (const pDesc of entry.parameterDescriptions) {
    if (normalizeForSearch(pDesc).includes(term)) {
      score += PARAM_DESC_SCORE;
      break;
    }
  }

  return score;
}

function scoreEntry(query: string, entry: CatalogEntry): number {
  const normalizedQuery = normalizeForSearch(query);
  const normalizedName = normalizeForSearch(entry.name);

  // Exact full-name match bonus
  if (normalizedName === normalizedQuery) return EXACT_NAME_SCORE;

  const terms = normalizedQuery.split(/\s+/).filter((t) => t.length > MIN_SCORE);
  let total = MIN_SCORE;
  for (const term of terms) {
    total += scoreTermAgainstEntry(term, entry);
  }
  return total;
}

export function searchTools(catalog: CatalogEntry[], query: string): SearchResult[] {
  if (query.trim().length === MIN_SCORE) return [];

  const scored = catalog
    .map((entry) => ({ entry, score: scoreEntry(query, entry) }))
    .filter((item) => item.score > MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(MIN_SCORE, MAX_RESULTS);

  return scored.map(({ entry }) => ({
    name: entry.name,
    description: entry.description,
    category: entry.category,
  }));
}

export function getToolSchemas(catalog: CatalogEntry[], toolNames: string[]): SchemaResult[] {
  const nameSet = new Set(toolNames);
  return catalog
    .filter((entry) => nameSet.has(entry.name))
    .map((entry) => ({
      name: entry.name,
      description: entry.description,
      category: entry.category,
      inputSchema: entry.inputSchema,
    }));
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -w packages/backend -- --testPathPattern=toolSearchService
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp-server/services/toolSearchService.ts \
  packages/backend/src/mcp-server/__tests__/toolSearchService.test.ts
git commit -m "feat(mcp-server): tool search algorithm with multi-field ranked scoring

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Modify all tool registration files to populate catalog

**Files:**
- Modify: All 22 `tools/*.ts` files listed in File Structure
- Modify: `packages/backend/src/mcp-server/tools/index.ts`

The change to each file is mechanical:

1. Add import: `import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';`
2. Add `catalog: ToolCatalogBuilder` parameter to the exported `register*Tools` function
3. Pass `catalog` to each inner `register*` function
4. After each `server.registerTool(name, { description, inputSchema }, handler)` call, add a `catalog.register(...)` call with the tool's name, description, category, and a JSON Schema derived from the Zod inputSchema

**Converting Zod to JSON Schema:** Each tool's `inputSchema` is a Zod object shape (e.g., `{ search: z.string().optional() }`). Convert to JSON Schema via `z.toJSONSchema(z.object(zodSchema))`.

**IMPORTANT:** To avoid calling `z.toJSONSchema` inside the handler (which runs per-request), compute the JSON Schema once at registration time. Extract the Zod schema into a `const` before `server.registerTool`, convert it, and pass the result to both `server.registerTool` and `catalog.register`.

- [ ] **Step 1: Update `tools/index.ts`**

Change `registerAllTools` signature:

```typescript
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';

export function registerAllTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerAgentTools(server, getContext, catalog);
  registerAgentDomainTools(server, getContext, catalog);
  // ... same for all 22 register calls, adding catalog param
}
```

- [ ] **Step 2: Update `agentTools.ts` as the pattern**

Example transformation for `agentTools.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';
import { resolveAgentId, textResult } from '../helpers.js';
import { listAgents, createAgent, getAgent, updateAgent, deleteAgent } from '../services/agentService.js';

const LIST_AGENTS_SCHEMA = { search: z.string().optional().describe('Filter by name or slug substring') };

function registerListAgents(server: McpServer, getContext: () => ServiceContext, catalog: ToolCatalogBuilder): void {
  server.registerTool(
    'list_agents',
    { description: 'List all agents in the organization', inputSchema: LIST_AGENTS_SCHEMA },
    async ({ search }) => {
      const ctx = getContext();
      const result = await listAgents(ctx, search);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_agents',
    description: 'List all agents in the organization',
    category: 'agent_management',
    inputSchema: z.toJSONSchema(z.object(LIST_AGENTS_SCHEMA)),
  });
}

// ... same pattern for all other tools in this file

export function registerAgentTools(server: McpServer, getContext: () => ServiceContext, catalog: ToolCatalogBuilder): void {
  registerListAgents(server, getContext, catalog);
  registerCreateAgent(server, getContext, catalog);
  registerGetAgent(server, getContext, catalog);
  registerUpdateAgent(server, getContext, catalog);
  registerDeleteAgent(server, getContext, catalog);
}
```

- [ ] **Step 3: Apply the same pattern to ALL remaining 21 tool files**

For each file, the category is:
- `agentTools.ts` → `'agent_management'`
- `agentDomainTools.ts` → `'agent_domain'`
- `graphReadTools.ts` → `'graph_read'`
- `graphWriteTools.ts`, `graphWriteToolsNodes.ts`, `graphWriteToolsEdges.ts`, `graphWriteToolsBatch.ts` → `'graph_write'`
- `validationTools.ts` → `'validation'`
- `mcpManagementTools.ts` → `'mcp_management'`
- `mcpLibraryTools.ts` → `'mcp_library'`
- `mcpToolOpsTools.ts` → `'mcp_tool_ops'`
- `outputSchemaTools.ts` → `'output_schema'`
- `contextPresetTools.ts` → `'context_preset'`
- `envVariableTools.ts` → `'env_variable'`
- `apiKeyTools.ts` → `'api_key'`
- `executionKeyTools.ts` → `'execution_key'`
- `publishTools.ts` → `'publishing'`
- `simulateTools.ts` → `'simulation'`
- `promptTools.ts` → `'prompt_inspection'`
- `modelTools.ts` → `'models'`
- `agentIntelligenceTools.ts` → `'agent_intelligence'`
- `nodeIntelligenceTools.ts` → `'node_intelligence'`
- `executionIntelTools.ts` → `'execution_intelligence'`
- `graphConvenienceTools.ts` → `'graph_convenience'`
- `versionIntelTools.ts` → `'version_intelligence'`

Note: `graphWriteTools.ts` is a barrel that re-exports from `graphWriteToolsNodes.ts`, `graphWriteToolsEdges.ts`, `graphWriteToolsBatch.ts`. Update the barrel to pass `catalog` through.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 5: Run all existing tests — verify nothing breaks**

```bash
npm test -w packages/backend
```

All 314 existing tests must still pass. The catalog parameter is additive — existing test mocks just need to accept the extra parameter (or tests that call register functions directly need updating).

Note: existing tests do NOT call `register*Tools` directly — they test the service layer. So no test changes should be needed.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/mcp-server/tools/
git commit -m "feat(mcp-server): populate tool catalog during registration across all 22 tool files

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Register search_tools + get_tool_schema

**Files:**
- Create: `packages/backend/src/mcp-server/tools/toolSearchTools.ts`

- [ ] **Step 1: Create tool registrations**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { textResult } from '../helpers.js';
import type { CatalogEntry } from '../services/toolCatalogBuilder.js';
import { getToolSchemas, searchTools } from '../services/toolSearchService.js';

function registerSearchTools(server: McpServer, catalog: CatalogEntry[]): void {
  server.registerTool(
    'search_tools',
    {
      description:
        'Search for available tools by keyword. Returns tool names, descriptions, and categories. ' +
        'Use get_tool_schema to retrieve full input schemas before calling a discovered tool.',
      inputSchema: {
        query: z.string().describe(
          'Natural language or keyword query describing what you need. ' +
          'Examples: "create agent", "validate graph", "mcp server", "publish"'
        ),
      },
    },
    async ({ query }) => {
      const results = searchTools(catalog, query);
      return textResult(results);
    }
  );
}

function registerGetToolSchema(server: McpServer, catalog: CatalogEntry[]): void {
  server.registerTool(
    'get_tool_schema',
    {
      description:
        'Get full input schemas for specific tools. Call this after search_tools to get ' +
        'the parameter definitions needed to call a tool.',
      inputSchema: {
        toolNames: z.array(z.string()).describe('Array of tool names to get schemas for'),
      },
    },
    async ({ toolNames }) => {
      const results = getToolSchemas(catalog, toolNames);
      return textResult(results);
    }
  );
}

export function registerToolSearchTools(server: McpServer, catalog: CatalogEntry[]): void {
  registerSearchTools(server, catalog);
  registerGetToolSchema(server, catalog);
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/mcp-server/tools/toolSearchTools.ts
git commit -m "feat(mcp-server): search_tools and get_tool_schema MCP tool registrations

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire into server.ts

**Files:**
- Modify: `packages/backend/src/mcp-server/server.ts`

- [ ] **Step 1: Update createMcpServer**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { authenticateMcpKey } from './auth.js';
import { ToolCatalogBuilder } from './services/toolCatalogBuilder.js';
import { registerAllTools } from './tools/index.js';
import { registerToolSearchTools } from './tools/toolSearchTools.js';
import type { ServiceContext } from './types.js';

// Build catalog ONCE at module level
const catalogBuilder = new ToolCatalogBuilder();

// Use a flag + cached catalog to ensure one-time build
let catalogBuilt = false;
let catalog: ReturnType<ToolCatalogBuilder['build']> = [];

function ensureCatalogBuilt(server: McpServer, getContext: () => ServiceContext): void {
  if (!catalogBuilt) {
    registerAllTools(server, getContext, catalogBuilder);
    catalog = catalogBuilder.build();
    catalogBuilt = true;
  }
}

function createMcpServer(getContext: () => ServiceContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  // Register all 84 tools + populate catalog (first call only populates catalog)
  registerAllTools(server, getContext, catalogBuilder);

  // Build catalog on first server creation
  if (!catalogBuilt) {
    catalog = catalogBuilder.build();
    catalogBuilt = true;
  }

  // Register the 2 search tools using the frozen catalog
  registerToolSearchTools(server, catalog);

  return server;
}
```

Wait — there's a subtlety. `registerAllTools` is called per-request (since `createMcpServer` is called per-request). But the `catalogBuilder.register()` calls inside will throw on the second request because the builder is already frozen after `build()`.

Fix: Make the catalog builder's `register` a no-op after build (instead of throwing). Or: separate the catalog building from tool registration.

**Better approach:** Build the catalog once, independently of the per-request server creation. Use a lazy initializer:

```typescript
import type { CatalogEntry } from './services/toolCatalogBuilder.js';
import { ToolCatalogBuilder } from './services/toolCatalogBuilder.js';

let cachedCatalog: CatalogEntry[] | null = null;

function buildCatalogOnce(getContext: () => ServiceContext): CatalogEntry[] {
  if (cachedCatalog !== null) return cachedCatalog;

  // Create a throwaway server just to register tools and capture catalog
  const tempServer = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );
  const builder = new ToolCatalogBuilder();
  registerAllTools(tempServer, getContext, builder);
  cachedCatalog = builder.build();
  return cachedCatalog;
}

function createMcpServer(getContext: () => ServiceContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  const catalog = buildCatalogOnce(getContext);

  // Register all 84 operational tools
  registerAllTools(server, getContext, new ToolCatalogBuilder());
  // The new builder is discarded — we only use the cached catalog

  // Register the 2 search tools
  registerToolSearchTools(server, catalog);

  return server;
}
```

Actually this is unnecessarily complex. Simplest fix: change `ToolCatalogBuilder.register` to silently skip after build (instead of throwing):

- [ ] **Step 1: Update server.ts**

The final `server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { authenticateMcpKey } from './auth.js';
import type { CatalogEntry } from './services/toolCatalogBuilder.js';
import { ToolCatalogBuilder } from './services/toolCatalogBuilder.js';
import { registerAllTools } from './tools/index.js';
import { registerToolSearchTools } from './tools/toolSearchTools.js';
import type { ServiceContext } from './types.js';

const SERVER_NAME = 'openflow';
const SERVER_VERSION = '1.0.0';
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_FORBIDDEN = 403;
const JSONRPC_SERVER_ERROR = -32000;

// Module-level singleton: catalog built once, reused across requests
const catalogBuilder = new ToolCatalogBuilder();
let catalog: CatalogEntry[] = [];
let catalogReady = false;

interface JsonRpcError {
  jsonrpc: '2.0';
  error: { code: number; message: string };
  id: null;
}

function jsonRpcError(code: number, message: string): JsonRpcError {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

function ensureCatalog(getContext: () => ServiceContext): void {
  if (catalogReady) return;
  const tempServer = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );
  registerAllTools(tempServer, getContext, catalogBuilder);
  catalog = catalogBuilder.build();
  catalogReady = true;
}

function createMcpServer(getContext: () => ServiceContext): McpServer {
  ensureCatalog(getContext);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  // Register all 84 tools (catalog.register calls are no-ops since already built)
  registerAllTools(server, getContext, catalogBuilder);

  // Register the 2 search tools
  registerToolSearchTools(server, catalog);

  return server;
}

// ... rest of handlePostRequest, sendMethodNotAllowed, handleMcpRequest unchanged
```

- [ ] **Step 2: Run tests + typecheck**

```bash
npm test -w packages/backend && npm run typecheck -w packages/backend
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/mcp-server/server.ts
git commit -m "feat(mcp-server): wire tool search into MCP server lifecycle

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: E2E Test Script

**Files:**
- Create: `packages/backend/src/mcp-server/scripts/test-tool-search.ts`

- [ ] **Step 1: Create test script**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { CatalogEntry } from '../services/toolCatalogBuilder.js';
import { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import { getToolSchemas, searchTools } from '../services/toolSearchService.js';
import { registerAllTools } from '../tools/index.js';
import type { ServiceContext } from '../types.js';

const SERVER_NAME = 'openflow-test';
const SERVER_VERSION = '1.0.0';
const EXPECTED_TOOL_COUNT = 84;

const mockCtx: ServiceContext = {
  supabase: {} as ServiceContext['supabase'],
  orgId: 'test-org',
  keyId: 'test-key',
};

function buildTestCatalog(): CatalogEntry[] {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );
  const builder = new ToolCatalogBuilder();
  registerAllTools(server, () => mockCtx, builder);
  return builder.build();
}

interface TestCase {
  query: string;
  expectInResults: string[];
}

const searchTests: TestCase[] = [
  { query: 'create agent', expectInResults: ['create_agent'] },
  { query: 'validate', expectInResults: ['validate_graph'] },
  { query: 'mcp server', expectInResults: ['list_mcp_servers'] },
  { query: 'publish', expectInResults: ['publish_agent'] },
  { query: 'graph_write', expectInResults: ['add_node'] },
  { query: 'simulate', expectInResults: ['simulate_agent'] },
  { query: 'environment variable', expectInResults: ['list_env_variables'] },
  { query: 'execution key', expectInResults: ['list_execution_keys'] },
];

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    process.stdout.write(`  PASS: ${message}\n`);
  } else {
    failed++;
    process.stderr.write(`  FAIL: ${message}\n`);
  }
}

function runTests(): void {
  const catalog = buildTestCatalog();

  process.stdout.write(`\nCatalog built: ${String(catalog.length)} tools\n\n`);
  assert(catalog.length === EXPECTED_TOOL_COUNT, `catalog has ${String(EXPECTED_TOOL_COUNT)} tools`);

  process.stdout.write('--- Search Tests ---\n');
  for (const test of searchTests) {
    const results = searchTools(catalog, test.query);
    const resultNames = results.map((r) => r.name);
    for (const expected of test.expectInResults) {
      assert(
        resultNames.includes(expected),
        `"${test.query}" → includes ${expected} (got: ${resultNames.join(', ')})`
      );
    }
  }

  process.stdout.write('\n--- Schema Tests ---\n');
  const schemas = getToolSchemas(catalog, ['add_node', 'validate_graph']);
  assert(schemas.length === 2, 'getToolSchemas returns 2 schemas');
  assert(schemas[0]?.inputSchema !== undefined, 'first schema has inputSchema');

  const empty = getToolSchemas(catalog, ['nonexistent_tool']);
  assert(empty.length === 0, 'getToolSchemas skips unknown tools');

  process.stdout.write(`\n${String(passed)} passed, ${String(failed)} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
```

- [ ] **Step 2: Run the script**

```bash
npx tsx packages/backend/src/mcp-server/scripts/test-tool-search.ts
```

Expected: All tests pass, 84 tools in catalog.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/mcp-server/scripts/test-tool-search.ts
git commit -m "feat(mcp-server): E2E test script for tool search

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test -w packages/backend
```

Expected: 314+ tests pass (314 existing + new catalog/search tests).

- [ ] **Step 2: Run E2E script**

```bash
npx tsx packages/backend/src/mcp-server/scripts/test-tool-search.ts
```

Expected: All pass, 84 tools in catalog.

- [ ] **Step 3: Run full monorepo check**

```bash
npm run check -w packages/backend
```

Expected: format, lint, typecheck all clean.

- [ ] **Step 4: Verify tool count**

```bash
grep -r "registerTool" packages/backend/src/mcp-server/tools/ --include="*.ts" | grep -v "index.ts" | grep -v "import" | wc -l
```

Expected: 86 (84 original + 2 search tools).
