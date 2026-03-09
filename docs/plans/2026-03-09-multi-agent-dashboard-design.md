# Multi-Agent Dashboard Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let authenticated users create, list, edit, delete, and save agents — each agent owns a graph stored in Supabase.

**Architecture:** New `agents` table (JSONB graph data). Dashboard at `/` lists agents in a table. Editor at `/editor/[slug]` loads the GraphBuilder with data from DB. Save button in toolbar with dirty-state tracking and tab-close protection.

**Tech Stack:** Supabase (Postgres + RLS), Next.js 16 App Router, React 19, shadcn/ui, next-intl, @xyflow/react

---

## Database

Single `agents` table:

```sql
CREATE TABLE public.agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  graph_data  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agents_user_id ON public.agents(user_id);
CREATE INDEX idx_agents_slug ON public.agents(slug);
```

- RLS: users can SELECT/INSERT/UPDATE/DELETE only their own rows (`auth.uid() = user_id`)
- Trigger: auto-update `updated_at` on every UPDATE
- `graph_data` stores the same shape as the current export: `{ startNode, agents, nodes, edges, mcpServers }`
- Slug is globally unique (DB constraint)

## Routing

| Route | Type | Purpose |
|-------|------|---------|
| `/` | Protected | Agent dashboard — list user's agents |
| `/editor/[slug]` | Protected | Graph editor for a specific agent |
| `/login`, `/signup`, `/forgot-password` | Guest-only | Auth pages |
| `/auth/callback`, `/reset-password` | Public | Auth callbacks |

## Dashboard (`/`)

- Server component fetches agents for current user (id, name, slug, description, updated_at — excludes graph_data)
- Simple table: name, description, relative updated time, edit/delete action buttons
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
- Passes `graph_data` and agent metadata (id, name) as props to client GraphBuilder
- New agents start with a blank graph (just the INITIAL_STEP start node)

## Save Flow

- **Dirty tracking:** store last-saved graph as a ref; on every node/edge change, compare current state to ref via JSON serialization
- **Save button:** standalone in toolbar, after play button area
  - Saved state: check icon, ghost/muted style
  - Unsaved state: warning indicator (orange), more prominent
- **On save:** serialize graph (same as export), UPDATE `agents.graph_data` and `updated_at` in Supabase, reset dirty flag
- **Keyboard shortcut:** Cmd+S / Ctrl+S (preventDefault on browser save)
- **Tab close:** register `beforeunload` when dirty, remove when clean

## New Files

- `supabase/migrations/..._create_agents_table.sql`
- `app/page.tsx` — agent dashboard (replaces current editor home)
- `app/components/agents/AgentTable.tsx`
- `app/components/agents/CreateAgentDialog.tsx`
- `app/components/agents/DeleteAgentDialog.tsx`
- `app/editor/[slug]/page.tsx`
- `app/components/panels/SaveButton.tsx`
- `app/lib/agents.ts` — Supabase CRUD helpers
- `app/lib/slug.ts` — slug generation

## Modified Files

- `app/components/panels/Toolbar.tsx` — add save button slot
- `app/components/GraphBuilder.tsx` — accept initial data prop, expose save, track dirty state, Cmd+S, beforeunload
- `messages/en.json` — new translation keys

## Translations

```json
"agents": {
  "title": "My Agents",
  "empty": "No agents yet. Create your first one.",
  "create": "Create agent",
  "name": "Name",
  "namePlaceholder": "My Agent",
  "description": "Description",
  "descriptionPlaceholder": "What does this agent do?",
  "updated": "Updated",
  "actions": "Actions",
  "edit": "Edit",
  "delete": "Delete",
  "deleteTitle": "Delete agent",
  "deleteDescription": "This will permanently delete \"{name}\". This action cannot be undone.",
  "deleteConfirm": "Delete",
  "deleteCancel": "Cancel",
  "slugTaken": "An agent with this name already exists. Try a different name."
},
"editor": {
  "save": "Save",
  "saved": "Saved",
  "unsavedChanges": "Unsaved changes",
  "notFound": "Agent not found"
}
```
