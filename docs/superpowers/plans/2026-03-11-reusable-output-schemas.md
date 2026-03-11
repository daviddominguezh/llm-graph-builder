# Reusable Output Schemas — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor output schemas from inline per-node data to reusable named entities managed in Settings, selected per-node via dropdown, with a premium UI overhaul of the schema builder dialog.

**Architecture:** New `graph_output_schemas` table stores schemas per-agent. Nodes reference schemas by ID (`output_schema_id`). Publishing snapshots the full schema into the version JSON. New operation types (insert/update/delete) follow the MCP server pattern. Settings panel gets an `OutputSchemasSection`; NodePanel gets a Select dropdown replacing the dialog trigger button.

**Tech Stack:** Zod schemas (graph-types), Supabase (migration + RLS), React hooks (state management), shadcn/ui (Select, AlertDialog), next-intl (translations)

**Spec:** `docs/superpowers/specs/2026-03-11-reusable-output-schemas-design.md`

---

## Chunk 1: Data Layer (graph-types + migration + backend)

### Task 1: OutputSchema entity schema and operation schemas in graph-types

**Files:**
- Create: `packages/graph-types/src/schemas/output-schema-entity.schema.ts`
- Create: `packages/graph-types/src/schemas/operation-output-schema.schema.ts`
- Modify: `packages/graph-types/src/schemas/operation.schema.ts`
- Modify: `packages/graph-types/src/schemas/index.ts`
- Modify: `packages/graph-types/src/types/index.ts`
- Modify: `packages/graph-types/src/schemas/node.schema.ts`
- Modify: `packages/graph-types/src/schemas/operation-node.schema.ts`
- Modify: `packages/graph-types/src/schemas/graph.schema.ts`

**Context:**
- The existing `OutputSchemaFieldSchema` (recursive via `z.lazy`) stays in `output-schema.schema.ts` — it defines the field structure.
- We add a new entity schema that wraps fields with `id` + `name`.
- Follow the pattern from `operation-mcp.schema.ts` for the operation schemas.
- `NodeSchema` currently has `outputSchema: OutputSchemaSchema` — change to `outputSchemaId: z.string().optional()`.
- `RuntimeNodeSchema` keeps `outputSchema` (published snapshots embed the full schema).
- `NodeDataSchema` in `operation-node.schema.ts` changes `outputSchema` to `outputSchemaId`.
- `GraphSchema` adds an optional `outputSchemas` array for the top-level entity list.

- [ ] **Step 1: Create `output-schema-entity.schema.ts`**

```typescript
// packages/graph-types/src/schemas/output-schema-entity.schema.ts
import { z } from 'zod';

import { OutputSchemaFieldSchema } from './output-schema.schema.js';

export const OutputSchemaEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(OutputSchemaFieldSchema),
});
```

- [ ] **Step 2: Create `operation-output-schema.schema.ts`**

Follow the exact pattern from `operation-mcp.schema.ts`:

```typescript
// packages/graph-types/src/schemas/operation-output-schema.schema.ts
import { z } from 'zod';

import { OutputSchemaFieldSchema } from './output-schema.schema.js';

const OutputSchemaDataSchema = z.object({
  schemaId: z.string(),
  name: z.string(),
  fields: z.array(OutputSchemaFieldSchema),
});

export const InsertOutputSchemaOperationSchema = z.object({
  type: z.literal('insertOutputSchema'),
  data: OutputSchemaDataSchema,
});

export const UpdateOutputSchemaOperationSchema = z.object({
  type: z.literal('updateOutputSchema'),
  data: OutputSchemaDataSchema,
});

export const DeleteOutputSchemaOperationSchema = z.object({
  type: z.literal('deleteOutputSchema'),
  schemaId: z.string(),
});
```

- [ ] **Step 3: Register new operations in `operation.schema.ts`**

Add imports for the three new operation schemas and add them to the `z.discriminatedUnion` array. Also add re-exports at the bottom. Follow the existing import/export pattern exactly.

In `packages/graph-types/src/schemas/operation.schema.ts`, add:
- Import: `import { DeleteOutputSchemaOperationSchema, InsertOutputSchemaOperationSchema, UpdateOutputSchemaOperationSchema } from './operation-output-schema.schema.js';`
- Add all three to the discriminated union array (after the MCP server operations)
- Add re-export block:
```typescript
export {
  InsertOutputSchemaOperationSchema,
  UpdateOutputSchemaOperationSchema,
  DeleteOutputSchemaOperationSchema,
} from './operation-output-schema.schema.js';
```

- [ ] **Step 4: Update `node.schema.ts`**

In `packages/graph-types/src/schemas/node.schema.ts`:
- `NodeSchema`: Replace `outputSchema: OutputSchemaSchema` with `outputSchemaId: z.string().optional()`
- `RuntimeNodeSchema`: Keep `outputSchema: OutputSchemaSchema` (published snapshots still embed full schema)
- Remove the import of `OutputSchemaSchema` only if `RuntimeNodeSchema` no longer uses it. Since `RuntimeNodeSchema` still uses it, keep the import.

```typescript
// NodeSchema changes:
// Before: outputSchema: OutputSchemaSchema,
// After:  outputSchemaId: z.string().optional(),
```

- [ ] **Step 5: Update `operation-node.schema.ts`**

In `packages/graph-types/src/schemas/operation-node.schema.ts`:
- Replace `outputSchema: OutputSchemaSchema` with `outputSchemaId: z.string().optional()` in `NodeDataSchema`
- Remove the `OutputSchemaSchema` import (no longer needed here)

```typescript
// Before: outputSchema: OutputSchemaSchema,
// After:  outputSchemaId: z.string().optional(),
```

- [ ] **Step 6: Update `graph.schema.ts`**

In `packages/graph-types/src/schemas/graph.schema.ts`:
- Import `OutputSchemaEntitySchema` from `./output-schema-entity.schema.js`
- Add `outputSchemas: z.array(OutputSchemaEntitySchema).optional()` to `GraphSchema`
- `RuntimeGraphSchema` does NOT need `outputSchemas` — it's just for the staging data flow

```typescript
import { OutputSchemaEntitySchema } from './output-schema-entity.schema.js';

// Add to GraphSchema:
outputSchemas: z.array(OutputSchemaEntitySchema).optional(),
```

- [ ] **Step 7: Update `index.ts` exports**

