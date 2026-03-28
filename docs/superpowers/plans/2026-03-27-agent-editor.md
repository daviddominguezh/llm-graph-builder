# Agent Editor UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the form-based editor for agent-type apps with auto-save, publish, simulation, and import/export.

**Architecture:** New operation types for agent config changes, new AgentEditor component replacing GraphCanvas for agent-type apps, extended publish flow with agent-specific Postgres function, simulation routing by app type.

**Tech Stack:** Supabase (Postgres), Express, Next.js 16, React, shadcn/ui, @xyflow/react (for workflows), Zod

---

## Task 1: New Operation Types in graph-types

**Files:**
- Create: `packages/graph-types/src/schemas/operation-agent-config.schema.ts`
- Modify: `packages/graph-types/src/schemas/operation.schema.ts`
- Modify: `packages/graph-types/src/schemas/index.ts`
- Modify: `packages/graph-types/src/types/index.ts`

- [ ] **Step 1: Create the agent config operation schemas**

Create `packages/graph-types/src/schemas/operation-agent-config.schema.ts`:

```ts
import { z } from 'zod';

export const UpdateAgentConfigOperationSchema = z.object({
  type: z.literal('updateAgentConfig'),
  data: z.object({
    systemPrompt: z.string().optional(),
    maxSteps: z.number().nullable().optional(),
  }),
});

export const InsertContextItemOperationSchema = z.object({
  type: z.literal('insertContextItem'),
  data: z.object({
    sortOrder: z.number(),
    content: z.string(),
  }),
});

export const UpdateContextItemOperationSchema = z.object({
  type: z.literal('updateContextItem'),
  data: z.object({
    sortOrder: z.number(),
    content: z.string(),
  }),
});

export const DeleteContextItemOperationSchema = z.object({
  type: z.literal('deleteContextItem'),
  data: z.object({
    sortOrder: z.number(),
  }),
});

export const ReorderContextItemsOperationSchema = z.object({
  type: z.literal('reorderContextItems'),
  data: z.object({
    sortOrders: z.array(z.number()),
  }),
});
```

- [ ] **Step 2: Register new schemas in the Operation union**

In `packages/graph-types/src/schemas/operation.schema.ts`, add the import:

```ts
import {
  DeleteContextItemOperationSchema,
  InsertContextItemOperationSchema,
  ReorderContextItemsOperationSchema,
  UpdateAgentConfigOperationSchema,
  UpdateContextItemOperationSchema,
} from './operation-agent-config.schema.js';
```

Add all five schemas to the `OperationSchema` discriminated union array:

```ts
UpdateAgentConfigOperationSchema,
InsertContextItemOperationSchema,
UpdateContextItemOperationSchema,
DeleteContextItemOperationSchema,
ReorderContextItemsOperationSchema,
```

Add re-exports at the bottom of the file:

```ts
export {
  UpdateAgentConfigOperationSchema,
  InsertContextItemOperationSchema,
  UpdateContextItemOperationSchema,
  DeleteContextItemOperationSchema,
  ReorderContextItemsOperationSchema,
} from './operation-agent-config.schema.js';
```

- [ ] **Step 3: Re-export from schemas/index.ts**

In `packages/graph-types/src/schemas/index.ts`, add:

```ts
export {
  UpdateAgentConfigOperationSchema,
  InsertContextItemOperationSchema,
  UpdateContextItemOperationSchema,
  DeleteContextItemOperationSchema,
  ReorderContextItemsOperationSchema,
} from './operation.schema.js';
```

No changes needed for `types/index.ts` since `Operation` is already `z.infer<typeof OperationSchema>` and automatically includes new union members.

- [ ] **Step 4: Verify types compile**

Run: `npm run typecheck -w packages/graph-types`

- [ ] **Step 5: Commit**

```bash
git add packages/graph-types/src/schemas/operation-agent-config.schema.ts packages/graph-types/src/schemas/operation.schema.ts packages/graph-types/src/schemas/index.ts
git commit -m "feat: add agent config operation schemas (updateAgentConfig, context item CRUD, reorder)"
```

---

## Task 2: Backend Operation Dispatch for Agent Config Operations

**Files:**
- Create: `packages/backend/src/db/queries/agentConfigOperations.ts`
- Modify: `packages/backend/src/db/queries/operationDispatch.ts`

- [ ] **Step 1: Create agentConfigOperations.ts**

Create `packages/backend/src/db/queries/agentConfigOperations.ts`:

```ts
import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type UpdateConfigOp = Extract<Operation, { type: 'updateAgentConfig' }>;
type InsertItemOp = Extract<Operation, { type: 'insertContextItem' }>;
type UpdateItemOp = Extract<Operation, { type: 'updateContextItem' }>;
type DeleteItemOp = Extract<Operation, { type: 'deleteContextItem' }>;
type ReorderItemsOp = Extract<Operation, { type: 'reorderContextItems' }>;

function buildConfigPayload(data: UpdateConfigOp['data']): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (data.systemPrompt !== undefined) payload.system_prompt = data.systemPrompt;
  if (data.maxSteps !== undefined) payload.max_steps = data.maxSteps;
  return payload;
}

export async function updateAgentConfig(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateConfigOp['data']
): Promise<void> {
  const payload = buildConfigPayload(data);
  const result = await supabase.from('agents').update(payload).eq('id', agentId);
  throwOnMutationError(result, 'updateAgentConfig');
}

export async function insertContextItem(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertItemOp['data']
): Promise<void> {
  const row = { agent_id: agentId, sort_order: data.sortOrder, content: data.content };
  const result = await supabase
    .from('agent_context_items')
    .upsert(row, { onConflict: 'agent_id,sort_order' });
  throwOnMutationError(result, 'insertContextItem');
}

export async function updateContextItem(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateItemOp['data']
): Promise<void> {
  const result = await supabase
    .from('agent_context_items')
    .update({ content: data.content })
    .eq('agent_id', agentId)
    .eq('sort_order', data.sortOrder);
  throwOnMutationError(result, 'updateContextItem');
}

export async function deleteContextItem(
  supabase: SupabaseClient,
  agentId: string,
  data: DeleteItemOp['data']
): Promise<void> {
  const result = await supabase
    .from('agent_context_items')
    .delete()
    .eq('agent_id', agentId)
    .eq('sort_order', data.sortOrder);
  throwOnMutationError(result, 'deleteContextItem');
}

export async function reorderContextItems(
  supabase: SupabaseClient,
  agentId: string,
  data: ReorderItemsOp['data']
): Promise<void> {
  const result = await supabase.rpc('reorder_context_items', {
    p_agent_id: agentId,
    p_sort_orders: data.sortOrders,
  });
  if (result.error !== null) {
    throw new Error(`reorderContextItems: ${result.error.message}`);
  }
}
```

