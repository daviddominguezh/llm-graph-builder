# Agent Marketplace & Templates — Design Spec

## Overview

Enable agent creators to publish their agents as public templates. Other users can browse, preview, and create new agents from these templates. The marketplace is a read-only storefront for agent graphs — no secrets, API keys, execution data, or environment variables are ever exposed.

---

## 1. Database Schema

### 1.1 Changes to `agents` table

Add three columns. Note: `created_from_template_id` must be added after `agent_templates` is created (see migration ordering in Section 1.2).

```sql
-- First: add is_public and category (no dependency on agent_templates)
ALTER TABLE agents
  ADD COLUMN is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN category text NOT NULL DEFAULT 'other';

-- After agent_templates table is created:
ALTER TABLE agents
  ADD COLUMN created_from_template_id uuid REFERENCES agent_templates(id) ON DELETE SET NULL;
```

- `is_public` — controls marketplace visibility. Private by default.
- `category` — fixed enum enforced at application level (see Section 1.3).
- `created_from_template_id` — lineage pointer. `SET NULL` on template deletion so cloned agents survive.

### 1.2 New table: `agent_templates`

Denormalized marketplace view optimized for browsing. One row per public, published agent.

```sql
CREATE TABLE agent_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          uuid NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  org_slug          text NOT NULL,
  org_avatar_url    text,
  agent_slug        text NOT NULL,
  agent_name        text NOT NULL,
  description       text NOT NULL DEFAULT '',
  category          text NOT NULL DEFAULT 'other',
  node_count        integer NOT NULL DEFAULT 0,
  mcp_server_count  integer NOT NULL DEFAULT 0,
  download_count    integer NOT NULL DEFAULT 0,
  latest_version    integer NOT NULL DEFAULT 1,
  template_graph_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

**RLS policies:**
- `SELECT` — any authenticated user.
- `INSERT / UPDATE / DELETE` — only members of the owning org.

**Indexes:**
- `idx_agent_templates_category` on `category`
- `idx_agent_templates_download_count` on `download_count DESC`
- Full-text index on `agent_name`, `description`, `category` for search

### 1.3 Fixed categories

```
customer-support, sales, marketing, engineering, data-analysis,
content-creation, research, operations, hr-recruiting,
legal-compliance, finance, education, e-commerce, other
```

Enforced via application-level validation (Zod enum), not a DB constraint. This allows adding categories without migrations.

### 1.4 `template_graph_data` shape

This JSONB column stores a **security-safe** graph snapshot. It is assembled by `assembleTemplateSafeGraph` which never reads secret columns.

```ts
interface TemplateGraphData {
  startNode: string;
  nodes: TemplateNode[];          // id, kind, text, description, position, etc.
  edges: TemplateEdge[];          // from, to, preconditions
  agents: TemplateSubAgent[];     // agent_key, description
  contextPresets: TemplateContextPreset[];
  outputSchemas: TemplateOutputSchema[];
  mcpServers: TemplateMcpServer[];
}

// Library-based MCP: only a reference
interface LibraryMcpRef {
  type: 'library';
  libraryItemId: string;
  name: string;
}

// Custom MCP: skeleton only
interface CustomMcpSkeleton {
  type: 'custom';
  name: string;
  transportType: string;
  headerKeys: string[];   // e.g. ["Authorization", "X-Workspace-Id"]
}

type TemplateMcpServer = LibraryMcpRef | CustomMcpSkeleton;
```

**Security invariant**: `assembleTemplateSafeGraph` is a single function that parses the `graph_data` JSONB snapshot from `agent_versions` and extracts only structural fields (nodes, edges, preconditions, sub-agents, presets, output schemas). For MCP servers, it emits only safe references — never reading `variable_values` or full `transport_config`. It never queries API key columns or `org_env_variables`. This function is the only code path that produces template graph data — used both for storing in `agent_templates` and for assembling a specific version on-the-fly during clone.

---

## 2. Backend Routes

### 2.1 New routes

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/templates` | Browse/search marketplace | Any authenticated user |
| `GET` | `/templates/:agentId/versions` | List published versions for a template | Any authenticated user |
| `GET` | `/templates/:agentId/versions/:version` | Get safe graph snapshot for preview/clone | Any authenticated user |
| `PATCH` | `/agents/:agentId/visibility` | Toggle `is_public` | Org member |
| `PATCH` | `/agents/:agentId/category` | Update category | Org member |
| `PATCH` | `/agents/:agentId/metadata` | Update name, description | Org member |

### 2.2 `GET /templates` query params

- `search` — full-text across name, description, category
- `category` — filter by exact category
- `sort` — `downloads` (default), `newest`, `updated`
- `limit` — default 15, max 50
- `offset` — for pagination

Returns: array of `agent_templates` rows (without `template_graph_data` to keep the listing response light).

### 2.3 `GET /templates/:agentId/versions/:version`