In `packages/graph-types/src/schemas/index.ts`, add:
```typescript
export { OutputSchemaEntitySchema } from './output-schema-entity.schema.js';
export {
  InsertOutputSchemaOperationSchema,
  UpdateOutputSchemaOperationSchema,
  DeleteOutputSchemaOperationSchema,
} from './operation-output-schema.schema.js';
```

In `packages/graph-types/src/types/index.ts`, add:
```typescript
export type OutputSchemaEntity = z.infer<typeof OutputSchemaEntitySchema>;
```

Import `OutputSchemaEntitySchema` at the top of the types file.

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck -w packages/graph-types`
Expected: PASS (there will be downstream errors in other packages — that's expected, we fix those in later tasks)

- [ ] **Step 9: Commit**

```bash
git add packages/graph-types/src/schemas/output-schema-entity.schema.ts packages/graph-types/src/schemas/operation-output-schema.schema.ts packages/graph-types/src/schemas/operation.schema.ts packages/graph-types/src/schemas/node.schema.ts packages/graph-types/src/schemas/operation-node.schema.ts packages/graph-types/src/schemas/graph.schema.ts packages/graph-types/src/schemas/index.ts packages/graph-types/src/types/index.ts
git commit -m "feat(graph-types): add OutputSchemaEntity, operation schemas, and outputSchemaId on nodes"
```

---

### Task 2: Database migration

**Files:**
- Create: `supabase/migrations/20260312000000_reusable_output_schemas.sql`

**Context:**
- Current migration `20260311200000_add_output_schema_to_nodes.sql` added `output_schema jsonb` to `graph_nodes`.
- This new migration creates `graph_output_schemas` table, renames `output_schema` to `output_schema_id` on `graph_nodes`, and updates `publish_version_tx`.
- Follow the RLS pattern from `graph_mcp_servers`:
  - Enable RLS
  - Policies: select/insert/update/delete for org members via `agents.org_id` join
- The publish function must now resolve `output_schema_id` → full schema from `graph_output_schemas` at snapshot time.
- Also include `outputSchemas` as a top-level key in the published JSON.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260312000000_reusable_output_schemas.sql

-- 1. Create the graph_output_schemas table
create table if not exists public.graph_output_schemas (
  agent_id uuid not null references public.agents(id) on delete cascade,
  schema_id text not null,
  name text not null,
  fields jsonb not null default '[]'::jsonb,
  primary key (agent_id, schema_id)
);

-- 2. Enable RLS
alter table public.graph_output_schemas enable row level security;

-- 3. RLS policies (same pattern as graph_mcp_servers)
create policy "org members can select output schemas"
  on public.graph_output_schemas for select
  using (
    exists (
      select 1 from public.agents a
      join public.org_members om on om.org_id = a.org_id
      where a.id = graph_output_schemas.agent_id
        and om.user_id = auth.uid()
    )
  );

create policy "org members can insert output schemas"
  on public.graph_output_schemas for insert
  with check (
    exists (
      select 1 from public.agents a
      join public.org_members om on om.org_id = a.org_id
      where a.id = graph_output_schemas.agent_id
        and om.user_id = auth.uid()
    )
  );

create policy "org members can update output schemas"
  on public.graph_output_schemas for update
  using (
    exists (
      select 1 from public.agents a
      join public.org_members om on om.org_id = a.org_id
      where a.id = graph_output_schemas.agent_id
        and om.user_id = auth.uid()
    )
  );

create policy "org members can delete output schemas"
  on public.graph_output_schemas for delete
  using (
    exists (
      select 1 from public.agents a
      join public.org_members om on om.org_id = a.org_id
      where a.id = graph_output_schemas.agent_id
        and om.user_id = auth.uid()
    )
  );

-- 4. Migrate existing inline schemas to graph_output_schemas
-- For each node that has a non-null output_schema, create a schema entity
-- and set the node's output_schema_id to the generated schema_id
do $$
declare
  r record;
  v_schema_id text;
begin
  for r in
    select agent_id, node_id, output_schema
    from public.graph_nodes
    where output_schema is not null
      and jsonb_array_length(output_schema) > 0
  loop
    v_schema_id := 'migrated_' || r.node_id;
    insert into public.graph_output_schemas (agent_id, schema_id, name, fields)
    values (r.agent_id, v_schema_id, 'schema_' || left(r.node_id, 8), r.output_schema)
    on conflict (agent_id, schema_id) do nothing;

    update public.graph_nodes
    set output_schema = null
    where agent_id = r.agent_id and node_id = r.node_id;
  end loop;
end;
$$;

-- 5. Replace output_schema column with output_schema_id
alter table public.graph_nodes
  add column if not exists output_schema_id text;

-- Copy migrated references
update public.graph_nodes
set output_schema_id = 'migrated_' || node_id
where output_schema is null
  and exists (
    select 1 from public.graph_output_schemas os
    where os.agent_id = graph_nodes.agent_id
      and os.schema_id = 'migrated_' || graph_nodes.node_id
  );

-- Drop old column
alter table public.graph_nodes
  drop column if exists output_schema;

-- 6. Update publish_version_tx to resolve schema references and include outputSchemas
drop function if exists public.publish_version_tx(uuid);

create or replace function public.publish_version_tx(
  p_agent_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_version integer;
  v_staging_api_key_id uuid;
  v_start_node text;
  v_graph_data jsonb;
begin
  if not exists (
    select 1
    from public.agents a
    join public.org_members om on om.org_id = a.org_id
    where a.id = p_agent_id and om.user_id = auth.uid()
  ) then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  select start_node, staging_api_key_id
  into v_start_node, v_staging_api_key_id
  from public.agents
  where id = p_agent_id
  for update;

  if v_start_node is null then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  v_graph_data := jsonb_strip_nulls(jsonb_build_object(
    'startNode', v_start_node,
    'nodes', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', n.node_id,
        'text', n.text,
        'kind', n.kind,
        'description', n.description,
        'agent', n.agent,
        'nextNodeIsUser', n.next_node_is_user,
        'fallbackNodeId', n.fallback_node_id,
        'global', n.global,
        'defaultFallback', n.default_fallback,
        'outputSchema', (
          select jsonb_agg(jsonb_build_object(
            'name', elem->>'name',
            'type', elem->>'type',
            'required', (elem->>'required')::boolean,
            'description', elem->>'description',
            'enumValues', elem->'enumValues',
            'items', elem->'items',
            'properties', elem->'properties'
          ))
          from jsonb_array_elements(
            coalesce(
              (select os.fields from public.graph_output_schemas os
               where os.agent_id = p_agent_id and os.schema_id = n.output_schema_id),
              '[]'::jsonb
            )
          ) as elem
        ),
        'position', case
          when n.position_x is not null and n.position_y is not null
          then jsonb_build_object('x', n.position_x, 'y', n.position_y)
        end
      )) from public.graph_nodes n where n.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'edges', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'from', e.from_node,
        'to', e.to_node,
        'preconditions', (
          select jsonb_agg(jsonb_build_object(
            'type', p.type,
            'value', p.value,
            'description', p.description,
            'toolFields', p.tool_fields
          ))
          from public.graph_edge_preconditions p
          where p.edge_id = e.id
        ),
        'contextPreconditions', (
          select jsonb_build_object(
            'preconditions', cp.preconditions,
            'jumpTo', cp.jump_to
          )
          from public.graph_edge_context_preconditions cp
          where cp.edge_id = e.id
          limit 1
        )
      )) from public.graph_edges e where e.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'agents', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', a.agent_key,
        'description', a.description
      )) from public.graph_agents a where a.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'mcpServers', (
      select jsonb_agg(jsonb_build_object(
        'id', m.server_id,
        'name', m.name,
        'transport', jsonb_build_object('type', m.transport_type) || m.transport_config,
        'enabled', m.enabled
      ))
      from public.graph_mcp_servers m where m.agent_id = p_agent_id
    ),
    'outputSchemas', (
      select jsonb_agg(jsonb_build_object(
        'id', os.schema_id,
        'name', os.name,
        'fields', os.fields
      ))
      from public.graph_output_schemas os where os.agent_id = p_agent_id
    )
  ));

  update public.agents
  set current_version = coalesce(current_version, 0) + 1
  where id = p_agent_id
  returning current_version into v_new_version;

  insert into public.agent_versions (agent_id, version, graph_data, published_by)
  values (p_agent_id, v_new_version, v_graph_data, auth.uid());

  update public.agents
  set production_api_key_id = v_staging_api_key_id
  where id = p_agent_id;

  return v_new_version;
end;
$$;
```