- [ ] **Step 2: Add dispatch function to operationDispatch.ts**

In `packages/backend/src/db/queries/operationDispatch.ts`, add import:

```ts
import {
  deleteContextItem,
  insertContextItem,
  reorderContextItems,
  updateAgentConfig,
  updateContextItem,
} from './agentConfigOperations.js';
```

Add a new dispatch function before `dispatchPresetOps`:

```ts
async function dispatchAgentConfigOps(
  supabase: SupabaseClient,
  agentId: string,
  op: Operation
): Promise<void> {
  if (op.type === 'updateAgentConfig') {
    await updateAgentConfig(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'insertContextItem') {
    await insertContextItem(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateContextItem') {
    await updateContextItem(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteContextItem') {
    await deleteContextItem(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'reorderContextItems') {
    await reorderContextItems(supabase, agentId, op.data);
    return;
  }
  throw new Error(`Unhandled operation type: ${op.type}`);
}
```

Update the existing `dispatchPresetOps` to call `dispatchAgentConfigOps` instead of throwing at the end. Change the final `throw` in `dispatchPresetOps` to:

```ts
await dispatchAgentConfigOps(supabase, agentId, op);
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/db/queries/agentConfigOperations.ts packages/backend/src/db/queries/operationDispatch.ts
git commit -m "feat: backend dispatch for agent config operations"
```

---

## Task 3: Backend getGraph Handler Extended for Agent Type

**Files:**
- Create: `packages/backend/src/db/queries/agentConfigQueries.ts`
- Modify: `packages/backend/src/routes/graph/getGraph.ts`

- [ ] **Step 1: Create agentConfigQueries.ts**

Create `packages/backend/src/db/queries/agentConfigQueries.ts`:

```ts
import { assembleMcpServers } from './graphAssemblers.js';
import { fetchMcpServers } from './graphFetchers.js';
import type { SupabaseClient } from './operationHelpers.js';

interface AgentConfigRow {
  system_prompt: string | null;
  max_steps: number | null;
  app_type: string;
}

interface ContextItemRow {
  sort_order: number;
  content: string;
}

export interface AgentConfigResponse {
  appType: 'agent';
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
  mcpServers: Array<Record<string, unknown>>;
}

function isAgentConfigRow(val: unknown): val is AgentConfigRow {
  return typeof val === 'object' && val !== null && 'app_type' in val;
}

async function fetchAgentRow(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentConfigRow | null> {
  const result = await supabase
    .from('agents')
    .select('system_prompt, max_steps, app_type')
    .eq('id', agentId)
    .single();
  if (result.error !== null) return null;
  if (!isAgentConfigRow(result.data)) return null;
  return result.data;
}

function isContextItemRow(val: unknown): val is ContextItemRow {
  return typeof val === 'object' && val !== null && 'sort_order' in val;
}

async function fetchContextItems(
  supabase: SupabaseClient,
  agentId: string
): Promise<ContextItemRow[]> {
  const result = await supabase
    .from('agent_context_items')
    .select('sort_order, content')
    .eq('agent_id', agentId)
    .order('sort_order', { ascending: true });
  if (result.error !== null) return [];
  if (!Array.isArray(result.data)) return [];
  return result.data.filter(isContextItemRow);
}

export async function isAgentType(supabase: SupabaseClient, agentId: string): Promise<boolean> {
  const row = await fetchAgentRow(supabase, agentId);
  return row !== null && row.app_type === 'agent';
}

export async function assembleAgentConfig(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentConfigResponse | null> {
  const agentRow = await fetchAgentRow(supabase, agentId);
  if (agentRow === null) return null;

  const [contextItems, mcpRows] = await Promise.all([
    fetchContextItems(supabase, agentId),
    fetchMcpServers(supabase, agentId),
  ]);

  const mcpServers = assembleMcpServers(mcpRows) ?? [];

  return {
    appType: 'agent',
    systemPrompt: agentRow.system_prompt ?? '',
    maxSteps: agentRow.max_steps,
    contextItems: contextItems.map((r) => ({ sortOrder: r.sort_order, content: r.content })),
    mcpServers: mcpServers as unknown as Array<Record<string, unknown>>,
  };
}
```

- [ ] **Step 2: Update getGraph handler to branch by app type**

In `packages/backend/src/routes/graph/getGraph.ts`, add import:

```ts
import { assembleAgentConfig, isAgentType } from '../../db/queries/agentConfigQueries.js';
```

Replace the try block body with:

```ts
try {
  const isAgent = await isAgentType(supabase, agentId);

  if (isAgent) {
    const config = await assembleAgentConfig(supabase, agentId);
    if (config === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Agent not found' });
      return;
    }
    res.status(HTTP_OK).json(config);
    return;
  }

  const graph = await assembleGraph(supabase, agentId);
  if (graph === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent not found' });
    return;
  }
  res.status(HTTP_OK).json(graph);
} catch (err) {
  const message = extractErrorMessage(err);
  logError(agentId, message);
  res.status(HTTP_INTERNAL_ERROR).json({ error: message });
}
```

