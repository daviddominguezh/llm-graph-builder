# Agents Sidebar & Empty State Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign agents sidebar with status-oriented compact cards, search, and contextual empty states.

**Architecture:** Data layer adds `published_at` via a second Supabase query on `agent_versions`, merged in TS. A pure `agentStatus` helper derives draft/published/unpublished from timestamps. The sidebar gets status strip cards with tooltips and search. The empty state page adapts between zero-agents (onboarding CTA) and has-agents (select prompt).

**Tech Stack:** Next.js 16 (App Router), Supabase JS, shadcn/ui (base-ui), Tailwind, next-intl, React.cache

**Spec:** `docs/superpowers/specs/2026-03-14-agents-sidebar-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/web/app/lib/agents.ts` | Add `published_at` query, update `AgentMetadata` type, export `getCachedAgentsByOrg` |
| Create | `packages/web/app/components/agents/agentStatus.ts` | `getAgentStatus` function, `AgentStatus` type, `STATUS_COLORS` map |
| Modify | `packages/web/app/components/agents/AgentsSidebar.tsx` | Status strip cards, search input, tooltip, filtered list |
| Create | `packages/web/app/components/agents/AgentEmptyState.tsx` | Zero-agents onboarding empty state with SVG + CTA |
| Modify | `packages/web/app/orgs/[slug]/(dashboard)/(agents)/page.tsx` | Dual empty state (State A vs State B) |
| Modify | `packages/web/app/orgs/[slug]/(dashboard)/(agents)/layout.tsx` | Use `getCachedAgentsByOrg` |
| Modify | `packages/web/messages/en.json` | Add translation keys |
| Delete | `packages/web/app/components/agents/EmptyState.tsx` | Replaced by `AgentEmptyState.tsx` |
| Delete | `packages/web/app/components/agents/AgentDashboard.tsx` | Dead code — old full-page agent list |
| Delete | `packages/web/app/components/agents/AgentTable.tsx` | Dead code — old table component |
| Delete | `packages/web/app/components/agents/AgentTableRow.tsx` | Dead code — old table row component |

---

## Chunk 1: Data Layer & Status Helper

### Task 1: Add translations

**Files:**
- Modify: `packages/web/messages/en.json:77-97`

- [ ] **Step 1: Add new translation keys**

Add these keys inside the `"agents"` section, after `"selectAgent"`:

```json
"search": "Search...",
"noResults": "No matching agents",
"createFirst": "Create your first agent",
"createFirstDescription": "Agents are workflows that connect LLM steps, tools, and decisions.",
```

- [ ] **Step 2: Run format check**

Run: `npm run format -w packages/web`
Expected: file formatted, no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add agents sidebar translation keys"
```

---

### Task 2: Create agentStatus helper

**Files:**
- Create: `packages/web/app/components/agents/agentStatus.ts`

- [ ] **Step 1: Create the status helper file**

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

- [ ] **Step 2: Run checks**

Run: `npm run check -w packages/web`
Expected: format, lint, typecheck all pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/agents/agentStatus.ts
git commit -m "feat: add agent status derivation helper"
```

---

### Task 3: Update AgentMetadata type and getAgentsByOrg query

**Files:**
- Modify: `packages/web/app/lib/agents.ts:20-53`

- [ ] **Step 1: Update AgentMetadata type**

Replace line 20:
```ts
export type AgentMetadata = Pick<AgentRow, 'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'>;
```

With:
```ts
export type AgentMetadata = Pick<
  AgentRow,
  'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'
> & {
  published_at: string | null;
};
```

- [ ] **Step 2: Add version row type**

Add after the `AgentMetadata` type (before `InsertAgentParams`):

```ts
interface VersionRow {
  agent_id: string;
  published_at: string;
}
```

- [ ] **Step 3: Extract published_at fetching into a helper**

Add this function before `getAgentsByOrg`:

```ts
async function fetchPublishedAtMap(
  supabase: SupabaseClient,
  agentIds: string[]
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('agent_versions')
    .select('agent_id, published_at')
    .in('agent_id', agentIds)
    .order('version', { ascending: false });

  const map = new Map<string, string>();
  for (const v of (data as VersionRow[] | null) ?? []) {
    if (!map.has(v.agent_id)) {
      map.set(v.agent_id, v.published_at);
    }
  }
  return map;
}
```

- [ ] **Step 4: Rewrite getAgentsByOrg to merge published_at**

Replace the `getAgentsByOrg` function body:

```ts
export async function getAgentsByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ agents: AgentMetadata[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select(METADATA_COLUMNS)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error !== null) return { agents: [], error: error.message };

  type AgentBase = Pick<AgentRow, 'id' | 'name' | 'slug' | 'description' | 'version' | 'updated_at'>;
  const rows = (data as AgentBase[] | null) ?? [];
  if (rows.length === 0) return { agents: [], error: null };

  const publishedAtMap = await fetchPublishedAtMap(
    supabase,
    rows.map((a) => a.id)
  );

  const agents: AgentMetadata[] = rows.map((a) => ({
    ...a,
    published_at: publishedAtMap.get(a.id) ?? null,
  }));

  return { agents, error: null };
}
```

