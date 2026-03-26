# Agent Marketplace & Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable public agent templates with a marketplace browse UI, 2-step creation wizard, read-only graph preview, and settings panel.

**Architecture:** Separate `agent_templates` table (denormalized for fast browsing) synced transactionally from `agents` + `agent_versions`. A single `assembleTemplateSafeGraph` function produces all template graph data — it never reads secrets. Frontend uses a 2-step wizard dialog and an isolated read-only preview component.

**Tech Stack:** Supabase (Postgres + RLS), Express backend, Next.js 16 (App Router), @xyflow/react, shadcn/ui, next-intl, Zod

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260326000000_agent_marketplace.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 1. Add is_public and category to agents
ALTER TABLE public.agents
  ADD COLUMN is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN category text NOT NULL DEFAULT 'other';

-- 2. Create agent_templates table
CREATE TABLE public.agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_slug text NOT NULL,
  org_avatar_url text,
  agent_slug text NOT NULL,
  agent_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  node_count integer NOT NULL DEFAULT 0,
  mcp_server_count integer NOT NULL DEFAULT 0,
  download_count integer NOT NULL DEFAULT 0,
  latest_version integer NOT NULL DEFAULT 1,
  template_graph_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Add lineage column (depends on agent_templates existing)
ALTER TABLE public.agents
  ADD COLUMN created_from_template_id uuid REFERENCES public.agent_templates(id) ON DELETE SET NULL;

-- 4. Indexes
CREATE INDEX idx_agent_templates_category ON public.agent_templates(category);
CREATE INDEX idx_agent_templates_download_count ON public.agent_templates(download_count DESC);
CREATE INDEX idx_agent_templates_search ON public.agent_templates
  USING gin (to_tsvector('english', agent_name || ' ' || description || ' ' || category));

-- 5. Updated_at trigger
CREATE TRIGGER set_agent_templates_updated_at
  BEFORE UPDATE ON public.agent_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. RLS
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can browse templates"
  ON public.agent_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Org members can insert templates"
  ON public.agent_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can update templates"
  ON public.agent_templates FOR UPDATE
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can delete templates"
  ON public.agent_templates FOR DELETE
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