Note: the function exceeds 40 lines so extract the two response branches into helpers:

```ts
async function respondWithAgentConfig(
  supabase: SupabaseClient,
  agentId: string,
  res: AuthenticatedResponse
): Promise<boolean> {
  const config = await assembleAgentConfig(supabase, agentId);
  if (config === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent not found' });
    return true;
  }
  res.status(HTTP_OK).json(config);
  return true;
}

async function respondWithGraph(
  supabase: SupabaseClient,
  agentId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const graph = await assembleGraph(supabase, agentId);
  if (graph === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent not found' });
    return;
  }
  res.status(HTTP_OK).json(graph);
}
```

Import the SupabaseClient type. Then the main handler becomes:

```ts
export async function handleGetGraph(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  const { supabase }: AuthenticatedLocals = res.locals;

  if (agentId === undefined) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Agent ID is required' });
    return;
  }

  try {
    const isAgent = await isAgentType(supabase, agentId);
    if (isAgent) {
      await respondWithAgentConfig(supabase, agentId, res);
      return;
    }
    await respondWithGraph(supabase, agentId, res);
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/db/queries/agentConfigQueries.ts packages/backend/src/routes/graph/getGraph.ts
git commit -m "feat: getGraph returns agent config for agent-type apps"
```

---

## Task 4: Backend publish_agent_version_tx Postgres Function + Publish Routing

**Files:**
- Create: `supabase/migrations/20260327100000_publish_agent_version.sql`
- Create: `supabase/migrations/20260327100001_reorder_context_items.sql`
- Modify: `packages/backend/src/db/queries/versionQueries.ts`
- Modify: `packages/backend/src/routes/graph/postPublish.ts`

- [ ] **Step 1: Write the publish_agent_version_tx migration**

Create `supabase/migrations/20260327100000_publish_agent_version.sql`:

```sql
-- Atomic publish for agent-type apps
-- Assembles agent config + MCP servers into a JSONB snapshot

create or replace function public.publish_agent_version_tx(
  p_agent_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_version integer;
  v_staging_api_key_id uuid;
  v_app_type text;
  v_system_prompt text;
  v_max_steps integer;
  v_graph_data jsonb;
begin
  -- Verify the calling user is a member of the agent's org
  if not exists (
    select 1
    from public.agents a
    join public.org_members om on om.org_id = a.org_id
    where a.id = p_agent_id and om.user_id = auth.uid()
  ) then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  -- Lock the agent row
  select app_type, system_prompt, max_steps, staging_api_key_id
  into v_app_type, v_system_prompt, v_max_steps, v_staging_api_key_id
  from public.agents
  where id = p_agent_id
  for update;

  if v_app_type is null or v_app_type <> 'agent' then
    raise exception 'NOT_AGENT_TYPE:%', p_agent_id;
  end if;

  -- Assemble agent config snapshot
  v_graph_data := jsonb_strip_nulls(jsonb_build_object(
    'appType', 'agent',
    'systemPrompt', coalesce(v_system_prompt, ''),
    'maxSteps', v_max_steps,
    'contextItems', coalesce(
      (select jsonb_agg(
        jsonb_build_object('sortOrder', ci.sort_order, 'content', ci.content)
        order by ci.sort_order
      ) from public.agent_context_items ci where ci.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'mcpServers', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', m.server_id,
        'name', m.name,
        'transport', jsonb_build_object('type', m.transport_type) || m.transport_config,
        'enabled', m.enabled
      )) from public.graph_mcp_servers m where m.agent_id = p_agent_id),
      '[]'::jsonb
    )
  ));

  -- Atomically increment version
  update public.agents
  set current_version = coalesce(current_version, 0) + 1
  where id = p_agent_id
  returning current_version into v_new_version;

  -- Insert the version snapshot
  insert into public.agent_versions (agent_id, version, graph_data, published_by)
  values (p_agent_id, v_new_version, v_graph_data, auth.uid());

  -- Promote the production API key
  update public.agents
  set production_api_key_id = v_staging_api_key_id
  where id = p_agent_id;

  return v_new_version;
end;
$$;
```

- [ ] **Step 2: Write the reorder_context_items helper function**

Create `supabase/migrations/20260327100001_reorder_context_items.sql`:

```sql
-- Reorder context items by reassigning sort_order values
-- p_sort_orders is an array of the current sort_order values in new order

create or replace function public.reorder_context_items(
  p_agent_id uuid,
  p_sort_orders integer[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idx integer;
  v_old_order integer;
begin
  -- Verify org membership
  if not exists (
    select 1
    from public.agents a
    join public.org_members om on om.org_id = a.org_id
    where a.id = p_agent_id and om.user_id = auth.uid()
  ) then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  -- Use negative temporary values to avoid unique constraint violations
  for v_idx in 1..array_length(p_sort_orders, 1) loop
    v_old_order := p_sort_orders[v_idx];
    update public.agent_context_items
    set sort_order = -v_idx
    where agent_id = p_agent_id and sort_order = v_old_order;
  end loop;

  -- Now set final values
  for v_idx in 1..array_length(p_sort_orders, 1) loop
    update public.agent_context_items
    set sort_order = v_idx - 1
    where agent_id = p_agent_id and sort_order = -v_idx;
  end loop;
end;
$$;
```

- [ ] **Step 3: Add publishAgentVersion to versionQueries.ts**

In `packages/backend/src/db/queries/versionQueries.ts`, add:

```ts
export async function publishAgentVersion(supabase: SupabaseClient, agentId: string): Promise<number> {
  const result = await supabase.rpc('publish_agent_version_tx', {
    p_agent_id: agentId,
  });

  if (result.error !== null) {
    throw new Error(`publishAgentVersion: ${result.error.message}`);
  }

  return Number(result.data);
}
```

