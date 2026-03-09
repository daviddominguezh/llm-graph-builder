# Multi-Agent Dashboard Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let authenticated users create, list, edit, delete, and publish agents — each agent owns a graph stored in Supabase with staging/production separation.

**Architecture:** New `agents` table with two JSONB columns (staging + production). Dashboard at `/` lists agents in a table. Editor at `/editor/[slug]` loads the GraphBuilder with staging data from DB. Auto-save (debounced 2s) writes to staging. Publish button promotes staging to production with version increment.

**Tech Stack:** Supabase (Postgres + RLS), Next.js 16 App Router, React 19, shadcn/ui, next-intl, @xyflow/react

---

## Database

Single `agents` table:

```sql
CREATE TABLE public.agents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  description           TEXT DEFAULT '',
  graph_data_staging    JSONB NOT NULL DEFAULT '{}',
  graph_data_production JSONB NOT NULL DEFAULT '{}',
  version               INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agents_user_id ON public.agents(user_id);
CREATE INDEX idx_agents_slug ON public.agents(slug);
```

- RLS: users can SELECT/INSERT/UPDATE/DELETE only their own rows (`auth.uid() = user_id`)
- Trigger: auto-update `updated_at` on every UPDATE
- `graph_data_staging` / `graph_data_production` store the same shape as the current export: `{ startNode, agents, nodes, edges, mcpServers }`
- `version` starts at 0, increments on each publish
- Slug is globally unique (DB constraint)

## Routing

| Route | Type | Purpose |
|-------|------|---------|
| `/` | Protected | Agent dashboard — list user's agents |
| `/editor/[slug]` | Protected | Graph editor for a specific agent |
| `/login`, `/signup`, `/forgot-password` | Guest-only | Auth pages |
| `/auth/callback`, `/reset-password` | Public | Auth callbacks |

## Dashboard (`/`)

- Server component fetches agents for current user (id, name, slug, description, version, updated_at — excludes graph data)
- Simple table: name, description, version, relative updated time, edit/delete action buttons
- "Create agent" button opens a shadcn Dialog with name (required) + description (optional)
- Clicking a row or "Edit" navigates to `/editor/[slug]`
- "Delete" opens shadcn AlertDialog confirmation, then deletes from DB
- Empty state message when no agents exist

## Slug Generation

- Derived from agent name: lowercase, replace spaces with hyphens, strip non-alphanumeric (except hyphens), collapse consecutive hyphens, trim leading/trailing hyphens
- On collision, append `-2`, `-3`, etc.
- Uniqueness verified against DB before insert

## Editor (`/editor/[slug]`)

- Server component fetches agent by slug, verifies ownership via RLS
- If not found → redirect to `/`
- Passes `graph_data_staging` and agent metadata (id, name, version) as props to client GraphBuilder
- New agents start with a blank graph (just the INITIAL_STEP start node)

## Auto-Save Flow

- **Debounced auto-save:** on every node/edge change, debounce 20 seconds of inactivity, then serialize graph and UPDATE `graph_data_staging` in Supabase
- **Saving indicator:** during the 20s debounce window (changes exist but haven't been persisted yet), show a "Saving..." state in the toolbar so the user knows their changes are pending
- **Tab close protection:** when changes are unsaved (during debounce window), register `beforeunload` to show browser's native "Leave site?" confirmation
- After auto-save completes, indicator clears and beforeunload is removed
- On auto-save error, show a toast notification

## Publish Flow

- **Publish button:** always visible in toolbar, shows "Publish" label
- Disabled when `graph_data_staging === graph_data_production` (nothing to publish)
- Enabled when staging differs from production
- On click: UPDATE `graph_data_production = graph_data_staging`, increment `version` by 1
- After publish, button becomes disabled again until next change

## New Files

- `supabase/migrations/..._create_agents_table.sql`
- `app/page.tsx` — agent dashboard (replaces current editor home)
- `app/components/agents/AgentTable.tsx`
- `app/components/agents/CreateAgentDialog.tsx`
- `app/components/agents/DeleteAgentDialog.tsx`
- `app/editor/[slug]/page.tsx`
- `app/components/panels/PublishButton.tsx`
- `app/hooks/useAutoSave.ts` — debounced auto-save hook
- `app/lib/agents.ts` — Supabase CRUD helpers
- `app/lib/slug.ts` — slug generation

## Modified Files

- `app/components/panels/Toolbar.tsx` — add publish button slot
- `app/components/GraphBuilder.tsx` — accept initial data prop, blank canvas default, integrate auto-save and publish
- `app/utils/loadGraphData.ts` — default to null (blank canvas)
- `messages/en.json` — new translation keys

## Translations

```json
"agents": {
  "title": "My Agents",
  "empty": "No agents yet. Create your first one.",
  "create": "Create agent",
  "name": "Name",
  "namePlaceholder": "My Agent",
  "nameRequired": "Agent name is required.",
  "description": "Description",
  "descriptionPlaceholder": "What does this agent do?",
  "version": "Version",
  "updated": "Updated",
  "actions": "Actions",
  "edit": "Edit",
  "delete": "Delete",
  "deleteTitle": "Delete agent",
  "deleteDescription": "This will permanently delete \"{name}\". This action cannot be undone.",
  "deleteConfirm": "Delete",
  "deleteCancel": "Cancel",
  "slugTaken": "An agent with this name already exists. Try a different name.",
  "createError": "Failed to create agent. Please try again."
},
"editor": {
  "publish": "Publish",
  "publishFailed": "Failed to publish. Please try again.",
  "saving": "Saving...",
  "autoSaveFailed": "Auto-save failed. Your changes may not be saved.",
  "notFound": "Agent not found"
}
```