-- 7. Atomic download counter (same pattern as increment_installations_count)
CREATE OR REPLACE FUNCTION public.increment_template_downloads(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agent_templates
  SET download_count = download_count + 1
  WHERE id = p_template_id;
END;
$$;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db reset` or `npx supabase migration up`
Expected: Migration applies without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260326000000_agent_marketplace.sql
git commit -m "feat: add agent_templates table and marketplace columns"
```

---

## Task 2: Shared Types — Template Category Schema

**Files:**
- Create: `packages/graph-types/src/schemas/template.schema.ts`
- Modify: `packages/graph-types/src/schemas/index.ts`
- Modify: `packages/graph-types/src/index.ts`

- [ ] **Step 1: Create template schema with categories and safe graph types**

```ts
// packages/graph-types/src/schemas/template.schema.ts
import { z } from 'zod';

export const TemplateCategorySchema = z.enum([
  'customer-support',
  'sales',
  'marketing',
  'engineering',
  'data-analysis',
  'content-creation',
  'research',
  'operations',
  'hr-recruiting',
  'legal-compliance',
  'finance',
  'education',
  'e-commerce',
  'other',
]);

export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;

export const TEMPLATE_CATEGORIES = TemplateCategorySchema.options;

const LibraryMcpRefSchema = z.object({
  type: z.literal('library'),
  libraryItemId: z.string(),
  name: z.string(),
});

const CustomMcpSkeletonSchema = z.object({
  type: z.literal('custom'),
  name: z.string(),
  transportType: z.string(),
  headerKeys: z.array(z.string()),
});

export const TemplateMcpServerSchema = z.discriminatedUnion('type', [
  LibraryMcpRefSchema,
  CustomMcpSkeletonSchema,
]);

export type TemplateMcpServer = z.infer<typeof TemplateMcpServerSchema>;

export const TemplateGraphDataSchema = z.object({
  startNode: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    text: z.string(),
    kind: z.string(),
    description: z.string().default(''),
    agent: z.string().optional(),
    nextNodeIsUser: z.boolean().optional(),
    fallbackNodeId: z.string().optional(),
    global: z.boolean().default(false),
    defaultFallback: z.boolean().optional(),
    outputSchemaId: z.string().optional(),
    outputPrompt: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
  })),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    preconditions: z.array(z.object({
      type: z.string(),
      value: z.string(),
      description: z.string().optional(),
    })).optional(),
    contextPreconditions: z.object({
      preconditions: z.array(z.string()),
      jumpTo: z.string().optional(),
    }).optional(),
  })),
  agents: z.array(z.object({
    id: z.string(),
    description: z.string().default(''),
  })),
  contextPresets: z.array(z.object({
    name: z.string(),
  })).optional(),
  outputSchemas: z.array(z.object({
    id: z.string(),
    name: z.string(),
    fields: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional(),
    })),
  })).optional(),
  mcpServers: z.array(TemplateMcpServerSchema),
});

export type TemplateGraphData = z.infer<typeof TemplateGraphDataSchema>;
```

- [ ] **Step 2: Export from schema index**

Add to `packages/graph-types/src/schemas/index.ts`:

```ts
export {
  TemplateCategorySchema,
  TemplateGraphDataSchema,
  TemplateMcpServerSchema,
  TEMPLATE_CATEGORIES,
} from './template.schema.js';

export type {
  TemplateCategory,
  TemplateGraphData,
  TemplateMcpServer,
} from './template.schema.js';
```

- [ ] **Step 3: Export from package index**

Add to `packages/graph-types/src/index.ts`:

```ts
export {
  TemplateCategorySchema,
  TemplateGraphDataSchema,
  TemplateMcpServerSchema,
  TEMPLATE_CATEGORIES,
} from './schemas/index.js';

export type {
  TemplateCategory,
  TemplateGraphData,
  TemplateMcpServer,
} from './schemas/index.js';
```

- [ ] **Step 4: Verify types compile**

Run: `npm run typecheck -w packages/graph-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/graph-types/src/schemas/template.schema.ts packages/graph-types/src/schemas/index.ts packages/graph-types/src/index.ts
git commit -m "feat: add template category and safe graph data schemas"
```

---

## Task 3: Backend — `assembleTemplateSafeGraph`

The single, auditable function that produces all template graph data. It parses `graph_data` from `agent_versions` and extracts only structural fields.

**Files:**
- Create: `packages/backend/src/db/queries/assembleTemplateSafeGraph.ts`

- [ ] **Step 1: Write the assembly function**

```ts
// packages/backend/src/db/queries/assembleTemplateSafeGraph.ts
import type { TemplateGraphData, TemplateMcpServer } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';

/**
 * Produces a security-safe graph snapshot from a published version.
 *
 * SECURITY INVARIANT: This function NEVER reads variable_values,
 * full transport_config for custom MCPs, API key columns,
 * org_env_variables, or any execution/session data.
 *
 * It is the sole code path for all template graph data.
 */

interface RawMcpServer {
  id?: string;
  name?: string;
  transport?: { type?: string; headers?: Record<string, string> };
  libraryItemId?: string;
  variableValues?: unknown;
  enabled?: boolean;
}

interface RawNode {
  id?: string;
  text?: string;
  kind?: string;
  description?: string;
  agent?: string;
  nextNodeIsUser?: boolean;
  fallbackNodeId?: string;
  global?: boolean;
  defaultFallback?: boolean;
  outputSchemaId?: string;
  outputPrompt?: string;
  position?: { x?: number; y?: number };
}

interface RawEdge {
  from?: string;
  to?: string;
  preconditions?: Array<{
    type?: string;
    value?: string;
    description?: string;
  }>;
  contextPreconditions?: {
    preconditions?: string[];
    jumpTo?: string;
  };
}

interface RawAgent {
  id?: string;
  description?: string;
}

interface RawOutputSchema {
  id?: string;
  name?: string;
  fields?: Array<{ name?: string; type?: string; description?: string }>;
}

interface RawContextPreset {
  name?: string;
}

interface RawGraphData {
  startNode?: string;
  nodes?: RawNode[];
  edges?: RawEdge[];
  agents?: RawAgent[];
  mcpServers?: RawMcpServer[];
  outputSchemas?: RawOutputSchema[];
  contextPresets?: RawContextPreset[];
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function extractSafeMcpServer(raw: RawMcpServer): TemplateMcpServer | null {
  const name = raw.name ?? '';
  if (name === '') return null;

  if (raw.libraryItemId !== undefined && raw.libraryItemId !== '') {
    return { type: 'library', libraryItemId: raw.libraryItemId, name };
  }

  const transportType = raw.transport?.type ?? 'http';
  const headerKeys = raw.transport?.headers !== undefined
    ? Object.keys(raw.transport.headers)
    : [];

  return { type: 'custom', name, transportType, headerKeys };
}

function extractSafeMcpServers(raw: RawMcpServer[] | undefined): TemplateMcpServer[] {
  if (raw === undefined) return [];
  const results: TemplateMcpServer[] = [];
  for (const server of raw) {
    const safe = extractSafeMcpServer(server);
    if (safe !== null) results.push(safe);
  }
  return results;
}

export function assembleFromGraphData(raw: RawGraphData): TemplateGraphData {
  return {
    startNode: raw.startNode ?? '',
    nodes: (raw.nodes ?? []).map((n) => ({
      id: n.id ?? '',
      text: n.text ?? '',
      kind: n.kind ?? 'agent',
      description: n.description ?? '',
      agent: n.agent,
      nextNodeIsUser: n.nextNodeIsUser,
      fallbackNodeId: n.fallbackNodeId,
      global: n.global ?? false,
      defaultFallback: n.defaultFallback,
      outputSchemaId: n.outputSchemaId,
      outputPrompt: n.outputPrompt,
      position: n.position?.x !== undefined && n.position.y !== undefined
        ? { x: n.position.x, y: n.position.y }
        : undefined,
    })),
    edges: (raw.edges ?? []).map((e) => ({
      from: e.from ?? '',
      to: e.to ?? '',
      preconditions: e.preconditions?.map((p) => ({
        type: p.type ?? '',
        value: p.value ?? '',
        description: p.description,
      })),
      contextPreconditions: e.contextPreconditions !== undefined
        ? {
            preconditions: e.contextPreconditions.preconditions ?? [],
            jumpTo: e.contextPreconditions.jumpTo,
          }
        : undefined,
    })),
    agents: (raw.agents ?? []).map((a) => ({
      id: a.id ?? '',
      description: a.description ?? '',
    })),
    contextPresets: raw.contextPresets?.map((p) => ({ name: p.name ?? '' })),
    outputSchemas: raw.outputSchemas?.map((s) => ({
      id: s.id ?? '',
      name: s.name ?? '',
      fields: (s.fields ?? []).map((f) => ({
        name: f.name ?? '',
        type: f.type ?? 'string',
        description: f.description,
      })),
    })),
    mcpServers: extractSafeMcpServers(raw.mcpServers),
  };
}

export async function assembleTemplateSafeGraph(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<TemplateGraphData | null> {
  const result = await supabase
    .from('agent_versions')
    .select('graph_data')
    .eq('agent_id', agentId)
    .eq('version', version)
    .single();

  if (result.error !== null) return null;
  if (!isRecord(result.data)) return null;

  const graphData = result.data.graph_data as RawGraphData;
  return assembleFromGraphData(graphData);
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/queries/assembleTemplateSafeGraph.ts
git commit -m "feat: add assembleTemplateSafeGraph safe assembly function"
```

---

## Task 4: Backend — Template Queries

**Files:**
- Create: `packages/backend/src/db/queries/templateQueries.ts`

- [ ] **Step 1: Write template query functions**

```ts
// packages/backend/src/db/queries/templateQueries.ts
import type { TemplateGraphData } from '@daviddh/graph-types';

import { assembleTemplateSafeGraph } from './assembleTemplateSafeGraph.js';
import type { SupabaseClient } from './operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TemplateRow {
  id: string;
  agent_id: string;
  org_id: string;
  org_slug: string;
  org_avatar_url: string | null;
  agent_slug: string;
  agent_name: string;
  description: string;
  category: string;
  node_count: number;
  mcp_server_count: number;
  download_count: number;
  latest_version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateRowWithGraph extends TemplateRow {
  template_graph_data: TemplateGraphData;
}

export interface BrowseTemplateOptions {
  search?: string;
  category?: string;
  sort?: 'downloads' | 'newest' | 'updated';
  limit?: number;
  offset?: number;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isTemplateRow(value: unknown): value is TemplateRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'agent_id' in value &&
    'org_slug' in value
  );
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function toSafeArray(data: unknown): unknown[] {
  return isUnknownArray(data) ? data : [];
}

function filterRows(data: unknown[]): TemplateRow[] {
  return data.reduce<TemplateRow[]>((acc, row) => {
    if (isTemplateRow(row)) acc.push(row);
    return acc;
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Browse                                                             */
/* ------------------------------------------------------------------ */

const BROWSE_COLUMNS =
  'id, agent_id, org_id, org_slug, org_avatar_url, agent_slug, agent_name, description, category, node_count, mcp_server_count, download_count, latest_version, created_at, updated_at';

const DEFAULT_LIMIT = 15;
const RANGE_OFFSET = 1;

function getSortColumn(sort: string | undefined): { column: string; ascending: boolean } {
  if (sort === 'newest') return { column: 'created_at', ascending: false };
  if (sort === 'updated') return { column: 'updated_at', ascending: false };
  return { column: 'download_count', ascending: false };
}

export async function browseTemplates(
  supabase: SupabaseClient,
  options?: BrowseTemplateOptions
): Promise<{ result: TemplateRow[]; error: string | null }> {
  const sortOpt = getSortColumn(options?.sort);
  let query = supabase
    .from('agent_templates')
    .select(BROWSE_COLUMNS)
    .order(sortOpt.column, { ascending: sortOpt.ascending });

  if (options !== undefined) {
    if (options.search !== undefined && options.search !== '') {
      const pattern = `%${options.search}%`;
      query = query.or(
        `agent_name.ilike.${pattern},description.ilike.${pattern},category.ilike.${pattern}`
      );
    }
    if (options.category !== undefined && options.category !== '') {
      query = query.eq('category', options.category);
    }
    const limit = options.limit ?? DEFAULT_LIMIT;
    query = query.limit(limit);
    const offset = options.offset ?? 0;
    if (offset > 0) {
      query = query.range(offset, offset + limit - RANGE_OFFSET);
    }
  }

  const { data, error } = await query;
  if (error !== null) return { result: [], error: error.message };
  return { result: filterRows(toSafeArray(data)), error: null };
}

/* ------------------------------------------------------------------ */
/*  Upsert / Remove                                                    */
/* ------------------------------------------------------------------ */

interface UpsertTemplateInput {
  agentId: string;
  orgId: string;
  orgSlug: string;
  orgAvatarUrl: string | null;
  agentSlug: string;
  agentName: string;
  description: string;
  category: string;
  nodeCount: number;
  mcpServerCount: number;
  latestVersion: number;
  templateGraphData: TemplateGraphData;
}

export async function upsertTemplate(
  supabase: SupabaseClient,
  input: UpsertTemplateInput
): Promise<{ result: TemplateRow | null; error: string | null }> {
  const row = {
    agent_id: input.agentId,
    org_id: input.orgId,
    org_slug: input.orgSlug,
    org_avatar_url: input.orgAvatarUrl,
    agent_slug: input.agentSlug,
    agent_name: input.agentName,
    description: input.description,
    category: input.category,
    node_count: input.nodeCount,
    mcp_server_count: input.mcpServerCount,
    latest_version: input.latestVersion,
    template_graph_data: input.templateGraphData,
  };

  const result = await supabase
    .from('agent_templates')
    .upsert(row, { onConflict: 'agent_id' })
    .select(BROWSE_COLUMNS)
    .single();

  if (result.error !== null) return { result: null, error: result.error.message };
  if (!isTemplateRow(result.data)) return { result: null, error: 'Invalid template data' };
  return { result: result.data, error: null };
}

export async function removeTemplate(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_templates')
    .delete()
    .eq('agent_id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateTemplateMetadata(
  supabase: SupabaseClient,
  agentId: string,
  fields: { agent_name?: string; description?: string; category?: string; agent_slug?: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_templates')
    .update(fields)
    .eq('agent_id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateTemplateOrgInfo(
  supabase: SupabaseClient,
  orgId: string,
  fields: { org_slug?: string; org_avatar_url?: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_templates')
    .update(fields)
    .eq('org_id', orgId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function incrementDownloads(
  supabase: SupabaseClient,
  templateId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('increment_template_downloads', {
    p_template_id: templateId,
  });
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function getTemplateByAgentId(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ result: TemplateRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_templates')
    .select(BROWSE_COLUMNS)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isTemplateRow(data)) return { result: null, error: 'Invalid template data' };
  return { result: data, error: null };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/queries/templateQueries.ts
git commit -m "feat: add template browse, upsert, and sync query functions"
```

---

## Task 5: Backend — Template Sync Logic

The sync function called after publish, visibility toggle, and metadata updates.

**Files:**
- Create: `packages/backend/src/db/queries/templateSync.ts`

- [ ] **Step 1: Write sync orchestrator**

```ts
// packages/backend/src/db/queries/templateSync.ts
import { assembleTemplateSafeGraph } from './assembleTemplateSafeGraph.js';
import type { SupabaseClient } from './operationHelpers.js';
import { removeTemplate, upsertTemplate } from './templateQueries.js';

interface AgentForSync {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  is_public: boolean;
  current_version: number;
}

interface OrgForSync {
  slug: string;
  avatar_url: string | null;
}

function isAgentForSync(val: unknown): val is AgentForSync {
  return typeof val === 'object' && val !== null && 'id' in val && 'is_public' in val;
}

function isOrgForSync(val: unknown): val is OrgForSync {
  return typeof val === 'object' && val !== null && 'slug' in val;
}

async function fetchAgentForSync(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentForSync | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('id, org_id, name, slug, description, category, is_public, current_version')
    .eq('id', agentId)
    .single();
  if (error !== null || !isAgentForSync(data)) return null;
  return data;
}

async function fetchOrgForSync(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgForSync | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('slug, avatar_url')
    .eq('id', orgId)
    .single();
  if (error !== null || !isOrgForSync(data)) return null;
  return data;
}

function countNodes(graphData: { nodes: unknown[] }): number {
  return graphData.nodes.length;
}

function countMcpServers(graphData: { mcpServers: unknown[] }): number {
  return graphData.mcpServers.length;
}

/**
 * Sync template after publish or visibility toggle.
 * If agent is public and has published versions, upserts the template.
 * If agent is not public, removes the template.
 */
export async function syncTemplateAfterPublish(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ error: string | null }> {
  const agent = await fetchAgentForSync(supabase, agentId);
  if (agent === null) return { error: 'Agent not found' };

  if (!agent.is_public) return { error: null };
  if (agent.current_version === 0) return { error: null };

  const org = await fetchOrgForSync(supabase, agent.org_id);
  if (org === null) return { error: 'Org not found' };

  const graphData = await assembleTemplateSafeGraph(supabase, agentId, agent.current_version);
  if (graphData === null) return { error: 'Failed to assemble template graph' };

  return upsertTemplate(supabase, {
    agentId: agent.id,
    orgId: agent.org_id,
    orgSlug: org.slug,
    orgAvatarUrl: org.avatar_url,
    agentSlug: agent.slug,
    agentName: agent.name,
    description: agent.description,
    category: agent.category,
    nodeCount: countNodes(graphData),
    mcpServerCount: countMcpServers(graphData),
    latestVersion: agent.current_version,
    templateGraphData: graphData,
  }).then((r) => ({ error: r.error }));
}

/**
 * Called when is_public toggled ON.
 * Returns error if agent has no published versions.
 */
export async function syncTemplateOnPublicToggle(
  supabase: SupabaseClient,
  agentId: string,
  isPublic: boolean
): Promise<{ error: string | null }> {
  if (!isPublic) {
    return removeTemplate(supabase, agentId);
  }

  const agent = await fetchAgentForSync(supabase, agentId);
  if (agent === null) return { error: 'Agent not found' };
  if (agent.current_version === 0) {
    return { error: 'Publish your agent at least once before making it public' };
  }

  return syncTemplateAfterPublish(supabase, agentId);
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/queries/templateSync.ts
git commit -m "feat: add template sync logic for publish and visibility"
```

---

## Task 6: Backend — Template Routes

**Files:**
- Create: `packages/backend/src/routes/templates/templateRouter.ts`
- Create: `packages/backend/src/routes/templates/browseTemplates.ts`
- Create: `packages/backend/src/routes/templates/getTemplateVersions.ts`
- Create: `packages/backend/src/routes/templates/getTemplateSnapshot.ts`
- Create: `packages/backend/src/routes/templates/templateHelpers.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Write template helpers**

```ts
// packages/backend/src/routes/templates/templateHelpers.ts
import type { Request } from 'express';

import type { BrowseTemplateOptions } from '../../db/queries/templateQueries.js';

const DEFAULT_LIMIT = 15;
const DEFAULT_OFFSET = 0;

interface AgentIdParams {
  agentId?: string;
}

interface VersionParams {
  agentId?: string;
  version?: string;
}

export function getTemplateAgentId(req: Request): string | undefined {
  const { agentId }: AgentIdParams = req.params;
  if (typeof agentId === 'string' && agentId !== '') return agentId;
  return undefined;
}

export function getTemplateVersion(req: Request): number | undefined {
  const { version }: VersionParams = req.params;
  if (typeof version !== 'string') return undefined;
  const num = Number(version);
  if (Number.isNaN(num) || num < 1) return undefined;
  return num;
}

export function parseBrowseTemplateOptions(req: Request): BrowseTemplateOptions {
  const { query } = req;
  const search = typeof query.search === 'string' ? query.search : undefined;
  const category = typeof query.category === 'string' ? query.category : undefined;
  const sort = typeof query.sort === 'string' ? query.sort : undefined;
  const limit = typeof query.limit === 'string' ? Number(query.limit) : DEFAULT_LIMIT;
  const offset = typeof query.offset === 'string' ? Number(query.offset) : DEFAULT_OFFSET;

  const validSort = sort === 'downloads' || sort === 'newest' || sort === 'updated'
    ? sort
    : 'downloads';

  return { search, category, sort: validSort, limit, offset };
}
```

- [ ] **Step 2: Write browse handler**

```ts
// packages/backend/src/routes/templates/browseTemplates.ts
import type { Request } from 'express';

import { browseTemplates } from '../../db/queries/templateQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseBrowseTemplateOptions } from './templateHelpers.js';

export async function handleBrowseTemplates(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const options = parseBrowseTemplateOptions(req);

  try {
    const { result, error } = await browseTemplates(supabase, options);

    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 3: Write version listing handler**

```ts
// packages/backend/src/routes/templates/getTemplateVersions.ts
import type { Request } from 'express';

import { listVersions } from '../../db/queries/versionQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTemplateAgentId } from './templateHelpers.js';

export async function handleGetTemplateVersions(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const agentId = getTemplateAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const versions = await listVersions(supabase, agentId);
    res.status(HTTP_OK).json(versions);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 4: Write version snapshot handler**

```ts
// packages/backend/src/routes/templates/getTemplateSnapshot.ts
import type { Request } from 'express';

import { assembleTemplateSafeGraph } from '../../db/queries/assembleTemplateSafeGraph.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getTemplateAgentId, getTemplateVersion } from './templateHelpers.js';

export async function handleGetTemplateSnapshot(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const agentId = getTemplateAgentId(req);
  const version = getTemplateVersion(req);

  if (agentId === undefined || version === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID and version are required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const graphData = await assembleTemplateSafeGraph(supabase, agentId, version);

    if (graphData === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Version not found' });
      return;
    }

    res.status(HTTP_OK).json(graphData);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 5: Write template router**

```ts
// packages/backend/src/routes/templates/templateRouter.ts
import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleBrowseTemplates } from './browseTemplates.js';
import { handleGetTemplateSnapshot } from './getTemplateSnapshot.js';
import { handleGetTemplateVersions } from './getTemplateVersions.js';

export const templateRouter = express.Router();
templateRouter.use(requireAuth);

templateRouter.get('/', handleBrowseTemplates);
templateRouter.get('/:agentId/versions', handleGetTemplateVersions);
templateRouter.get('/:agentId/versions/:version', handleGetTemplateSnapshot);
```

- [ ] **Step 6: Register router in server.ts**

Add to `packages/backend/src/server.ts`:

Import: `import { templateRouter } from './routes/templates/templateRouter.js';`

Add route: `app.use('/templates', templateRouter);` (after the `/mcp-library` line)

- [ ] **Step 7: Verify types compile**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/routes/templates/ packages/backend/src/server.ts
git commit -m "feat: add template browse, versions, and snapshot routes"
```

---

## Task 7: Backend — Agent Settings Routes (Visibility, Category, Metadata)

**Files:**
- Create: `packages/backend/src/routes/agents/updateVisibility.ts`
- Create: `packages/backend/src/routes/agents/updateCategory.ts`
- Create: `packages/backend/src/routes/agents/updateMetadata.ts`
- Modify: `packages/backend/src/routes/agents/agentRouter.ts`
- Modify: `packages/backend/src/db/queries/agentQueries.ts`

- [ ] **Step 1: Add agent update functions to agentQueries.ts**

Add to `packages/backend/src/db/queries/agentQueries.ts`:

```ts
export async function updateAgentVisibility(
  supabase: SupabaseClient,
  agentId: string,
  isPublic: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agents')
    .update({ is_public: isPublic })
    .eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateAgentCategory(
  supabase: SupabaseClient,
  agentId: string,
  category: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agents')
    .update({ category })
    .eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function updateAgentMetadata(
  supabase: SupabaseClient,
  agentId: string,
  fields: { name?: string; description?: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agents')
    .update(fields)
    .eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 2: Write visibility handler**

```ts
// packages/backend/src/routes/agents/updateVisibility.ts
import type { Request } from 'express';

import { updateAgentVisibility } from '../../db/queries/agentQueries.js';
import { syncTemplateOnPublicToggle } from '../../db/queries/templateSync.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

export async function handleUpdateVisibility(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;
  const isPublic = req.body?.isPublic;

  if (typeof isPublic !== 'boolean') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'isPublic (boolean) is required' });
    return;
  }

  try {
    const updateResult = await updateAgentVisibility(supabase, agentId, isPublic);
    if (updateResult.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: updateResult.error });
      return;
    }

    const syncResult = await syncTemplateOnPublicToggle(supabase, agentId, isPublic);
    if (syncResult.error !== null) {
      // Rollback visibility if sync fails
      await updateAgentVisibility(supabase, agentId, !isPublic);
      res.status(HTTP_BAD_REQUEST).json({ error: syncResult.error });
      return;
    }

    res.status(HTTP_OK).json({ isPublic });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 3: Write category handler**

```ts
// packages/backend/src/routes/agents/updateCategory.ts
import type { Request } from 'express';

import { TemplateCategorySchema } from '@daviddh/graph-types';

import { updateAgentCategory } from '../../db/queries/agentQueries.js';
import { updateTemplateMetadata } from '../../db/queries/templateQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

export async function handleUpdateCategory(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;
  const parsed = TemplateCategorySchema.safeParse(req.body?.category);

  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid category' });
    return;
  }

  try {
    const result = await updateAgentCategory(supabase, agentId, parsed.data);
    if (result.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: result.error });
      return;
    }

    await updateTemplateMetadata(supabase, agentId, { category: parsed.data });
    res.status(HTTP_OK).json({ category: parsed.data });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 4: Write metadata handler**

```ts
// packages/backend/src/routes/agents/updateMetadata.ts
import type { Request } from 'express';

import { updateAgentMetadata } from '../../db/queries/agentQueries.js';
import { updateTemplateMetadata } from '../../db/queries/templateQueries.js';
import { parseStringField } from './agentCrudHelpers.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

export async function handleUpdateMetadata(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;
  const description = parseStringField(req.body, 'description');

  if (description === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'description is required' });
    return;
  }

  try {
    const result = await updateAgentMetadata(supabase, agentId, { description });
    if (result.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: result.error });
      return;
    }

    await updateTemplateMetadata(supabase, agentId, { description });
    res.status(HTTP_OK).json({ description });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 5: Register routes in agentRouter.ts**

Add imports and routes to `packages/backend/src/routes/agents/agentRouter.ts`:

```ts
import { handleUpdateCategory } from './updateCategory.js';
import { handleUpdateMetadata } from './updateMetadata.js';
import { handleUpdateVisibility } from './updateVisibility.js';

// Add after existing routes:
agentRouter.patch('/:agentId/visibility', handleUpdateVisibility);
agentRouter.patch('/:agentId/category', handleUpdateCategory);
agentRouter.patch('/:agentId/metadata', handleUpdateMetadata);
```

- [ ] **Step 6: Verify types compile**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/routes/agents/ packages/backend/src/db/queries/agentQueries.ts
git commit -m "feat: add agent visibility, category, and metadata update routes"
```

---

## Task 8: Backend — Extend Agent Creation with Template Cloning

**Files:**
- Modify: `packages/backend/src/routes/agents/createAgent.ts`
- Create: `packages/backend/src/db/queries/cloneTemplateGraph.ts`

- [ ] **Step 1: Write clone function**

```ts
// packages/backend/src/db/queries/cloneTemplateGraph.ts
import type { TemplateGraphData, TemplateMcpServer } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

function buildNodeRows(agentId: string, graphData: TemplateGraphData): object[] {
  return graphData.nodes.map((n) => ({
    agent_id: agentId,
    node_id: n.id,
    text: n.text,
    kind: n.kind,
    description: n.description,
    agent: n.agent,
    next_node_is_user: n.nextNodeIsUser ?? false,
    fallback_node_id: n.fallbackNodeId,
    global: n.global,
    default_fallback: n.defaultFallback,
    position_x: n.position?.x,
    position_y: n.position?.y,
    output_schema_id: n.outputSchemaId,
    output_prompt: n.outputPrompt,
  }));
}

function buildAgentRows(agentId: string, graphData: TemplateGraphData): object[] {
  return graphData.agents.map((a) => ({
    agent_id: agentId,
    agent_key: a.id,
    description: a.description,
  }));
}

function buildMcpServerRow(agentId: string, server: TemplateMcpServer, index: number): object {
  if (server.type === 'library') {
    return {
      agent_id: agentId,
      server_id: `mcp-${String(index)}`,
      name: server.name,
      transport_type: 'http',
      transport_config: {},
      enabled: true,
      library_item_id: server.libraryItemId,
      variable_values: null,
    };
  }

  return {
    agent_id: agentId,
    server_id: `mcp-${String(index)}`,
    name: server.name,
    transport_type: server.transportType,
    transport_config: {},
    enabled: true,
    library_item_id: null,
    variable_values: null,
  };
}

function buildOutputSchemaRows(agentId: string, graphData: TemplateGraphData): object[] {
  if (graphData.outputSchemas === undefined) return [];
  return graphData.outputSchemas.map((s) => ({
    agent_id: agentId,
    schema_id: s.id,
    name: s.name,
    fields: s.fields,
  }));
}

export async function cloneTemplateGraph(
  supabase: SupabaseClient,
  agentId: string,
  graphData: TemplateGraphData
): Promise<void> {
  // Update start node
  const startResult = await supabase
    .from('agents')
    .update({ start_node: graphData.startNode })
    .eq('id', agentId);
  throwOnMutationError(startResult, 'cloneTemplate:startNode');

  // Insert nodes
  const nodeRows = buildNodeRows(agentId, graphData);
  if (nodeRows.length > 0) {
    const nodeResult = await supabase.from('graph_nodes').insert(nodeRows);
    throwOnMutationError(nodeResult, 'cloneTemplate:nodes');
  }

  // Insert edges via RPC (handles preconditions atomically)
  for (const edge of graphData.edges) {
    const preconditions = (edge.preconditions ?? []).map((p) => ({
      type: p.type,
      value: p.value,
      description: p.description ?? '',
    }));
    const contextPreconditions = edge.contextPreconditions ?? null;

    const result = await supabase.rpc('upsert_edge_tx', {
      p_agent_id: agentId,
      p_from_node: edge.from,
      p_to_node: edge.to,
      p_preconditions: preconditions,
      p_context_preconditions: contextPreconditions,
    });
    if (result.error !== null) {
      throw new Error(`cloneTemplate:edge: ${result.error.message}`);
    }
  }

  // Insert agents
  const agentRows = buildAgentRows(agentId, graphData);
  if (agentRows.length > 0) {
    const agentResult = await supabase.from('graph_agents').insert(agentRows);
    throwOnMutationError(agentResult, 'cloneTemplate:agents');
  }

  // Insert MCP servers
  for (let i = 0; i < graphData.mcpServers.length; i++) {
    const server = graphData.mcpServers[i];
    if (server === undefined) continue;
    const row = buildMcpServerRow(agentId, server, i);
    const result = await supabase
      .from('graph_mcp_servers')
      .upsert(row, { onConflict: 'agent_id,server_id' });
    throwOnMutationError(result, 'cloneTemplate:mcpServer');
  }

  // Insert output schemas
  const schemaRows = buildOutputSchemaRows(agentId, graphData);
  if (schemaRows.length > 0) {
    const schemaResult = await supabase.from('graph_output_schemas').insert(schemaRows);
    throwOnMutationError(schemaResult, 'cloneTemplate:outputSchemas');
  }
}
```

- [ ] **Step 2: Extend createAgent handler**

Modify `packages/backend/src/routes/agents/createAgent.ts` to accept template params:

Add imports at top:

```ts
import { TemplateCategorySchema } from '@daviddh/graph-types';

import { assembleTemplateSafeGraph } from '../../db/queries/assembleTemplateSafeGraph.js';
import { cloneTemplateGraph } from '../../db/queries/cloneTemplateGraph.js';
import { getTemplateByAgentId, incrementDownloads } from '../../db/queries/templateQueries.js';
```

Then add new field parsing in the handler body (after existing parsing), and add clone logic after agent creation:

```ts
// Add field parsing:
const category = parseStringField(req.body, 'category') ?? 'other';
const categoryResult = TemplateCategorySchema.safeParse(category);
const validCategory = categoryResult.success ? categoryResult.data : 'other';
const isPublic = req.body?.isPublic === true;
const templateAgentId = parseStringField(req.body, 'templateAgentId');
const templateVersionRaw = req.body?.templateVersion;
const templateVersion = typeof templateVersionRaw === 'number' ? templateVersionRaw : undefined;

// Modify insert call to include new fields:
const { result, error } = await insertAgent(supabase, {
  orgId,
  name,
  slug,
  description: description ?? '',
  category: validCategory,
  isPublic,
});

// After successful agent creation, clone template if provided:
if (result !== null && templateAgentId !== undefined && templateVersion !== undefined) {
  const graphData = await assembleTemplateSafeGraph(supabase, templateAgentId, templateVersion);
  if (graphData !== null) {
    await cloneTemplateGraph(supabase, result.id, graphData);
    const template = await getTemplateByAgentId(supabase, templateAgentId);
    if (template.result !== null) {
      await supabase
        .from('agents')
        .update({ created_from_template_id: template.result.id })
        .eq('id', result.id);
      await incrementDownloads(supabase, template.result.id);
    }
  }
}
```

- [ ] **Step 3: Update insertAgent in agentQueries.ts**

Modify the `InsertAgentInput` interface and `insertAgent` function in `packages/backend/src/db/queries/agentQueries.ts` to accept `category` and `isPublic`:

```ts
interface InsertAgentInput {
  orgId: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  isPublic: boolean;
}

// In insertAgent, update the insert object:
.insert({
  org_id: input.orgId,
  name: input.name,
  slug: input.slug,
  description: input.description,
  category: input.category,
  is_public: input.isPublic,
})
```

- [ ] **Step 4: Verify types compile**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/cloneTemplateGraph.ts packages/backend/src/routes/agents/createAgent.ts packages/backend/src/db/queries/agentQueries.ts
git commit -m "feat: extend agent creation with template cloning support"
```

---

## Task 9: Backend — Trigger Template Sync on Publish

**Files:**
- Modify: `packages/backend/src/routes/graph/postPublish.ts`

- [ ] **Step 1: Add sync call after publish**

In `packages/backend/src/routes/graph/postPublish.ts`, add import and sync call:

```ts
import { syncTemplateAfterPublish } from '../../db/queries/templateSync.js';
```

After `const version = await publishVersion(supabase, agentId);`, add:

```ts
// Sync template if agent is public (fire-and-forget, don't block publish)
await syncTemplateAfterPublish(supabase, agentId).catch((syncErr) => {
  logError(agentId, `template sync failed: ${extractErrorMessage(syncErr)}`);
});
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/graph/postPublish.ts
git commit -m "feat: trigger template sync on agent publish"
```

---

## Task 10: Frontend — Template API Client & Server Actions

**Files:**
- Create: `packages/web/app/lib/templates.ts`
- Create: `packages/web/app/actions/templates.ts`
- Create: `packages/web/app/actions/agentSettings.ts`
- Modify: `packages/web/app/lib/agents.ts`
- Modify: `packages/web/app/actions/agents.ts`

- [ ] **Step 1: Create template API client**

```ts
// packages/web/app/lib/templates.ts
import type { TemplateCategory, TemplateGraphData } from '@daviddh/graph-types';

import { fetchFromBackend } from './backendProxy';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TemplateListItem {
  id: string;
  agent_id: string;
  org_id: string;
  org_slug: string;
  org_avatar_url: string | null;
  agent_slug: string;
  agent_name: string;
  description: string;
  category: string;
  node_count: number;
  mcp_server_count: number;
  download_count: number;
  latest_version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersionSummary {
  version: number;
  publishedAt: string;
  publishedBy: string;
}

export interface BrowseTemplateParams {
  search?: string;
  category?: TemplateCategory;
  sort?: 'downloads' | 'newest' | 'updated';
  limit?: number;
  offset?: number;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isTemplateArray(value: unknown): value is TemplateListItem[] {
  return Array.isArray(value);
}

function isVersionArray(value: unknown): value is TemplateVersionSummary[] {
  return Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function buildQueryString(params: BrowseTemplateParams): string {
  const parts: string[] = [];
  if (params.search !== undefined) parts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.category !== undefined) parts.push(`category=${encodeURIComponent(params.category)}`);
  if (params.sort !== undefined) parts.push(`sort=${params.sort}`);
  if (params.limit !== undefined) parts.push(`limit=${String(params.limit)}`);
  if (params.offset !== undefined) parts.push(`offset=${String(params.offset)}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function browseTemplates(
  params?: BrowseTemplateParams
): Promise<{ templates: TemplateListItem[]; error: string | null }> {
  try {
    const qs = buildQueryString(params ?? {});
    const data = await fetchFromBackend('GET', `/templates${qs}`);
    if (!isTemplateArray(data)) return { templates: [], error: 'Invalid response' };
    return { templates: data, error: null };
  } catch (err) {
    return { templates: [], error: extractError(err) };
  }
}

export async function getTemplateVersions(
  agentId: string
): Promise<{ versions: TemplateVersionSummary[]; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/templates/${encodeURIComponent(agentId)}/versions`
    );
    if (!isVersionArray(data)) return { versions: [], error: 'Invalid response' };
    return { versions: data, error: null };
  } catch (err) {
    return { versions: [], error: extractError(err) };
  }
}

export async function getTemplateSnapshot(
  agentId: string,
  version: number
): Promise<{ graphData: TemplateGraphData | null; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/templates/${encodeURIComponent(agentId)}/versions/${String(version)}`
    );
    return { graphData: data as TemplateGraphData, error: null };
  } catch (err) {
    return { graphData: null, error: extractError(err) };
  }
}
```

- [ ] **Step 2: Create template server actions**

```ts
// packages/web/app/actions/templates.ts
'use server';

import type { BrowseTemplateParams, TemplateListItem, TemplateVersionSummary } from '@/app/lib/templates';
import { browseTemplates as browseTemplatesLib, getTemplateVersions as getVersionsLib } from '@/app/lib/templates';

export async function browseTemplatesAction(
  params?: BrowseTemplateParams
): Promise<{ templates: TemplateListItem[]; error: string | null }> {
  return browseTemplatesLib(params);
}

export async function getTemplateVersionsAction(
  agentId: string
): Promise<{ versions: TemplateVersionSummary[]; error: string | null }> {
  return getVersionsLib(agentId);
}
```

- [ ] **Step 3: Create agent settings server actions**

```ts
// packages/web/app/actions/agentSettings.ts
'use server';

import { fetchFromBackend } from '@/app/lib/backendProxy';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { revalidatePath } from 'next/cache';

export async function updateVisibilityAction(
  agentId: string,
  isPublic: boolean
): Promise<{ error: string | null }> {
  serverLog('[updateVisibilityAction] agentId:', agentId, 'isPublic:', isPublic);
  try {
    await fetchFromBackend('PATCH', `/agents/${encodeURIComponent(agentId)}/visibility`, {
      isPublic,
    });
    revalidatePath('/orgs/[slug]', 'layout');
    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    serverError('[updateVisibilityAction] error:', msg);
    return { error: msg };
  }
}

export async function updateCategoryAction(
  agentId: string,
  category: string
): Promise<{ error: string | null }> {
  serverLog('[updateCategoryAction] agentId:', agentId, 'category:', category);
  try {
    await fetchFromBackend('PATCH', `/agents/${encodeURIComponent(agentId)}/category`, {
      category,
    });
    revalidatePath('/orgs/[slug]', 'layout');
    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    serverError('[updateCategoryAction] error:', msg);
    return { error: msg };
  }
}

export async function updateDescriptionAction(
  agentId: string,
  description: string
): Promise<{ error: string | null }> {
  serverLog('[updateDescriptionAction] agentId:', agentId);
  try {
    await fetchFromBackend('PATCH', `/agents/${encodeURIComponent(agentId)}/metadata`, {
      description,
    });
    revalidatePath('/orgs/[slug]', 'layout');
    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    serverError('[updateDescriptionAction] error:', msg);
    return { error: msg };
  }
}
```

- [ ] **Step 4: Update AgentRow type in agents.ts**

In `packages/web/app/lib/agents.ts`, add `is_public`, `category`, and `created_from_template_id` to `AgentRow`:

```ts
export interface AgentRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string;
  start_node: string;
  current_version: number;
  version: number;
  created_at: string;
  updated_at: string;
  staging_api_key_id: string | null;
  production_api_key_id: string | null;
  is_public: boolean;
  category: string;
  created_from_template_id: string | null;
}
```

- [ ] **Step 5: Extend createAgent in agents.ts**

Update the `createAgent` function signature and body in `packages/web/app/lib/agents.ts`:

```ts
export async function createAgent(
  orgId: string,
  name: string,
  description: string,
  category: string,
  isPublic: boolean,
  templateAgentId?: string,
  templateVersion?: number
): Promise<{ agent: AgentRow | null; error: string | null }> {
  try {
    const body: Record<string, unknown> = { orgId, name, description, category, isPublic };
    if (templateAgentId !== undefined) body.templateAgentId = templateAgentId;
    if (templateVersion !== undefined) body.templateVersion = templateVersion;
    const data = await fetchFromBackend('POST', '/agents', body);
    if (!isAgentRow(data)) return { agent: null, error: 'Invalid response' };
    return { agent: data, error: null };
  } catch (err) {
    return { agent: null, error: extractError(err) };
  }
}
```

- [ ] **Step 6: Update createAgentAction**

In `packages/web/app/actions/agents.ts`, update `createAgentAction`:

```ts
export async function createAgentAction(
  orgId: string,
  name: string,
  description: string,
  category: string,
  isPublic: boolean,
  templateAgentId?: string,
  templateVersion?: number
): Promise<{ agent: AgentRow | null; error: string | null }> {
  serverLog('[createAgentAction] orgId:', orgId, 'name:', name);
  const res = await createAgentLib(orgId, name, description, category, isPublic, templateAgentId, templateVersion);
  if (res.error === null) {
    serverLog('[createAgentAction] created agent:', res.agent?.slug);
    revalidatePath('/orgs/[slug]', 'layout');
  } else {
    serverError('[createAgentAction] error:', res.error);
  }
  return res;
}
```

- [ ] **Step 7: Verify types compile**

Run: `npm run typecheck -w packages/web`
Expected: PASS (may have errors from components not yet updated — that's OK, we'll fix in later tasks)

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/lib/templates.ts packages/web/app/actions/templates.ts packages/web/app/actions/agentSettings.ts packages/web/app/lib/agents.ts packages/web/app/actions/agents.ts
git commit -m "feat: add template API client, server actions, and extended agent creation"
```

---

## Task 11: Frontend — Translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add marketplace and settings translations**

Add the following keys to `packages/web/messages/en.json`:

```json
"marketplace": {
  "searchPlaceholder": "Search templates...",
  "blankCanvas": "Blank Canvas",
  "blankCanvasDescription": "Start from scratch with an empty graph",
  "noResults": "No templates found",
  "nodes": "nodes",
  "mcpServers": "MCPs",
  "downloads": "downloads",
  "preview": "Preview",
  "previewTitle": "Graph Preview",
  "selectTemplate": "Select a template",
  "next": "Next",
  "back": "Back",
  "step1Title": "Choose a starting point",
  "step2Title": "Agent details",
  "version": "v{version}",
  "latest": "latest",
  "allCategories": "All"
},
"categories": {
  "customer-support": "Customer Support",
  "sales": "Sales",
  "marketing": "Marketing",
  "engineering": "Engineering",
  "data-analysis": "Data Analysis",
  "content-creation": "Content Creation",
  "research": "Research",
  "operations": "Operations",
  "hr-recruiting": "HR & Recruiting",
  "legal-compliance": "Legal & Compliance",
  "finance": "Finance",
  "education": "Education",
  "e-commerce": "E-commerce",
  "other": "Other"
},
"settings": {
  "title": "Settings",
  "description": "Description",
  "descriptionPlaceholder": "Describe what this agent does...",
  "category": "Category",
  "visibility": "Visibility",
  "visibilityPublic": "Public",
  "visibilityPrivate": "Private",
  "publicExplanation": "Other users will be able to create copies of this agent's graph. They won't have access to your API keys, secrets, or execution data.",
  "makePublicTitle": "Make agent public?",
  "makePublicDescription": "Your agent's published graph will become visible to all users in the marketplace. No secrets or execution data will be shared.",
  "makePrivateTitle": "Make agent private?",
  "makePrivateDescription": "Your agent will be removed from the marketplace. Users who already created copies will keep them.",
  "confirm": "Confirm",
  "cancel": "Cancel",
  "save": "Save",
  "saved": "Saved",
  "dangerZone": "Danger Zone",
  "deleteAgent": "Delete this agent",
  "deleteAgentDescription": "Once deleted, this agent and all its data will be permanently removed.",
  "mustPublishFirst": "Publish your agent at least once before making it public."
}
```

- [ ] **Step 2: Verify no JSON syntax errors**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/web/messages/en.json','utf8'))"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add marketplace, categories, and settings translations"
```

---

## Task 12: Frontend — Template Card Component

**Files:**
- Create: `packages/web/app/components/agents/TemplateCard.tsx`
- Create: `packages/web/app/components/agents/TemplateVersionSelector.tsx`

- [ ] **Step 1: Create version selector (borderless combobox)**

```ts
// packages/web/app/components/agents/TemplateVersionSelector.tsx
'use client';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { useTranslations } from 'next-intl';

interface TemplateVersionSelectorProps {
  versions: number[];
  value: number;
  onValueChange: (version: number) => void;
}

export function TemplateVersionSelector({
  versions,
  value,
  onValueChange,
}: TemplateVersionSelectorProps) {
  const t = useTranslations('marketplace');
  const anchorRef = useComboboxAnchor();

  const items = versions.map((v) => String(v));
  const selected = String(value);

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(v) => {
        if (v !== null) onValueChange(Number(v));
      }}
      itemToStringLabel={(v) => (v === String(value) ? t('latest') : `v${v}`)}
    >
      <div ref={anchorRef}>
        <button
          type="button"
          className="h-5 border-none bg-transparent text-[11px] text-muted-foreground transition-colors rounded-md hover:bg-card px-1"
        >
          {value === versions[0] ? t('latest') : `v${String(value)}`}
        </button>
      </div>
      <ComboboxContent className="w-[120px]" align="end" anchor={anchorRef}>
        <ComboboxEmpty>No versions</ComboboxEmpty>
        <ComboboxList>
          {(v) => (
            <ComboboxItem key={v} value={v}>
              {t('version', { version: v })}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
```

- [ ] **Step 2: Create template card component**

```ts
// packages/web/app/components/agents/TemplateCard.tsx
'use client';

import type { TemplateListItem } from '@/app/lib/templates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Eye, GitFork, Network, Puzzle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TemplateVersionSelector } from './TemplateVersionSelector';

interface TemplateCardProps {
  template: TemplateListItem;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  selectedVersion: number;
  onVersionChange: (version: number) => void;
  versions: number[];
}

function OrgAvatar({ url, slug }: { url: string | null; slug: string }) {
  if (url !== null) {
    return <img src={url} alt={slug} className="size-5 rounded-full" />;
  }
  const initial = slug.charAt(0).toUpperCase();
  return (
    <div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
      {initial}
    </div>
  );
}

function StatItem({ icon: Icon, value }: { icon: typeof Network; value: number }) {
  return (
    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
      <Icon className="size-3" />
      {value}
    </span>
  );
}

export function TemplateCard(props: TemplateCardProps) {
  const { template, selected, onSelect, onPreview } = props;
  const { selectedVersion, onVersionChange, versions } = props;
  const tc = useTranslations('categories');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 ${
        selected ? 'border-primary ring-1 ring-primary' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <OrgAvatar url={template.org_avatar_url} slug={template.org_slug} />
          <span className="truncate text-xs font-medium">
            {template.org_slug}/{template.agent_slug}
          </span>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {tc(template.category)}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatItem icon={Network} value={template.node_count} />
          <StatItem icon={Puzzle} value={template.mcp_server_count} />
          <StatItem icon={Download} value={template.download_count} />
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <TemplateVersionSelector
            versions={versions}
            value={selectedVersion}
            onValueChange={onVersionChange}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
          >
            <Eye className="size-3.5" />
          </Button>
        </div>
      </div>
    </button>
  );
}

export function BlankCanvasCard({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('marketplace');
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-3 transition-colors hover:border-primary/50 ${
        selected ? 'border-primary ring-1 ring-primary' : 'border-border border-dashed'
      }`}
    >
      <GitFork className="size-6 text-muted-foreground" />
      <span className="text-xs font-medium">{t('blankCanvas')}</span>
      <span className="text-[11px] text-muted-foreground text-center">
        {t('blankCanvasDescription')}
      </span>
    </button>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/agents/TemplateCard.tsx packages/web/app/components/agents/TemplateVersionSelector.tsx
git commit -m "feat: add TemplateCard and TemplateVersionSelector components"
```

---

## Task 13: Frontend — Template Grid Component

**Files:**
- Create: `packages/web/app/components/agents/TemplateGrid.tsx`

- [ ] **Step 1: Create the grid with search and filters**

This component handles browsing, category filtering, and search. It manages template state and delegates rendering to TemplateCard. Build with appropriate file splitting to stay within ESLint line limits.

```ts
// packages/web/app/components/agents/TemplateGrid.tsx
'use client';

import type { TemplateCategory } from '@daviddh/graph-types';
import { TEMPLATE_CATEGORIES } from '@daviddh/graph-types';
import type { TemplateListItem } from '@/app/lib/templates';
import { browseTemplatesAction, getTemplateVersionsAction } from '@/app/actions/templates';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { BlankCanvasCard, TemplateCard } from './TemplateCard';

interface TemplateSelection {
  type: 'blank' | 'template';
  agentId?: string;
  version?: number;
}

interface TemplateGridProps {
  selection: TemplateSelection | null;
  onSelectionChange: (selection: TemplateSelection) => void;
  onPreview: (agentId: string, version: number) => void;
}

type VersionMap = Record<string, number[]>;
type SelectedVersionMap = Record<string, number>;

export function TemplateGrid({ selection, onSelectionChange, onPreview }: TemplateGridProps) {
  const t = useTranslations('marketplace');
  const tc = useTranslations('categories');
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<TemplateCategory | ''>('');
  const [versions, setVersions] = useState<VersionMap>({});
  const [selectedVersions, setSelectedVersions] = useState<SelectedVersionMap>({});

  const loadTemplates = useCallback(async () => {
    const params = {
      search: search || undefined,
      category: (category || undefined) as TemplateCategory | undefined,
      limit: 15,
    };
    const { templates: result } = await browseTemplatesAction(params);
    setTemplates(result);
  }, [search, category]);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  const loadVersions = useCallback(async (agentId: string, latestVersion: number) => {
    if (versions[agentId] !== undefined) return;
    const { versions: versionList } = await getTemplateVersionsAction(agentId);
    const nums = versionList.map((v) => v.version);
    setVersions((prev) => ({ ...prev, [agentId]: nums }));
    setSelectedVersions((prev) => ({ ...prev, [agentId]: latestVersion }));
  }, [versions]);

  useEffect(() => {
    for (const tpl of templates) {
      void loadVersions(tpl.agent_id, tpl.latest_version);
    }
  }, [templates, loadVersions]);

  const handleVersionChange = useCallback((agentId: string, version: number) => {
    setSelectedVersions((prev) => ({ ...prev, [agentId]: version }));
    if (selection?.agentId === agentId) {
      onSelectionChange({ type: 'template', agentId, version });
    }
  }, [selection, onSelectionChange]);

  const isBlankSelected = selection?.type === 'blank';

  return (
    <div className="flex flex-col gap-3">
      <SearchBar value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      <CategoryPills value={category} onChange={setCategory} tc={tc} />
      <div className="grid grid-cols-3 gap-2 max-h-[380px] overflow-y-auto pr-1">
        <BlankCanvasCard selected={isBlankSelected} onSelect={() => onSelectionChange({ type: 'blank' })} />
        {templates.map((tpl) => {
          const agentVersions = versions[tpl.agent_id] ?? [tpl.latest_version];
          const selectedVer = selectedVersions[tpl.agent_id] ?? tpl.latest_version;
          return (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              selected={selection?.agentId === tpl.agent_id}
              onSelect={() => onSelectionChange({ type: 'template', agentId: tpl.agent_id, version: selectedVer })}
              onPreview={() => onPreview(tpl.agent_id, selectedVer)}
              selectedVersion={selectedVer}
              onVersionChange={(v) => handleVersionChange(tpl.agent_id, v)}
              versions={agentVersions}
            />
          );
        })}
        {templates.length === 0 && (
          <div className="col-span-3 py-8 text-center text-sm text-muted-foreground">
            {t('noResults')}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 h-8 text-sm"
      />
    </div>
  );
}

function CategoryPills({ value, onChange, tc }: { value: string; onChange: (v: TemplateCategory | '') => void; tc: (key: string) => string }) {
  const t = useTranslations('marketplace');
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      <PillButton active={value === ''} onClick={() => onChange('')} label={t('allCategories')} />
      {TEMPLATE_CATEGORIES.map((cat) => (
        <PillButton key={cat} active={value === cat} onClick={() => onChange(cat)} label={tc(cat)} />
      ))}
    </div>
  );
}

function PillButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
    >
      {label}
    </button>
  );
}

export type { TemplateSelection };
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/agents/TemplateGrid.tsx
git commit -m "feat: add TemplateGrid with search, category filters, and version loading"
```

---

## Task 14: Frontend — Read-Only Graph Preview Modal

A separate, isolated component — NOT the editor with flags. No edit operations, no simulation, no mutation callbacks.

**Files:**
- Create: `packages/web/app/components/agents/TemplatePreviewModal.tsx`

- [ ] **Step 1: Create preview component**

This component renders a read-only graph using @xyflow/react with all interaction disabled. It receives only static data from `template_graph_data`.

```ts
// packages/web/app/components/agents/TemplatePreviewModal.tsx
'use client';

import type { TemplateGraphData } from '@daviddh/graph-types';
import { getTemplateSnapshot } from '@/app/lib/templates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import '@xyflow/react/dist/style.css';

interface TemplatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
  version: number | null;
}

interface PreviewNode {
  id: string;
  position: { x: number; y: number };
  data: { label: string; kind: string; description: string };
  type: string;
}

interface PreviewEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

function toPreviewNodes(graphData: TemplateGraphData): PreviewNode[] {
  return graphData.nodes.map((n) => ({
    id: n.id,
    position: n.position ?? { x: 0, y: 0 },
    data: { label: n.text, kind: n.kind, description: n.description },
    type: 'default',
  }));
}

function buildEdgeLabel(edge: TemplateGraphData['edges'][number]): string {
  if (edge.preconditions === undefined) return '';
  return edge.preconditions.map((p) => p.value).join(', ');
}

function toPreviewEdges(graphData: TemplateGraphData): PreviewEdge[] {
  return graphData.edges.map((e, i) => ({
    id: `e-${String(i)}`,
    source: e.from,
    target: e.to,
    label: buildEdgeLabel(e) || undefined,
  }));
}

export function TemplatePreviewModal({
  open,
  onOpenChange,
  agentId,
  version,
}: TemplatePreviewModalProps) {
  const t = useTranslations('marketplace');
  const { resolvedTheme } = useTheme();
  const [graphData, setGraphData] = useState<TemplateGraphData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || agentId === null || version === null) {
      setGraphData(null);
      return;
    }

    setLoading(true);
    void getTemplateSnapshot(agentId, version).then(({ graphData: data }) => {
      setGraphData(data);
      setLoading(false);
    });
  }, [open, agentId, version]);

  const nodes = graphData !== null ? toPreviewNodes(graphData) : [];
  const edges = graphData !== null ? toPreviewEdges(graphData) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[600px] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>{t('previewTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          {loading && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading...
            </div>
          )}
          {!loading && graphData !== null && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              edgesFocusable={false}
              nodesFocusable={false}
              panOnDrag={true}
              zoomOnScroll={true}
              fitView
              colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
            >
              <Background color="var(--canvas-dots)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/agents/TemplatePreviewModal.tsx
git commit -m "feat: add read-only TemplatePreviewModal with isolated graph render"
```

---

## Task 15: Frontend — 2-Step Creation Wizard Dialog

**Files:**
- Create: `packages/web/app/components/agents/CreateAgentWizard.tsx`
- Modify: `packages/web/app/components/agents/AgentsSidebar.tsx`

- [ ] **Step 1: Create the wizard dialog**

This replaces the old `CreateAgentDialog`. Two steps: template selection, then agent details. Split into focused subcomponents as needed for ESLint line limits.

```ts
// packages/web/app/components/agents/CreateAgentWizard.tsx
'use client';

import type { TemplateCategory } from '@daviddh/graph-types';
import { TEMPLATE_CATEGORIES } from '@daviddh/graph-types';
import { createAgentAction } from '@/app/actions/agents';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useState } from 'react';
import { toast } from 'sonner';

import { TemplateGrid, type TemplateSelection } from './TemplateGrid';
import { TemplatePreviewModal } from './TemplatePreviewModal';

interface CreateAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgSlug: string;
}

type Step = 'template' | 'details';

export function CreateAgentWizard({ open, onOpenChange, orgId, orgSlug }: CreateAgentWizardProps) {
  const t = useTranslations('marketplace');
  const [step, setStep] = useState<Step>('template');
  const [selection, setSelection] = useState<TemplateSelection | null>(null);
  const [previewAgentId, setPreviewAgentId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setStep('template');
      setSelection(null);
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);

  const handlePreview = useCallback((agentId: string, version: number) => {
    setPreviewAgentId(agentId);
    setPreviewVersion(version);
    setPreviewOpen(true);
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{step === 'template' ? t('step1Title') : t('step2Title')}</DialogTitle>
          </DialogHeader>
          {step === 'template' && (
            <TemplateStep
              selection={selection}
              onSelectionChange={setSelection}
              onPreview={handlePreview}
              onNext={() => setStep('details')}
            />
          )}
          {step === 'details' && (
            <DetailsStep
              orgId={orgId}
              orgSlug={orgSlug}
              selection={selection}
              onBack={() => setStep('template')}
              onOpenChange={handleOpenChange}
            />
          )}
        </DialogContent>
      </Dialog>
      <TemplatePreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        agentId={previewAgentId}
        version={previewVersion}
      />
    </>
  );
}

interface TemplateStepProps {
  selection: TemplateSelection | null;
  onSelectionChange: (s: TemplateSelection) => void;
  onPreview: (agentId: string, version: number) => void;
  onNext: () => void;
}

function TemplateStep({ selection, onSelectionChange, onPreview, onNext }: TemplateStepProps) {
  const t = useTranslations('marketplace');
  return (
    <div className="flex flex-col gap-4">
      <TemplateGrid selection={selection} onSelectionChange={onSelectionChange} onPreview={onPreview} />
      <DialogFooter>
        <Button onClick={onNext} disabled={selection === null}>
          {t('next')}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface DetailsStepProps {
  orgId: string;
  orgSlug: string;
  selection: TemplateSelection | null;
  onBack: () => void;
  onOpenChange: (open: boolean) => void;
}

function DetailsStep({ orgId, orgSlug, selection, onBack, onOpenChange }: DetailsStepProps) {
  const t = useTranslations('agents');
  const tm = useTranslations('marketplace');
  const ts = useTranslations('settings');
  const tc = useTranslations('categories');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('other');
  const [isPublic, setIsPublic] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (name.trim() === '') return;

    setLoading(true);
    const templateAgentId = selection?.type === 'template' ? selection.agentId : undefined;
    const templateVersion = selection?.type === 'template' ? selection.version : undefined;

    const { agent, error } = await createAgentAction(
      orgId, name.trim(), description.trim(), category, isPublic, templateAgentId, templateVersion
    );

    if (error !== null || agent === null) {
      setLoading(false);
      toast.error(error ?? t('createError'));
      return;
    }

    onOpenChange(false);
    router.push(`/orgs/${orgSlug}/editor/${agent.slug}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="agent-name">{t('name')}</Label>
        <Input id="agent-name" name="name" placeholder={t('namePlaceholder')} required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="agent-description">{t('description')}</Label>
        <Textarea id="agent-description" name="description" placeholder={t('descriptionPlaceholder')} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="agent-category">{ts('category')}</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
          <SelectTrigger id="agent-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{tc(cat)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id="agent-public" checked={isPublic} onCheckedChange={(v) => setIsPublic(v === true)} />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="agent-public" className="text-sm font-medium">{ts('visibilityPublic')}</Label>
          <p className="text-xs text-muted-foreground">{ts('publicExplanation')}</p>
        </div>
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onBack}>{tm('back')}</Button>
        <Button type="submit" disabled={loading || name.trim() === '' || description.trim() === ''}>{t('create')}</Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 2: Update AgentsSidebar to use CreateAgentWizard**

In `packages/web/app/components/agents/AgentsSidebar.tsx`, replace the import:

Old: `import { CreateAgentDialog } from './CreateAgentDialog';`
New: `import { CreateAgentWizard } from './CreateAgentWizard';`

And replace the component usage (all instances of `<CreateAgentDialog`) with `<CreateAgentWizard` using the same props.

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/agents/CreateAgentWizard.tsx packages/web/app/components/agents/AgentsSidebar.tsx
git commit -m "feat: replace CreateAgentDialog with 2-step CreateAgentWizard"
```

---

## Task 16: Frontend — Settings Panel

**Files:**
- Create: `packages/web/app/components/agents/SettingsPanel.tsx`
- Create: `packages/web/app/components/agents/VisibilityToggle.tsx`
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/(agents)/editor/[agentSlug]/EditorTabs.tsx`
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/(agents)/editor/[agentSlug]/page.tsx`

- [ ] **Step 1: Create VisibilityToggle with confirmation**

```ts
// packages/web/app/components/agents/VisibilityToggle.tsx
'use client';

import { updateVisibilityAction } from '@/app/actions/agentSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface VisibilityToggleProps {
  agentId: string;
  currentVersion: number;
  initialIsPublic: boolean;
}

export function VisibilityToggle({ agentId, currentVersion, initialIsPublic }: VisibilityToggleProps) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleToggle(checked: boolean) {
    if (checked && currentVersion === 0) {
      toast.error(t('mustPublishFirst'));
      return;
    }
    setPendingValue(checked);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setLoading(true);
    const { error } = await updateVisibilityAction(agentId, pendingValue);
    setLoading(false);
    setConfirmOpen(false);

    if (error !== null) {
      toast.error(error);
      return;
    }

    setIsPublic(pendingValue);
    router.refresh();
  }

  const title = pendingValue ? t('makePublicTitle') : t('makePrivateTitle');
  const desc = pendingValue ? t('makePublicDescription') : t('makePrivateDescription');

  return (
    <>
      <div className="flex items-start gap-2">
        <Checkbox
          id="visibility-toggle"
          checked={isPublic}
          onCheckedChange={(v) => handleToggle(v === true)}
          disabled={loading}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="visibility-toggle" className="text-sm font-medium">
            {isPublic ? t('visibilityPublic') : t('visibilityPrivate')}
          </Label>
          <p className="text-xs text-muted-foreground">{t('publicExplanation')}</p>
        </div>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={loading}>
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Create SettingsPanel**

```ts
// packages/web/app/components/agents/SettingsPanel.tsx
'use client';

import type { TemplateCategory } from '@daviddh/graph-types';
import { TEMPLATE_CATEGORIES, TemplateCategorySchema } from '@daviddh/graph-types';
import type { AgentMetadata } from '@/app/lib/agents';
import { updateCategoryAction, updateDescriptionAction } from '@/app/actions/agentSettings';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { DeleteAgentDialog } from './DeleteAgentDialog';
import { VisibilityToggle } from './VisibilityToggle';

interface SettingsPanelProps {
  agentId: string;
  agentName: string;
  agentSlug: string;
  initialDescription: string;
  initialCategory: string;
  initialIsPublic: boolean;
  currentVersion: number;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { agentId, agentName, agentSlug, currentVersion } = props;
  const t = useTranslations('settings');
  const tc = useTranslations('categories');

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <DescriptionSection agentId={agentId} initial={props.initialDescription} />
      <Separator />
      <CategorySection agentId={agentId} initial={props.initialCategory} tc={tc} />
      <Separator />
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">{t('visibility')}</Label>
        <VisibilityToggle
          agentId={agentId}
          currentVersion={currentVersion}
          initialIsPublic={props.initialIsPublic}
        />
      </div>
      <Separator />
      <DangerZone agentId={agentId} agentName={agentName} agentSlug={agentSlug} />
    </div>
  );
}

function DescriptionSection({ agentId, initial }: { agentId: string; initial: string }) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const { error } = await updateDescriptionAction(agentId, value);
    setSaving(false);
    if (error !== null) {
      toast.error(error);
      return;
    }
    toast.success(t('saved'));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('description')}</Label>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('descriptionPlaceholder')} />
      <Button size="sm" onClick={handleSave} disabled={saving || value === initial} className="self-end">
        {t('save')}
      </Button>
    </div>
  );
}

function CategorySection({ agentId, initial, tc }: { agentId: string; initial: string; tc: (key: string) => string }) {
  const t = useTranslations('settings');
  const router = useRouter();
  const parsed = TemplateCategorySchema.safeParse(initial);
  const [value, setValue] = useState<TemplateCategory>(parsed.success ? parsed.data : 'other');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const { error } = await updateCategoryAction(agentId, value);
    setSaving(false);
    if (error !== null) {
      toast.error(error);
      return;
    }
    toast.success(t('saved'));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('category')}</Label>
      <Select value={value} onValueChange={(v) => setValue(v as TemplateCategory)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {TEMPLATE_CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat}>{tc(cat)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleSave} disabled={saving || value === initial} className="self-end">
        {t('save')}
      </Button>
    </div>
  );
}

function DangerZone({ agentId, agentName, agentSlug }: { agentId: string; agentName: string; agentSlug: string }) {
  const t = useTranslations('settings');
  const [deleteAgent, setDeleteAgent] = useState<AgentMetadata | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium text-destructive">{t('dangerZone')}</Label>
      <p className="text-xs text-muted-foreground">{t('deleteAgentDescription')}</p>
      <Button
        variant="destructive"
        size="sm"
        className="self-start"
        onClick={() => setDeleteAgent({
          id: agentId,
          name: agentName,
          slug: agentSlug,
          description: '',
          version: 0,
          updated_at: '',
          published_at: null,
        })}
      >
        {t('deleteAgent')}
      </Button>
      <DeleteAgentDialog agent={deleteAgent} onOpenChange={() => setDeleteAgent(null)} />
    </div>
  );
}
```

- [ ] **Step 3: Wire SettingsPanel into EditorTabs.tsx**

In `packages/web/app/orgs/[slug]/(dashboard)/(agents)/editor/[agentSlug]/EditorTabs.tsx`:

Add import: `import { SettingsPanel } from '@/app/components/agents/SettingsPanel';`

Add new props to `EditorTabsProps`:

```ts
agentDescription: string;
agentCategory: string;
agentIsPublic: boolean;
```

Replace the settings placeholder:

```ts
{activeTab === 'settings' && (
  <SettingsPanel
    agentId={props.agentId}
    agentName={props.agentName}
    agentSlug={props.agentSlug}
    initialDescription={props.agentDescription}
    initialCategory={props.agentCategory}
    initialIsPublic={props.agentIsPublic}
    currentVersion={props.initialVersion}
  />
)}
```

- [ ] **Step 4: Pass new props from page.tsx**

In `packages/web/app/orgs/[slug]/(dashboard)/(agents)/editor/[agentSlug]/page.tsx`, add the new props to the `EditorTabs` component:

```tsx
agentDescription={agent.description}
agentCategory={agent.category}
agentIsPublic={agent.is_public}
```

- [ ] **Step 5: Verify types compile**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/components/agents/SettingsPanel.tsx packages/web/app/components/agents/VisibilityToggle.tsx packages/web/app/orgs/[slug]/(dashboard)/(agents)/editor/[agentSlug]/EditorTabs.tsx packages/web/app/orgs/[slug]/(dashboard)/(agents)/editor/[agentSlug]/page.tsx
git commit -m "feat: add settings panel with description, category, visibility, and delete"
```

---

## Task 17: Full Check & Fix

- [ ] **Step 1: Run format**

Run: `npm run format`

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Fix any issues (likely ESLint max-lines violations — split large files as needed).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Fix any type errors across all packages.

- [ ] **Step 4: Run check**

Run: `npm run check`
Expected: All pass.

- [ ] **Step 5: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve lint and type errors"
```

---

## Task 18: Re-export Template Schema from Web Package

**Files:**
- Modify: `packages/web/app/schemas/graph.schema.ts`

- [ ] **Step 1: Add template exports**

Add to `packages/web/app/schemas/graph.schema.ts`:

```ts
export {
  TemplateCategorySchema,
  TemplateGraphDataSchema,
  TEMPLATE_CATEGORIES,
} from '@daviddh/graph-types';

export type {
  TemplateCategory,
  TemplateGraphData,
  TemplateMcpServer,
} from '@daviddh/graph-types';
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/schemas/graph.schema.ts
git commit -m "feat: re-export template schemas from web package"
```