- [ ] **Step 2: Apply migration**

Run: `cd /Users/daviddominguez/closer/llm-graph-builder && npx supabase migration up`
Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260312000000_reusable_output_schemas.sql
git commit -m "feat(db): add graph_output_schemas table, migrate inline schemas, update publish_version_tx"
```

---

### Task 3: Backend — output schema operations, fetcher, assembler, dispatch

**Files:**
- Create: `packages/backend/src/db/queries/outputSchemaOperations.ts`
- Modify: `packages/backend/src/db/queries/graphRowTypes.ts`
- Modify: `packages/backend/src/db/queries/graphFetchers.ts`
- Modify: `packages/backend/src/db/queries/graphAssemblers.ts`
- Modify: `packages/backend/src/db/queries/graphQueries.ts`
- Modify: `packages/backend/src/db/queries/operationDispatch.ts`
- Modify: `packages/backend/src/db/queries/nodeOperations.ts`

**Context:**
- Follow `mcpServerOperations.ts` pattern for the new operations file.
- `NodeRow` in `graphRowTypes.ts`: change `output_schema` to `output_schema_id: string | null`.
- `assembleNode` in `graphAssemblers.ts`: change to emit `outputSchemaId` instead of `outputSchema`. Remove `parseOutputSchema`.
- `nodeOperations.ts`: change `output_schema` to `output_schema_id` in the row builder.
- `graphFetchers.ts`: add `fetchOutputSchemas`.
- `graphQueries.ts`: fetch and assemble output schemas into the graph.
- `operationDispatch.ts`: add dispatch for the three new operation types.

- [ ] **Step 1: Create `outputSchemaOperations.ts`**

```typescript
// packages/backend/src/db/queries/outputSchemaOperations.ts
import type { Operation } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';
import { throwOnMutationError } from './operationHelpers.js';

type InsertOp = Extract<Operation, { type: 'insertOutputSchema' }>;
type UpdateOp = Extract<Operation, { type: 'updateOutputSchema' }>;

interface OutputSchemaInsertRow {
  agent_id: string;
  schema_id: string;
  name: string;
  fields: unknown;
}

function buildRow(agentId: string, data: InsertOp['data']): OutputSchemaInsertRow {
  return {
    agent_id: agentId,
    schema_id: data.schemaId,
    name: data.name,
    fields: data.fields,
  };
}

export async function insertOutputSchema(
  supabase: SupabaseClient,
  agentId: string,
  data: InsertOp['data']
): Promise<void> {
  const row = buildRow(agentId, data);
  const result = await supabase
    .from('graph_output_schemas')
    .upsert(row, { onConflict: 'agent_id,schema_id' });
  throwOnMutationError(result, 'insertOutputSchema');
}

export async function updateOutputSchema(
  supabase: SupabaseClient,
  agentId: string,
  data: UpdateOp['data']
): Promise<void> {
  const row = buildRow(agentId, data);
  const result = await supabase
    .from('graph_output_schemas')
    .update(row)
    .eq('agent_id', agentId)
    .eq('schema_id', data.schemaId);
  throwOnMutationError(result, 'updateOutputSchema');
}

export async function deleteOutputSchema(
  supabase: SupabaseClient,
  agentId: string,
  schemaId: string
): Promise<void> {
  const result = await supabase
    .from('graph_output_schemas')
    .delete()
    .eq('agent_id', agentId)
    .eq('schema_id', schemaId);
  throwOnMutationError(result, 'deleteOutputSchema');
}
```

- [ ] **Step 2: Update `graphRowTypes.ts`**

Add `OutputSchemaRow` interface and update `NodeRow`:

```typescript
// Add new interface:
export interface OutputSchemaRow {
  agent_id: string;
  schema_id: string;
  name: string;
  fields: Array<Record<string, unknown>>;
}