- [ ] **Step 5: Add getCachedAgentsByOrg export**

Add the import at the top of the file, after the existing imports:

```ts
import { cache } from 'react';
```

Then add the cached wrapper at the bottom of the file, after all function definitions (before `deleteAgent`):

```ts
export const getCachedAgentsByOrg = cache(getAgentsByOrg);
```

- [ ] **Step 6: Run checks**

Run: `npm run check -w packages/web`
Expected: format, lint, typecheck all pass. There may be type errors in `AgentsSidebar.tsx` and other consumers because `AgentMetadata` now requires `published_at` — those will be fixed in subsequent tasks.

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/lib/agents.ts
git commit -m "feat: add published_at to AgentMetadata via agent_versions query"
```

---

### Task 4: Update layout to use getCachedAgentsByOrg

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/(agents)/layout.tsx:4,22`

- [ ] **Step 1: Update import and function call**

Change line 4 from:
```ts
import { getAgentsByOrg } from '@/app/lib/agents';
```
To:
```ts
import { getCachedAgentsByOrg } from '@/app/lib/agents';
```

Change line 22 from:
```ts
const { agents } = await getAgentsByOrg(supabase, org.id);
```
To:
```ts
const { agents } = await getCachedAgentsByOrg(supabase, org.id);
```

- [ ] **Step 2: Run checks**

Run: `npm run check -w packages/web`
Expected: pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/orgs/[slug]/(dashboard)/(agents)/layout.tsx
git commit -m "feat: use cached agent query in agents layout"
```

---

## Chunk 2: Sidebar Redesign

### Task 5: Rewrite AgentsSidebar with status strips, search, and tooltips

**Files:**
- Modify: `packages/web/app/components/agents/AgentsSidebar.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the sidebar component**

Replace the entire file content with:

```tsx
'use client';

import type { AgentMetadata } from '@/app/lib/agents';
import { formatRelativeTime } from '@/app/utils/formatRelativeTime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { CreateAgentDialog } from './CreateAgentDialog';
import { getAgentStatus, STATUS_COLORS } from './agentStatus';

interface AgentsSidebarProps {
  agents: AgentMetadata[];
  orgId: string;
  orgSlug: string;
}

function SidebarHeader({ onCreateClick }: { onCreateClick: () => void }) {
  const t = useTranslations('agents');

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <Button variant="ghost" size="icon-sm" onClick={onCreateClick}>
        <Plus />
      </Button>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('agents');

  return (
    <div className="relative px-3 pb-2">
      <Search className="pointer-events-none absolute left-5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('search')}
        className="pl-7"
      />
    </div>
  );
}

function StatusBar({ status, active }: { status: string; active: boolean }) {
  return (
    <div
      className={`w-0.5 shrink-0 self-stretch rounded-full ${active ? 'bg-primary' : status}`}
    />
  );
}

function AgentCardTooltip({ agent }: { agent: AgentMetadata }) {
  return (
    <div className="flex flex-col gap-1">
      {agent.description ? <span>{agent.description}</span> : null}
      <span className="text-background/70">{formatRelativeTime(agent.updated_at)}</span>
    </div>
  );
}

function AgentCard({ agent, orgSlug, active }: { agent: AgentMetadata; orgSlug: string; active: boolean }) {
  const href = `/orgs/${orgSlug}/editor/${agent.slug}`;
  const status = getAgentStatus(agent);
  const colorClass = STATUS_COLORS[status];

  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link href={href} />}
        className={`flex h-8 items-center gap-2 rounded-md px-2 transition-colors ${
          active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted text-foreground'
        }`}
      >
        <StatusBar status={colorClass} active={active} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{agent.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">v{agent.version}</span>
      </TooltipTrigger>
      <TooltipContent side="right">
        <AgentCardTooltip agent={agent} />
      </TooltipContent>
    </Tooltip>
  );
}

function AgentList({
  agents,
  orgSlug,
  pathname,
  search,
}: {
  agents: AgentMetadata[];
  orgSlug: string;
  pathname: string;
  search: string;
}) {
  const t = useTranslations('agents');
  const filtered = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  if (agents.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('empty')}</p>;
  }

  if (filtered.length === 0) {
    return <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('noResults')}</p>;
  }

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {filtered.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          orgSlug={orgSlug}
          active={pathname === `/orgs/${orgSlug}/editor/${agent.slug}`}
        />
      ))}
    </nav>
  );
}

export function AgentsSidebar({ agents, orgId, orgSlug }: AgentsSidebarProps) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border rounded-md bg-background">
      <SidebarHeader onCreateClick={() => setCreateOpen(true)} />
      <SearchInput value={search} onChange={setSearch} />
      <div className="flex-1 overflow-y-auto">
        <AgentList agents={agents} orgSlug={orgSlug} pathname={pathname} search={search} />
      </div>
      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} orgId={orgId} orgSlug={orgSlug} />
    </aside>
  );
}
```