Calls `assembleTemplateSafeGraph` against the requested version's data in `agent_versions`. Returns the safe graph snapshot. Used for:
- Preview modal (read-only graph render)
- Clone flow (populating new agent's staging tables)

### 2.4 Extended `POST /agents`

New optional fields in request body:
- `category` (required, string)
- `isPublic` (boolean, default false)
- `templateAgentId` (uuid, optional)
- `templateVersion` (integer, optional)

When `templateAgentId` + `templateVersion` are provided:
1. Create agent as today (name, description, category, is_public).
2. Set `created_from_template_id` to the `agent_templates.id` for that agent.
3. Fetch the safe graph snapshot via `assembleTemplateSafeGraph` for the requested version.
4. Insert structural data into new agent's staging tables: `graph_nodes`, `graph_edges`, `graph_edge_preconditions`, `graph_edge_context_preconditions`, `graph_agents`, `graph_output_schemas`, `graph_context_presets`.
5. For MCP servers:
   - Library-based: insert with `library_item_id` reference, `variable_values = null`.
   - Custom: insert with `name`, `transport_type`, empty `transport_config`, `variable_values = null`.
6. Increment `download_count` on `agent_templates`.

### 2.5 `assembleTemplateSafeGraph` function

Single, auditable function. Inputs: `agentId`, `version`. Steps:
1. Load the `agent_versions` row for the given version.
2. Extract from `graph_data` JSON: nodes, edges, preconditions, sub-agents, context presets, output schemas.
3. For MCP servers in `graph_data`:
   - If `library_item_id` present → emit `LibraryMcpRef` (only `libraryItemId` + `name`).
   - Otherwise → emit `CustomMcpSkeleton` (only `name`, `transport_type`, header keys from `transport_config.headers` keys).
4. Return `TemplateGraphData`.

This function **never reads**: `variable_values`, full `transport_config` for custom MCPs, `staging_api_key_id`, `production_api_key_id`, `org_env_variables`, or any execution/session data.

---

## 3. Sync Lifecycle

All sync is transactional — no background jobs, no eventual consistency.

| Event | Action on `agent_templates` |
|-------|---------------------------|
| Agent published + `is_public = true` | **Upsert** — refresh `template_graph_data`, `node_count`, `mcp_server_count`, `latest_version`, metadata |
| Agent published + `is_public = false` | **No-op** |
| `is_public` toggled ON | **Upsert** full row from latest published version. Reject if agent has 0 published versions. |
| `is_public` toggled OFF | **Delete** row |
| Agent metadata updated (name, description, category) | **Update** row if exists |
| Agent deleted | **CASCADE** via FK |
| Org slug or avatar changes | **Update** all template rows for that `org_id` |
| Agent slug changes | **Update** the template row for that `agent_id` |

**Edge cases:**
- Toggle public on unpublished agent → error: "Publish your agent at least once before making it public."
- `download_count` persists across public/private cycles (never reset).

---

## 4. Frontend

### 4.1 Agent Creation Dialog (2-step wizard)

Replaces current `CreateAgentDialog`. Larger modal (`max-w-3xl` or similar).

**Step 1 — Template Selection:**
- Search bar at top (searches name, description, category).
- Category filter pills below search.
- Grid of template cards. **First card is always "Blank Canvas"** — same size and prominence as template cards.
- Each template card shows:
  - Org profile picture (or fallback initial) + `{orgSlug}/{agentSlug}`
  - Description (truncated ~2 lines)
  - Category badge
  - Stats row: node count, MCP server count, download count
  - Inline borderless version combobox (styled like `SimulationModelSelector` — no border, transparent bg, compact text). Defaults to "latest". Lists all published versions.
  - "Preview" button — opens read-only graph modal (Section 4.3)
- Clicking a card selects it (ring/border highlight).
- "Next" button at bottom (disabled until a card is selected).

**Step 2 — Agent Details:**
- Name (required)
- Description (required)
- Category dropdown (fixed list, required)
- "Make public" checkbox with explanation: "Other users will be able to create copies of this agent's graph. They won't have access to your API keys, secrets, or execution data."
- "Back" button to return to step 1 (preserves selection).
- "Create" button.

### 4.2 Settings Panel

Replaces the current placeholder in `EditorTabs.tsx` settings tab.

**Sections:**
- **Description** — editable textarea + save button.
- **Category** — dropdown + save button.
- **Visibility** — public/private toggle. Toggling triggers a confirmation dialog:
  - ON: "Your agent's published graph will become visible to all users in the marketplace. No secrets or execution data will be shared."
  - OFF: "Your agent will be removed from the marketplace. Users who already created copies will keep them."
- **Danger Zone** — delete agent button with confirmation dialog (reuse existing `DeleteAgentDialog`).

### 4.3 Read-Only Graph Preview Modal

Opens from the "Preview" button on template cards. Renders the graph using `@xyflow/react` with all interaction disabled:

```
nodesDraggable={false}
nodesConnectable={false}
elementsSelectable={false}
edgesFocusable={false}
nodesFocusable={false}
panOnDrag={true}         // allow panning to explore
zoomOnScroll={true}      // allow zooming
```

**Security hardening:**
- Data source is `template_graph_data` only — never fetches from graph editing or execution APIs.
- No simulation panel, no toolbar, no publish button, no API key UI.
- No edit operations wired — the component receives static node/edge arrays, no mutation callbacks.
- The preview component must be a separate component from the editor, not the editor with flags. This prevents accidental leakage of edit/execute capabilities through shared state or context providers.

The preview shows:
- Nodes rendered with their kind (agent, agent_decision, tool) and labels.
- Edges with precondition labels.
- A panel or overlay showing agent name, description, org, version.

### 4.4 Internationalization

All new user-facing strings require translation keys:
- `marketplace.*` — template browsing (search placeholder, category names, stats labels, blank canvas, etc.)
- `agents.category`, `agents.isPublic`, `agents.publicExplanation`, etc.
- `settings.*` — settings panel labels, confirmation dialog messages.
- Category display names (e.g., `categories.customer-support` → "Customer Support").

---

## 5. Security Summary

| Data | Exposed in marketplace? | Exposed in preview? | Copied to clone? |
|------|------------------------|--------------------|--------------------|
| Graph structure (nodes, edges, preconditions) | No (only counts) | Yes (read-only) | Yes |
| Node labels, descriptions, kinds | No | Yes | Yes |
| MCP server names | No (only count) | Yes | Yes |
| MCP `library_item_id` | No | Yes | Yes (as reference) |
| MCP `transport_config` | **Never** | **Never** | **Never** |
| MCP `variable_values` | **Never** | **Never** | **Never** |
| MCP header keys (custom only) | No | Yes | Yes |
| API keys (staging/production) | **Never** | **Never** | **Never** |
| `org_env_variables` | **Never** | **Never** | **Never** |
| Execution data (sessions, traces, logs) | **Never** | **Never** | **Never** |
| Sub-agent definitions | No | Yes | Yes |
| Context presets | No | Yes | Yes (structure only) |
| Output schemas | No | Yes | Yes |

**Enforcement**: `assembleTemplateSafeGraph` is the sole function that produces any graph data for the marketplace/preview/clone paths. It reads only structural columns. The preview component is a separate, isolated component with no edit/execute wiring.

---

## 6. File Impact Summary

### New files (web)
- `app/components/agents/CreateAgentWizard.tsx` — 2-step creation dialog
- `app/components/agents/TemplateCard.tsx` — template card component
- `app/components/agents/TemplateGrid.tsx` — grid + search + filters
- `app/components/agents/TemplateVersionSelector.tsx` — borderless version combobox
- `app/components/agents/TemplatePreviewModal.tsx` — read-only graph preview
- `app/components/agents/SettingsPanel.tsx` — settings tab content
- `app/components/agents/VisibilityToggle.tsx` — public/private toggle with confirmation
- `app/lib/templates.ts` — template API client functions
- `app/actions/templates.ts` — server actions for template browsing
- `app/actions/agentSettings.ts` — server actions for metadata/visibility/category updates

### Modified files (web)
- `app/components/agents/AgentsSidebar.tsx` — update to use new wizard dialog
- `app/orgs/[slug]/(dashboard)/(agents)/editor/[agentSlug]/EditorTabs.tsx` — wire settings panel
- `app/lib/agents.ts` — add `category`, `is_public`, `created_from_template_id` to types
- `app/actions/agents.ts` — extend `createAgentAction` with template/category/visibility params

### New files (backend)
- `src/routes/templates/templateRouter.ts` — template routes
- `src/routes/templates/browseTemplates.ts` — GET /templates
- `src/routes/templates/getTemplateVersions.ts` — GET /templates/:agentId/versions
- `src/routes/templates/getTemplateVersionSnapshot.ts` — GET /templates/:agentId/versions/:version
- `src/routes/agents/updateVisibility.ts` — PATCH visibility
- `src/routes/agents/updateCategory.ts` — PATCH category
- `src/routes/agents/updateMetadata.ts` — PATCH metadata
- `src/db/queries/templateQueries.ts` — template CRUD + sync functions
- `src/db/queries/assembleTemplateSafeGraph.ts` — the single safe assembly function

### Modified files (backend)
- `src/routes/agents/createAgent.ts` — handle template cloning + category + is_public
- `src/routes/agents/agentRouter.ts` — register new routes
- `src/routes/graph/postPublish.ts` — trigger template sync on publish
- `src/db/queries/agentQueries.ts` — add is_public, category columns

### New files (migrations)
- `supabase/migrations/YYYYMMDD_agent_marketplace.sql` — schema changes + RLS

### Translation files
- Add keys under `marketplace`, `settings`, `categories` namespaces