- [ ] **Step 4: Update postPublish handler to route by app type**

In `packages/backend/src/routes/graph/postPublish.ts`, add import:

```ts
import { isAgentType } from '../../db/queries/agentConfigQueries.js';
import { publishAgentVersion } from '../../db/queries/versionQueries.js';
```

Update `handlePostPublish` to check app type:

```ts
export async function handlePostPublish(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);

  if (agentId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Agent ID is required' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const isAgent = await isAgentType(supabase, agentId);
    const publishFn = isAgent ? publishAgentVersion : publishVersion;
    const version = await publishFn(supabase, agentId);
    await syncTemplateAfterPublish(supabase, agentId).catch((syncErr: unknown) => {
      logError(agentId, `template sync failed: ${extractErrorMessage(syncErr)}`);
    });
    res.status(HTTP_OK).json({ version });
  } catch (err) {
    const message = extractErrorMessage(err);
    logError(agentId, message);
    res.status(HTTP_INTERNAL_ERROR).json({ error: message });
  }
}
```

- [ ] **Step 5: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260327100000_publish_agent_version.sql supabase/migrations/20260327100001_reorder_context_items.sql packages/backend/src/db/queries/versionQueries.ts packages/backend/src/routes/graph/postPublish.ts
git commit -m "feat: publish_agent_version_tx function, reorder helper, publish routing by app type"
```

---

## Task 5: Frontend AgentEditor Component

**Files:**
- Create: `packages/web/app/components/agent-editor/AgentEditor.tsx`
- Create: `packages/web/app/components/agent-editor/SystemPromptField.tsx`
- Create: `packages/web/app/components/agent-editor/MaxStepsField.tsx`
- Create: `packages/web/app/components/agent-editor/ContextItemsList.tsx`
- Create: `packages/web/app/components/agent-editor/ContextItemRow.tsx`
- Create: `packages/web/app/components/agent-editor/index.ts`
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add translations**

In `packages/web/messages/en.json`, add an `"agentEditor"` section at the top level (after `"editor"`):

```json
"agentEditor": {
  "systemPrompt": "System prompt",
  "systemPromptPlaceholder": "Enter the system prompt for this agent...",
  "contextItems": "Context items",
  "addContextItem": "Add item",
  "contextItemPlaceholder": "Enter context...",
  "maxSteps": "Max steps",
  "maxStepsPlaceholder": "Unlimited",
  "maxStepsDescription": "Maximum number of tool-call loops before stopping. Leave empty for unlimited.",
  "emptyContextItems": "No context items yet. Add one to provide additional context to the agent.",
  "deleteContextItem": "Remove"
}
```

- [ ] **Step 2: Create SystemPromptField component**

Create `packages/web/app/components/agent-editor/SystemPromptField.tsx`:

```tsx
'use client';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 500;

interface SystemPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function SystemPromptField({ value, onChange }: SystemPromptFieldProps) {
  const t = useTranslations('agentEditor');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(text), DEBOUNCE_MS);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{t('systemPrompt')}</Label>
      <Textarea
        defaultValue={value}
        onChange={handleChange}
        placeholder={t('systemPromptPlaceholder')}
        className="min-h-48 resize-y text-sm"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create MaxStepsField component**

Create `packages/web/app/components/agent-editor/MaxStepsField.tsx`:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 500;

interface MaxStepsFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function MaxStepsField({ value, onChange }: MaxStepsFieldProps) {
  const t = useTranslations('agentEditor');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const parsed = raw === '' ? null : Number(raw);
        const result = parsed !== null && Number.isFinite(parsed) ? parsed : null;
        onChange(result);
      }, DEBOUNCE_MS);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{t('maxSteps')}</Label>
      <Input
        type="number"
        defaultValue={value ?? ''}
        onChange={handleChange}
        placeholder={t('maxStepsPlaceholder')}
        className="w-32"
      />
      <p className="text-[11px] text-muted-foreground">{t('maxStepsDescription')}</p>
    </div>
  );
}
```

- [ ] **Step 4: Create ContextItemRow component**

Create `packages/web/app/components/agent-editor/ContextItemRow.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GripVertical, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 500;

interface ContextItemRowProps {
  sortOrder: number;
  content: string;
  onContentChange: (sortOrder: number, content: string) => void;
  onDelete: (sortOrder: number) => void;
}

export function ContextItemRow({ sortOrder, content, onContentChange, onDelete }: ContextItemRowProps) {
  const t = useTranslations('agentEditor');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onContentChange(sortOrder, text), DEBOUNCE_MS);
    },
    [sortOrder, onContentChange]
  );

  const handleDelete = useCallback(() => {
    onDelete(sortOrder);
  }, [sortOrder, onDelete]);

  return (
    <div className="group flex items-start gap-1.5 rounded-md border p-2">
      <GripVertical className="mt-1.5 size-3.5 shrink-0 text-muted-foreground" />
      <Textarea
        defaultValue={content}
        onChange={handleChange}
        placeholder={t('contextItemPlaceholder')}
        className="min-h-16 flex-1 resize-y text-sm"
      />
      <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0" onClick={handleDelete}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Create ContextItemsList component**

Create `packages/web/app/components/agent-editor/ContextItemsList.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { ContextItemRow } from './ContextItemRow';

interface ContextItem {
  sortOrder: number;
  content: string;
}

interface ContextItemsListProps {
  items: ContextItem[];
  onInsert: (sortOrder: number, content: string) => void;
  onUpdate: (sortOrder: number, content: string) => void;
  onDelete: (sortOrder: number) => void;
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-xs text-muted-foreground py-4 text-center">{message}</p>;
}

export function ContextItemsList({ items, onInsert, onUpdate, onDelete }: ContextItemsListProps) {
  const t = useTranslations('agentEditor');

  const handleAdd = useCallback(() => {
    const nextOrder = items.length;
    onInsert(nextOrder, '');
  }, [items.length, onInsert]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{t('contextItems')}</Label>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAdd}>
          <Plus className="mr-1 size-3" />
          {t('addContextItem')}
        </Button>
      </div>
      {items.length === 0 && <EmptyState message={t('emptyContextItems')} />}
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <ContextItemRow
            key={item.sortOrder}
            sortOrder={item.sortOrder}
            content={item.content}
            onContentChange={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create AgentEditor component**

Create `packages/web/app/components/agent-editor/AgentEditor.tsx`:

```tsx
'use client';

import type { Operation } from '@daviddh/graph-types';
import { useCallback, useState } from 'react';

import type { AgentConfigData } from '../../hooks/useGraphLoader';
import { ContextItemsList } from './ContextItemsList';
import { MaxStepsField } from './MaxStepsField';
import { SystemPromptField } from './SystemPromptField';

interface ContextItem {
  sortOrder: number;
  content: string;
}

interface AgentEditorProps {
  config: AgentConfigData;
  pushOperation: (op: Operation) => void;
}

function useAgentEditorState(config: AgentConfigData) {
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);
  const [maxSteps, setMaxSteps] = useState<number | null>(config.maxSteps);
  const [contextItems, setContextItems] = useState<ContextItem[]>(config.contextItems);
  return { systemPrompt, setSystemPrompt, maxSteps, setMaxSteps, contextItems, setContextItems };
}