// In NodeRow, replace:
//   output_schema: Array<Record<string, unknown>> | null;
// With:
//   output_schema_id: string | null;
```

- [ ] **Step 3: Update `graphFetchers.ts`**

Add `fetchOutputSchemas` function. Import `OutputSchemaRow` from `graphRowTypes.js`:

```typescript
export async function fetchOutputSchemas(
  supabase: SupabaseClient,
  agentId: string
): Promise<OutputSchemaRow[]> {
  const result = await supabase.from('graph_output_schemas').select('*').eq('agent_id', agentId);
  return throwOnError<OutputSchemaRow[]>(result);
}
```

- [ ] **Step 4: Update `graphAssemblers.ts`**

- Remove the `parseOutputSchema` function and its `z` / `OutputSchemaFieldSchema` imports (if they become unused).
- In `assembleNode`: replace `outputSchema: parseOutputSchema(row.output_schema)` with `outputSchemaId: row.output_schema_id ?? undefined`.
- Add `assembleOutputSchemas` function:

```typescript
export function assembleOutputSchemas(
  rows: OutputSchemaRow[]
): OutputSchemaEntity[] | undefined {
  if (rows.length === EMPTY_LENGTH) return undefined;
  return rows.map((row) => ({
    id: row.schema_id,
    name: row.name,
    fields: parseOutputSchemaFields(row.fields),
  }));
}
```

Keep `parseOutputSchema` but rename it to `parseOutputSchemaFields` since it's now used for the entity fields:

```typescript
function parseOutputSchemaFields(
  raw: Array<Record<string, unknown>>
): OutputSchemaField[] {
  const result = z.array(OutputSchemaFieldSchema).safeParse(raw);
  return result.success ? result.data : [];
}
```

Import `OutputSchemaEntity` from `@daviddh/graph-types` and `OutputSchemaRow` from `./graphRowTypes.js`.

- [ ] **Step 5: Update `graphQueries.ts`**

- Import `fetchOutputSchemas` from `./graphFetchers.js` and `assembleOutputSchemas` from `./graphAssemblers.js`.
- In `assembleGraph`, add `fetchOutputSchemas` to the parallel fetch:

```typescript
const [nodeRows, edgeData, agentRows, mcpServerRows, outputSchemaRows] = await Promise.all([
  fetchNodes(supabase, agentId),
  fetchAllEdgeData(supabase, agentId),
  fetchAgents(supabase, agentId),
  fetchMcpServers(supabase, agentId),
  fetchOutputSchemas(supabase, agentId),
]);
```

Add to the return object:
```typescript
outputSchemas: assembleOutputSchemas(outputSchemaRows),
```

- [ ] **Step 6: Update `nodeOperations.ts`**

In the local `NodeRow` interface and `buildNodeRow` function:
- Replace `output_schema: unknown` with `output_schema_id: string | undefined`
- In `buildNodeRow`: replace `output_schema: data.outputSchema` with `output_schema_id: data.outputSchemaId`

- [ ] **Step 7: Update `operationDispatch.ts`**

- Import the three functions from `./outputSchemaOperations.js`
- Add a new dispatch function `dispatchOutputSchemaOps` in the chain. Insert it between `dispatchRemainingOps` (rename to `dispatchMcpOps`) and `dispatchPresetOps`:

```typescript
// Rename dispatchRemainingOps to dispatchMcpOps
// At the end of dispatchMcpOps, call dispatchOutputSchemaOps instead of dispatchPresetOps