- [ ] **Step 2: Run checks**

Run: `npm run check -w packages/web`
Expected: format, lint, typecheck all pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/agents/AgentsSidebar.tsx
git commit -m "feat: redesign agents sidebar with status strips, search, and tooltips"
```

---

## Chunk 3: Empty States

### Task 6: Create AgentEmptyState component

**Files:**
- Create: `packages/web/app/components/agents/AgentEmptyState.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CreateAgentDialog } from './CreateAgentDialog';

interface AgentEmptyStateProps {
  orgId: string;
  orgSlug: string;
}

function NodeIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-muted-foreground/40"
    >
      <rect
        x="12"
        y="12"
        width="56"
        height="56"
        rx="12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />
      <line x1="40" y1="30" x2="40" y2="50" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      <line x1="30" y1="40" x2="50" y2="40" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
    </svg>
  );
}

export function AgentEmptyState({ orgId, orgSlug }: AgentEmptyStateProps) {
  const t = useTranslations('agents');
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <NodeIllustration />
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-lg font-medium text-foreground">{t('createFirst')}</h2>
        <p className="max-w-xs text-center text-sm text-muted-foreground">{t('createFirstDescription')}</p>
      </div>
      <Button onClick={() => setCreateOpen(true)}>
        <Plus data-icon="inline-start" />
        {t('create')}
      </Button>
      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} orgId={orgId} orgSlug={orgSlug} />
    </div>
  );
}
```

- [ ] **Step 2: Run checks**

Run: `npm run check -w packages/web`
Expected: pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/agents/AgentEmptyState.tsx
git commit -m "feat: add zero-agents onboarding empty state component"
```

---

### Task 7: Update agents page with dual empty state

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/(agents)/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the page**

```tsx
import { redirect } from 'next/navigation';

import { AgentEmptyState } from '@/app/components/agents/AgentEmptyState';
import { getCachedAgentsByOrg } from '@/app/lib/agents';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AgentsPageProps {
  params: Promise<{ slug: string }>;
}

function SelectAgentPrompt() {
  const t = useTranslations('agents');

  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground/50">
      <ArrowLeft className="size-5" />
      <p className="text-sm">{t('selectAgent')}</p>
    </div>
  );
}

export default async function AgentsPage({ params }: AgentsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) {
    redirect('/');
  }

  const { agents } = await getCachedAgentsByOrg(supabase, org.id);

  if (agents.length === 0) {
    return <AgentEmptyState orgId={org.id} orgSlug={org.slug} />;
  }

  return <SelectAgentPrompt />;
}
```

- [ ] **Step 2: Run checks**

Run: `npm run check -w packages/web`
Expected: pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/orgs/[slug]/(dashboard)/(agents)/page.tsx
git commit -m "feat: implement dual empty state for agents page"
```

---

### Task 8: Delete dead code from old agents dashboard

**Files:**
- Delete: `packages/web/app/components/agents/EmptyState.tsx`
- Delete: `packages/web/app/components/agents/AgentDashboard.tsx`
- Delete: `packages/web/app/components/agents/AgentTable.tsx`
- Delete: `packages/web/app/components/agents/AgentTableRow.tsx`

These files formed the old full-page agents table view. They are no longer imported after the sidebar redesign.

- [ ] **Step 1: Verify no remaining imports**

Run: `grep -r "AgentDashboard\|AgentTable\|EmptyState" packages/web/app/ --include="*.tsx" --include="*.ts" -l`

Expected: no matches (or only the files being deleted referencing each other)

- [ ] **Step 2: Delete the files**

```bash
rm packages/web/app/components/agents/EmptyState.tsx
rm packages/web/app/components/agents/AgentDashboard.tsx
rm packages/web/app/components/agents/AgentTable.tsx
rm packages/web/app/components/agents/AgentTableRow.tsx
```

- [ ] **Step 3: Run checks**

Run: `npm run check -w packages/web`
Expected: pass (no remaining references to deleted files)

- [ ] **Step 4: Commit**

```bash
git add -u packages/web/app/components/agents/
git commit -m "chore: remove dead code from old agents dashboard"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full check across all packages**

Run: `npm run check`
Expected: all packages pass format, lint, typecheck

- [ ] **Step 2: Visual verification**

Run: `npm run dev -w packages/web`

Test these scenarios:
1. Navigate to an org with agents — sidebar shows status strips with color indicators
2. Click an agent — card highlights with `bg-primary/10`, status bar turns primary
3. Hover a card — tooltip shows description + relative time
4. Type in search — list filters by name
5. Search with no matches — shows "No matching agents"
6. Clear search — full list returns
7. Navigate to an org with zero agents — shows onboarding empty state with illustration + CTA
8. Click "Create agent" in empty state — dialog opens
9. Navigate to org with agents, no agent selected — shows arrow + "Select an agent"