function useAgentEditorActions(
  state: ReturnType<typeof useAgentEditorState>,
  pushOperation: (op: Operation) => void
) {
  const handleSystemPromptChange = useCallback(
    (value: string) => {
      state.setSystemPrompt(value);
      pushOperation({ type: 'updateAgentConfig', data: { systemPrompt: value } });
    },
    [state.setSystemPrompt, pushOperation]
  );

  const handleMaxStepsChange = useCallback(
    (value: number | null) => {
      state.setMaxSteps(value);
      pushOperation({ type: 'updateAgentConfig', data: { maxSteps: value } });
    },
    [state.setMaxSteps, pushOperation]
  );

  const handleInsertItem = useCallback(
    (sortOrder: number, content: string) => {
      state.setContextItems((prev) => [...prev, { sortOrder, content }]);
      pushOperation({ type: 'insertContextItem', data: { sortOrder, content } });
    },
    [state.setContextItems, pushOperation]
  );

  const handleUpdateItem = useCallback(
    (sortOrder: number, content: string) => {
      state.setContextItems((prev) =>
        prev.map((item) => (item.sortOrder === sortOrder ? { ...item, content } : item))
      );
      pushOperation({ type: 'updateContextItem', data: { sortOrder, content } });
    },
    [state.setContextItems, pushOperation]
  );

  const handleDeleteItem = useCallback(
    (sortOrder: number) => {
      state.setContextItems((prev) => prev.filter((item) => item.sortOrder !== sortOrder));
      pushOperation({ type: 'deleteContextItem', data: { sortOrder } });
    },
    [state.setContextItems, pushOperation]
  );

  return {
    handleSystemPromptChange,
    handleMaxStepsChange,
    handleInsertItem,
    handleUpdateItem,
    handleDeleteItem,
  };
}