async function dispatchOutputSchemaOps(
  supabase: SupabaseClient,
  agentId: string,
  op: Operation
): Promise<void> {
  if (op.type === 'insertOutputSchema') {
    await insertOutputSchema(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateOutputSchema') {
    await updateOutputSchema(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteOutputSchema') {
    await deleteOutputSchema(supabase, agentId, op.schemaId);
    return;
  }
  await dispatchPresetOps(supabase, agentId, op);
}
```

Update `dispatchRemainingOps` (now `dispatchMcpOps`) to call `dispatchOutputSchemaOps` instead of `dispatchPresetOps`.

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/db/queries/outputSchemaOperations.ts packages/backend/src/db/queries/graphRowTypes.ts packages/backend/src/db/queries/graphFetchers.ts packages/backend/src/db/queries/graphAssemblers.ts packages/backend/src/db/queries/graphQueries.ts packages/backend/src/db/queries/operationDispatch.ts packages/backend/src/db/queries/nodeOperations.ts
git commit -m "feat(backend): add output schema CRUD operations, fetcher, assembler, and dispatch"
```

---

## Chunk 2: Web Data Layer

### Task 4: Update web graph transformers and operation builders

**Files:**
- Modify: `packages/web/app/utils/graphTransformers.ts`
- Modify: `packages/web/app/utils/operationBuilders.ts`
- Modify: `packages/web/app/schemas/graph.schema.ts`

**Context:**
- `RFNodeData.outputSchema` → `RFNodeData.outputSchemaId` (string | undefined)
- `schemaNodeToRFNode` and `rfNodeToSchemaNode` update accordingly
- `buildInsertNodeOp` and `buildUpdateNodeOp` change `outputSchema` → `outputSchemaId`
- Add three new operation builders: `buildInsertOutputSchemaOp`, `buildUpdateOutputSchemaOp`, `buildDeleteOutputSchemaOp`
- `graph.schema.ts` re-exports need `OutputSchemaEntitySchema` and `OutputSchemaEntity` type

- [ ] **Step 1: Update `graphTransformers.ts`**

In `RFNodeData` interface:
```typescript
// Replace: outputSchema?: OutputSchemaField[];
// With:    outputSchemaId?: string;
```

Remove the `OutputSchemaField` import if no longer used.

In `schemaNodeToRFNode`, change:
```typescript
// Replace: outputSchema: node.outputSchema,
// With:    outputSchemaId: node.outputSchemaId,
```

In `resolveOptionalFields`, update the Pick type and both return objects:
```typescript
// Replace 'outputSchema' with 'outputSchemaId' in the Pick type
// Replace: outputSchema: data.outputSchema ?? original.outputSchema,
// With:    outputSchemaId: data.outputSchemaId ?? original.outputSchemaId,
```

- [ ] **Step 2: Update `operationBuilders.ts`**

In both `buildInsertNodeOp` and `buildUpdateNodeOp`:
```typescript
// Replace: outputSchema: node.data.outputSchema,
// With:    outputSchemaId: node.data.outputSchemaId,
```

Add new builders at the end of the file:

```typescript
import type { OutputSchemaField } from '@daviddh/graph-types';

export function buildInsertOutputSchemaOp(
  schemaId: string,
  name: string,
  fields: OutputSchemaField[]
): Operation {
  return { type: 'insertOutputSchema', data: { schemaId, name, fields } };
}

export function buildUpdateOutputSchemaOp(
  schemaId: string,
  name: string,
  fields: OutputSchemaField[]
): Operation {
  return { type: 'updateOutputSchema', data: { schemaId, name, fields } };
}

export function buildDeleteOutputSchemaOp(schemaId: string): Operation {
  return { type: 'deleteOutputSchema', schemaId };
}
```

- [ ] **Step 3: Update `graph.schema.ts`**

Add to re-exports:

```typescript
export { OutputSchemaEntitySchema } from '@daviddh/graph-types';
export type { OutputSchemaEntity } from '@daviddh/graph-types';
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: Errors in components that still reference `outputSchema` on nodes — that's expected, fixed in later tasks.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/utils/graphTransformers.ts packages/web/app/utils/operationBuilders.ts packages/web/app/schemas/graph.schema.ts
git commit -m "feat(web): update transformers and operation builders for outputSchemaId"
```

---

### Task 5: useOutputSchemas hook and graph loader updates

**Files:**
- Create: `packages/web/app/hooks/useOutputSchemas.ts`
- Modify: `packages/web/app/hooks/useGraphLoader.ts`

**Context:**
- Follow `useMcpServers.ts` pattern closely.
- Hook provides: `schemas`, `addSchema`, `removeSchema`, `updateSchema`, `setSchemas`
- Each mutation pushes an operation via `pushOperation`
- `useGraphLoader.ts`: Add `outputSchemas` to `GraphLoadResult` and `buildLoadResult`

- [ ] **Step 1: Create `useOutputSchemas.ts`**

```typescript
// packages/web/app/hooks/useOutputSchemas.ts
import type { Operation, OutputSchemaEntity, OutputSchemaField } from '@daviddh/graph-types';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import type { PushOperation } from '../utils/operationBuilders';

const NAME_SLICE_END = 4;

export interface OutputSchemasState {
  schemas: OutputSchemaEntity[];
  addSchema: () => string;
  removeSchema: (id: string) => void;
  updateSchema: (id: string, updates: Partial<OutputSchemaEntity>) => void;
  setSchemas: (schemas: OutputSchemaEntity[]) => void;
}

function createDefaultSchema(): OutputSchemaEntity {
  const id = nanoid();
  return { id, name: `schema_${id.slice(0, NAME_SLICE_END)}`, fields: [] };
}

function buildInsertOp(schema: OutputSchemaEntity): Operation {
  return {
    type: 'insertOutputSchema',
    data: { schemaId: schema.id, name: schema.name, fields: schema.fields },
  };
}

function buildUpdateOp(schema: OutputSchemaEntity): Operation {
  return {
    type: 'updateOutputSchema',
    data: { schemaId: schema.id, name: schema.name, fields: schema.fields },
  };
}

function buildDeleteOp(id: string): Operation {
  return { type: 'deleteOutputSchema', schemaId: id };
}

export interface UseOutputSchemasOptions {
  initialSchemas: OutputSchemaEntity[] | undefined;
  pushOperation: PushOperation;
}

export function useOutputSchemas(options: UseOutputSchemasOptions): OutputSchemasState {
  const { initialSchemas, pushOperation } = options;
  const [schemas, setSchemas] = useState<OutputSchemaEntity[]>(initialSchemas ?? []);

  const addSchema = useCallback((): string => {
    const schema = createDefaultSchema();
    setSchemas((prev) => [...prev, schema]);
    pushOperation(buildInsertOp(schema));
    return schema.id;
  }, [pushOperation]);

  const removeSchema = useCallback(
    (id: string) => {
      setSchemas((prev) => prev.filter((s) => s.id !== id));
      pushOperation(buildDeleteOp(id));
    },
    [pushOperation]
  );

  const updateSchema = useCallback(
    (id: string, updates: Partial<OutputSchemaEntity>) => {
      setSchemas((prev) => {
        const updated = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
        const merged = updated.find((s) => s.id === id);
        if (merged !== undefined) {
          pushOperation(buildUpdateOp(merged));
        }
        return updated;
      });
    },
    [pushOperation]
  );

  return { schemas, addSchema, removeSchema, updateSchema, setSchemas };
}
```

- [ ] **Step 2: Update `useGraphLoader.ts`**

Add `OutputSchemaEntity` import:
```typescript
import type { OutputSchemaEntity } from '@/app/schemas/graph.schema';
```

Add to `GraphLoadResult`:
```typescript
outputSchemas: OutputSchemaEntity[];
```

Add to `EMPTY_RESULT`:
```typescript
outputSchemas: [],
```

Add to `buildLoadResult`:
```typescript
outputSchemas: graph.outputSchemas ?? [],
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: Still some errors in components — that's expected.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/hooks/useOutputSchemas.ts packages/web/app/hooks/useGraphLoader.ts
git commit -m "feat(web): add useOutputSchemas hook and update graph loader"
```

---

## Chunk 3: Settings Panel — OutputSchemasSection

### Task 6: OutputSchemasSection component and PresetsPanel wiring

**Files:**
- Create: `packages/web/app/components/panels/OutputSchemasSection.tsx`
- Modify: `packages/web/app/components/panels/PresetsPanel.tsx`
- Modify: `packages/web/app/components/SidePanels.tsx`
- Modify: `packages/web/messages/en.json`

**Context:**
- Follow `ContextPreconditionsSection.tsx` pattern exactly for the section layout.
- Section shows: header ("Output Schemas" + Plus button), list of schema rows, separator.
- Each row: schema name + field count badge + edit button + delete button with AlertDialog.
- Plus button calls `addSchema()` then opens the schema builder dialog for the new schema.
- Edit button opens the schema builder dialog for that schema.
- Delete uses AlertDialog pattern from existing codebase.
- The dialog opening will be handled via state (selected schema ID) — the dialog itself is refactored in Task 8.
- Wire through `SidePanels` → `PresetsAside` → `PresetsPanel` → `OutputSchemasSection`.

- [ ] **Step 1: Add translations to `en.json`**

Add a new `"outputSchemas"` namespace after the `"nodePanel"` block:

```json
"outputSchemas": {
  "sectionTitle": "Output Schemas",
  "newSchema": "New schema...",
  "deleteTitle": "Delete schema?",
  "deleteDescription": "This will remove the schema \"{name}\" and unassign it from any nodes using it.",
  "schemaName": "Schema name",
  "fieldCount": "{count} fields",
  "none": "None",
  "editSchema": "Edit schema"
}
```

- [ ] **Step 2: Create `OutputSchemasSection.tsx`**

```typescript
// packages/web/app/components/panels/OutputSchemasSection.tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface OutputSchemasSectionProps {
  schemas: OutputSchemaEntity[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

function SchemaRowActions({
  schema,
  onEdit,
  onRemove,
}: {
  schema: OutputSchemaEntity;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('outputSchemas');

  return (
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="icon-xs" onClick={onEdit} title={t('editSchema')}>
        <Pencil className="size-3" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="ghost" size="icon-xs" title={t('deleteTitle')}>
              <Trash2 className="size-3" />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription', { name: schema.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onRemove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SchemaRow({
  schema,
  onEdit,
  onRemove,
}: {
  schema: OutputSchemaEntity;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('outputSchemas');

  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate text-xs font-medium">{schema.name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {t('fieldCount', { count: schema.fields.length })}
        </span>
      </div>
      <SchemaRowActions schema={schema} onEdit={onEdit} onRemove={onRemove} />
    </li>
  );
}

export function OutputSchemasSection({ schemas, onAdd, onRemove, onEdit }: OutputSchemasSectionProps) {
  const t = useTranslations('outputSchemas');

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <Label>{t('sectionTitle')}</Label>
        <Button variant="ghost" size="icon-xs" onClick={onAdd}>
          <Plus className="size-3" />
        </Button>
      </div>
      {schemas.length > 0 && (
        <ul className="space-y-1">
          {schemas.map((schema) => (
            <SchemaRow
              key={schema.id}
              schema={schema}
              onEdit={() => onEdit(schema.id)}
              onRemove={() => onRemove(schema.id)}
            />
          ))}
        </ul>
      )}
      <Separator className="mt-3" />
    </div>
  );
}
```

- [ ] **Step 3: Update `PresetsPanel.tsx`**

Add import:
```typescript
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { OutputSchemasSection } from './OutputSchemasSection';
```

Add to `PresetsPanelProps`:
```typescript
outputSchemas: {
  schemas: OutputSchemaEntity[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
};
```

Add the prop to the function parameters.

In the JSX, between `<ContextKeysSection ... />` and `<ContextPreconditionsSection ... />`, add:
```tsx
<OutputSchemasSection
  schemas={outputSchemas.schemas}
  onAdd={outputSchemas.onAdd}
  onRemove={outputSchemas.onRemove}
  onEdit={outputSchemas.onEdit}
/>
```

- [ ] **Step 4: Update `SidePanels.tsx`**

Add `OutputSchemasState` import from the hook:
```typescript
import type { OutputSchemasState } from '../hooks/useOutputSchemas';
```

Add to `SidePanelsProps`:
```typescript
outputSchemasHook: OutputSchemasState;
```

Add to `PresetsAsideProps` Pick:
```typescript
| 'outputSchemasHook'
```

In `PresetsAside`, wire `outputSchemas` prop to `PresetsPanel`:

```typescript
outputSchemas={{
  schemas: props.outputSchemasHook.schemas,
  onAdd: () => {
    const id = props.outputSchemasHook.addSchema();
    // TODO: open dialog for schema with this id (Task 8)
  },
  onRemove: props.outputSchemasHook.removeSchema,
  onEdit: (_id) => {
    // TODO: open dialog for schema with this id (Task 8)
  },
}}
```

Note: The dialog opening will be wired in Task 8 when the dialog is refactored. For now, use placeholder callbacks.

- [ ] **Step 5: Find and update the parent component that creates `SidePanelsProps`**

Search for where `SidePanels` is rendered and add the `outputSchemasHook` prop. This is likely in the editor page component. Read the file, add the `useOutputSchemas` hook call, and pass it through.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/components/panels/OutputSchemasSection.tsx packages/web/app/components/panels/PresetsPanel.tsx packages/web/app/components/SidePanels.tsx packages/web/messages/en.json
git commit -m "feat(web): add OutputSchemasSection in settings panel"
```

---

## Chunk 4: NodePanel Selector

### Task 7: Replace OutputSchemaDialog button with Select dropdown in NodePanel

**Files:**
- Modify: `packages/web/app/components/panels/NodePanel.tsx`

**Context:**
- Remove the `OutputSchemaDialog` import and its trigger button from the header.
- Add a `Select` dropdown in the properties area (after the text fields, before the checkboxes).
- Only visible for `node.type === 'agent'`.
- Options: all schemas by name + separator + "New schema..." at the bottom.
- Selecting a schema calls `updateNodeData({ outputSchemaId: selectedId })`.
- Selecting "None" calls `updateNodeData({ outputSchemaId: undefined })`.
- Selecting "New schema..." calls `addSchema()` to create a new schema, sets the ID on the node, then opens the dialog.
- A pencil icon button next to the select opens the dialog for the currently selected schema.
- `NodePanel` needs new props: `outputSchemas: OutputSchemaEntity[]`, `onAddOutputSchema: () => string`, `onEditOutputSchema: (id: string) => void`.

- [ ] **Step 1: Update `NodePanelProps`**

Add to the interface:
```typescript
import type { OutputSchemaEntity } from '@daviddh/graph-types';

// In NodePanelProps:
outputSchemas: OutputSchemaEntity[];
onAddOutputSchema: () => string;
onEditOutputSchema: (id: string) => void;
```

- [ ] **Step 2: Remove OutputSchemaDialog from header**

Remove the `OutputSchemaDialog` import and the JSX block that renders it in the header (lines ~149-154).

- [ ] **Step 3: Add Select dropdown in properties area**

After the Text textarea and before the tool call alert/checkboxes, add (only for `node.type === 'agent'`):

```tsx
{node.type === 'agent' && (
  <OutputSchemaSelect
    schemas={outputSchemas}
    value={nodeData.outputSchemaId}
    onChange={(schemaId) => updateNodeData({ outputSchemaId: schemaId })}
    onAddSchema={() => {
      const id = onAddOutputSchema();
      updateNodeData({ outputSchemaId: id });
      onEditOutputSchema(id);
    }}
    onEditSchema={onEditOutputSchema}
  />
)}
```

This should be a separate component to keep `NodePanel` under the line limit. Create it as a helper function within NodePanel or as a small extracted component. Given the max-lines constraint (NodePanel is already ~416 lines), extract to a separate file.

- [ ] **Step 4: Create `OutputSchemaSelect.tsx`**

```typescript
// packages/web/app/components/panels/OutputSchemaSelect.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

const NONE_VALUE = '__none__';
const NEW_VALUE = '__new__';

interface OutputSchemaSelectProps {
  schemas: OutputSchemaEntity[];
  value: string | undefined;
  onChange: (schemaId: string | undefined) => void;
  onAddSchema: () => void;
  onEditSchema: (id: string) => void;
}

export function OutputSchemaSelect({
  schemas,
  value,
  onChange,
  onAddSchema,
  onEditSchema,
}: OutputSchemaSelectProps) {
  const t = useTranslations('nodePanel');
  const tSchemas = useTranslations('outputSchemas');

  const handleChange = (selected: string) => {
    if (selected === NEW_VALUE) {
      onAddSchema();
      return;
    }
    onChange(selected === NONE_VALUE ? undefined : selected);
  };

  return (
    <div className="space-y-2">
      <Label>{t('outputSchema')}</Label>
      <div className="flex items-center gap-1">
        <Select value={value ?? NONE_VALUE} onValueChange={handleChange}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{tSchemas('none')}</SelectItem>
            {schemas.map((schema) => (
              <SelectItem key={schema.id} value={schema.id}>
                {schema.name}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={NEW_VALUE}>{tSchemas('newSchema')}</SelectItem>
          </SelectContent>
        </Select>
        {value !== undefined && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onEditSchema(value)}
            title={tSchemas('editSchema')}
          >
            <Pencil className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
```

Note: Check if `SelectSeparator` exists in the shadcn Select component. If not, use a simple `<div>` with a border or add the component. Read `components/ui/select.tsx` to check.

- [ ] **Step 5: Wire in NodePanel**

Import and use the new component. Update the `SidePanels` `SelectionPanel` to pass the new props through to `NodePanel`.

- [ ] **Step 6: Update `SidePanels.tsx` SelectionPanel**

Pass new props to `NodePanel`:
```typescript
outputSchemas={props.outputSchemasHook.schemas}
onAddOutputSchema={props.outputSchemasHook.addSchema}
onEditOutputSchema={(id) => {
  // TODO: open dialog (Task 8)
}}
```

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/components/panels/OutputSchemaSelect.tsx packages/web/app/components/panels/NodePanel.tsx packages/web/app/components/SidePanels.tsx
git commit -m "feat(web): replace output schema button with select dropdown in NodePanel"
```

---

## Chunk 5: Schema Builder Dialog Refactor and UI Overhaul

### Task 8: Refactor OutputSchemaDialog to take schema entity

**Files:**
- Modify: `packages/web/app/components/panels/OutputSchemaDialog.tsx`
- Modify: `packages/web/app/components/SidePanels.tsx`

**Context:**
- Dialog now takes `schema: OutputSchemaEntity` + `onUpdate: (updates: Partial<OutputSchemaEntity>) => void` + `open: boolean` + `onOpenChange: (open: boolean) => void`.
- No longer self-triggers — controlled externally via open/onOpenChange.
- Adds a name input at the top of the dialog (editable schema name, monospace).
- Title shows the schema name.
- Remove the `DialogTrigger` — dialog is now a controlled component.
- Wire the dialog opening from `OutputSchemasSection` and `NodePanel` via state in `SidePanels` or a shared context.

- [ ] **Step 1: Refactor `OutputSchemaDialog.tsx`**

Rewrite the component as a controlled dialog:

```typescript
// packages/web/app/components/panels/OutputSchemaDialog.tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { OutputSchemaEntity, OutputSchemaField } from '@daviddh/graph-types';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OutputSchemaFieldCard } from './OutputSchemaFieldCard';
import { createEmptyField, removeFieldFromList, updateFieldInList } from './outputSchemaTypes';

interface OutputSchemaDialogProps {
  schema: OutputSchemaEntity | undefined;
  onUpdate: (id: string, updates: Partial<OutputSchemaEntity>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EmptyState() {
  const t = useTranslations('nodePanel');
  return (
    <p className="py-8 text-center text-xs text-muted-foreground">
      {t('outputSchemaEmpty')}
    </p>
  );
}

function FieldList({
  fields,
  onChange,
}: {
  fields: OutputSchemaField[];
  onChange: (fields: OutputSchemaField[]) => void;
}) {
  return (
    <div className="space-y-1">
      {fields.map((field, index) => (
        <OutputSchemaFieldCard
          key={index}
          field={field}
          depth={1}
          onChange={(updated) => onChange(updateFieldInList(fields, index, updated))}
          onRemove={() => onChange(removeFieldFromList(fields, index))}
        />
      ))}
    </div>
  );
}

export function OutputSchemaDialog({
  schema,
  onUpdate,
  open,
  onOpenChange,
}: OutputSchemaDialogProps) {
  const t = useTranslations('nodePanel');
  const tSchemas = useTranslations('outputSchemas');

  if (schema === undefined) return null;

  const handleFieldsChange = (fields: OutputSchemaField[]) => {
    onUpdate(schema.id, { fields });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schema.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 px-1">
          <Input
            value={schema.name}
            onChange={(e) => onUpdate(schema.id, { name: e.target.value })}
            placeholder={tSchemas('schemaName')}
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {schema.fields.length === 0 ? (
            <EmptyState />
          ) : (
            <FieldList fields={schema.fields} onChange={handleFieldsChange} />
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button
            variant="outline"
            onClick={() => handleFieldsChange([...schema.fields, createEmptyField()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('addField')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire dialog state in `SidePanels.tsx`**

Add state for the editing dialog:

```typescript
import { useState } from 'react';
import { OutputSchemaDialog } from './panels/OutputSchemaDialog';

// Inside SidePanels component:
const [editingSchemaId, setEditingSchemaId] = useState<string | null>(null);
const editingSchema = editingSchemaId !== null
  ? props.outputSchemasHook.schemas.find((s) => s.id === editingSchemaId)
  : undefined;
```

Add the dialog to the JSX (rendered at top level of `SidePanels`):
```tsx
<OutputSchemaDialog
  schema={editingSchema}
  onUpdate={props.outputSchemasHook.updateSchema}
  open={editingSchemaId !== null}
  onOpenChange={(open) => { if (!open) setEditingSchemaId(null); }}
/>
```

Update `PresetsAside` callbacks:
```typescript
onAdd: () => {
  const id = props.outputSchemasHook.addSchema();
  setEditingSchemaId(id);
},
onEdit: (id) => setEditingSchemaId(id),
```

Update `NodePanel` callbacks:
```typescript
onEditOutputSchema={(id) => setEditingSchemaId(id)}
```

Note: Since `setEditingSchemaId` is defined inside `SidePanels`, `PresetsAside` and `SelectionPanel` need it passed through. Either lift it via props or use a simpler approach: define the callbacks inside `SidePanels` and pass them down. The cleanest approach is to pass `setEditingSchemaId` through the existing prop chains.

- [ ] **Step 3: Run typecheck and check**

Run: `npm run check`
Expected: PASS (may need ESLint fixes for line limits)

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/panels/OutputSchemaDialog.tsx packages/web/app/components/SidePanels.tsx
git commit -m "feat(web): refactor OutputSchemaDialog as controlled entity-aware component"
```

---

### Task 9: OutputSchemaFieldCard premium UI overhaul

**Files:**
- Modify: `packages/web/app/components/panels/OutputSchemaFieldCard.tsx`
- Modify: `packages/web/app/components/panels/outputSchemaTypes.ts`

**Context:**
The field card gets a complete visual redesign per the spec:
- **No Card wrapper** — use a plain `div` with colored left border and `hover:bg-muted/30`
- **Type-colored left borders**: string→zinc, number→blue, boolean→green, enum→amber, object→purple, array→orange
- **Monospace field names**: `font-mono` on name inputs
- **Compact height**: `h-6` inputs, tight spacing
- **Required**: small toggle/switch instead of checkbox + label
- **Description**: collapsed by default — info icon that expands on click. Filled icon when description has content.
- **Delete**: ghost icon button, only visible on hover via group/hover
- **Enum values**: compact inline pills with tiny × to remove

- [ ] **Step 1: Add type color map to `outputSchemaTypes.ts`**

```typescript
// Add to outputSchemaTypes.ts:
export const TYPE_BORDER_COLORS: Record<OutputSchemaFieldType, string> = {
  string: 'border-l-zinc-300',
  number: 'border-l-blue-400',
  boolean: 'border-l-green-400',
  enum: 'border-l-amber-400',
  object: 'border-l-purple-400',
  array: 'border-l-orange-400',
};

export const TYPE_BG_COLORS: Record<OutputSchemaFieldType, string> = {
  string: '',
  number: '',
  boolean: '',
  enum: '',
  object: 'bg-purple-50/30',
  array: 'bg-orange-50/30',
};
```

- [ ] **Step 2: Redesign `OutputSchemaFieldCard.tsx`**

Complete rewrite of the component. Key changes:

1. Remove `Card` import — use plain `div` with `border-l-2` and type color
2. `font-mono` on name input, `h-6` height
3. Required field: use a small toggle-like checkbox (keep using `Checkbox` component but style it compactly)
4. Description: collapsed by default, toggle via `Info` icon (small), show `InfoIcon` filled when content exists
5. Delete: `opacity-0 group-hover:opacity-100` transition
6. Enum values: inline pill/tag layout instead of vertical list
7. Nested fields: type-colored left borders for indentation

The component should stay under 200 lines. If needed, extract `EnumValuesEditor` and `NestedFieldList` into separate helper functions or a companion file.

Structure each field row as:
```
[2px colored left border] [name input: mono, h-6] [type select: w-20, h-6] [req: small checkbox] [info icon] [delete icon: hidden until hover]
```

```tsx
// Key JSX structure for each field:
<div className={`group flex flex-col border-l-2 ${borderColor} pl-2 py-0.5 rounded-r hover:bg-muted/30`}>
  <div className="flex items-center gap-1">
    <Input
      value={field.name}
      onChange={(e) => handleChange({ name: e.target.value })}
      placeholder={t('fieldNamePlaceholder')}
      className={`h-6 flex-1 font-mono text-xs ${nameInvalid ? 'border-destructive' : ''}`}
    />
    <Select ...> {/* type select, h-6 w-20 */} </Select>
    <Checkbox ... /> {/* compact required toggle */}
    <Button ... onClick={toggleDescription}> {/* Info/InfoFilled icon */} </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={onRemove}
      className="opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <Trash2 className="size-3" />
    </Button>
  </div>
  {showDescription && <Input ... className="h-6 text-xs mt-1" />}
  {/* enum/object/array children below */}
</div>
```

- [ ] **Step 3: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/panels/OutputSchemaFieldCard.tsx packages/web/app/components/panels/outputSchemaTypes.ts
git commit -m "feat(web): premium UI overhaul for OutputSchemaFieldCard"
```

---

### Task 10: Wire useOutputSchemas in the editor page and final integration

**Files:**
- Modify: The editor page component that renders `SidePanels` (find via searching for `<SidePanels`)
- Possibly: `packages/web/app/components/GraphEditor.tsx` or similar

**Context:**
- Find where `SidePanels` is instantiated.
- Add `useOutputSchemas` hook call with `initialSchemas` from the graph loader and `pushOperation`.
- Pass `outputSchemasHook` prop to `SidePanels`.
- When a schema is deleted, also clear `outputSchemaId` from any nodes referencing it.

- [ ] **Step 1: Find the editor component**

Search for `<SidePanels` to find where it's rendered. Read that file.

- [ ] **Step 2: Add useOutputSchemas hook**

```typescript
import { useOutputSchemas } from '../hooks/useOutputSchemas';

// Inside the editor component:
const outputSchemasHook = useOutputSchemas({
  initialSchemas: graphLoader.result.outputSchemas,
  pushOperation,
});
```

- [ ] **Step 3: Pass to SidePanels**

```tsx
<SidePanels
  {...existingProps}
  outputSchemasHook={outputSchemasHook}
/>
```

- [ ] **Step 4: Handle schema deletion cascading to nodes**

When a schema is removed, nodes with that `outputSchemaId` should have it cleared. Wrap `removeSchema`:

```typescript
const handleRemoveSchema = (id: string) => {
  outputSchemasHook.removeSchema(id);
  // Clear outputSchemaId from nodes using this schema
  setNodes((nds) =>
    nds.map((n) =>
      n.data.outputSchemaId === id
        ? { ...n, data: { ...n.data, outputSchemaId: undefined } }
        : n
    )
  );
};
```

Pass this wrapped version through instead of `outputSchemasHook.removeSchema` directly.

- [ ] **Step 5: Run full check**

Run: `npm run check`
Expected: PASS — all packages typecheck, lint, and format cleanly

- [ ] **Step 6: Commit**

```bash
git add <editor-file> packages/web/app/components/SidePanels.tsx
git commit -m "feat(web): wire useOutputSchemas in editor and complete integration"
```

---

## Post-Implementation Checklist

- [ ] All `npm run check` passes (format + lint + typecheck)
- [ ] Migration applied successfully
- [ ] Translations added for all new user-facing text
- [ ] No `any` types, no `eslint-disable` comments
- [ ] Files stay under 300 lines, functions under 40 lines
- [ ] Schema builder dialog opens from both Settings panel and NodePanel edit button
- [ ] NodePanel Select dropdown shows all schemas + "None" + "New schema..."
- [ ] Deleting a schema clears references from nodes
- [ ] Publishing snapshots full schema fields into version JSON
