# App Types & Agent Support (Sub-project 1) — Design Spec

## Overview

Introduce the concept of "app types" — workflows (existing) and agents (new). This sub-project covers the data model, wizard type selection, template filtering, and UI text rename. The agent editor, runtime, and debug views are separate sub-projects.

---

## 1. Database Schema

### 1.1 Changes to `agents` table

```sql
ALTER TABLE public.agents
  ADD COLUMN app_type text NOT NULL DEFAULT 'workflow',
  ADD COLUMN system_prompt text,
  ADD COLUMN max_steps integer;
```

- `app_type` — `'workflow'` or `'agent'`. All existing rows default to `'workflow'`.
- `system_prompt` — null for workflows. Required for agents (enforced at application level).
- `max_steps` — null means unlimited. Only applies to agents.

### 1.2 New table: `agent_context_items`

Ordered context strings for agents. One-to-many relationship.

```sql
CREATE TABLE public.agent_context_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  content    text NOT NULL,
  UNIQUE(agent_id, sort_order)
);

ALTER TABLE public.agent_context_items ENABLE ROW LEVEL SECURITY;

-- Same org-member RLS pattern as graph tables
CREATE POLICY "Org members can read context items"
  ON public.agent_context_items FOR SELECT
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can insert context items"
  ON public.agent_context_items FOR INSERT
  WITH CHECK (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can update context items"
  ON public.agent_context_items FOR UPDATE
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can delete context items"
  ON public.agent_context_items FOR DELETE
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));
```

### 1.3 Changes to `agent_templates` table

```sql
ALTER TABLE public.agent_templates
  ADD COLUMN app_type text NOT NULL DEFAULT 'workflow',
  ADD COLUMN template_agent_config jsonb;
```

- `app_type` — matches the source agent's type.
- `template_agent_config` — JSONB snapshot for agent templates, null for workflows.

Shape:
```ts
interface TemplateAgentConfig {
  systemPrompt: string;
  contextItems: string[];
  maxSteps: number | null;
  mcpServers: TemplateMcpServer[];  // same safe format as workflow templates
}
```

`template_graph_data` stays null for agent templates.

### 1.4 Index

```sql
CREATE INDEX idx_agent_templates_app_type ON public.agent_templates(app_type);
```

---

## 2. Backend

### 2.1 `POST /agents` (create)

New optional field in request body:
- `appType` — `'workflow' | 'agent'`, defaults to `'workflow'`

Inserts `app_type` into the agents row. For agents, `system_prompt` starts as empty string, no context items, no max_steps.

### 2.2 `GET /templates`

New optional query param: `app_type` — filters `agent_templates.app_type`.

Added to `BrowseTemplateOptions` and the query builder in `browseTemplates`.

### 2.3 Template sync

`syncTemplateAfterPublish` checks `app_type`:

**Workflow** (existing behavior): assembles `template_graph_data` via `assembleTemplateSafeGraph`, sets `template_agent_config = null`.

**Agent** (new): assembles `template_agent_config` from:
- `agents.system_prompt`
- `agents.max_steps`
- `agent_context_items` (ordered by `sort_order`)
- MCP servers from `graph_mcp_servers` (using the same `toTemplateMcpServer` stripping logic)

Sets `template_graph_data = null`.

Both types: upserts the `app_type` column on the template row.

### 2.4 Clone flow

Extended in `createAgent` handler:

**Workflow clone** (unchanged): copies nodes, edges, MCPs from `template_graph_data`.

**Agent clone** (new): from `template_agent_config`:
- Sets `system_prompt` on the new agent
- Sets `max_steps` on the new agent
- Inserts `agent_context_items` rows
- Inserts MCP servers (library MCPs pull from `mcp_library`, custom use preserved URL)

### 2.5 Type changes

**`AgentRow`**: add `app_type: string`, `system_prompt: string | null`, `max_steps: number | null`

**`TemplateRow`**: add `app_type: string`

**`InsertAgentInput`**: add `appType: string`

**`BrowseTemplateOptions`**: add `appType?: string`

---

## 3. Frontend

### 3.1 Type updates

**`AgentRow`** (web): add `app_type: string`, `system_prompt: string | null`, `max_steps: number | null`

**`TemplateListItem`**: add `app_type: string`

**`BrowseTemplateParams`**: add `appType?: string`

**`CreateAgentParams`**: add `appType?: string`

### 3.2 Wizard — App type selection

Inside step 1 of `CreateAgentWizard`, above the template grid:

**Two selectable cards** (same pattern as visibility Private/Public cards):
- **Workflow** — GitFork icon, "Workflow", "Build a graph of connected nodes with conditional routing"
- **Agent** — Bot icon, "Agent", "Configure a system prompt, context, and tools with an execution loop"

State: `appType: 'workflow' | 'agent' | null` (starts null).

Behavior:
- Neither selected by default
- Clicking a selected card deselects it (toggle)
- Template grid only appears after a type is selected
- Template grid filters by `app_type` matching selection
- "Blank Canvas" always available
- "Next" disabled until both type AND template/blank selected
- Switching type clears template selection

### 3.3 Template grid filtering

`TemplateGrid` gains `appType` prop, passes to `browseTemplatesAction({ appType })`.

`useTemplatesPrefetch` fetches all templates (both types). Client-side filtering in the grid by `appType`.

### 3.4 Creation flow

`createAgentAction` passes `appType` to `POST /agents`.

Step 2 (details) unchanged — name, description, category, visibility. The `app_type` is set from step 1.

### 3.5 UI text rename

All user-facing text that says "agent" becomes "app" in translations. Examples:
- "Create agent" → "Create app"
- "Agent details" → "App details"
- Sidebar title "Agents" → "Apps"
- "Delete this agent" → "Delete this app"

Internal code (component names, variable names, API routes, DB tables) stays as-is.

---

## 4. File Impact Summary

### New files
- `supabase/migrations/20260327000000_app_types.sql`

### Modified files (backend)
- `src/db/queries/agentQueries.ts` — `AgentRow` + `InsertAgentInput` types, insert logic
- `src/db/queries/templateQueries.ts` — `TemplateRow` type, browse filtering
- `src/db/queries/templateSync.ts` — agent config assembly + sync
- `src/db/queries/cloneTemplateGraph.ts` — agent clone path
- `src/routes/agents/createAgent.ts` — accept `appType`
- `src/routes/templates/templateHelpers.ts` — parse `app_type` query param
- `src/routes/templates/browseTemplates.ts` — pass filter

### Modified files (frontend)
- `app/lib/agents.ts` — `AgentRow` type
- `app/lib/templates.ts` — `TemplateListItem`, `BrowseTemplateParams` types
- `app/actions/agents.ts` — pass `appType`
- `app/hooks/useTemplatesPrefetch.ts` — fetch both types
- `app/components/agents/CreateAgentWizard.tsx` — `appType` state, type cards
- `app/components/agents/TemplateGrid.tsx` — `appType` prop, filtering
- `messages/en.json` — rename agent → app in user-facing text