export function AgentEditor({ config, pushOperation }: AgentEditorProps) {
  const state = useAgentEditorState(config);
  const actions = useAgentEditorActions(state, pushOperation);

  return (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6 pb-24">
        <SystemPromptField value={state.systemPrompt} onChange={actions.handleSystemPromptChange} />
        <ContextItemsList
          items={state.contextItems}
          onInsert={actions.handleInsertItem}
          onUpdate={actions.handleUpdateItem}
          onDelete={actions.handleDeleteItem}
        />
        <MaxStepsField value={state.maxSteps} onChange={actions.handleMaxStepsChange} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create barrel export**

Create `packages/web/app/components/agent-editor/index.ts`:

```ts
export { AgentEditor } from './AgentEditor';
```

- [ ] **Step 8: Verify types compile**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 9: Commit**

```bash
git add packages/web/app/components/agent-editor/ packages/web/messages/en.json
git commit -m "feat: AgentEditor component with system prompt, context items, and max steps"
```

---

## Task 6: Frontend GraphBuilder Branching (Workflow vs Agent Rendering)

**Files:**
- Modify: `packages/web/app/components/GraphBuilder.tsx`

- [ ] **Step 1: Import AgentEditor and add appType to GraphLoadResult**

In `packages/web/app/components/GraphBuilder.tsx`, add import:

```ts
import { AgentEditor } from './agent-editor';
import type { AgentConfigData } from '../hooks/useGraphLoader';
```

- [ ] **Step 2: Add AgentConfigData to LoadedEditor props and conditional render**

The `LoadedEditorProps` already extends `GraphBuilderProps` and receives `loadResult`. The `GraphLoadResult` will be extended in Task 7 to include an optional `agentConfig` field.

In the `LoadedEditor` function, after the existing render, add a conditional before `<GraphCanvas>`:

Check if `loadResult.agentConfig` is defined. If so, render `<AgentEditor>` instead of `<GraphCanvas>` and the workflow-specific panels.

Replace the `<GraphCanvas>` block with:

```tsx
{h.agentConfig !== undefined ? (
  <AgentEditor config={h.agentConfig} pushOperation={h.pushOperation} />
) : (
  <GraphCanvas
    agentId={props.agentId ?? ''}
    reactFlowWrapper={h.reactFlowWrapper}
    displayNodes={h.displayNodes}
    edges={h.edges}
    onNodesChange={isReadOnly ? () => {} : h.onNodesChange}
    onEdgesChange={isReadOnly ? () => {} : h.onEdgesChange}
    onConnect={isReadOnly ? () => {} : h.graphActions.onConnect}
    onNodeClick={h.selection.onNodeClick}
    onEdgeClick={h.selection.onEdgeClick}
    onPaneClick={h.selection.onPaneClick}
    zoomViewNodeId={h.zoomView.zoomViewNodeId}
    simulation={h.simulation}
    onExitZoomView={h.zoomView.handleExitZoomView}
    readOnly={isReadOnly}
  />
)}
```

Add `agentConfig` to the return value of `useGraphBuilderHooks`:

```ts
const agentConfig = loadResult.agentConfig;
```

And return it in the hooks object.

- [ ] **Step 3: Hide workflow-specific toolbar buttons for agent type**

In the `LoadedEditor` function's toolbar rendering, conditionally pass `onAddNode` and `onFormat`:

```tsx
onAddNode={h.agentConfig !== undefined ? () => {} : h.graphActions.handleAddNode}
onFormat={h.agentConfig !== undefined ? () => {} : h.handleFormat}
```

Or better, set these to `undefined` for agent type and handle in Toolbar (see Task 8).

- [ ] **Step 4: Hide workflow-specific panels for agent type**

Wrap `SearchDialog`, `SidePanels` (node/edge panels), `DeleteConfirmDialog`, and `ConnectionMenu` in `{h.agentConfig === undefined && (...)}` guards. The `SidePanels` that contain tools/MCP should still render for agents. Only node/edge selection panels should be hidden.

Note: If `SidePanels` is a monolithic component, keep it but agent mode won't select nodes/edges so the panels won't open.

- [ ] **Step 5: Verify types compile**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: GraphBuilder branches between GraphCanvas (workflow) and AgentEditor (agent)"
```

---

## Task 7: Frontend useGraphLoader Extended for Agent Config Response

**Files:**
- Modify: `packages/web/app/hooks/useGraphLoader.ts`
- Modify: `packages/web/app/lib/graphApi.ts`

- [ ] **Step 1: Add AgentConfigData type and extend GraphLoadResult**

In `packages/web/app/hooks/useGraphLoader.ts`, add a new exported interface:

```ts
export interface AgentConfigData {
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
}
```

Extend `GraphLoadResult` with an optional `agentConfig` field:

```ts
export interface GraphLoadResult {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  agents: Agent[];
  mcpServers: McpServerConfig[];
  outputSchemas: OutputSchemaEntity[];
  graphData: Graph | undefined;
  agentConfig?: AgentConfigData;
}
```

- [ ] **Step 2: Add fetchAgentConfig to graphApi.ts**

In `packages/web/app/lib/graphApi.ts`, add a Zod schema and fetch function for agent config:

```ts
const AgentConfigResponseSchema = z.object({
  appType: z.literal('agent'),
  systemPrompt: z.string(),
  maxSteps: z.number().nullable(),
  contextItems: z.array(z.object({
    sortOrder: z.number(),
    content: z.string(),
  })),
  mcpServers: z.array(z.record(z.string(), z.unknown())),
});

type AgentConfigResponse = z.infer<typeof AgentConfigResponseSchema>;

function isAgentConfigResponse(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && 'appType' in raw;
}

export type { AgentConfigResponse };

export async function fetchGraphOrAgentConfig(
  agentId: string
): Promise<Graph | AgentConfigResponse> {
  const res = await fetch(agentPath(agentId, '/graph'));
  await assertOk(res, 'Fetch graph');
  const raw = await parseJsonResponse(res);
  if (isAgentConfigResponse(raw)) {
    return AgentConfigResponseSchema.parse(raw);
  }
  return GraphSchema.parse(raw);
}
```

- [ ] **Step 3: Update useGraphLoader to handle agent config response**

In `packages/web/app/hooks/useGraphLoader.ts`, update imports to use `fetchGraphOrAgentConfig` instead of `fetchGraph`.

Add a helper to build a load result from agent config:

```ts
function buildAgentLoadResult(config: AgentConfigResponse): GraphLoadResult {
  return {
    nodes: [],
    edges: [],
    agents: [],
    mcpServers: config.mcpServers as McpServerConfig[],
    outputSchemas: [],
    graphData: undefined,
    agentConfig: {
      systemPrompt: config.systemPrompt,
      maxSteps: config.maxSteps,
      contextItems: config.contextItems,
    },
  };
}
```

Import `McpServerConfigSchema` from graph-types to safely parse the MCP servers array instead of casting. Or use a Zod parse on each server.

Update `buildLoadResult` to detect the response type:

```ts
function buildLoadResult(response: Graph | AgentConfigResponse): GraphLoadResult {
  if ('appType' in response && response.appType === 'agent') {
    return buildAgentLoadResult(response);
  }
  return buildWorkflowLoadResult(response);
}
```

Rename the old `buildLoadResult` to `buildWorkflowLoadResult`.

Update `useLoadOnMount` and the `reload` callback to call `fetchGraphOrAgentConfig` instead of `fetchGraph`.

- [ ] **Step 4: Update NEW_AGENT_RESULT and LOADING_RESULT**

Add `agentConfig: undefined` to `NEW_AGENT_RESULT` and `LOADING_RESULT`:

```ts
const NEW_AGENT_RESULT: GraphLoadResult = {
  ...existingFields,
  agentConfig: undefined,
};

const LOADING_RESULT: GraphLoadResult = {
  ...existingFields,
  agentConfig: undefined,
};
```

- [ ] **Step 5: Verify types compile**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/hooks/useGraphLoader.ts packages/web/app/lib/graphApi.ts
git commit -m "feat: useGraphLoader handles both workflow graph and agent config responses"
```

---

## Task 8: Frontend Toolbar Adjustments for Agent Type

**Files:**
- Modify: `packages/web/app/components/panels/Toolbar.tsx`
- Modify: `packages/web/app/components/GraphBuilder.tsx`

- [ ] **Step 1: Add hideWorkflowActions prop to Toolbar**

In `packages/web/app/components/panels/Toolbar.tsx`, extend `ToolbarProps`:

```ts
hideWorkflowActions?: boolean;
```

- [ ] **Step 2: Conditionally hide workflow buttons in FileMenuItems**

In `FileMenuItems`, accept a `hideWorkflowActions` prop and hide the "Auto-layout" item when true:

```tsx
{!hideWorkflowActions && (
  <DropdownMenuItem onClick={onFormat}>
    <AlignHorizontalSpaceAround className="size-4" />
    {tToolbar('autoLayout')}
  </DropdownMenuItem>
)}
```

Update `FileMenuItemsProps` to include `hideWorkflowActions?: boolean`.

- [ ] **Step 3: Conditionally hide graph-specific toolbar buttons**

In `ToolbarButtons`, hide `onToggleGlobalPanel` when `hideWorkflowActions` is true:

```tsx
{!props.hideWorkflowActions && onToggleGlobalPanel && (
  <ToolbarTooltip label={t('globalNodes')}>
    ...
  </ToolbarTooltip>
)}
```

- [ ] **Step 4: Pass hideWorkflowActions from GraphBuilder**

In `GraphBuilder.tsx`, when rendering `<Toolbar>`, pass:

```tsx
hideWorkflowActions={h.agentConfig !== undefined}
```

- [ ] **Step 5: Verify types compile**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/components/panels/Toolbar.tsx packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: hide workflow-specific toolbar buttons for agent type"
```

---

## Task 9: Frontend Simulation Hook Extended for Agent Type

**Files:**
- Modify: `packages/web/app/hooks/useSimulation.ts`
- Modify: `packages/web/app/hooks/useSimulationHelpers.ts`
- Modify: `packages/web/app/lib/api.ts`
- Modify: `packages/web/app/components/GraphBuilder.tsx`

- [ ] **Step 1: Add appType to UseSimulationParams**

In `packages/web/app/hooks/useSimulation.ts`, extend `UseSimulationParams`:

```ts
appType?: 'workflow' | 'agent';
agentConfig?: {
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
};
```

- [ ] **Step 2: Add agent simulate request body type**

In `packages/web/app/lib/api.ts`, add:

```ts
export interface AgentSimulateRequestBody {
  appType: 'agent';
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
  mcpServers: Record<string, unknown>[];
  messages: unknown[];
  apiKeyId: string;
  modelId: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
}
```

Add a `streamAgentSimulation` function:

```ts
export async function streamAgentSimulation(
  params: AgentSimulateRequestBody,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Agent simulation request failed: ${String(res.status)}`);
  }

  const reader = res.body?.getReader();
  if (reader === undefined) {
    throw new Error('No response stream available');
  }

  await readSseStream(reader, callbacks);
}
```

Note: the `readSseStream` function is already defined in the file but not exported. Either export it or refactor to share.

- [ ] **Step 3: Add buildAgentSimulateParams to useSimulationHelpers.ts**

In `packages/web/app/hooks/useSimulationHelpers.ts`, add:

```ts
export interface BuildAgentSimulateParamsOptions {
  agentConfig: {
    systemPrompt: string;
    maxSteps: number | null;
    contextItems: Array<{ sortOrder: number; content: string }>;
  };
  mcpServers: McpServerConfig[];
  allMessages: Message[];
  preset: ContextPreset;
  apiKeyId: string;
  modelId: string;
}

export function buildAgentSimulateParams(opts: BuildAgentSimulateParamsOptions): AgentSimulateRequestBody {
  const fullContext = buildContext(opts.preset, '');
  const { sessionID, tenantID, userID, data, quickReplies } = fullContext;
  return {
    appType: 'agent',
    systemPrompt: opts.agentConfig.systemPrompt,
    maxSteps: opts.agentConfig.maxSteps,
    contextItems: opts.agentConfig.contextItems,
    mcpServers: opts.mcpServers as unknown as Record<string, unknown>[],
    messages: opts.allMessages,
    apiKeyId: opts.apiKeyId,
    modelId: opts.modelId,
    sessionID,
    tenantID,
    userID,
    data,
    quickReplies,
  };
}
```

Import `AgentSimulateRequestBody` from `'../lib/api'`.

- [ ] **Step 4: Branch simulation send by appType**

In `useSimulation.ts`, update `useSimulationSend` to check if `appType === 'agent'` and use `buildAgentSimulateParams` + `streamAgentSimulation` instead of the workflow path.

This requires extending `SendMessageDeps` and `SendDepsWithAbort` with the `appType` and `agentConfig` fields, and branching inside `useSimulationSend`.

For agents, the start function should not zoom to `START_NODE_ID` (there are no graph nodes). Update `useSimulationStart` to skip zoom when `appType === 'agent'`.

- [ ] **Step 5: Pass appType and agentConfig from GraphBuilder**

In `GraphBuilder.tsx`, update the `useSimulation` call:

```ts
const simulation = useSimulation({
  allNodes: nodes,
  edges,
  agents,
  preset: presetsHook.activePreset,
  apiKeyId: apiKeys.stagingKeyId ?? '',
  mcpServers: mcpHook.servers,
  outputSchemas: outputSchemasHook.schemas,
  onZoomToNode: zoomView.handleZoomToNode,
  onSelectNode: handleSimSelectNode,
  onExitZoomView: zoomView.handleExitZoomView,
  appType: loadResult.agentConfig !== undefined ? 'agent' : 'workflow',
  agentConfig: loadResult.agentConfig,
});
```

- [ ] **Step 6: Verify types compile**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/hooks/useSimulation.ts packages/web/app/hooks/useSimulationHelpers.ts packages/web/app/lib/api.ts packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: simulation hook extended for agent type with agent-specific request body"
```

---

## Task 10: Frontend Import/Export for Agent Config

**Files:**
- Create: `packages/web/app/hooks/useAgentExport.ts`
- Create: `packages/web/app/hooks/useAgentImport.ts`
- Create: `packages/web/app/schemas/agentConfig.schema.ts`
- Modify: `packages/web/app/components/GraphBuilder.tsx`
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Create Zod schema for agent config import/export**

Create `packages/web/app/schemas/agentConfig.schema.ts`:

```ts
import { McpServerConfigSchema } from '@daviddh/graph-types';
import { z } from 'zod';

export const AgentConfigExportSchema = z.object({
  appType: z.literal('agent'),
  systemPrompt: z.string(),
  maxSteps: z.number().nullable(),
  contextItems: z.array(z.string()),
  mcpServers: z.array(McpServerConfigSchema).optional(),
});

export type AgentConfigExport = z.infer<typeof AgentConfigExportSchema>;
```

- [ ] **Step 2: Create useAgentExport hook**

Create `packages/web/app/hooks/useAgentExport.ts`:

```ts
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { McpServerConfig } from '../schemas/graph.schema';
import type { AgentConfigData } from './useGraphLoader';

const JSON_INDENT = 2;

interface UseAgentExportParams {
  agentConfig: AgentConfigData | undefined;
  mcpServers: McpServerConfig[];
}

export function useAgentExport({ agentConfig, mcpServers }: UseAgentExportParams): () => void {
  const t = useTranslations('agentEditor');

  return useCallback(() => {
    if (agentConfig === undefined) return;

    const exportData = {
      appType: 'agent' as const,
      systemPrompt: agentConfig.systemPrompt,
      maxSteps: agentConfig.maxSteps,
      contextItems: agentConfig.contextItems.map((item) => item.content),
      mcpServers,
    };

    const json = JSON.stringify(exportData, null, JSON_INDENT);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [agentConfig, mcpServers, t]);
}
```

- [ ] **Step 3: Create useAgentImport hook**

Create `packages/web/app/hooks/useAgentImport.ts`:

```ts
import type { Operation } from '@daviddh/graph-types';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { AgentConfigExportSchema } from '../schemas/agentConfig.schema';
import type { AgentConfigData } from './useGraphLoader';

const FIRST_FILE_INDEX = 0;

type PushOperation = (op: Operation) => void;

interface UseAgentImportParams {
  pushOperation: PushOperation;
  setAgentConfig: (config: AgentConfigData) => void;
}

function applyImportedConfig(
  data: ReturnType<typeof AgentConfigExportSchema.parse>,
  params: UseAgentImportParams
): void {
  const contextItems = data.contextItems.map((content, i) => ({
    sortOrder: i,
    content,
  }));

  const config: AgentConfigData = {
    systemPrompt: data.systemPrompt,
    maxSteps: data.maxSteps,
    contextItems,
  };

  params.setAgentConfig(config);
  params.pushOperation({
    type: 'updateAgentConfig',
    data: { systemPrompt: data.systemPrompt, maxSteps: data.maxSteps },
  });

  for (const item of contextItems) {
    params.pushOperation({
      type: 'insertContextItem',
      data: { sortOrder: item.sortOrder, content: item.content },
    });
  }
}

function parseAndApply(text: string, params: UseAgentImportParams): void {
  const json: unknown = JSON.parse(text);
  const result = AgentConfigExportSchema.safeParse(json);
  if (result.success) {
    applyImportedConfig(result.data, params);
  } else {
    toast.error(`Invalid agent config file: ${result.error.message}`);
  }
}

export function useAgentImport(params: UseAgentImportParams): () => void {
  const { pushOperation, setAgentConfig } = params;

  return useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[FIRST_FILE_INDEX];
      if (file === undefined) return;
      void file.text().then((text) => {
        try {
          parseAndApply(text, { pushOperation, setAgentConfig });
        } catch {
          toast.error('Failed to parse JSON file');
        }
      });
    };
    input.click();
  }, [pushOperation, setAgentConfig]);
}
```

- [ ] **Step 4: Wire import/export into GraphBuilder for agent type**

In `packages/web/app/components/GraphBuilder.tsx`, import the new hooks:

```ts
import { useAgentExport } from '../hooks/useAgentExport';
import { useAgentImport } from '../hooks/useAgentImport';
```

In `useGraphBuilderHooks`, conditionally use agent import/export when in agent mode:

```ts
const agentConfig = loadResult.agentConfig;
const [agentConfigState, setAgentConfigState] = useState(agentConfig);

const agentExport = useAgentExport({
  agentConfig: agentConfigState,
  mcpServers: mcpHook.servers,
});

const agentImport = useAgentImport({
  pushOperation: opQueue.pushOperation,
  setAgentConfig: setAgentConfigState,
});

const effectiveImport = agentConfig !== undefined ? agentImport : handleImport;
const effectiveExport = agentConfig !== undefined ? agentExport : handleExport;
```

Pass `effectiveImport` and `effectiveExport` to `<Toolbar>` instead of `handleImport` and `handleExport`.

- [ ] **Step 5: Verify types compile**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/hooks/useAgentExport.ts packages/web/app/hooks/useAgentImport.ts packages/web/app/schemas/agentConfig.schema.ts packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: import/export for agent config JSON format"
```

---

## Task 11: Full Check and Fix

- [ ] **Step 1: Run format**

Run: `npm run format`

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Fix any ESLint errors in changed files. If files exceed `max-lines` (300) or functions exceed `max-lines-per-function` (40), extract helper functions or split into smaller files. Never use eslint-disable comments.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Fix any type errors. Never use `any` type.

- [ ] **Step 4: Run tests**

Run: `npm run test -w packages/backend`

Expected: All existing tests pass.

- [ ] **Step 5: Run full check**

Run: `npm run check`

Expected: All pass (format + lint + typecheck).

- [ ] **Step 6: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve lint, format, and type errors for agent editor feature"
```
