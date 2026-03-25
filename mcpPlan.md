Please, in our back-end, create an MCP server with the following requirements.

## 1. MCP Config

This MCP server must live in the /mcp endpoint (like, http://localhost:4000/mcp).

When a client tries to connect to the MCP server, we must ensure we receive an `Authorization: Bearer <token>` header. We will use this token to verify the user has access.

This way, we must also allow users to generate this token. For this, we already implemented the "API Keys" section in the sidebar (org sidebar), nevertheless, please extend this to allow the user to also select an "All agents" option instead of granular agent access.

Then, when a client connects to this MCP server, we must use the API Key to validate access, or, otherwise, throw a 401 error.

---

## 2. Multi-Agent Scoping

The Copilot manages **multiple agents** within an org. Because of this, every tool that operates on a specific agent's graph requires an `agent_slug` parameter to identify the target agent.

The org context is derived from the API key used to authenticate with the MCP server (execution key). The `agent_slug` identifies which agent within that org to operate on.

**Scoping rules:**
- **Org-scoped tools** (env vars, API keys, execution keys, MCP library) — no `agent_slug` needed, org derived from the auth key
- **Agent-scoped tools** (graph read/write, validation, simulation, publishing) — require `agent_slug`
- **Agent management tools** (list/create/delete agents) — org-scoped, some take `agent_slug` for targeting

---

## 3. Tool Catalog

### 3.1 Agent Management Tools

| # | Tool Name | Purpose | Scope | Parameters | Returns |
|---|-----------|---------|-------|------------|---------|
| 1 | `list_agents` | List all agents in the org | org | `search?: string` | `AgentListItem[]` |
| 2 | `create_agent` | Create a new agent | org | `name: string`, `description: string` | `AgentInfo` |
| 3 | `get_agent` | Full details of an agent | agent | `agent_slug: string` | `AgentInfo` |
| 4 | `update_agent` | Update agent name/description | agent | `agent_slug: string`, `fields: { name?, description? }` | `AgentInfo` |
| 5 | `delete_agent` | Delete an agent and its graph | agent | `agent_slug: string` | Confirmation |

### 3.2 Graph Read Tools

All tools in this section require `agent_slug: string` as their first parameter.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 6 | `get_graph_summary` | High-level overview of an agent's graph | `agent_slug` | `GraphSummary` |
| 7 | `get_node` | Full details of a single node | `agent_slug`, `node_id: string` | `NodeDetail` |
| 8 | `get_edges_from` | All outbound edges from a node | `agent_slug`, `node_id: string` | `Edge[]` |
| 9 | `get_edges_to` | All inbound edges to a node | `agent_slug`, `node_id: string` | `Edge[]` |
| 10 | `list_nodes` | List nodes, optionally filtered | `agent_slug`, `agent_domain?: string`, `kind?: NodeKind`, `global?: boolean` | `NodeListItem[]` |
| 11 | `search_nodes` | Fuzzy search over id, text, description | `agent_slug`, `query: string`, `limit?: number` | `NodeListItem[]` |
| 12 | `get_subgraph` | Get a node + N hops of neighbors | `agent_slug`, `node_id: string`, `depth?: number` | `SubgraphResult` |

### 3.3 Graph Write Tools

All tools in this section require `agent_slug: string` as their first parameter.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 13 | `add_node` | Create a new node | `agent_slug`, `node: NodeInput` | Created node + empty edge lists |
| 14 | `update_node` | Patch fields on an existing node | `agent_slug`, `node_id: string`, `fields: Partial<Node>` | Updated node + its edges |
| 15 | `delete_node` | Remove node and all connected edges | `agent_slug`, `node_id: string` | Deleted node + removed edges |
| 16 | `add_edge` | Create a new edge | `agent_slug`, `edge: EdgeInput` | Created edge + edges from source |
| 17 | `update_edge` | Modify an existing edge | `agent_slug`, `from: string`, `to: string`, `fields: EdgeFieldsInput` | Updated edge + edges from source |
| 18 | `delete_edge` | Remove an edge | `agent_slug`, `from: string`, `to: string` | Confirmation + remaining edges |
| 19 | `set_start_node` | Change the graph's start node | `agent_slug`, `node_id: string` | Confirmation |
| 20 | `batch_mutate` | Apply multiple mutations atomically | `agent_slug`, `operations: MutationOp[]`, `validate_after?: boolean` | Results + optional violations |

### 3.4 Agent Domain Tools

Agent domains are named groups within a graph (e.g., "greeting", "checkout"). All require `agent_slug`.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 21 | `list_agent_domains` | List all agent domains in a graph | `agent_slug` | `AgentDomain[]` |
| 22 | `add_agent_domain` | Register a new agent domain | `agent_slug`, `key: string`, `description?: string` | Updated domain list |
| 23 | `update_agent_domain` | Update a domain's description | `agent_slug`, `key: string`, `description: string` | Updated domain |
| 24 | `delete_agent_domain` | Remove a domain (fails if nodes still reference it) | `agent_slug`, `key: string` | Confirmation |

### 3.5 MCP Server Management (Graph-Level)

MCP servers are configured per-graph. All require `agent_slug`.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 25 | `list_mcp_servers` | List MCP servers on an agent's graph | `agent_slug` | `McpServerSummary[]` |
| 26 | `get_mcp_server` | Full details of an MCP server | `agent_slug`, `server_id: string` | `McpServerConfig` |
| 27 | `add_mcp_server` | Manually add an MCP server | `agent_slug`, `server: McpServerInput` | Created server |
| 28 | `update_mcp_server` | Update MCP server config | `agent_slug`, `server_id: string`, `fields: Partial<McpServerInput>` | Updated server |
| 29 | `remove_mcp_server` | Remove an MCP server from the graph | `agent_slug`, `server_id: string` | Confirmation |
| 30 | `install_mcp_from_library` | Install a library MCP server into a graph | `agent_slug`, `library_item_id: string`, `variable_values?: Record<string, VariableValue>` | Created server |

### 3.6 MCP Library (Org-Level)

Browse and discover MCP servers from the shared library. Org-scoped, no `agent_slug` needed.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 31 | `browse_mcp_library` | Search/browse the MCP library | `query?: string`, `category?: McpCategory`, `limit?: number`, `offset?: number` | `McpLibraryItem[]` |
| 32 | `get_mcp_library_item` | Full details of a library item | `library_item_id: string` | `McpLibraryItem` (including variables, transport config) |

### 3.7 MCP Tool Operations

Discover and test MCP tools. These can operate on a server already in a graph or on an arbitrary transport.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 33 | `discover_mcp_tools` | List tools available from an MCP server | `agent_slug: string`, `server_id: string` | `McpToolInfo[]` (name, description, inputSchema) |
| 34 | `call_mcp_tool` | Invoke an MCP tool with arguments | `agent_slug: string`, `server_id: string`, `tool_name: string`, `args: Record<string, unknown>` | `{ success: boolean, result?: unknown, error?: string }` |

### 3.8 Output Schema Management

Output schemas are defined at the graph level and referenced by nodes. All require `agent_slug`.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 35 | `list_output_schemas` | List all output schemas on a graph | `agent_slug` | `OutputSchemaEntity[]` |
| 36 | `get_output_schema` | Get a single output schema with fields | `agent_slug`, `schema_id: string` | `OutputSchemaEntity` |
| 37 | `add_output_schema` | Create a new output schema | `agent_slug`, `name: string`, `fields: OutputSchemaField[]` | Created schema |
| 38 | `update_output_schema` | Update a schema's name or fields | `agent_slug`, `schema_id: string`, `name?: string`, `fields?: OutputSchemaField[]` | Updated schema |
| 39 | `delete_output_schema` | Delete an output schema | `agent_slug`, `schema_id: string` | Confirmation |

### 3.9 Context Preset Management

Context presets define simulation contexts (session/tenant/user IDs, custom data). All require `agent_slug`.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 40 | `list_context_presets` | List all context presets on a graph | `agent_slug` | `ContextPreset[]` |
| 41 | `add_context_preset` | Create a context preset | `agent_slug`, `preset: ContextPresetInput` | Created preset |
| 42 | `update_context_preset` | Update a context preset | `agent_slug`, `name: string`, `fields: Partial<ContextPresetInput>` | Updated preset |
| 43 | `delete_context_preset` | Delete a context preset | `agent_slug`, `name: string` | Confirmation |

### 3.10 Environment Variables (Org-Level)

Org-scoped variables used in MCP server transport configs. No `agent_slug` needed.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 44 | `list_env_variables` | List org environment variables | *(none)* | `EnvVariableListItem[]` (id, name, is_secret) |
| 45 | `create_env_variable` | Create a new environment variable | `name: string`, `value: string`, `is_secret?: boolean` | Created variable |
| 46 | `update_env_variable` | Update an env variable | `variable_id: string`, `fields: { name?, value?, is_secret? }` | Updated variable |
| 47 | `delete_env_variable` | Delete an env variable | `variable_id: string` | Confirmation |
| 48 | `get_env_variable_value` | Retrieve the decrypted value | `variable_id: string` | `{ value: string }` |

### 3.11 API Keys — Model Provider (Org-Level)

OpenRouter/model-provider API keys. Org-scoped.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 49 | `list_api_keys` | List org model-provider API keys | *(none)* | `ApiKeyListItem[]` (id, name, key_preview) |
| 50 | `create_api_key` | Store a new model-provider API key | `name: string`, `key_value: string` | Created key |
| 51 | `delete_api_key` | Delete an API key | `key_id: string` | Confirmation |
| 52 | `set_agent_staging_key` | Assign a staging API key to an agent | `agent_slug: string`, `key_id: string \| null` | Confirmation |
| 53 | `set_agent_production_key` | Assign a production API key to an agent | `agent_slug: string`, `key_id: string \| null` | Confirmation |

### 3.12 Execution Keys (Org-Level)

API keys for external consumers calling published agents.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 54 | `list_execution_keys` | List org execution keys | *(none)* | `ExecutionKeyListItem[]` |
| 55 | `create_execution_key` | Create with agent scoping | `name: string`, `agent_ids: string[]`, `expires_at?: string \| null` | `{ key: ExecutionKeyInfo, full_key: string }` |
| 56 | `update_execution_key` | Update name or agent scoping | `key_id: string`, `fields: { name?, agent_ids? }` | Updated key |
| 57 | `delete_execution_key` | Delete an execution key | `key_id: string` | Confirmation |

### 3.13 Publishing & Version Management

All require `agent_slug`.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 58 | `publish_agent` | Publish the current draft as a new version | `agent_slug` | `{ version: number }` |
| 59 | `list_versions` | List all published versions | `agent_slug` | `VersionSummary[]` |
| 60 | `get_version` | Get the full graph snapshot at a version | `agent_slug`, `version: number` | `Graph` |
| 61 | `restore_version` | Restore a historical version as the new draft | `agent_slug`, `version: number` | Restored `Graph` |

### 3.14 Simulation & Execution

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 62 | `simulate_agent` | Run the agent with messages and get full debug trace | `agent_slug`, `messages: Message[]`, `options?: SimulateOptions` | `SimulationResult` |

### 3.15 Prompt Inspection

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 63 | `get_node_prompt` | See the fully assembled prompt for a node | `agent_slug`, `node_id: string` | `NodePromptResult` |

### 3.16 Validation & Analysis Tools

All require `agent_slug`.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 64 | `validate_graph` | Run all violation-detection rules | `agent_slug` | `Violation[]` |
| 65 | `get_reachability` | Nodes reachable from a starting point | `agent_slug`, `from_node: string`, `max_depth?: number` | `ReachabilityResult` |
| 66 | `find_path` | Shortest path between two nodes | `agent_slug`, `from: string`, `to: string` | `PathResult` |
| 67 | `get_dead_ends` | Nodes with no outbound edges (non-terminal) | `agent_slug` | `string[]` |
| 68 | `get_orphans` | Nodes unreachable from startNode | `agent_slug` | `string[]` |

### 3.17 Models Discovery

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 69 | `list_available_models` | List available LLM models from OpenRouter | *(none)* | `ModelInfo[]` |

---

**Phase 1 total: 69 tools** — These make it technically possible to perform every action available in the UI.

---

### 3.18 Agent Intelligence Tools (Phase 2)

High-level tools that synthesize multiple data sources to give the Copilot rich understanding.

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 70 | `get_agent_overview` | Comprehensive agent summary | `agent_slug` | `AgentOverview` |
| 71 | `get_agent_health` | Combined validation + config checks | `agent_slug` | `AgentHealthReport` |
| 72 | `explain_agent_flow` | Natural language description of the agent's conversational flow | `agent_slug`, `from_node?: string` | `FlowExplanation` |

### 3.19 Node Intelligence Tools (Phase 2)

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 73 | `get_node_full_context` | Everything about a node: prompt, neighbors, schema, tools, preconditions | `agent_slug`, `node_id: string` | `NodeFullContext` |
| 74 | `explain_edge` | Human-readable explanation of an edge's routing logic | `agent_slug`, `from: string`, `to: string` | `EdgeExplanation` |

### 3.20 Execution Intelligence Tools (Phase 2)

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 75 | `get_execution_history` | Dashboard analytics for an agent | `agent_slug`, `limit?: number` | `AgentExecutionStats` |
| 76 | `get_session_detail` | Full session with execution summaries | `session_id: string` | `SessionDetail` |
| 77 | `get_execution_trace` | Per-node debug data from a specific execution | `execution_id: string` | `NodeVisit[]` |

### 3.21 Graph Convenience Tools (Phase 2)

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 78 | `clone_node` | Duplicate a node with optional edge cloning | `agent_slug`, `node_id: string`, `new_id: string`, `clone_edges?: boolean` | Created node + cloned edges |
| 79 | `insert_node_between` | Insert a node on an existing edge (delete old edge + add node + add two new edges) | `agent_slug`, `from: string`, `to: string`, `new_node: NodeInput` | Created node + new edges |
| 80 | `swap_edge_target` | Redirect an edge to a different target node | `agent_slug`, `from: string`, `old_to: string`, `new_to: string` | Updated edge |
| 81 | `list_context_flags` | List all context flags used across the graph | `agent_slug` | `ContextFlagUsage[]` |
| 82 | `get_mcp_tool_usage` | Map which MCP tools are referenced by which edges/nodes | `agent_slug` | `McpToolUsageMap` |
| 83 | `scaffold_agent_domain` | Generate a starter set of nodes + edges for a new domain | `agent_slug`, `domain_key: string`, `description: string`, `pattern?: 'linear' \| 'decision_tree' \| 'tool_loop'` | Created nodes + edges |

### 3.22 Version Intelligence Tools (Phase 2)

| # | Tool Name | Purpose | Parameters | Returns |
|---|-----------|---------|------------|---------|
| 84 | `diff_versions` | Compare two published versions (or draft vs. version) | `agent_slug`, `from_version: number \| 'draft'`, `to_version: number \| 'draft'` | `VersionDiff` |

---

**Phase 2 total: 15 tools** — These make it easy and robust for the Copilot to operate at both high and low levels of detail.

**Grand total: 84 tools**

---

## 4. Detailed Tool Schemas

### 4.1 Agent Management

#### `list_agents`

```typescript
interface ListAgentsParams {
  search?: string;                  // filter by name/slug substring
}

interface AgentListItem {
  id: string;                       // UUID
  name: string;
  slug: string;
  description: string;
  current_version: number;
  staging_api_key_id: string | null;
  production_api_key_id: string | null;
  created_at: string;
  updated_at: string;
}

// Returns: AgentListItem[]
```

#### `create_agent`

```typescript
interface CreateAgentParams {
  name: string;
  description: string;
}

// Validations:
// - name must be non-empty
// - slug is auto-generated from name
// - Creates an empty graph with a default start node

// Returns: AgentInfo (same as AgentListItem + slug)
```

#### `get_agent`

```typescript
interface GetAgentParams {
  agent_slug: string;
}

// Returns: AgentInfo — full agent details including key assignments
```

#### `update_agent`

```typescript
interface UpdateAgentParams {
  agent_slug: string;
  fields: {
    name?: string;
    description?: string;
  };
}

// Returns: AgentInfo
```

#### `delete_agent`

```typescript
interface DeleteAgentParams {
  agent_slug: string;
}

// Validations:
// - Cannot be undone
// - Deletes the agent, its graph, all versions, and all session data

// Returns: { deleted: true }
```

---

### 4.2 Graph Read Tools

#### `get_graph_summary`

```typescript
interface GetGraphSummaryParams {
  agent_slug: string;
}

interface GraphSummary {
  agent_name: string;
  agent_slug: string;
  startNode: string;
  agents: string[];                        // agent domain keys: ["greeting", "browse", "checkout"]
  totalNodes: number;
  totalEdges: number;
  globalNodes: string[];                   // ["AnswerBusinessQuestion"]
  fallbackNodes: string[];                 // nodes with defaultFallback=true
  nodeCountByAgent: Record<string, number>;
  nodeCountByKind: Record<string, number>; // { agent: 105, agent_decision: 15 }
  mcpServers: { id: string; name: string; enabled: boolean }[];
  outputSchemas: { id: string; name: string }[];
  contextPresets: string[];                // preset names
  contextFlags: string[];                  // all context flags used in edges
  warnings: string[];                      // quick-check issues
  staging_key_configured: boolean;
  production_key_configured: boolean;
  current_version: number;
}
```

**Usage note:** Call this as the first tool when working on an agent. Provides the full map before exploring.

---

#### `get_node`

```typescript
interface GetNodeParams {
  agent_slug: string;
  node_id: string;
}

interface NodeDetail {
  node: Node;                    // full node object
  inboundEdgeCount: number;
  outboundEdgeCount: number;
  inboundFrom: string[];         // IDs of nodes that point here
  outboundTo: string[];          // IDs of nodes this points to
  outputSchema?: OutputSchemaEntity;  // resolved if outputSchemaId is set
}
```

---

#### `get_edges_from` / `get_edges_to`

```typescript
interface GetEdgesParams {
  agent_slug: string;
  node_id: string;
}

// Returns: Edge[] — full edge objects including preconditions, contextPreconditions, toolFields
```

---

#### `list_nodes`

```typescript
interface ListNodesParams {
  agent_slug: string;
  agent_domain?: string;    // filter by agent domain key
  kind?: 'agent' | 'agent_decision';
  global?: boolean;
}

interface NodeListItem {
  id: string;
  text: string;              // truncated to 80 chars
  kind: string;
  agent?: string;
  global: boolean;
  nextNodeIsUser?: boolean;
  hasOutputSchema: boolean;
  fallbackNodeId?: string;
}

// Returns: NodeListItem[]
```

---

#### `search_nodes`

```typescript
interface SearchNodesParams {
  agent_slug: string;
  query: string;
  limit?: number;            // default 10, max 25
}

// Returns: NodeListItem[] ranked by relevance (fuzzy match on id, text, description)
```

---

#### `get_subgraph`

```typescript
interface GetSubgraphParams {
  agent_slug: string;
  node_id: string;
  depth?: number;            // default 1, max 3
}

interface SubgraphResult {
  nodes: Node[];
  edges: Edge[];
  center: string;
}
```

---

### 4.3 Graph Write Tools

#### `add_node`

```typescript
interface AddNodeParams {
  agent_slug: string;
  node: {
    id: string;                        // must be unique, match /^[A-Za-z][A-Za-z0-9_]*$/
    text: string;                      // response template / label
    kind: 'agent' | 'agent_decision';
    description?: string;
    agent?: string;                    // must reference an existing agent domain
    nextNodeIsUser?: boolean;
    fallbackNodeId?: string;           // for agent_decision nodes
    global?: boolean;
    defaultFallback?: boolean;
    outputSchemaId?: string;           // must reference an existing output schema
    outputPrompt?: string;
    position?: { x: number; y: number };
  };
}

// Validations:
// - id must not already exist
// - if agent is set, must reference existing agent domain
// - if outputSchemaId is set, must reference existing output schema
// - if fallbackNodeId is set, must reference existing node

// Returns: { node: Node, edges: { inbound: [], outbound: [] } }
```

---

#### `update_node`

```typescript
interface UpdateNodeParams {
  agent_slug: string;
  node_id: string;
  fields: {
    text?: string;
    kind?: 'agent' | 'agent_decision';
    description?: string;
    agent?: string;
    nextNodeIsUser?: boolean;
    fallbackNodeId?: string | null;      // null to clear
    global?: boolean;
    defaultFallback?: boolean;
    outputSchemaId?: string | null;      // null to clear
    outputPrompt?: string | null;
    position?: { x: number; y: number };
  };
}

// Returns: { node: Node, edges: { inbound: Edge[], outbound: Edge[] } }
```

---

#### `delete_node`

```typescript
interface DeleteNodeParams {
  agent_slug: string;
  node_id: string;
}

// Validations:
// - Cannot delete startNode
// - All connected edges are also deleted

// Returns: { deletedNode: Node, deletedEdges: Edge[] }
```

---

#### `add_edge`

```typescript
interface AddEdgeParams {
  agent_slug: string;
  edge: {
    from: string;
    to: string;
    preconditions?: Precondition[];     // all must share the same type
    contextPreconditions?: {
      preconditions: string[];          // context flag names
      jumpTo?: string;                  // redirect node ID
    };
  };
}

interface Precondition {
  type: 'user_said' | 'agent_decision' | 'tool_call';
  value: string;
  description?: string;
  toolFields?: Record<string, ToolFieldValue>;
}

type ToolFieldValue =
  | { type: 'fixed'; value: string }
  | { type: 'reference'; nodeId: string; path: string; fallbacks?: ToolFieldValue[] };

// Validations:
// - from and to must reference existing nodes
// - all preconditions must share the same type
// - warns on duplicate edge

// Returns: { edge: Edge, allEdgesFromSource: Edge[] }
```

---

#### `update_edge`

```typescript
interface UpdateEdgeParams {
  agent_slug: string;
  from: string;
  to: string;
  fields: {
    preconditions?: Precondition[];
    contextPreconditions?: {
      preconditions: string[];
      jumpTo?: string;
    };
  };
}

// Returns: { edge: Edge, allEdgesFromSource: Edge[] }
```

---

#### `delete_edge`

```typescript
interface DeleteEdgeParams {
  agent_slug: string;
  from: string;
  to: string;
}

// Returns: { deleted: true, remainingEdgesFromSource: Edge[] }
```

---

#### `set_start_node`

```typescript
interface SetStartNodeParams {
  agent_slug: string;
  node_id: string;             // must reference an existing node
}

// Returns: { startNode: string }
```

---

#### `batch_mutate`

```typescript
type MutationOp =
  | { op: 'add_node';           params: Omit<AddNodeParams, 'agent_slug'> }
  | { op: 'update_node';        params: Omit<UpdateNodeParams, 'agent_slug'> }
  | { op: 'delete_node';        params: Omit<DeleteNodeParams, 'agent_slug'> }
  | { op: 'add_edge';           params: Omit<AddEdgeParams, 'agent_slug'> }
  | { op: 'update_edge';        params: Omit<UpdateEdgeParams, 'agent_slug'> }
  | { op: 'delete_edge';        params: Omit<DeleteEdgeParams, 'agent_slug'> }
  | { op: 'add_agent_domain';   params: { key: string; description?: string } }
  | { op: 'update_agent_domain'; params: { key: string; description: string } }
  | { op: 'delete_agent_domain'; params: { key: string } }
  | { op: 'add_mcp_server';     params: Omit<AddMcpServerParams, 'agent_slug'> }
  | { op: 'update_mcp_server';  params: Omit<UpdateMcpServerParams, 'agent_slug'> }
  | { op: 'remove_mcp_server';  params: { server_id: string } }
  | { op: 'add_output_schema';  params: { name: string; fields: OutputSchemaField[] } }
  | { op: 'update_output_schema'; params: { schema_id: string; name?: string; fields?: OutputSchemaField[] } }
  | { op: 'delete_output_schema'; params: { schema_id: string } }
  | { op: 'add_context_preset'; params: ContextPresetInput }
  | { op: 'update_context_preset'; params: { name: string } & Partial<ContextPresetInput> }
  | { op: 'delete_context_preset'; params: { name: string } }
  | { op: 'set_start_node';     params: { node_id: string } };

interface BatchMutateParams {
  agent_slug: string;
  operations: MutationOp[];
  validate_after?: boolean;     // default true
}

// Semantics:
// - All ops applied in order
// - If any op fails, entire batch rolls back (atomic)
// - Maps directly to the backend's POST /agents/:agentId/graph/operations

interface BatchMutateResult {
  applied: number;
  violations?: Violation[];     // only if validate_after is true
}
```

**Usage note:** `batch_mutate` now supports ALL graph-level entity types (nodes, edges, agent domains, MCP servers, output schemas, context presets, start node). This maps directly to the backend's `OperationsBatch` schema. Prefer this for multi-step changes to ensure atomicity.

---

### 4.4 Agent Domain Tools

#### `list_agent_domains`

```typescript
interface ListAgentDomainsParams {
  agent_slug: string;
}

interface AgentDomain {
  key: string;              // "greeting", "checkout", etc.
  description: string;
  node_count: number;       // how many nodes reference this domain
}

// Returns: AgentDomain[]
```

---

#### `add_agent_domain`

```typescript
interface AddAgentDomainParams {
  agent_slug: string;
  key: string;
  description?: string;
}

// Validations:
// - key must be unique among existing domains

// Returns: { domains: AgentDomain[] }
```

---

#### `update_agent_domain`

```typescript
interface UpdateAgentDomainParams {
  agent_slug: string;
  key: string;
  description: string;
}

// Returns: { domain: AgentDomain }
```

---

#### `delete_agent_domain`

```typescript
interface DeleteAgentDomainParams {
  agent_slug: string;
  key: string;
}

// Validations:
// - Fails if any nodes still reference this domain (must reassign or delete them first)

// Returns: { deleted: true }
```

---

### 4.5 MCP Server Management

#### `list_mcp_servers`

```typescript
interface ListMcpServersParams {
  agent_slug: string;
}

interface McpServerSummary {
  id: string;
  name: string;
  enabled: boolean;
  transport_type: 'stdio' | 'sse' | 'http';
  library_item_id?: string;       // set if installed from library
  variable_count: number;         // how many variable bindings
}

// Returns: McpServerSummary[]
```

---

#### `get_mcp_server`

```typescript
interface GetMcpServerParams {
  agent_slug: string;
  server_id: string;
}

// Returns: McpServerConfig — full config including transport, variableValues, enabled
```

---

#### `add_mcp_server`

```typescript
interface AddMcpServerParams {
  agent_slug: string;
  server: {
    name: string;
    transport: McpTransport;
    enabled?: boolean;                                    // default true
    variable_values?: Record<string, VariableValue>;
  };
}

type McpTransport =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> };

type VariableValue =
  | { type: 'direct'; value: string }
  | { type: 'env_ref'; envVariableId: string };

// Returns: McpServerConfig (with auto-generated id)
```

---

#### `update_mcp_server`

```typescript
interface UpdateMcpServerParams {
  agent_slug: string;
  server_id: string;
  fields: {
    name?: string;
    transport?: McpTransport;
    enabled?: boolean;
    variable_values?: Record<string, VariableValue>;
  };
}

// Returns: McpServerConfig
```

---

#### `remove_mcp_server`

```typescript
interface RemoveMcpServerParams {
  agent_slug: string;
  server_id: string;
}

// Returns: { deleted: true }
```

---

#### `install_mcp_from_library`

```typescript
interface InstallMcpFromLibraryParams {
  agent_slug: string;
  library_item_id: string;
  variable_values?: Record<string, VariableValue>;   // bind the library item's declared variables
}

// Validations:
// - library_item_id must exist in the MCP library
// - All required variables (from the library item) must be provided

// Returns: McpServerConfig (the installed server with libraryItemId set)
```

---

### 4.6 MCP Library

#### `browse_mcp_library`

```typescript
interface BrowseMcpLibraryParams {
  query?: string;
  category?: McpCategory;    // 'Productivity' | 'Development' | 'Data & Analytics' | ... (20 categories)
  limit?: number;            // default 20
  offset?: number;           // default 0
}

interface McpLibraryListItem {
  id: string;
  name: string;
  description: string;
  category: string;
  transport_type: string;
  variables: { name: string; description?: string }[];
  installations_count: number;
  published_by: string;
  auth_type: 'none' | 'token' | 'oauth';
}

// Returns: McpLibraryListItem[]
```

---

#### `get_mcp_library_item`

```typescript
interface GetMcpLibraryItemParams {
  library_item_id: string;
}

// Returns: full McpLibraryItem including transport config, variables, image URL
```

---

### 4.7 MCP Tool Operations

#### `discover_mcp_tools`

```typescript
interface DiscoverMcpToolsParams {
  agent_slug: string;
  server_id: string;          // ID of an MCP server already in the graph
}

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;    // JSON Schema
}

// Resolves variable values and OAuth before connecting.
// Returns: McpToolInfo[]
```

---

#### `call_mcp_tool`

```typescript
interface CallMcpToolParams {
  agent_slug: string;
  server_id: string;          // ID of an MCP server already in the graph
  tool_name: string;
  args: Record<string, unknown>;
}

// Resolves variable values and OAuth before connecting.
// Returns: { success: boolean, result?: unknown, error?: { message: string, code?: string } }
```

---

### 4.8 Output Schema Management

#### `list_output_schemas`

```typescript
interface ListOutputSchemasParams {
  agent_slug: string;
}

interface OutputSchemaListItem {
  id: string;
  name: string;
  field_count: number;
  used_by_nodes: string[];    // node IDs referencing this schema
}

// Returns: OutputSchemaListItem[]
```

---

#### `get_output_schema`

```typescript
interface GetOutputSchemaParams {
  agent_slug: string;
  schema_id: string;
}

// Returns: OutputSchemaEntity { id, name, fields: OutputSchemaField[] }
```

---

#### `add_output_schema`

```typescript
interface AddOutputSchemaParams {
  agent_slug: string;
  name: string;
  fields: OutputSchemaField[];
}

interface OutputSchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array';
  required: boolean;
  description?: string;
  enumValues?: string[];           // for type === 'enum'
  items?: OutputSchemaField;       // for type === 'array'
  properties?: OutputSchemaField[]; // for type === 'object'
}

// Max nesting depth: 3

// Returns: OutputSchemaEntity (with auto-generated id)
```

---

#### `update_output_schema`

```typescript
interface UpdateOutputSchemaParams {
  agent_slug: string;
  schema_id: string;
  name?: string;
  fields?: OutputSchemaField[];
}

// Returns: OutputSchemaEntity
```

---

#### `delete_output_schema`

```typescript
interface DeleteOutputSchemaParams {
  agent_slug: string;
  schema_id: string;
}

// Validations:
// - Warns if nodes still reference this schema (their outputSchemaId will become dangling)

// Returns: { deleted: true, affected_nodes: string[] }
```

---

### 4.9 Context Preset Management

#### `list_context_presets`

```typescript
interface ListContextPresetsParams {
  agent_slug: string;
}

// Returns: ContextPreset[]
```

---

#### `add_context_preset`

```typescript
interface AddContextPresetParams {
  agent_slug: string;
  preset: {
    name: string;
    sessionId?: string;
    tenantId?: string;
    userId?: string;
    data?: Record<string, unknown>;
  };
}

// Returns: ContextPreset
```

---

#### `update_context_preset`

```typescript
interface UpdateContextPresetParams {
  agent_slug: string;
  name: string;                     // identifies the preset
  fields: {
    sessionId?: string;
    tenantId?: string;
    userId?: string;
    data?: Record<string, unknown>;
  };
}

// Returns: ContextPreset
```

---

#### `delete_context_preset`

```typescript
interface DeleteContextPresetParams {
  agent_slug: string;
  name: string;
}

// Returns: { deleted: true }
```

---

### 4.10 Environment Variables

#### `list_env_variables`

```typescript
// No parameters (org derived from auth key)

interface EnvVariableListItem {
  id: string;
  name: string;
  is_secret: boolean;
  created_at: string;
}

// Returns: EnvVariableListItem[]
```

---

#### `create_env_variable`

```typescript
interface CreateEnvVariableParams {
  name: string;
  value: string;
  is_secret?: boolean;       // default false
}

// Returns: EnvVariableListItem (value is NOT returned for security)
```

---

#### `update_env_variable`

```typescript
interface UpdateEnvVariableParams {
  variable_id: string;
  fields: {
    name?: string;
    value?: string;
    is_secret?: boolean;
  };
}

// Returns: EnvVariableListItem
```

---

#### `delete_env_variable`

```typescript
interface DeleteEnvVariableParams {
  variable_id: string;
}

// Validations:
// - Warns if any MCP servers reference this variable (their env_ref will become dangling)

// Returns: { deleted: true }
```

---

#### `get_env_variable_value`

```typescript
interface GetEnvVariableValueParams {
  variable_id: string;
}

// Returns: { value: string }
// Note: This returns the decrypted value. The Copilot may need this to verify config.
```

---

### 4.11 API Keys (Model Provider)

#### `list_api_keys`

```typescript
// No parameters

interface ApiKeyListItem {
  id: string;
  name: string;
  key_preview: string;       // e.g. "sk-or-...xxxx"
  created_at: string;
}

// Returns: ApiKeyListItem[]
```

---

#### `create_api_key`

```typescript
interface CreateApiKeyParams {
  name: string;
  key_value: string;         // the actual key (e.g. OpenRouter API key)
}

// Returns: ApiKeyListItem (key_value is NOT returned)
```

---

#### `delete_api_key`

```typescript
interface DeleteApiKeyParams {
  key_id: string;
}

// Validations:
// - Warns if any agents use this key as staging or production key

// Returns: { deleted: true }
```

---

#### `set_agent_staging_key`

```typescript
interface SetAgentStagingKeyParams {
  agent_slug: string;
  key_id: string | null;     // null to unassign
}

// Returns: { agent_slug: string, staging_api_key_id: string | null }
```

---

#### `set_agent_production_key`

```typescript
interface SetAgentProductionKeyParams {
  agent_slug: string;
  key_id: string | null;     // null to unassign
}

// Returns: { agent_slug: string, production_api_key_id: string | null }
```

---

### 4.12 Execution Keys

#### `list_execution_keys`

```typescript
// No parameters

interface ExecutionKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  agents: { agent_id: string; agent_name: string; agent_slug: string }[];
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

// Returns: ExecutionKeyListItem[]
```

---

#### `create_execution_key`

```typescript
interface CreateExecutionKeyParams {
  name: string;
  agent_ids: string[];          // UUIDs, or empty for "all agents"
  expires_at?: string | null;   // ISO date string, null for no expiry
}

// Returns: { key: ExecutionKeyListItem, full_key: string }
// Note: full_key is only returned once at creation time
```

---

#### `update_execution_key`

```typescript
interface UpdateExecutionKeyParams {
  key_id: string;
  fields: {
    name?: string;
    agent_ids?: string[];
  };
}

// Returns: ExecutionKeyListItem
```

---

#### `delete_execution_key`

```typescript
interface DeleteExecutionKeyParams {
  key_id: string;
}

// Returns: { deleted: true }
```

---

### 4.13 Publishing & Versions

#### `publish_agent`

```typescript
interface PublishAgentParams {
  agent_slug: string;
}

// Validations:
// - Runs validate_graph first; blocks publish if errors exist (warnings are OK)
// - Agent must have a production key configured

// Returns: { version: number, published_at: string }
```

---

#### `list_versions`

```typescript
interface ListVersionsParams {
  agent_slug: string;
}

interface VersionSummary {
  version: number;
  published_at: string;
  published_by: string | null;
}

// Returns: VersionSummary[]
```

---

#### `get_version`

```typescript
interface GetVersionParams {
  agent_slug: string;
  version: number;
}

// Returns: Graph — the full graph snapshot at that version
```

---

#### `restore_version`

```typescript
interface RestoreVersionParams {
  agent_slug: string;
  version: number;
}

// Returns: Graph — the restored graph (now the new draft)
```

---

### 4.14 Simulation

#### `simulate_agent`

```typescript
interface SimulateAgentParams {
  agent_slug: string;
  messages: Message[];                    // the conversation so far
  options?: {
    current_node?: string;               // default: startNode (or 'INITIAL_STEP')
    model_id?: string;                   // override model; default uses agent's staging key model
    context_preset?: string;             // name of a context preset to use
    data?: Record<string, unknown>;      // override context data (businessName, userName, etc.)
    structured_outputs?: Record<string, unknown[]>;  // prior structured output results
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SimulationResult {
  response: string | null;              // final message to user
  visited_nodes: string[];              // ordered list of nodes traversed
  node_traces: NodeTrace[];             // per-node debug data
  tool_calls: ToolCallTrace[];          // all tool calls made
  structured_outputs: Array<{ nodeId: string; data: unknown }>;
  total_tokens: { input: number; output: number; cached: number };
  total_cost_usd: number;
  total_duration_ms: number;
}

interface NodeTrace {
  node_id: string;
  step_order: number;
  messages_sent: unknown;               // raw messages sent to the LLM
  response: unknown;                    // raw LLM response
  text?: string;                        // messageToUser if any
  reasoning?: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  model: string;
}

interface ToolCallTrace {
  node_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  output: unknown;
}
```

**Usage note:** This is the most powerful tool. It executes the agent using the staging API key and returns the same level of detail shown in the dashboard's debug view. Use this to test changes after making graph modifications.

---

### 4.15 Prompt Inspection

#### `get_node_prompt`

```typescript
interface GetNodePromptParams {
  agent_slug: string;
  node_id: string;
}

interface NodePromptResult {
  node_id: string;
  kind: string;                           // 'user_reply' | 'agent_decision' | 'tool_call' | 'structured_output' | 'terminal'
  system_prompt: string;                  // the base prompt with routing instructions
  options: PromptOption[];                // the outbound options as the LLM will see them
  fallback?: {
    node_id: string;
    index: number;
  };
  output_format: string;                  // the JSON format the LLM is asked to produce
  output_schema?: OutputSchemaField[];    // if structured output node
  tool_field_instructions?: string;       // resolved toolFields prompt if applicable
  global_tools?: string[];                // global node tool names injected
  template_variables: Record<string, string>;  // {BOT_NAME}, {BUSINESS_NAME} values
}

interface PromptOption {
  index: number;
  target_node_id: string;
  precondition_type: string;
  value: string;
  description?: string;
  context_preconditions?: string[];
}
```

**Usage note:** This is a "dry run" of prompt assembly. The Copilot can use it to verify that the graph structure produces the intended LLM behavior without running a full simulation. Critical for debugging agent_decision nodes.

---

### 4.16 Validation & Analysis

#### `validate_graph`

```typescript
interface ValidateGraphParams {
  agent_slug: string;
}

interface Violation {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeIds?: string[];
  edgeRef?: { from: string; to: string };
}

// Returns: Violation[]
```

**Violation codes:**
- `ORPHAN_NODE` — node unreachable from startNode
- `DEAD_END` — non-terminal node with no outbound edges
- `MISSING_PRECONDITION` — edge from agent_decision node lacks agent_decision precondition
- `UNKNOWN_AGENT` — node references agent not in agents list
- `DUPLICATE_EDGE` — identical from/to/preconditions
- `INVALID_CONTEXT_FLAG` — contextPreconditions references unknown flag
- `BROKEN_JUMP` — jumpTo references non-existent node
- `DANGLING_SCHEMA` — node references non-existent outputSchemaId
- `DANGLING_FALLBACK` — node references non-existent fallbackNodeId
- `GLOBAL_NODE_MISSING_TOOL` — global node without exactly one outgoing tool_call edge
- `MISSING_MCP_SERVER` — tool_call edge references tool from a disabled/missing MCP server

---

#### `get_reachability`

```typescript
interface GetReachabilityParams {
  agent_slug: string;
  from_node: string;
  max_depth?: number;
}

interface ReachabilityResult {
  reachable: string[];
  unreachable: string[];
  depth_map: Record<string, number>;
}
```

---

#### `find_path`

```typescript
interface FindPathParams {
  agent_slug: string;
  from: string;
  to: string;
}

interface PathResult {
  found: boolean;
  path: string[];
  edges: Edge[];
  length: number;
}
```

---

#### `get_dead_ends`

```typescript
interface GetDeadEndsParams {
  agent_slug: string;
}

// Returns: string[] — IDs of non-terminal nodes with no outbound edges
```

---

#### `get_orphans`

```typescript
interface GetOrphansParams {
  agent_slug: string;
}

// Returns: string[] — IDs of nodes unreachable from startNode
```

---

### 4.17 Models Discovery

#### `list_available_models`

```typescript
// No parameters

interface ModelInfo {
  id: string;                  // e.g. "anthropic/claude-3.5-sonnet"
  name: string;
  provider: string;
  context_length: number;
  pricing?: {
    prompt: number;            // per million tokens
    completion: number;
  };
}

// Returns: ModelInfo[]
```

---

## 5. Phase 2 — Detailed Schemas

### 5.1 Agent Intelligence Tools

#### `get_agent_overview`

```typescript
interface GetAgentOverviewParams {
  agent_slug: string;
}

interface AgentOverview {
  agent: AgentListItem;
  graph_summary: GraphSummary;           // same as get_graph_summary
  health: AgentHealthReport;             // same as get_agent_health
  mcp_servers: McpServerSummary[];
  output_schemas: OutputSchemaListItem[];
  context_presets: string[];
  versions: VersionSummary[];
  recent_executions?: {                  // last 5 executions
    total_executions: number;
    total_cost: number;
    last_execution_at: string | null;
  };
}
```

**Usage note:** The "mega-tool" for understanding an agent. Combines `get_agent`, `get_graph_summary`, `get_agent_health`, and config data in a single call. Use this when first encountering an agent or when the user asks "tell me about this agent."

---

#### `get_agent_health`

```typescript
interface GetAgentHealthParams {
  agent_slug: string;
}

interface AgentHealthReport {
  status: 'healthy' | 'warnings' | 'errors';
  violations: Violation[];                    // from validate_graph
  orphan_nodes: string[];
  dead_end_nodes: string[];
  config_issues: ConfigIssue[];
}

interface ConfigIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

// Config issue codes:
// - NO_STAGING_KEY: no staging API key configured (can't simulate)
// - NO_PRODUCTION_KEY: no production API key configured (can't publish)
// - DISABLED_MCP_SERVER: an MCP server is disabled but referenced by edges
// - EMPTY_AGENT_DOMAIN: an agent domain exists but has no nodes
// - UNREFERENCED_SCHEMA: an output schema exists but no nodes use it
// - MISSING_ENV_VAR: an MCP variable references a deleted env variable
```

**Usage note:** A single health check that catches graph issues + config issues. Run this after making changes or before publishing.

---

#### `explain_agent_flow`

```typescript
interface ExplainAgentFlowParams {
  agent_slug: string;
  from_node?: string;          // default: startNode; narrows scope
}

interface FlowExplanation {
  summary: string;             // 2-3 sentence high-level description
  domains: DomainExplanation[];
  global_behaviors: string[];  // descriptions of global node behaviors
}

interface DomainExplanation {
  domain_key: string;
  description: string;
  entry_points: string[];      // nodes that receive traffic from outside this domain
  exit_points: string[];       // nodes that route to outside this domain
  node_count: number;
}
```

**Usage note:** Generates a natural language description of the agent's conversational flow. Useful for onboarding the Copilot or for the user to understand what an agent does.

---

### 5.2 Node Intelligence Tools

#### `get_node_full_context`

```typescript
interface GetNodeFullContextParams {
  agent_slug: string;
  node_id: string;
}

interface NodeFullContext {
  node: Node;
  prompt: NodePromptResult;                     // from get_node_prompt
  inbound_edges: EdgeWithExplanation[];
  outbound_edges: EdgeWithExplanation[];
  output_schema?: OutputSchemaEntity;
  mcp_tools_used: string[];                     // tool names from tool_call edges
  reachable_from_start: boolean;
  depth_from_start: number | null;              // null if unreachable
  is_terminal: boolean;                         // no outbound + nextNodeIsUser
}

interface EdgeWithExplanation {
  edge: Edge;
  explanation: string;                          // human-readable
  other_node_id: string;                        // the node on the other end
  other_node_text: string;                      // truncated text of other node
}
```

**Usage note:** The "tell me everything about this node" tool. Combines structural data, prompt preview, edge explanations, and connectivity info. Use when the Copilot needs to make an informed decision about modifying a specific node.

---

#### `explain_edge`

```typescript
interface ExplainEdgeParams {
  agent_slug: string;
  from: string;
  to: string;
}

interface EdgeExplanation {
  edge: Edge;
  from_node: { id: string; text: string; kind: string };
  to_node: { id: string; text: string; kind: string };
  explanation: string;                   // e.g. "When the user says 'check order status', route from Greeting to OrderLookup"
  routing_type: string;                  // 'user_said' | 'agent_decision' | 'tool_call' | 'unconditional'
  context_conditions?: string;           // e.g. "Only when USER_HAS_NAME is set"
  jump_redirect?: string;               // "After taking this edge, jumps to NodeX"
}
```

---

### 5.3 Execution Intelligence Tools

#### `get_execution_history`

```typescript
interface GetExecutionHistoryParams {
  agent_slug: string;
  limit?: number;              // default 10
}

interface AgentExecutionStats {
  agent_slug: string;
  total_executions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  unique_tenants: number;
  unique_users: number;
  unique_sessions: number;
  last_execution_at: string | null;
  recent_sessions: SessionListItem[];
}

interface SessionListItem {
  id: string;
  session_id: string;
  tenant_id: string;
  user_id: string;
  current_node_id: string;
  model: string;
  has_error: boolean;
  total_cost: number;
  created_at: string;
  updated_at: string;
}
```

---

#### `get_session_detail`

```typescript
interface GetSessionDetailParams {
  session_id: string;
}

interface SessionDetail {
  session: SessionListItem;
  executions: ExecutionSummary[];
}

interface ExecutionSummary {
  id: string;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_cost: number;
  total_duration_ms: number;
  started_at: string;
  completed_at: string;
  status: string;
  error?: string;
}
```

---

#### `get_execution_trace`

```typescript
interface GetExecutionTraceParams {
  execution_id: string;
}

interface NodeVisit {
  node_id: string;
  step_order: number;
  messages_sent: unknown;        // raw LLM messages
  response: unknown;             // raw LLM response
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost: number;
  duration_ms: number;
  model: string;
}

// Returns: NodeVisit[]
```

**Usage note:** This gives the same data as the dashboard's node-visit debug view. Use to understand exactly what happened during a real execution: what messages were sent to the LLM at each node, what the LLM responded, and which path was chosen.

---

### 5.4 Graph Convenience Tools

#### `clone_node`

```typescript
interface CloneNodeParams {
  agent_slug: string;
  node_id: string;               // source node to clone
  new_id: string;                // ID for the new node
  clone_edges?: boolean;         // default false — also clone outbound edges
}

// Semantics:
// - Creates a copy of the node with the new ID
// - If clone_edges is true, duplicates all outbound edges (pointing to same targets)
// - Inbound edges are NEVER cloned (the clone starts disconnected from the rest of the graph)

// Returns: { node: Node, cloned_edges: Edge[] }
```

---

#### `insert_node_between`

```typescript
interface InsertNodeBetweenParams {
  agent_slug: string;
  from: string;                  // existing edge source
  to: string;                    // existing edge target
  new_node: {
    id: string;
    text: string;
    kind: 'agent' | 'agent_decision';
    description?: string;
    agent?: string;
    nextNodeIsUser?: boolean;
  };
}

// Semantics (atomic via batch_mutate):
// 1. Delete edge from → to
// 2. Create new_node
// 3. Create edge from → new_node (inherits preconditions from the deleted edge)
// 4. Create edge new_node → to (unconditional)

// Returns: { node: Node, edges: { from_to_new: Edge, new_to_old: Edge } }
```

---

#### `swap_edge_target`

```typescript
interface SwapEdgeTargetParams {
  agent_slug: string;
  from: string;
  old_to: string;
  new_to: string;               // must reference an existing node
}

// Semantics (atomic):
// 1. Delete edge from → old_to
// 2. Create edge from → new_to (preserves preconditions from the deleted edge)

// Returns: { old_edge: Edge, new_edge: Edge }
```

---

#### `list_context_flags`

```typescript
interface ListContextFlagsParams {
  agent_slug: string;
}

interface ContextFlagUsage {
  flag: string;                          // e.g. "USER_HAS_NAME"
  used_in_edges: { from: string; to: string }[];
  jump_targets: string[];                // nodes that jumpTo references when this flag is active
}

// Returns: ContextFlagUsage[]
```

---

#### `get_mcp_tool_usage`

```typescript
interface GetMcpToolUsageParams {
  agent_slug: string;
}

interface McpToolUsageMap {
  servers: {
    server_id: string;
    server_name: string;
    tools_discovered: string[];          // all tools from discover
    tools_referenced: {                  // tools actually used in edges
      tool_name: string;
      used_in_edges: { from: string; to: string }[];
    }[];
    unreferenced_tools: string[];        // discovered but not used
  }[];
  edges_with_unknown_tools: {            // edges referencing tools not found in any server
    from: string;
    to: string;
    tool_name: string;
  }[];
}
```

**Usage note:** Maps the relationship between MCP servers, their tools, and which graph edges use them. Critical for understanding tool coverage and finding broken tool references.

---

#### `scaffold_agent_domain`

```typescript
interface ScaffoldAgentDomainParams {
  agent_slug: string;
  domain_key: string;                    // e.g. "returns"
  description: string;                   // e.g. "Handle product return requests"
  pattern?: 'linear' | 'decision_tree' | 'tool_loop';  // default 'linear'
}

// Semantics:
// 1. Creates the agent domain if it doesn't exist
// 2. Based on pattern, generates a starter set of nodes + edges:
//    - linear: Entry → Step1 → Step2 → End (3 nodes, 2 edges)
//    - decision_tree: Entry → Decision → BranchA / BranchB (4 nodes, 3 edges)
//    - tool_loop: Entry → ToolCall → ProcessResult → (loop back or exit) (3 nodes, 3 edges)
// 3. All generated node IDs follow the convention: {DomainKey}_{NodeName}
// 4. Does NOT connect the scaffold to the rest of the graph (that's up to the Copilot)

// Returns: { domain: AgentDomain, nodes: Node[], edges: Edge[] }
```

**Usage note:** Jumpstarts domain creation with sensible starter structures. The Copilot can then customize the scaffolded nodes and connect them to the existing graph.

---

### 5.5 Version Intelligence

#### `diff_versions`

```typescript
interface DiffVersionsParams {
  agent_slug: string;
  from_version: number | 'draft';
  to_version: number | 'draft';
}

interface VersionDiff {
  from_version: number | 'draft';
  to_version: number | 'draft';
  nodes: {
    added: Node[];
    removed: Node[];
    modified: { before: Node; after: Node; changed_fields: string[] }[];
  };
  edges: {
    added: Edge[];
    removed: Edge[];
    modified: { before: Edge; after: Edge }[];
  };
  agent_domains: {
    added: string[];
    removed: string[];
  };
  mcp_servers: {
    added: string[];        // server names
    removed: string[];
    modified: string[];
  };
  output_schemas: {
    added: string[];        // schema names
    removed: string[];
    modified: string[];
  };
  start_node_changed: boolean;
  summary: string;              // e.g. "Added 3 nodes, removed 1 edge, modified 2 nodes"
}
```

**Usage note:** Compare any two versions (or the current draft against a published version). Essential for understanding what changed between releases or verifying that a set of edits had the intended effect.

---

## 6. Tool Summary by Scope

### Org-Scoped (no `agent_slug` needed)
| Tool | Section |
|------|---------|
| `list_agents` | 3.1 |
| `create_agent` | 3.1 |
| `browse_mcp_library` | 3.6 |
| `get_mcp_library_item` | 3.6 |
| `list_env_variables` | 3.10 |
| `create_env_variable` | 3.10 |
| `update_env_variable` | 3.10 |
| `delete_env_variable` | 3.10 |
| `get_env_variable_value` | 3.10 |
| `list_api_keys` | 3.11 |
| `create_api_key` | 3.11 |
| `delete_api_key` | 3.11 |
| `list_execution_keys` | 3.12 |
| `create_execution_key` | 3.12 |
| `update_execution_key` | 3.12 |
| `delete_execution_key` | 3.12 |
| `list_available_models` | 3.17 |

### Agent-Scoped (require `agent_slug`)
All other tools (67 of 84).

### Session-Scoped (reference specific sessions/executions)
| Tool | Section |
|------|---------|
| `get_session_detail` | 5.3 |
| `get_execution_trace` | 5.3 |
