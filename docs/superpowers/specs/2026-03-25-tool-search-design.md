# MCP Tool Search — Design Spec

**Goal:** Add a provider-agnostic tool discovery mechanism to the MCP server so the Copilot LLM only loads tool schemas on demand, reducing token overhead from ~10K-17K to ~200 tokens per request.

**Scope:** MCP server side only. Copilot client-side integration is out of scope.

---

## 1. Problem

The MCP server exposes 84 tools. Loading all tool schemas into an LLM context costs ~10K-17K tokens per request, even when the user says "Hello." This degrades accuracy past ~30-50 tools and wastes tokens.

## 2. Solution

Add two new tools (#85 and #86) to the MCP server:

- **`search_tools`** — Multi-field ranked search. Returns top 5 matching tool metadata (name, description, category). No schemas.
- **`get_tool_schema`** — Batch schema retrieval. Given an array of tool names, returns their full input schemas.

The Copilot client (when built) will only expose `search_tools` and `get_tool_schema` as full tool definitions to the LLM. All other tools are hidden until discovered.

## 3. Tool Catalog

A static in-memory catalog built at module load time. Each entry:

```typescript
interface CatalogEntry {
  name: string;                    // "add_node"
  description: string;             // "Create a new node in an agent's graph"
  category: ToolCategory;          // "graph_write"
  parameterNames: string[];        // ["agentSlug", "id", "text", "kind", ...]
  parameterDescriptions: string[]; // ["Agent slug", "Unique node ID", ...]
  inputSchema: Record<string, unknown>; // Full JSON Schema from Zod
}
```

### 3.1 Categories

Each tool belongs to exactly one category, mapped from the existing tool file groupings:

| Category | Tools | Count |
|----------|-------|-------|
| `agent_management` | list_agents, create_agent, get_agent, update_agent, delete_agent | 5 |
| `graph_read` | get_graph_summary, get_node, get_edges_from, get_edges_to, list_nodes, search_nodes, get_subgraph | 7 |
| `graph_write` | add_node, update_node, delete_node, add_edge, update_edge, delete_edge, set_start_node, batch_mutate | 8 |
| `agent_domain` | list_agent_domains, add_agent_domain, update_agent_domain, delete_agent_domain | 4 |
| `validation` | validate_graph, get_reachability, find_path, get_dead_ends, get_orphans | 5 |
| `mcp_management` | list_mcp_servers, get_mcp_server, add_mcp_server, update_mcp_server, remove_mcp_server, install_mcp_from_library | 6 |
| `mcp_library` | browse_mcp_library, get_mcp_library_item | 2 |
| `mcp_tool_ops` | discover_mcp_tools, call_mcp_tool | 2 |
| `output_schema` | list_output_schemas, get_output_schema, add_output_schema, update_output_schema, delete_output_schema | 5 |
| `context_preset` | list_context_presets, add_context_preset, update_context_preset, delete_context_preset | 4 |
| `env_variable` | list_env_variables, create_env_variable, update_env_variable, delete_env_variable, get_env_variable_value | 5 |
| `api_key` | list_api_keys, create_api_key, delete_api_key, set_agent_staging_key, set_agent_production_key | 5 |
| `execution_key` | list_execution_keys, create_execution_key, update_execution_key, delete_execution_key | 4 |
| `publishing` | publish_agent, list_versions, get_version, restore_version | 4 |
| `simulation` | simulate_agent | 1 |
| `prompt_inspection` | get_node_prompt | 1 |
| `models` | list_available_models | 1 |
| `agent_intelligence` | get_agent_overview, get_agent_health, explain_agent_flow | 3 |
| `node_intelligence` | get_node_full_context, explain_edge | 2 |
| `execution_intelligence` | get_execution_history, get_session_detail, get_execution_trace | 3 |
| `graph_convenience` | clone_node, insert_node_between, swap_edge_target, list_context_flags, get_mcp_tool_usage, scaffold_agent_domain | 6 |
| `version_intelligence` | diff_versions | 1 |

### 3.2 Catalog Construction

The `McpServer._registeredTools` field is private with no public accessor. Instead of accessing internals, we build the catalog ourselves using a **parallel registry pattern**:

Each `register*Tools` function (e.g., `registerAgentTools`) already knows the tool name, description, and Zod input schema. We modify each registration function to also register a catalog entry via a shared `ToolCatalogBuilder`.

The `ToolCatalogBuilder` is a simple class:
```typescript
class ToolCatalogBuilder {
  private entries: CatalogEntry[] = [];

  register(entry: CatalogEntry): void { ... }
  build(): CatalogEntry[] { return [...this.entries]; }
}
```

Each `register*Tools` function receives the builder and calls `builder.register(...)` alongside `server.registerTool(...)`. This keeps the catalog perfectly in sync with actual registrations without fragile access to SDK internals.

The category for each tool is passed explicitly during registration — no separate mapping file needed, since each tools file already knows its category.

## 4. Search Algorithm

### 4.1 Scoring

Given a query string, split into lowercase terms (whitespace-separated). For each catalog entry, compute a relevance score:

| Match type | Score per term |
|-----------|---------------|
| Exact tool name match (full query, not per-term) | 100 |
| Tool name contains term | 50 |
| Category contains term | 40 |
| Description contains term | 30 |
| Any parameter name contains term | 20 |
| Any parameter description contains term | 10 |

All matching is case-insensitive. Underscores in tool names are treated as word separators for matching (so query "add node" matches tool name "add_node").

### 4.2 Result Selection

- Sum scores across all query terms
- Sort descending by total score
- Return top 5 results
- Tools with score 0 are excluded

### 4.3 Edge Cases

- Empty query → return empty array
- Query matches fewer than 5 tools → return all matches
- Query matches no tools → return empty array

## 5. Tool Interfaces

### 5.1 `search_tools`

```
Name: search_tools
Description: "Search for available tools by keyword. Returns tool names,
  descriptions, and categories. Use get_tool_schema to retrieve full input
  schemas before calling a discovered tool."

Input:
  query: string (required) — "Natural language or keyword query describing
    what you need. Examples: 'create agent', 'validate graph', 'mcp server',
    'publish'"

Output: JSON array of up to 5 results:
  [{ name: string, description: string, category: string }]
```

### 5.2 `get_tool_schema`

```
Name: get_tool_schema
Description: "Get full input schemas for specific tools. Call this after
  search_tools to get the parameter definitions needed to call a tool."

Input:
  toolNames: string[] (required) — "Array of tool names to get schemas for"

Output: JSON array:
  [{ name: string, description: string, category: string, inputSchema: object }]

  Unknown tool names are silently skipped (no error).
```

## 6. File Structure

```
packages/backend/src/mcp-server/
├── services/
│   └── toolSearchService.ts     ← Catalog construction, search, schema retrieval
├── tools/
│   └── toolSearchTools.ts       ← Register search_tools + get_tool_schema
├── __tests__/
│   └── toolSearchService.test.ts ← Unit tests
└── scripts/
    └── test-tool-search.ts       ← E2E test script (standalone Node.js)
```

### 6.1 `toolSearchService.ts`

Exports:
- `buildCatalog(server: McpServer): CatalogEntry[]` — extracts tool metadata from the server's registered tools
- `searchTools(catalog: CatalogEntry[], query: string): SearchResult[]` — ranked search, returns top 5
- `getToolSchemas(catalog: CatalogEntry[], toolNames: string[]): SchemaResult[]` — batch schema lookup

### 6.2 `toolSearchTools.ts`

Registers `search_tools` and `get_tool_schema`. These two tools are special — they don't need `ServiceContext` (no auth/DB), they only query the in-memory catalog.

### 6.3 `test-tool-search.ts`

Standalone script that:
1. Creates an `McpServer`, registers all 84 tools (with a mock `getContext`)
2. Builds the catalog
3. Runs test queries and prints results
4. Verifies `get_tool_schema` returns valid schemas
5. Exits 0 on success, 1 on failure

Run: `npx tsx packages/backend/src/mcp-server/scripts/test-tool-search.ts`

## 7. Integration

### 7.1 Registration Order

The `ToolCatalogBuilder` is created first and passed through the entire registration chain.

The flow in `server.ts`:
1. Create `McpServer`
2. Create `ToolCatalogBuilder`
3. Call `registerAllTools(server, getContext, catalogBuilder)` — registers all 84 tools AND populates the catalog builder
4. Call `const catalog = catalogBuilder.build()` — finalize the catalog
5. Call `registerToolSearchTools(server, catalog)` — registers search_tools + get_tool_schema

Each `register*Tools` function signature changes from `(server, getContext)` to `(server, getContext, catalog)`. The catalog parameter is passed through to each registration function.

### 7.2 No Changes to Existing Tools

The 84 existing tools are unchanged. The catalog reads their metadata non-destructively.

## 8. Testing

### 8.1 Unit Tests (`toolSearchService.test.ts`)

Test `searchTools` with a small fixture catalog (5-10 fake entries):
- Query matching tool name scores highest
- Query matching category returns relevant tools
- Multi-term queries combine scores
- Empty query returns empty
- No-match query returns empty
- Results are limited to 5
- Underscore-to-space normalization works

Test `getToolSchemas`:
- Returns schemas for valid names
- Silently skips unknown names
- Handles empty array input
- Returns correct inputSchema structure

Test `buildCatalog`:
- Returns correct count of entries
- Each entry has all required fields
- Categories are assigned correctly

### 8.2 E2E Test Script (`test-tool-search.ts`)

Verifies against the real 84-tool catalog:
- `searchTools("create agent")` returns `create_agent` in top results
- `searchTools("validate")` returns validation tools
- `searchTools("mcp")` returns MCP-related tools
- `searchTools("publish")` returns publishing tools
- `searchTools("graph_write")` returns graph write tools (category search)
- `getToolSchemas(["add_node", "validate_graph"])` returns both schemas
- `getToolSchemas(["nonexistent"])` returns empty array
