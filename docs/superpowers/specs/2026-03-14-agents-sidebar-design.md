# Agents Sidebar & Empty State Design

## Overview

Redesign the agents sidebar list and empty state to be status-oriented, high-density, and minimalistic. Every pixel earns its place.

## Agent Cards

### Layout

Each card is a compact row, ~32px height, full sidebar width minus padding. No border or background by default.

**Anatomy (left to right):**

1. **Status bar** — 2px wide vertical strip, full card height, rounded ends
2. **8px gap**
3. **Agent name** — `text-sm font-medium text-foreground`, single line, truncated
4. **Flex spacer**
5. **Version badge** — `text-[11px] text-muted-foreground`, right-aligned, format: `v3`

### Status Colors

Three states derived from data. The status bar uses `bg-` classes (it's a background element, not text):

| State | Color | Condition |
|---|---|---|
| Draft | `bg-muted-foreground/30` | `version === 0` |
| Published | `bg-green-500` | `version > 0` AND `updated_at <= published_at` |
| Unpublished changes | `bg-amber-500` | `version > 0` AND `updated_at > published_at` |

### Interaction States

- **Default**: No background, no border. Just the strip + text.
- **Hover**: `bg-muted` background, smooth transition.
- **Active (selected)**: `bg-primary/10` background, status bar becomes `bg-primary`.

### Tooltip

On hover, show a tooltip (shadcn Tooltip) containing:
- Description (if present)
- Last updated (relative time, e.g., "2 days ago")

The tooltip appears after a short delay and does not interfere with click navigation since both behaviors (hover = tooltip, click = navigate) operate on the same Link element.

## Sidebar Structure

Top to bottom:

1. **Header row** (~36px) — "Agents" label (`text-sm font-semibold`) + Plus icon button (opens CreateAgentDialog)
2. **Search input** (~32px) — Always visible, compact, no label. Placeholder: "Search..." (`agents.search` translation). Small search icon. Filters agent list by name, case-insensitive `includes()` match. No debounce needed at this scale.
3. **Agent list** — Scrollable, fills remaining height. Uses the card design above.

**Search empty state**: When search filters out all agents, show "No matching agents" (`agents.noResults` translation) instead of the "No agents yet" message.

## Empty States

The empty state page is a server component. It resolves the org from route params, then fetches agents via `getCachedAgentsByOrg` (see Data Changes). Since the layout calls the same cached function during the same render, no duplicate DB query occurs.

```ts
// (agents)/page.tsx pattern:
const { slug } = await params;
const supabase = await createClient();
const { result: org } = await getOrgBySlug(supabase, slug);
if (!org) redirect('/');
const { agents } = await getCachedAgentsByOrg(supabase, org.id);
// Render State A if agents.length === 0, else State B
```

### State A: Zero agents (new org)

Centered in the content area (right of the sidebar):

- **Illustration**: Minimal abstract inline SVG — a single rounded-rect node outline (dashed stroke), with a small plus icon inside. Monochrome using `currentColor`, accented with `text-primary` on the plus. ~80x80px viewBox. Thin 1.5px strokes.
- **16px gap**
- **Heading**: "Create your first agent" (`agents.createFirst`) — `text-lg font-medium text-foreground`
- **4px gap**
- **Subtext**: "Agents are workflows that connect LLM steps, tools, and decisions." (`agents.createFirstDescription`) — `text-sm text-muted-foreground`, `max-w-xs`, centered
- **16px gap**
- **CTA**: Primary button with Plus icon, label from existing `agents.create` key. Opens CreateAgentDialog.

### State B: Has agents, none selected

Centered in the content area:

- A subtle left-pointing arrow icon (~20px, `text-muted-foreground/50`) next to the text "Select an agent" (`agents.selectAgent`, already exists) — `text-sm text-muted-foreground`
- Horizontally + vertically centered
- No illustration, no heading, no button — this is a transient waypoint

## Data Changes

### Cached `getAgentsByOrg`

Wrap `getAgentsByOrg` with `React.cache` so that when both the `(agents)/layout.tsx` and `(agents)/page.tsx` call it during the same server render, the database query executes only once:

```ts
import { cache } from 'react';

export const getCachedAgentsByOrg = cache(getAgentsByOrg);
```

Both the layout and the page import `getCachedAgentsByOrg` instead of `getAgentsByOrg` directly.

### `getAgentsByOrg` query modification

Current query selects: `id, name, slug, description, version, updated_at`.

**Prerequisite**: The `agent_versions` table already exists (created in migration `20260309500000_normalized_graph_storage.sql`).

**Approach: Two queries, merged in TypeScript.** The Supabase JS client (PostgREST) does not support `LEFT JOIN LATERAL`. Instead:

1. Fetch agents from `agents` table (existing query).
2. Fetch the latest `published_at` per agent from `agent_versions`.
3. Merge the results in TypeScript.

Both queries run in parallel with `Promise.all`. Query 2 is skipped when there are no agents (empty `agentIds` array would cause a PostgREST error with `.in()`).

```ts
// Inside getAgentsByOrg, after existing error handling:

// Query 1: agents (existing)
const { data: agentRows, error } = await supabase
  .from('agents')
  .select('id, name, slug, description, version, updated_at')
  .eq('org_id', orgId)
  .order('updated_at', { ascending: false });

if (error !== null) return { agents: [], error: error.message };
if (agentRows === null || agentRows.length === 0) return { agents: [], error: null };

// Query 2: latest published_at per agent
// Ordered by version DESC globally — the merge picks the first occurrence
// per agent_id, which is the latest version since global ordering guarantees it.
const agentIds = agentRows.map(a => a.id);
const { data: versions } = await supabase
  .from('agent_versions')
  .select('agent_id, published_at')
  .in('agent_id', agentIds)
  .order('version', { ascending: false });

// Merge: build a Map of agent_id → first (latest) published_at
const publishedAtMap = new Map<string, string>();
for (const v of versions ?? []) {
  if (!publishedAtMap.has(v.agent_id)) {
    publishedAtMap.set(v.agent_id, v.published_at);
  }
}

// Combine into AgentMetadata[]
const agents = agentRows.map(a => ({
  ...a,
  published_at: publishedAtMap.get(a.id) ?? null,
}));
```

### `AgentMetadata` type update

`AgentMetadata` can no longer be a simple `Pick<AgentRow, ...>` since `published_at` doesn't exist on `AgentRow`. Change to an intersection type:

```ts
export type AgentMetadata = Pick<
  AgentRow,
  'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'
> & {
  published_at: string | null;
};
```

### Status derivation helper

A pure function in `app/components/agents/agentStatus.ts`:

```ts
export type AgentStatus = 'draft' | 'published' | 'unpublished';

interface AgentStatusInput {
  version: number;
  updated_at: string;
  published_at: string | null;
}

export function getAgentStatus(agent: AgentStatusInput): AgentStatus {
  if (agent.version === 0) return 'draft';
  if (agent.published_at === null) return 'draft';
  if (new Date(agent.updated_at) <= new Date(agent.published_at)) return 'published';
  return 'unpublished';
}

export const STATUS_COLORS: Record<AgentStatus, string> = {
  draft: 'bg-muted-foreground/30',
  published: 'bg-green-500',
  unpublished: 'bg-amber-500',
};
```

Note: comparisons use `new Date()` parsing to avoid string comparison issues with timestamps. The `cache` import is from `'react'` (request-level memoization), not `'next/cache'` (revalidation).

## Component Changes

### Modified files

- `app/components/agents/AgentsSidebar.tsx` — Replace AgentCard with status strip design, add search input with state, add Tooltip wrapping. If file approaches 300 lines, extract `AgentCard` and search input into separate files under `app/components/agents/`.
- `app/orgs/[slug]/(dashboard)/(agents)/page.tsx` — Fetch agent count via `getCachedAgentsByOrg`, render State A (zero agents) or State B (has agents).
- `app/orgs/[slug]/(dashboard)/(agents)/layout.tsx` — Use `getCachedAgentsByOrg` instead of `getAgentsByOrg`.
- `app/lib/agents.ts` — Add second query for `published_at`, merge results, update `AgentMetadata` type, export `getCachedAgentsByOrg`.

### New files

- `app/components/agents/AgentEmptyState.tsx` — Zero-agents empty state with SVG illustration and CTA (client component for CreateAgentDialog state)
- `app/components/agents/agentStatus.ts` — `getAgentStatus` pure function + `AgentStatus` type + `STATUS_COLORS` mapping constant

### Removed files

- `app/components/agents/EmptyState.tsx` — Replaced by `AgentEmptyState.tsx` and the inline State B in the page. Delete to avoid dead code.

### Translations

New keys in `messages/en.json` under `agents`:

- `search`: "Search..."
- `noResults`: "No matching agents"
- `createFirst`: "Create your first agent"
- `createFirstDescription`: "Agents are workflows that connect LLM steps, tools, and decisions."

Reused existing keys:
- `agents.create` — CTA button label
- `agents.selectAgent` — State B text
- `agents.empty` — sidebar empty state (no agents at all)
