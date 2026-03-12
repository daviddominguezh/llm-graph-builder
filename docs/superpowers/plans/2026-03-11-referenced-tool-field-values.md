# Referenced Tool Field Values Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable tool call parameters to reference structured outputs from previous nodes, with full path-coverage validation, type safety, fallback chains, and a new structured-output node processor in the runtime.

**Architecture:** References extend the `ToolFieldValue` discriminated union with recursive fallback chains validated via a graph-dominator algorithm. At runtime, a new `processStructuredOutputNode` function uses dynamically-built Zod schemas (from `OutputSchemaField[]`) with the Vercel AI SDK. The `structuredOutputs` map (`Record<string, unknown[]>`) is threaded through the full execution pipeline. On the web side, a three-way toggle replaces the agent-inferred checkbox, and a reference configuration dialog handles upstream discovery, type compatibility, and path coverage.

**Tech Stack:** TypeScript, Zod v4, Vercel AI SDK v6, Next.js 16, React Flow, shadcn/ui (base-ui), next-intl

**Spec:** `docs/superpowers/specs/2026-03-11-referenced-tool-field-values-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `packages/api/src/utils/outputSchemaToZod.ts` | Convert `OutputSchemaField[]` to a `z.ZodObject` |
| `packages/api/src/utils/outputSchemaToZod.test.ts` | Tests for Zod schema generation |
| `packages/api/src/utils/stableJsonHash.ts` | Sorted-key JSON serialization for dedup hashing |
| `packages/api/src/utils/stableJsonHash.test.ts` | Tests for stable hashing |
| `packages/api/src/core/structuredOutputProcessor.ts` | `processStructuredOutputNode()` function |
| `packages/api/src/stateMachine/referenceResolver.ts` | Resolve `type: 'reference'` fields from structuredOutputs map |
| `packages/api/src/stateMachine/referenceResolver.test.ts` | Tests for reference resolution |
| `packages/web/app/utils/typeCompatibility.ts` | Type matching between output schema fields and tool input params |
| `packages/web/app/utils/pathCoverage.ts` | Dominator-check algorithm + fallback validation + upstream discovery |
| `packages/web/app/components/panels/FieldModeToggle.tsx` | Three-way toggle component (agent inferred / fixed / reference) |
| `packages/web/app/components/panels/ReferenceConfigDialog.tsx` | Reference configuration dialog with path coverage UI |
| `packages/web/app/components/panels/referenceDialogHelpers.ts` | Pure helpers for the reference dialog (upstream filtering, coverage checks) |
| `packages/web/app/components/panels/NodePanelOutputSchema.tsx` | Extracted output-schema section of NodePanel (ESLint line-limit compliance) |
| `packages/web/app/utils/stableJsonHash.ts` | Web-package copy of stable JSON serialization for simulation dedup |
| `packages/web/app/utils/graphValidationOutputSchemas.ts` | Output-schema and reference validation rules (extracted from graphValidation) |
| `supabase/migrations/20260313000000_add_output_prompt_to_nodes.sql` | Add `output_prompt` column to `graph_nodes` |

### Modified Files

| File | Changes |
|------|---------|
| `packages/graph-types/src/schemas/edge.schema.ts` | Add `fallbacks` to reference variant using `z.lazy()` |
| `packages/graph-types/src/schemas/node.schema.ts` | Add `outputPrompt` to `NodeSchema` and `RuntimeNodeSchema` |
| `packages/graph-types/src/schemas/operation-node.schema.ts` | Add `outputPrompt` to `NodeDataSchema` |
| `packages/api/src/index.ts` | Add `structuredOutputs` param to `execute()` and `executeWithCallbacks()` |
| `packages/api/src/core/types.ts` | Add `structuredOutputs` to `CallAgentOutput` |
| `packages/api/src/core/index.ts` | Thread `structuredOutputs` through `executeFlow` |
| `packages/api/src/core/indexHelpers.ts` | Add `structuredOutputs` to `FlowState`, thread through flow |
| `packages/api/src/core/modelCaller.ts` | Accept optional dynamic Zod schema instead of hardcoded one |
| `packages/api/src/stateMachine/index.ts` | Check `outputSchemaId` before terminal return, extend `buildFixedFieldsPrompt`, add `structured_output` kind |
| `packages/api/src/types/stateMachine.ts` | Add `structured_output` to `SMNextOptions` and `SMConfig` kind unions, add `outputSchema` field |
| `packages/api/src/types/tools.ts` | (No changes needed — `Context` already has `graph` which includes `outputSchemas`) |
| `packages/web/app/components/panels/ToolParamsCard.tsx` | Three-way toggle, recursive nested params, enriched `SchemaProperty` |
| `packages/web/app/components/panels/NodePanel.tsx` | Output schema gating, `outputPrompt` text field, mutual exclusion with nextNodeIsUser |
| `packages/web/app/utils/graphTransformers.ts` | Add `outputPrompt` to `RFNodeData` interface |
| `packages/web/app/utils/graphValidation.ts` | Wire new validators into `validateGraph` |
| `packages/web/app/hooks/useSimulation.ts` | Maintain `structuredOutputs` across simulation steps |
| `packages/web/app/hooks/useSimulationHelpers.ts` | Include `structuredOutputs` in `buildSimulateParams` |
| `packages/web/app/lib/api.ts` | Add `structuredOutputs` to `SimulateRequestBody` |
| `packages/api/src/types/tools.ts` | Add `structuredOutputs` to `NodeProcessedEvent` |
| `packages/backend/src/routes/simulateHandler.ts` | Thread `structuredOutputs` in SSE events |
| `packages/web/messages/en.json` | New translation keys |
| `packages/backend/src/db/queries/graphRowTypes.ts` | Add `output_prompt` to `NodeRow` |
| `packages/backend/src/db/queries/nodeOperations.ts` | Read/write `output_prompt` |
| `packages/backend/src/db/queries/graphAssemblers.ts` | Parse `output_prompt` |

---

## Chunk 1: Data Model + Backend

### Task 1: Add `fallbacks` to ToolFieldValue reference variant (graph-types)

**Files:**
- Modify: `packages/graph-types/src/schemas/edge.schema.ts:5-8`

- [ ] **Step 1: Update ToolFieldValueSchema to use z.lazy() with fallbacks**

Replace the current `ToolFieldValueSchema` (lines 5-8) with a recursive version:

```ts
import { z } from 'zod';

export const PreconditionTypeSchema = z.enum(['user_said', 'agent_decision', 'tool_call']);

/** Explicit type required for z.lazy() recursive reference. */
export type ToolFieldValue =
  | { type: 'fixed'; value: string }
  | { type: 'reference'; nodeId: string; path: string; fallbacks?: ToolFieldValue[] };

const FixedFieldValueSchema = z.object({ type: z.literal('fixed'), value: z.string() });

export const ToolFieldValueSchema: z.ZodType<ToolFieldValue> = z.lazy(() =>
  z.union([
    FixedFieldValueSchema,
    z.object({
      type: z.literal('reference'),
      nodeId: z.string(),
      path: z.string(),
      fallbacks: z.array(ToolFieldValueSchema).optional(),
    }),
  ])
);
```

**Important notes:**
- Use `type` alias (not `interface`) for the union — TypeScript interfaces cannot be unions.
- Use `z.union()` instead of `z.discriminatedUnion()` inside `z.lazy()` — Zod v4 has a known TDZ (Temporal Dead Zone) bug when combining `z.discriminatedUnion()` with `z.lazy()` (see zod#4264, zod#1504). `z.union()` avoids this.
- The `ToolFieldValue` type must be declared **before** the schema so the `z.ZodType<ToolFieldValue>` annotation resolves. This matches the existing pattern in `output-schema.schema.ts`.

- [ ] **Step 2: Update the types/index.ts to export the interface instead of z.infer**

In `packages/graph-types/src/types/index.ts`, the `ToolFieldValue` type is currently `z.infer<typeof ToolFieldValueSchema>`. Since we're using `z.lazy()` with an explicit type alias, we need to re-export it from `edge.schema.ts` instead:

```ts
// In types/index.ts, change from:
export type ToolFieldValue = z.infer<typeof ToolFieldValueSchema>;
// To:
export type { ToolFieldValue } from '../schemas/edge.schema.js';
```

The `ToolFieldValue` type is already exported from `edge.schema.ts` (declared alongside the schema in Step 1).

- [ ] **Step 3: Add ToolFieldValue re-export to schemas/index.ts**

In `packages/graph-types/src/schemas/index.ts`, add the explicit re-export line. The file currently re-exports schemas but not the `ToolFieldValue` type — add it:

```ts
// Add this line to schemas/index.ts:
export type { ToolFieldValue } from './edge.schema.js';
```

This ensures `ToolFieldValue` is available from both `@daviddh/graph-types` (via `types/index.ts`) and from direct schema imports.

- [ ] **Step 4: Build graph-types and verify**

Run: `npm run typecheck -w packages/graph-types`
Expected: PASS (no type errors)

- [ ] **Step 5: Commit**

```bash
git add packages/graph-types/src/schemas/edge.schema.ts packages/graph-types/src/types/index.ts packages/graph-types/src/schemas/index.ts
git commit -m "feat(graph-types): add fallbacks to ToolFieldValue reference variant"
```

---

### Task 2: Add `outputPrompt` to node schemas (graph-types)

**Files:**
- Modify: `packages/graph-types/src/schemas/node.schema.ts:21-33,35-48`
- Modify: `packages/graph-types/src/schemas/operation-node.schema.ts:6-18`

- [ ] **Step 1: Add outputPrompt to NodeSchema**

In `node.schema.ts`, add `outputPrompt: z.string().optional()` after `outputSchemaId` (line 32):

```ts
export const NodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: BaseNodeKindSchema,
  description: z.string().default(''),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  fallbackNodeId: z.string().optional(),
  global: z.boolean().default(false),
  defaultFallback: z.boolean().optional(),
  outputSchemaId: z.string().optional(),
  outputPrompt: z.string().optional(),       // NEW
  position: PositionSchema.optional(),
});
```

- [ ] **Step 2: Add outputPrompt to RuntimeNodeSchema**

In `node.schema.ts`, add `outputPrompt: z.string().optional()` to `RuntimeNodeSchema` (after `outputSchema`):

```ts
export const RuntimeNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: RuntimeNodeKindSchema,
  description: z.string().default(''),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  fallbackNodeId: z.string().optional(),
  previousNodeWasUser: z.boolean().optional(),
  isUser: z.boolean().optional(),
  global: z.boolean().default(false),
  outputSchema: OutputSchemaSchema,
  outputPrompt: z.string().optional(),       // NEW
  position: PositionSchema.optional(),
});
```

- [ ] **Step 3: Add outputPrompt to NodeDataSchema (operations)**

In `operation-node.schema.ts`, add `outputPrompt: z.string().optional()` after `outputSchemaId`:

```ts
const NodeDataSchema = z.object({
  nodeId: z.string(),
  text: z.string(),
  kind: BaseNodeKindSchema,
  description: z.string().optional(),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  fallbackNodeId: z.string().optional(),
  global: z.boolean().optional(),
  defaultFallback: z.boolean().optional(),
  outputSchemaId: z.string().optional(),
  outputPrompt: z.string().optional(),       // NEW
  position: PositionSchema.optional(),
});
```

- [ ] **Step 4: Build and verify**

Run: `npm run typecheck -w packages/graph-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/graph-types/src/schemas/node.schema.ts packages/graph-types/src/schemas/operation-node.schema.ts
git commit -m "feat(graph-types): add outputPrompt field to node schemas"
```

---

### Task 3: Database migration for `output_prompt`

**Files:**
- Create: `supabase/migrations/20260313000000_add_output_prompt_to_nodes.sql`

- [ ] **Step 1: Write migration**

The migration follows the exact style of `20260312000000_reusable_output_schemas.sql` — same variable names, same `jsonb_strip_nulls()` wrapper, same permission check pattern. The only change is adding `'outputPrompt', n.output_prompt` to the nodes jsonb_build_object.

```sql
-- Add output_prompt column to graph_nodes
alter table public.graph_nodes add column output_prompt text;

-- Drop and recreate publish_version_tx to include output_prompt
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
          select os.fields
          from public.graph_output_schemas os
          where os.agent_id = p_agent_id and os.schema_id = n.output_schema_id
        ),
        'outputPrompt', n.output_prompt,
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

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260313000000_add_output_prompt_to_nodes.sql
git commit -m "feat(db): add output_prompt column and update publish_version_tx"
```

---

### Task 4: Backend CRUD for `output_prompt`

**Files:**
- Modify: `packages/backend/src/db/queries/graphRowTypes.ts:4-18`
- Modify: `packages/backend/src/db/queries/nodeOperations.ts:9-41`
- Modify: `packages/backend/src/db/queries/graphAssemblers.ts:47-61`

- [ ] **Step 1: Add output_prompt to NodeRow (graphRowTypes.ts)**

Add `output_prompt: string | null;` after `output_schema_id` (line 17):

```ts
export interface NodeRow {
  agent_id: string;
  node_id: string;
  text: string;
  kind: BaseNodeKind;
  description: string;
  agent: string | null;
  next_node_is_user: boolean | null;
  fallback_node_id: string | null;
  global: boolean;
  default_fallback: boolean | null;
  position_x: number | null;
  position_y: number | null;
  output_schema_id: string | null;
  output_prompt: string | null;              // NEW
}
```

- [ ] **Step 2: Add output_prompt to nodeOperations.ts NodeRow and buildNodeRow**

In `nodeOperations.ts`, add `output_prompt: string | undefined;` to the local `NodeRow` interface (line 23) and map it in `buildNodeRow` (line 40):

```ts
interface NodeRow {
  // ...existing fields
  output_schema_id: string | undefined;
  output_prompt: string | undefined;         // NEW
}

function buildNodeRow(agentId: string, data: InsertNodeOp['data']): NodeRow {
  return {
    // ...existing fields
    output_schema_id: data.outputSchemaId,
    output_prompt: data.outputPrompt,        // NEW
  };
}
```

- [ ] **Step 3: Add outputPrompt to assembleNode (graphAssemblers.ts)**

In `graphAssemblers.ts`, add `outputPrompt` to the assembled node object (line 59):

```ts
export function assembleNode(row: NodeRow): Node {
  return {
    id: row.node_id,
    text: row.text,
    kind: row.kind,
    description: row.description,
    agent: row.agent ?? undefined,
    nextNodeIsUser: row.next_node_is_user ?? undefined,
    fallbackNodeId: row.fallback_node_id ?? undefined,
    global: row.global,
    defaultFallback: row.default_fallback ?? undefined,
    position: buildPosition(row),
    outputSchemaId: row.output_schema_id ?? undefined,
    outputPrompt: row.output_prompt ?? undefined,  // NEW
  };
}
```

- [ ] **Step 4: Typecheck backend**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/graphRowTypes.ts packages/backend/src/db/queries/nodeOperations.ts packages/backend/src/db/queries/graphAssemblers.ts
git commit -m "feat(backend): support output_prompt field in node CRUD"
```

---

## Chunk 2: API Runtime

### Task 5: Stable JSON hash utility

**Files:**
- Create: `packages/api/src/utils/stableJsonHash.ts`
- Create: `packages/api/src/utils/stableJsonHash.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/utils/stableJsonHash.test.ts
import { describe, expect, it } from '@jest/globals';

import { stableJsonStringify } from './stableJsonHash.js';

describe('stableJsonStringify', () => {
  it('sorts keys alphabetically', () => {
    const a = stableJsonStringify({ z: 1, a: 2 });
    const b = stableJsonStringify({ a: 2, z: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"z":1}');
  });

  it('sorts nested object keys', () => {
    const result = stableJsonStringify({ b: { z: 1, a: 2 }, a: 3 });
    expect(result).toBe('{"a":3,"b":{"a":2,"z":1}}');
  });

  it('handles arrays (preserves order)', () => {
    const result = stableJsonStringify({ items: [3, 1, 2] });
    expect(result).toBe('{"items":[3,1,2]}');
  });

  it('handles null and primitives', () => {
    expect(stableJsonStringify(null)).toBe('null');
    expect(stableJsonStringify('hello')).toBe('"hello"');
    expect(stableJsonStringify(42)).toBe('42');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=stableJsonHash`
Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

```ts
// packages/api/src/utils/stableJsonHash.ts

/** JSON.stringify with sorted keys at every nesting level for deterministic output. */
export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=stableJsonHash`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/stableJsonHash.ts packages/api/src/utils/stableJsonHash.test.ts
git commit -m "feat(api): add stableJsonStringify utility for deterministic dedup hashing"
```

---

### Task 6: outputSchemaToZod utility

**Files:**
- Create: `packages/api/src/utils/outputSchemaToZod.ts`
- Create: `packages/api/src/utils/outputSchemaToZod.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/src/utils/outputSchemaToZod.test.ts
import { describe, expect, it } from '@jest/globals';
import type { OutputSchemaField } from '@daviddh/graph-types';

import { outputSchemaToZod } from './outputSchemaToZod.js';

describe('outputSchemaToZod', () => {
  it('converts string fields', () => {
    const fields: OutputSchemaField[] = [
      { name: 'teamId', type: 'string', required: true },
    ];
    const schema = outputSchemaToZod(fields);
    const result = schema.safeParse({ teamId: 'abc' });
    expect(result.success).toBe(true);
  });

  it('rejects missing required field', () => {
    const fields: OutputSchemaField[] = [
      { name: 'teamId', type: 'string', required: true },
    ];
    const schema = outputSchemaToZod(fields);
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('allows null for optional fields', () => {
    const fields: OutputSchemaField[] = [
      { name: 'note', type: 'string', required: false },
    ];
    const schema = outputSchemaToZod(fields);
    const result = schema.safeParse({ note: null });
    expect(result.success).toBe(true);
  });

  it('converts enum fields', () => {
    const fields: OutputSchemaField[] = [
      { name: 'status', type: 'enum', required: true, enumValues: ['active', 'inactive'] },
    ];
    const schema = outputSchemaToZod(fields);
    expect(schema.safeParse({ status: 'active' }).success).toBe(true);
    expect(schema.safeParse({ status: 'unknown' }).success).toBe(false);
  });

  it('converts number and boolean fields', () => {
    const fields: OutputSchemaField[] = [
      { name: 'count', type: 'number', required: true },
      { name: 'active', type: 'boolean', required: true },
    ];
    const schema = outputSchemaToZod(fields);
    expect(schema.safeParse({ count: 5, active: true }).success).toBe(true);
  });

  it('converts nested object fields', () => {
    const fields: OutputSchemaField[] = [
      {
        name: 'address',
        type: 'object',
        required: true,
        properties: [
          { name: 'city', type: 'string', required: true },
          { name: 'zip', type: 'string', required: false },
        ],
      },
    ];
    const schema = outputSchemaToZod(fields);
    expect(schema.safeParse({ address: { city: 'NYC', zip: null } }).success).toBe(true);
  });

  it('converts array fields', () => {
    const fields: OutputSchemaField[] = [
      {
        name: 'tags',
        type: 'array',
        required: true,
        items: { name: 'tag', type: 'string', required: true },
      },
    ];
    const schema = outputSchemaToZod(fields);
    expect(schema.safeParse({ tags: ['a', 'b'] }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=outputSchemaToZod`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```ts
// packages/api/src/utils/outputSchemaToZod.ts
import type { OutputSchemaField } from '@daviddh/graph-types';
import { z } from 'zod';

const MIN_ENUM_VALUES = 1;

function fieldToZodType(field: OutputSchemaField): z.ZodTypeAny {
  const base = buildBaseType(field);
  return field.required ? base : base.nullable();
}

function buildBaseType(field: OutputSchemaField): z.ZodTypeAny {
  switch (field.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'enum':
      return buildEnumType(field.enumValues);
    case 'object':
      return buildObjectType(field.properties);
    case 'array':
      return buildArrayType(field.items);
    default:
      return z.unknown();
  }
}

function buildEnumType(enumValues: string[] | undefined): z.ZodTypeAny {
  if (enumValues === undefined || enumValues.length < MIN_ENUM_VALUES) return z.string();
  return z.enum(enumValues as [string, ...string[]]);
}

function buildObjectType(properties: OutputSchemaField[] | undefined): z.ZodTypeAny {
  if (properties === undefined) return z.object({});
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const prop of properties) {
    shape[prop.name] = fieldToZodType(prop);
  }
  return z.object(shape);
}

function buildArrayType(items: OutputSchemaField | undefined): z.ZodTypeAny {
  if (items === undefined) return z.array(z.unknown());
  return z.array(fieldToZodType(items));
}

/** Convert OutputSchemaField[] to a Zod object schema for structured output. */
export function outputSchemaToZod(fields: OutputSchemaField[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.name] = fieldToZodType(field);
  }
  return z.object(shape);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=outputSchemaToZod`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/outputSchemaToZod.ts packages/api/src/utils/outputSchemaToZod.test.ts
git commit -m "feat(api): add outputSchemaToZod utility for dynamic Zod schema generation"
```

---

### Task 7: Thread `structuredOutputs` through execution pipeline

**Files:**
- Modify: `packages/api/src/index.ts:20-59`
- Modify: `packages/api/src/core/types.ts:25-43`
- Modify: `packages/api/src/core/index.ts:21-48`
- Modify: `packages/api/src/core/indexHelpers.ts:140-146,186-229,241-274,283-292`

- [ ] **Step 1: Add structuredOutputs to CallAgentInput, CallAgentOutput, and NodeProcessingConfig**

In `packages/api/src/core/types.ts`:

```ts
export interface CallAgentInput {
  messages: Message[];
  tokensLog: ActionTokenUsage[];
  currentNode: string;
  indicatorOriginalId?: string;
  structuredOutputs: Record<string, unknown[]>;  // NEW
}

export interface CallAgentOutput {
  message: AssistantModelMessage | null;
  tokensLogs: ActionTokenUsage[];
  toolCalls: Array<TypedToolCall<Record<string, Tool>>>;
  visitedNodes: string[];
  parsedResults?: ParsedResult[];
  text?: string;
  debugMessages: Record<string, ModelMessage[][]>;
  structuredOutputs?: Array<{ nodeId: string; data: unknown }>;  // NEW
}
```

Also add `outputSchema` to `NodeProcessingConfig` (needed by `processStructuredOutputNode`):

```ts
import type { OutputSchemaField } from '@daviddh/graph-types';

export interface NodeProcessingConfig {
  kind: 'tool_call' | 'agent_decision' | 'user_reply' | 'structured_output' | undefined;  // UPDATED
  promptWithoutToolPreconditions: string;
  toolsByEdge: Record<
    string,
    {
      tools?: Record<string, Tool> | undefined;
      toolChoice?: ToolChoice<NoInfer<ToolSet>> | undefined;
    }
  >;
  nodes: Record<string, string>;
  outputSchema?: OutputSchemaField[];  // NEW — present when kind === 'structured_output'
}
```

- [ ] **Step 2: Add structuredOutputs to FlowState**

In `packages/api/src/core/indexHelpers.ts`, update `FlowState` (line 140):

```ts
interface FlowState {
  currentNodeID: string;
  nodeBeforeGlobal: string;
  parsedResults: ParsedResult[];
  visitedNodes: string[];
  allToolCalls: ToolCallsArray;
  structuredOutputs: Record<string, unknown[]>;         // NEW
  newStructuredOutputs: Array<{ nodeId: string; data: unknown }>;  // NEW — collected for return
}
```

- [ ] **Step 3: Update createInitialFlowState to accept structuredOutputs**

In `indexHelpers.ts`, update `createInitialFlowState` (line 283):

```ts
export function createInitialFlowState(input: CallAgentInput, graph: Graph): FlowState {
  const startNode = resolveStartNode(graph, input.currentNode);
  return {
    currentNodeID: startNode,
    nodeBeforeGlobal: startNode,
    parsedResults: [],
    visitedNodes: [],
    allToolCalls: [],
    structuredOutputs: { ...input.structuredOutputs },
    newStructuredOutputs: [],
  };
}
```

- [ ] **Step 4: Update FlowResult to include structuredOutputs**

```ts
export interface FlowResult {
  parsedResults: ParsedResult[];
  visitedNodes: string[];
  debugMessages: Record<string, ModelMessage[][]>;
  error: boolean;
  toolCalls: ToolCallsArray;
  newStructuredOutputs: Array<{ nodeId: string; data: unknown }>;  // NEW
}
```

- [ ] **Step 5: Thread through executeAgentFlowRecursive and processFlowStep**

In `processFlowStep`, pass `structuredOutputs` and `newStructuredOutputs` through `newState`. In `executeAgentFlowRecursive`, include `newStructuredOutputs` in the return.

- [ ] **Step 6: Update execute() and executeWithCallbacks() signatures**

In `packages/api/src/index.ts`, **do NOT change the positional parameters** of `execute()` — instead add `structuredOutputs` to the `CallAgentInput` construction only. The existing positional API stays:

```ts
export const execute = async (
  context: Context,
  messages: Message[],
  currentNode?: string,
  logger?: Logger
): Promise<CallAgentOutput | null> => {
  if (logger !== undefined) setLogger(logger);
  return await Pipeline.executeSingleStep(context, callAgentStep, {
    messages,
    tokensLog: [],
    currentNode: currentNode ?? INITIAL_STEP_NODE,
    structuredOutputs: {},  // NEW — always starts empty for direct execute()
  });
};
```

For `executeWithCallbacks`, add `structuredOutputs` to `ExecuteWithCallbacksOptions` and thread it through:

```ts
export interface ExecuteWithCallbacksOptions {
  context: Context;
  messages: Message[];
  currentNode?: string;
  logger?: Logger;
  toolsOverride?: Record<string, Tool>;
  onNodeVisited?: (nodeId: string) => void;
  onNodeProcessed?: (event: NodeProcessedEvent) => void;
  structuredOutputs?: Record<string, unknown[]>;  // NEW
}

export const executeWithCallbacks = async (
  options: ExecuteWithCallbacksOptions
): Promise<CallAgentOutput | null> => {
  if (options.logger !== undefined) setLogger(options.logger);
  const context: Context = {
    ...options.context,
    toolsOverride: options.toolsOverride,
    onNodeVisited: options.onNodeVisited,
    onNodeProcessed: options.onNodeProcessed,
  };
  return await Pipeline.executeSingleStep(context, callAgentStep, {
    messages: options.messages,
    tokensLog: [],
    currentNode: options.currentNode ?? INITIAL_STEP_NODE,
    structuredOutputs: options.structuredOutputs ?? {},  // NEW
  });
};
```

**Call-site audit:** `execute()` is called from tests and external consumers. Since we didn't change its positional signature, no call-sites break. `executeWithCallbacks()` uses an options bag, so the new optional field is backward-compatible. The one call-site in `packages/backend/src/routes/simulateHandler.ts` (line 68) needs `structuredOutputs` added — see Task 18 for that.

- [ ] **Step 7: Update executeFlow to include structuredOutputs in output**

In `packages/api/src/core/index.ts`, add `structuredOutputs` to the return:

```ts
async function executeFlow(context: Context, input: CallAgentInput): Promise<CallAgentOutput> {
  const debugMessages: Record<string, ModelMessage[][]> = {};
  const initialState = createInitialFlowState(input, context.graph);

  const { parsedResults, visitedNodes, error, toolCalls, newStructuredOutputs } =
    await executeAgentFlowRecursive(context, input, debugMessages, initialState);

  if (error) return handleError(context, input);

  const lastMessage = extractLastMessage(input);
  const [lastResult] = parsedResults.slice(-LAST_INDEX_OFFSET);

  return {
    message: lastMessage,
    tokensLogs: input.tokensLog,
    toolCalls,
    parsedResults,
    visitedNodes,
    text: lastResult?.messageToUser,
    debugMessages,
    structuredOutputs: newStructuredOutputs.length > 0 ? newStructuredOutputs : undefined,
  };
}
```

- [ ] **Step 8: Typecheck API package**

Run: `npm run typecheck -w packages/api`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/index.ts packages/api/src/core/types.ts packages/api/src/core/index.ts packages/api/src/core/indexHelpers.ts
git commit -m "feat(api): thread structuredOutputs through execution pipeline"
```

---

### Task 8: Reference resolver for tool field prompts

**Files:**
- Create: `packages/api/src/stateMachine/referenceResolver.ts`
- Create: `packages/api/src/stateMachine/referenceResolver.test.ts`
- Modify: `packages/api/src/stateMachine/index.ts:44-54`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/src/stateMachine/referenceResolver.test.ts
import { describe, expect, it } from '@jest/globals';

import { resolveReferenceValue, buildResolvedFieldsPrompt } from './referenceResolver.js';

describe('resolveReferenceValue', () => {
  const outputs: Record<string, unknown[]> = {
    nodeA: [{ teamId: 'abc-123', note: null }],
    nodeB: [{ teamId: 'def-456' }, { teamId: 'ghi-789' }],
  };

  it('resolves single value', () => {
    const result = resolveReferenceValue(
      { type: 'reference', nodeId: 'nodeA', path: 'teamId' },
      outputs
    );
    expect(result).toEqual({ kind: 'single', value: 'abc-123' });
  });

  it('resolves multiple values from cycles', () => {
    const result = resolveReferenceValue(
      { type: 'reference', nodeId: 'nodeB', path: 'teamId' },
      outputs
    );
    expect(result).toEqual({ kind: 'multiple', values: ['def-456', 'ghi-789'] });
  });

  it('falls back when node not visited', () => {
    const result = resolveReferenceValue(
      {
        type: 'reference',
        nodeId: 'nodeC',
        path: 'teamId',
        fallbacks: [{ type: 'fixed', value: 'fallback-val' }],
      },
      outputs
    );
    expect(result).toEqual({ kind: 'single', value: 'fallback-val' });
  });

  it('falls back when value is null', () => {
    const result = resolveReferenceValue(
      {
        type: 'reference',
        nodeId: 'nodeA',
        path: 'note',
        fallbacks: [{ type: 'fixed', value: 'default-note' }],
      },
      outputs
    );
    expect(result).toEqual({ kind: 'single', value: 'default-note' });
  });
});

describe('buildResolvedFieldsPrompt', () => {
  it('builds prompt for fixed fields', () => {
    const fields: Record<string, ToolFieldValue> = {
      team_id: { type: 'fixed', value: 'fixed-val' },
    };
    const prompt = buildResolvedFieldsPrompt(fields, {});
    expect(prompt).toContain('team_id: "fixed-val"');
    expect(prompt).toContain('EXACT values');
  });

  it('builds prompt for single and multi reference values', () => {
    const outputs: Record<string, unknown[]> = {
      nodeA: [{ teamId: 'abc' }],
      nodeB: [{ ts: '1' }, { ts: '2' }],
    };
    const fields: Record<string, ToolFieldValue> = {
      team_id: { type: 'reference', nodeId: 'nodeA', path: 'teamId' },
      timestamp: { type: 'reference', nodeId: 'nodeB', path: 'ts' },
    };
    const prompt = buildResolvedFieldsPrompt(fields, outputs);
    expect(prompt).toContain('team_id: "abc"');
    expect(prompt).toContain('timestamp: one of');
  });

  it('builds prompt mixing fixed and reference fields', () => {
    const outputs: Record<string, unknown[]> = { nodeA: [{ teamId: 'abc' }] };
    const fields: Record<string, ToolFieldValue> = {
      team_id: { type: 'reference', nodeId: 'nodeA', path: 'teamId' },
      region: { type: 'fixed', value: 'us-east-1' },
    };
    const prompt = buildResolvedFieldsPrompt(fields, outputs);
    expect(prompt).toContain('team_id: "abc"');
    expect(prompt).toContain('region: "us-east-1"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/api -- --testPathPattern=referenceResolver`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```ts
// packages/api/src/stateMachine/referenceResolver.ts
import type { ToolFieldValue } from '@src/types/graph.js';

import { stableJsonStringify } from '@src/utils/stableJsonHash.js';

const EMPTY = 0;
const SINGLE = 1;

interface SingleResolution { kind: 'single'; value: unknown }
interface MultipleResolution { kind: 'multiple'; values: unknown[] }
type Resolution = SingleResolution | MultipleResolution;

export function resolveReferenceValue(
  field: ToolFieldValue,
  structuredOutputs: Record<string, unknown[]>
): Resolution | null {
  if (field.type === 'fixed') return { kind: 'single', value: field.value };
  return resolveReference(field, structuredOutputs);
}

function resolveReference(
  field: Extract<ToolFieldValue, { type: 'reference' }>,
  outputs: Record<string, unknown[]>
): Resolution | null {
  const entries = outputs[field.nodeId];
  if (entries === undefined || entries.length === EMPTY) {
    return tryFallbacks(field.fallbacks, outputs);
  }

  const values = extractAndDeduplicate(entries, field.path);
  if (values.length === EMPTY) return tryFallbacks(field.fallbacks, outputs);
  if (values.length === SINGLE) return { kind: 'single', value: values[EMPTY] };
  return { kind: 'multiple', values };
}

function extractAndDeduplicate(entries: unknown[], path: string): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const val = (entry as Record<string, unknown>)[path];
    if (val === null || val === undefined) continue;
    const hash = stableJsonStringify(val);
    if (!seen.has(hash)) {
      seen.add(hash);
      result.push(val);
    }
  }
  return result;
}

function tryFallbacks(
  fallbacks: ToolFieldValue[] | undefined,
  outputs: Record<string, unknown[]>
): Resolution | null {
  if (fallbacks === undefined) return null;
  for (const fb of fallbacks) {
    const result = resolveReferenceValue(fb, outputs);
    if (result !== null) return result;
  }
  return null;
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
}

export function buildResolvedFieldsPrompt(
  toolFields: Record<string, ToolFieldValue>,
  structuredOutputs: Record<string, unknown[]>
): string {
  const singleLines: string[] = [];
  const multiLines: string[] = [];

  for (const [name, field] of Object.entries(toolFields)) {
    if (field.type === 'fixed') {
      singleLines.push(`- ${name}: "${field.value}"`);
      continue;
    }
    const resolution = resolveReferenceValue(field, structuredOutputs);
    if (resolution === null) continue;
    if (resolution.kind === 'single') {
      singleLines.push(`- ${name}: ${formatValue(resolution.value)}`);
    } else {
      multiLines.push(`- ${name}: one of [${resolution.values.map(formatValue).join(', ')}]`);
    }
  }

  const parts: string[] = [];
  if (singleLines.length > EMPTY) {
    parts.push(`\n\nFor the following parameters, use these EXACT values:\n${singleLines.join('\n')}`);
  }
  if (multiLines.length > EMPTY) {
    parts.push(
      `\n\nFor the following parameters, multiple values are available from different executions. Choose the most appropriate based on context:\n${multiLines.join('\n')}`
    );
  }
  return parts.join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/api -- --testPathPattern=referenceResolver`
Expected: PASS

- [ ] **Step 5: Update buildFixedFieldsPrompt to use reference resolver**

In `packages/api/src/stateMachine/index.ts`, replace the current `buildFixedFieldsPrompt` (lines 44-54) with a call to the reference resolver:

```ts
import { buildResolvedFieldsPrompt } from './referenceResolver.js';

function buildFixedFieldsPrompt(
  toolFields: Record<string, ToolFieldValue> | undefined,
  structuredOutputs?: Record<string, unknown[]>
): string {
  if (toolFields === undefined) return '';
  return buildResolvedFieldsPrompt(toolFields, structuredOutputs ?? {});
}
```

Also update the threading chain concretely:

1. **`buildFixedFieldsPrompt`** now delegates to `buildResolvedFieldsPrompt`, which handles both fixed and reference fields.

2. **`buildToolCallOptions`** — add `structuredOutputs` to `BuildToolCallOptionsParams`:

```ts
interface BuildToolCallOptionsParams {
  // ...existing fields
  structuredOutputs?: Record<string, unknown[]>;  // NEW
}

const buildToolCallOptions = (params: BuildToolCallOptionsParams): SMNextOptions => {
  // ...existing code
  prompt += buildFixedFieldsPrompt(toolFields, params.structuredOutputs);
  // ...rest unchanged
};
```

3. **`getNextOptions`** — add `structuredOutputs` parameter and pass to `buildToolCallOptions`:

```ts
export const getNextOptions = async (
  graph: Graph,
  context: Context,
  currentNode: string,
  toolsOverride?: Record<string, Tool>,
  structuredOutputs?: Record<string, unknown[]>  // NEW
): Promise<SMNextOptions> => {
  // ...existing code
  if (toolCall !== undefined) {
    return buildToolCallOptions({
      node, edges, toolsByEdge, nodes,
      toolCallValue: toolCall.value,
      toolDescription: toolCall.description,
      toolFields: toolCall.toolFields,
      nextNode: firstEdgeEntry.to,
      structuredOutputs,  // NEW
    });
  }
  // ...rest unchanged
};
```

4. **`buildNextAgentConfig`** — add `structuredOutputs` to the options parameter and pass to `getNextOptions`:

```ts
export const buildNextAgentConfig = async (
  graph: Graph,
  context: Context,
  cn?: string,
  options?: { logger?: Logger; toolsOverride?: Record<string, Tool>; structuredOutputs?: Record<string, unknown[]> }
): Promise<SMConfig> => {
  // ...existing code
  const nextOptions = await getNextOptions(graph, context, currentNode, options?.toolsOverride, options?.structuredOutputs);
  // Add outputSchema to config return when present:
  return { ...promptConfig, outputSchema: nextOptions.outputSchema };
};
```

5. **`getNodeConfig` in `indexHelpers.ts`** — pass `structuredOutputs` from `FlowState`:

```ts
async function getNodeConfig(
  context: Context,
  currentNodeID: string,
  nodeBeforeGlobal: string,
  structuredOutputs?: Record<string, unknown[]>
): Promise<NodeProcessingConfig> {
  const isGlobal = isGlobalNode(context, currentNodeID);
  if (isGlobal) return buildGlobalNodeConfig(context, nodeBeforeGlobal, currentNodeID);
  return await buildNextAgentConfig(context.graph, context, currentNodeID, {
    toolsOverride: context.toolsOverride,
    structuredOutputs,
  });
}
```

- [ ] **Step 6: Typecheck and run tests**

Run: `npm run typecheck -w packages/api && npm run test -w packages/api`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/stateMachine/referenceResolver.ts packages/api/src/stateMachine/referenceResolver.test.ts packages/api/src/stateMachine/index.ts
git commit -m "feat(api): add reference resolver and integrate into tool field prompt builder"
```

---

### Task 9: processStructuredOutputNode and dynamic model caller

**Files:**
- Create: `packages/api/src/core/structuredOutputProcessor.ts`
- Modify: `packages/api/src/core/modelCaller.ts:82-112`
- Modify: `packages/api/src/core/indexHelpers.ts:120-138`
- Modify: `packages/api/src/stateMachine/index.ts:113-159`
- Modify: `packages/api/src/types/stateMachine.ts:12-31`

- [ ] **Step 1: Add `structured_output` kind to SMNextOptions and SMConfig**

In `packages/api/src/types/stateMachine.ts`:

```ts
import type { OutputSchemaField } from '@daviddh/graph-types';

export type NodeKind = 'tool_call' | 'agent_decision' | 'user_reply' | 'structured_output';

export interface SMNextOptions {
  edges: Edge[];
  node: Node;
  prompt: string;
  promptWithoutToolPreconditions: string;
  toolsByEdge: ToolsByEdge;
  nextNode?: string;
  kind: NodeKind;
  nodes: Record<string, string>;
  outputSchema?: OutputSchemaField[];  // NEW — present when kind === 'structured_output'
}

export interface SMConfig {
  prompt: string;
  promptWithoutToolPreconditions: string;
  toolsByEdge: ToolsByEdge;
  node: Node;
  nextNode?: string;
  kind: NodeKind;
  nodes: Record<string, string>;
  outputSchema?: OutputSchemaField[];  // NEW
}
```

- [ ] **Step 2: Update getNextOptions to check outputSchemaId before terminal return**

In `packages/api/src/stateMachine/index.ts`, update `getNextOptions` (line 113-159). Add the outputSchemaId check **before** the terminal node early return:

```ts
export const getNextOptions = async (
  graph: Graph,
  context: Context,
  currentNode: string,
  toolsOverride?: Record<string, Tool>,
  structuredOutputs?: Record<string, unknown[]>
): Promise<SMNextOptions> => {
  const node = getNode(graph, currentNode);

  // Check outputSchemaId BEFORE terminal-node early return
  if (node.outputSchema !== undefined && node.outputSchema.length > 0) {
    const edges = await getEdgesFromNode(graph, context, currentNode);
    const [firstEdge] = edges;
    return {
      node,
      edges,
      prompt: node.outputPrompt ?? '',
      promptWithoutToolPreconditions: node.outputPrompt ?? '',
      toolsByEdge: {},
      nextNode: firstEdge?.to,
      kind: 'structured_output',
      nodes: firstEdge !== undefined ? { [firstEdge.to]: firstEdge.to } : {},
      outputSchema: node.outputSchema,
    };
  }

  const edges = await getEdgesFromNode(graph, context, currentNode);
  // ...rest of existing logic unchanged
};
```

**Note:** In the API package, the runtime uses `RuntimeNode` which has `outputSchema: OutputSchemaField[] | undefined` (inline, not an ID reference). The `outputSchemaId` → `outputSchema` resolution happens at publish time in the SQL function.

- [ ] **Step 3: Update executeModelCall to accept an optional dynamic schema**

In `packages/api/src/core/modelCaller.ts`, change `executeModelCall` to accept an optional schema parameter. Use `z.ZodTypeAny` (not `z.ZodType`) for the generic parameter — `z.ZodType` is too narrow and doesn't accept `z.ZodObject` without explicit generic args:

```ts
async function executeModelCall(
  config: ToolModelConfig & { model: LanguageModel },
  expectedTool: string | undefined,
  outputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>,
  timeoutMs = MODEL_CALL_TIMEOUT_MS
): Promise<ModelCallResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => { controller.abort(); }, timeoutMs);

  try {
    const configWithAbort = { ...config, abortSignal: controller.signal };

    if (expectedTool !== undefined && expectedTool !== '') {
      const result = await generateText(configWithAbort);
      return toModelCallResult(result);
    }

    const schema = outputSchema ?? z.object({
      nextNodeID: z.string().nonempty(),
      messageToUser: z.string().nonempty(),
    });

    const result = await generateText({
      ...configWithAbort,
      output: Output.object({ schema }),
    });
    return toModelCallResult(result);
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Thread the `outputSchema` parameter through the full call chain — update each function signature:

```ts
// executeAttempt — add outputSchema parameter
async function executeAttempt(
  ctx: ModelCallContext,
  config: ToolModelConfig,
  expectedTool: string | undefined,
  state: RetryState,
  outputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>
): Promise<AttemptResult> {
  // ...existing code...
  const result = await executeModelCall(newConfig, expectedTool, outputSchema);
  // ...rest unchanged
}

// executeWithRetries — add outputSchema parameter
async function executeWithRetries(
  ctx: ModelCallContext,
  config: ToolModelConfig,
  expectedTool: string | undefined,
  state: RetryState,
  outputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>
): Promise<ModelCallResult> {
  const result = await executeAttempt(ctx, config, expectedTool, state, outputSchema);
  // ...rest unchanged (thread outputSchema in recursive call too)
}

// callModel — add outputSchema as 5th parameter (public API)
export async function callModel(
  context: Context,
  config: ToolModelConfig,
  expectedTool: string | undefined,
  model: LanguageModel,
  outputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>
): Promise<ModelCallResult> {
  // ...existing setup...
  return await executeWithRetries(ctx, config, expectedTool, initialState, outputSchema);
}
```

**Note:** Task 6 already defines `outputSchemaToZod` with `z.ZodTypeAny` throughout (return type `z.ZodObject<Record<string, z.ZodTypeAny>>`). No changes needed to Task 6's code — the `callModel` signature here is the only new `z.ZodTypeAny` usage.

- [ ] **Step 4: Create processStructuredOutputNode**

```ts
// packages/api/src/core/structuredOutputProcessor.ts
import type { ModelMessage } from 'ai';
import type { OutputSchemaField } from '@daviddh/graph-types';

import type { ParsedResult } from '@src/types/ai/ai.js';
import type { Context } from '@src/types/tools.js';
import { formatMessages } from '@src/utils/messages.js';
import { outputSchemaToZod } from '@src/utils/outputSchemaToZod.js';
import { stableJsonStringify } from '@src/utils/stableJsonHash.js';

import { getModel } from './agentExecutorHelpers.js';
import { getConfig } from './config.js';
import { callModel } from './modelCaller.js';
import type { ToolCallsArray } from './nodeProcessorHelpers.js';
import { accumulateTokens } from './tokenTracker.js';
import type { CallAgentInput, NodeProcessingConfig } from './types.js';

const LAST_INDEX_OFFSET = 1;
const EMPTY = 0;

interface StructuredOutputResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  toolCalls: ToolCallsArray;
  structuredOutput: { nodeId: string; data: unknown };
}

interface ProcessStructuredOutputParams {
  context: Context;
  config: NodeProcessingConfig;
  input: CallAgentInput;
  currentNodeID: string;
  debugMessages: Record<string, ModelMessage[][]>;
}

export async function processStructuredOutputNode(
  params: ProcessStructuredOutputParams
): Promise<StructuredOutputResult> {
  const { context, config, input, currentNodeID, debugMessages } = params;
  const { model } = getModel(context.apiKey);

  const zodSchema = outputSchemaToZod(config.outputSchema ?? []);
  const cleanMessages = formatMessages(input.messages, [config.promptWithoutToolPreconditions]);
  const modelConfig = getConfig({ model, cleanMessages, toolChoice: 'none' });

  const result = await callModel(context, modelConfig, undefined, model, zodSchema);
  const output = result.output ?? {};

  // Track token usage (same pattern as processReplyNode)
  const { tokensLog } = input;
  const lastLog = tokensLog.at(-LAST_INDEX_OFFSET);
  if (lastLog !== undefined && result.usage !== undefined) {
    const usage = result.usage as Record<string, number>;
    accumulateTokens(lastLog.tokens, {
      input: usage.inputTokens ?? usage.promptTokens ?? EMPTY,
      output: usage.outputTokens ?? usage.completionTokens ?? EMPTY,
      cached: usage.cachedInputTokens ?? EMPTY,
    });
  }

  // Store debug messages (same pattern as processReplyNode)
  if (result.response?.messages !== undefined) {
    Object.assign(debugMessages, { [currentNodeID]: [result.response.messages] });
  }

  // Add structured output to conversation history per design spec section 4.3:
  // "Structured output nodes DO add to the message history"
  // Append an assistant message summarizing the extraction so downstream nodes see it.
  const outputSummary = JSON.stringify(output);
  input.messages.push({
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: `[Structured output from ${currentNodeID}]: ${outputSummary}` }],
    },
  } as Message);

  // Determine next node (single outgoing edge or terminal)
  const nextNodeKeys = Object.keys(config.nodes);
  const [firstNextNode] = nextNodeKeys;
  const nextNodeID = firstNextNode ?? '';

  const parsedResult: ParsedResult = {
    nextNodeID: nextNodeID,
    messageToUser: undefined,
  };

  return {
    parsedResult,
    nextNodeID,
    toolCalls: [],
    structuredOutput: { nodeId: currentNodeID, data: output },
  };
}
```

- [ ] **Step 5: Integrate into processNode dispatch**

In `packages/api/src/core/indexHelpers.ts`, update `processNode` (line 120) to check for structured_output kind:

```ts
export async function processNode(params: ProcessNodeParams): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, nodeBeforeGlobal } = params;
  const isGlobal = isGlobalNode(context, currentNodeID);

  input.tokensLog.push({ action: currentNodeID, tokens: createEmptyTokenLog() });

  const config = await getNodeConfig(context, currentNodeID, nodeBeforeGlobal);

  if (config.kind === 'structured_output') {
    return await processStructuredOutputCallNode(params, config);
  }

  if (config.kind === 'tool_call') {
    return await processToolCallNode(params, config, isGlobal);
  }

  return await processReplyCallNode(params, config);
}
```

**Step 5a: Extend `ProcessNodeParams` and `ProcessNodeResult`**

First, add `structuredOutputs` to `ProcessNodeParams` so it's in scope for `processNode`:

```ts
interface ProcessNodeParams {
  context: Context;
  input: CallAgentInput;
  currentNodeID: string;
  nodeBeforeGlobal: string;
  debugMessages: Record<string, ModelMessage[][]>;
  structuredOutputs?: Record<string, unknown[]>;  // NEW
}

interface ProcessNodeResult {
  parsedResult: ParsedResult;
  nextNodeID: string;
  error: boolean;
  toolCalls: ToolCallsArray;
  structuredOutput?: { nodeId: string; data: unknown };  // NEW — optional, only set for structured_output nodes
}
```

**Step 5b: Add `processStructuredOutputCallNode`**

```ts
import { processStructuredOutputNode } from './structuredOutputProcessor.js';
import { stableJsonStringify } from '@src/utils/stableJsonHash.js';

async function processStructuredOutputCallNode(
  params: ProcessNodeParams,
  config: NodeProcessingConfig
): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, debugMessages } = params;
  const result = await processStructuredOutputNode({
    context, config, input, currentNodeID, debugMessages,
  });
  return {
    parsedResult: result.parsedResult,
    nextNodeID: result.nextNodeID,
    error: false,
    toolCalls: result.toolCalls,
    structuredOutput: result.structuredOutput,
  };
}
```

**Step 5c: Update `processNode` to use `structuredOutputs` from params (not `state`)**

```ts
export async function processNode(params: ProcessNodeParams): Promise<ProcessNodeResult> {
  const { context, input, currentNodeID, nodeBeforeGlobal, structuredOutputs } = params;
  const isGlobal = isGlobalNode(context, currentNodeID);
  input.tokensLog.push({ action: currentNodeID, tokens: createEmptyTokenLog() });
  const config = await getNodeConfig(context, currentNodeID, nodeBeforeGlobal, structuredOutputs);
  // ...existing logging...

  if (config.kind === 'structured_output') {
    return await processStructuredOutputCallNode(params, config);
  }
  if (config.kind === 'tool_call') {
    return await processToolCallNode(params, config, isGlobal);
  }
  return await processReplyCallNode(params, config);
}
```

**Step 5d: Update `processNodeTimed` return type to match widened `ProcessNodeResult`**

Since `ProcessNodeResult` now includes the optional `structuredOutput` field, `processNodeTimed` automatically picks it up:

```ts
async function processNodeTimed(
  params: ProcessNodeParams
): Promise<ProcessNodeResult & { durationMs: number }> {
  const startTime = Date.now();
  const result = await processNode(params);
  return { ...result, durationMs: Date.now() - startTime };
}
```

**Step 5e: Update `emitNodeProcessed` to include `structuredOutput`**

```ts
function emitNodeProcessed(params: EmitNodeProcessedParams): void {
  const { context, input, nodeId, parsedResult, toolCalls, durationMs, structuredOutput } = params;
  if (context.onNodeProcessed === undefined) return;
  const lastLog = input.tokensLog.at(-LAST_INDEX_OFFSET);
  const tokens = lastLog?.tokens ?? createEmptyTokenLog();
  context.onNodeProcessed({ nodeId, text: parsedResult.messageToUser, toolCalls, tokens, durationMs, structuredOutput });
}

// Update EmitNodeProcessedParams to include structuredOutput:
interface EmitNodeProcessedParams {
  context: Context;
  input: CallAgentInput;
  nodeId: string;
  parsedResult: ParsedResult;
  toolCalls: ToolCallsArray;
  durationMs: number;
  structuredOutput?: { nodeId: string; data: unknown };  // NEW
}
```

**Step 5f: Ensure `SMConfig` → `NodeProcessingConfig` mapping preserves `outputSchema`**

`getNodeConfig` returns `NodeProcessingConfig` but calls `buildNextAgentConfig` which returns `SMConfig`. These types are structurally compatible because TypeScript uses structural typing. Both now have an `outputSchema?: OutputSchemaField[]` field. The `buildNextAgentConfig` return already includes `outputSchema` from `nextOptions.outputSchema`. When `getNodeConfig` returns this `SMConfig` value as a `NodeProcessingConfig`, the `outputSchema` field is preserved because it's structurally present.

To make this explicit and avoid relying on structural coincidence, update `getNodeConfig` to be clear:

```ts
async function getNodeConfig(
  context: Context,
  currentNodeID: string,
  nodeBeforeGlobal: string,
  structuredOutputs?: Record<string, unknown[]>
): Promise<NodeProcessingConfig> {
  const isGlobal = isGlobalNode(context, currentNodeID);
  if (isGlobal) return buildGlobalNodeConfig(context, nodeBeforeGlobal, currentNodeID);
  const config = await buildNextAgentConfig(context.graph, context, currentNodeID, {
    toolsOverride: context.toolsOverride,
    structuredOutputs,
  });
  // Explicitly map SMConfig → NodeProcessingConfig, preserving outputSchema
  return {
    kind: config.kind,
    promptWithoutToolPreconditions: config.promptWithoutToolPreconditions,
    toolsByEdge: config.toolsByEdge,
    nodes: config.nodes,
    outputSchema: config.outputSchema,
  };
}
```

- [ ] **Step 6: Update processFlowStep to accumulate structured outputs**

In `processFlowStep`, after processing a node, accumulate structured outputs with deduplication:

```ts
async function processFlowStep(
  context: Context,
  input: CallAgentInput,
  debugMessages: Record<string, ModelMessage[][]>,
  state: FlowState
): Promise<{ state: FlowState; error: boolean; shouldContinue: boolean; isTerminal?: boolean }> {
  const { currentNodeID, nodeBeforeGlobal, parsedResults, visitedNodes, allToolCalls } = state;
  visitedNodes.push(currentNodeID);
  context.onNodeVisited?.(currentNodeID);

  const result = await processNodeTimed({
    context, input, currentNodeID, nodeBeforeGlobal, debugMessages,
    structuredOutputs: state.structuredOutputs,  // Pass from FlowState into ProcessNodeParams
  });

  if (result.error) {
    return { state, error: true, shouldContinue: false };
  }

  const { parsedResult, nextNodeID, toolCalls, durationMs, structuredOutput } = result;
  emitNodeProcessed({ context, input, nodeId: currentNodeID, parsedResult, toolCalls, durationMs, structuredOutput });

  if (toolCalls.length > EMPTY_LENGTH) {
    allToolCalls.push(...toolCalls);
  }

  // Accumulate structured outputs with deduplication
  const { structuredOutputs, newStructuredOutputs } = state;
  if (result.structuredOutput !== undefined) {
    const { nodeId, data } = result.structuredOutput;
    const existing = structuredOutputs[nodeId] ?? [];
    const hash = stableJsonStringify(data);
    const alreadyExists = existing.some((e) => stableJsonStringify(e) === hash);
    if (!alreadyExists) {
      structuredOutputs[nodeId] = [...existing, data];
    }
    newStructuredOutputs.push(result.structuredOutput);
  }

  // ...rest of existing logic (terminal check, newState construction) unchanged,
  // except newState now includes structuredOutputs and newStructuredOutputs
  const newState: FlowState = {
    currentNodeID: nextNodeID,
    nodeBeforeGlobal: newNodeBeforeGlobal,
    parsedResults,
    visitedNodes,
    allToolCalls,
    structuredOutputs,
    newStructuredOutputs,
  };
  // ...
}
```

- [ ] **Step 7: Typecheck and run all tests**

Run: `npm run typecheck -w packages/api && npm run test -w packages/api`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/core/structuredOutputProcessor.ts packages/api/src/core/modelCaller.ts packages/api/src/core/indexHelpers.ts packages/api/src/stateMachine/index.ts packages/api/src/types/stateMachine.ts
git commit -m "feat(api): add processStructuredOutputNode and dynamic Zod schema in model caller"
```

---

## Chunk 3: Web Algorithms

### Task 10: Type compatibility checker

**Files:**
- Create: `packages/web/app/utils/typeCompatibility.ts`

- [ ] **Step 1: Create type compatibility module**

```ts
// packages/web/app/utils/typeCompatibility.ts
import type { OutputSchemaField } from '@daviddh/graph-types';

/** Represents a JSON Schema property from a tool's inputSchema. */
export interface ToolInputProperty {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
  properties?: Record<string, ToolInputProperty>;
  items?: ToolInputProperty;
}

type FieldType = OutputSchemaField['type'];

const JSON_SCHEMA_TO_FIELD_TYPE: Record<string, FieldType | undefined> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
};

function resolveTargetType(prop: ToolInputProperty): FieldType | null {
  if (prop.type === undefined) return null;
  if (prop.enum !== undefined && prop.enum.length > 0) return 'enum';
  return JSON_SCHEMA_TO_FIELD_TYPE[prop.type] ?? null;
}

function isEnumSubset(source: string[], target: string[]): boolean {
  const targetSet = new Set(target);
  return source.every((v) => targetSet.has(v));
}

function checkArrayCompat(source: OutputSchemaField, target: ToolInputProperty): boolean {
  if (source.items === undefined || target.items === undefined) return true;
  const sourceItemType = source.items.type;
  const targetItemType = resolveTargetType(target.items);
  if (targetItemType === null) return false;
  return sourceItemType === targetItemType;
}

/** Check if source output field is type-compatible with target tool input. */
export function isTypeCompatible(source: OutputSchemaField, target: ToolInputProperty): boolean {
  const sourceType = source.type;
  const targetType = resolveTargetType(target);
  if (targetType === null) return false;

  if (sourceType === targetType) {
    if (sourceType === 'enum') return checkEnumCompat(source, target);
    if (sourceType === 'array') return checkArrayCompat(source, target);
    return true;
  }

  // enum → string is always safe
  if (sourceType === 'enum' && targetType === 'string') return true;

  return false;
}

function checkEnumCompat(source: OutputSchemaField, target: ToolInputProperty): boolean {
  const sourceVals = source.enumValues ?? [];
  const targetVals = target.enum ?? [];
  if (targetVals.length === 0) return true;
  return isEnumSubset(sourceVals, targetVals);
}

/** Filter output schema fields to those compatible with a target tool input property. */
export function getCompatibleFields(
  fields: OutputSchemaField[],
  target: ToolInputProperty
): OutputSchemaField[] {
  return fields.filter((f) => isTypeCompatible(f, target));
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/utils/typeCompatibility.ts
git commit -m "feat(web): add type compatibility checker for output-to-tool mapping"
```

---

### Task 11: Path coverage algorithm (dominator check + upstream discovery)

**Files:**
- Create: `packages/web/app/utils/pathCoverage.ts`

- [ ] **Step 1: Create path coverage module**

```ts
// packages/web/app/utils/pathCoverage.ts
import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from './graphTransformers';

type FlowNode = RFFlowNode<RFNodeData>;
type FlowEdge = RFFlowEdge<RFEdgeData>;

const START_NODE_ID = 'INITIAL_STEP';
const EMPTY = 0;

/**
 * Check if `target` is reachable from START when `excludedNode` is removed.
 * If NOT reachable → `excludedNode` dominates `target` (100% coverage).
 */
export function isDominator(
  edges: FlowEdge[],
  excludedNode: string,
  target: string
): boolean {
  const reachable = bfsReachable(edges, START_NODE_ID, excludedNode);
  return !reachable.has(target);
}

function bfsReachable(edges: FlowEdge[], start: string, exclude: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [start];

  while (queue.length > EMPTY) {
    const current = queue.shift();
    if (current === undefined || visited.has(current) || current === exclude) continue;
    visited.add(current);
    for (const edge of edges) {
      if (edge.source === current && !visited.has(edge.target) && edge.target !== exclude) {
        queue.push(edge.target);
      }
    }
  }
  return visited;
}

/**
 * Find all output-schema nodes upstream of `sourceNode`.
 * A node R is upstream if R is an ancestor of sourceNode (reachable via reverse edges).
 */
export function findUpstreamOutputNodes(
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceNode: string
): FlowNode[] {
  const ancestors = reverseBfsAncestors(edges, sourceNode);
  return nodes.filter(
    (n) => n.id !== sourceNode && ancestors.has(n.id) && n.data.outputSchemaId !== undefined
  );
}

function reverseBfsAncestors(edges: FlowEdge[], target: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [target];

  while (queue.length > EMPTY) {
    const current = queue.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }
  return visited;
}

export interface CoverageResult {
  covered: boolean;
  reason?: string;
}

/**
 * Validate path coverage for a reference from target T to output node R.
 * Uses the dominator check algorithm from the design spec (section 3.1-3.2).
 */
export function checkPathCoverage(
  edges: FlowEdge[],
  target: string,
  refNodeId: string
): CoverageResult {
  if (isDominator(edges, refNodeId, target)) {
    return { covered: true };
  }
  return {
    covered: false,
    reason: `Some paths to this node don't pass through "${refNodeId}"`,
  };
}

/**
 * Validate a fallback reference in the reduced graph.
 * Per spec section 3.2:
 * - If R's field is REQUIRED: remove R from graph (paths through R have a value).
 * - If R's field is OPTIONAL: validate in full graph (R may be on path but produce null).
 */
export function checkFallbackCoverage(
  edges: FlowEdge[],
  target: string,
  primaryRefNodeId: string,
  fallbackNodeId: string,
  primaryFieldRequired: boolean
): CoverageResult {
  if (primaryFieldRequired) {
    // Remove primary ref node — only consider paths that bypass it
    const reducedEdges = edges.filter(
      (e) => e.source !== primaryRefNodeId && e.target !== primaryRefNodeId
    );
    if (isDominator(reducedEdges, fallbackNodeId, target)) {
      return { covered: true };
    }
    return {
      covered: false,
      reason: `Fallback node "${fallbackNodeId}" doesn't cover all bypass paths`,
    };
  }

  // Optional field: validate in full graph
  if (isDominator(edges, fallbackNodeId, target)) {
    return { covered: true };
  }
  return {
    covered: false,
    reason: `Fallback node "${fallbackNodeId}" doesn't cover all paths (source field is optional)`,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/utils/pathCoverage.ts
git commit -m "feat(web): add path coverage algorithm with dominator check and upstream discovery"
```

---

## Chunk 4: Web UI

### Task 12: Add translations for new UI elements

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add translation keys**

Add new keys to the appropriate sections in `en.json`:

In `edgePanel`:
```json
"fixedValue": "Fixed value",
"reference": "Reference",
"referencesSet": "References set",
"editReference": "Edit reference"
```

In `nodePanel`:
```json
"outputPrompt": "Extraction Prompt",
"outputPromptPlaceholder": "Tell the LLM what to extract...",
"outputPromptRequired": "An extraction prompt is required when an output schema is set.",
"outputSchemaDisabledNextNodeIsUser": "Disable 'next node is user' to set an output schema.",
"outputSchemaDisabledMultipleEdges": "Output schemas require at most one outgoing edge.",
"outputSchemaDisabledPreconditions": "Remove preconditions from outgoing edges to set an output schema.",
"outputSchemaDisabledContextPreconditions": "Remove context preconditions from outgoing edges to set an output schema."
```

In a new `referenceDialog` section:
```json
"referenceDialog": {
  "title": "Configure Reference",
  "selectNode": "Select source node",
  "selectField": "Select field",
  "noUpstreamNodes": "No upstream nodes with output schemas found.",
  "pathCovered": "All paths pass through this node.",
  "pathNotCovered": "Some paths don't pass through this node. Add a fallback.",
  "addFallback": "Add fallback",
  "optionalFieldInfo": "This field is optional. The value may be null at runtime.",
  "requiredFallback": "A fallback is required because the source field is optional and the target is required.",
  "apply": "Apply",
  "cancel": "Cancel"
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat(web): add translations for reference dialog and output schema gating"
```

---

### Task 13: Node panel output schema gating and outputPrompt field

**Files:**
- Modify: `packages/web/app/utils/graphTransformers.ts:49-61` — add `outputPrompt` to `RFNodeData`
- Modify: `packages/web/app/components/panels/NodePanel.tsx:236-263`
- Create: `packages/web/app/components/panels/NodePanelOutputSchema.tsx` — extracted output-schema section
- Modify: `packages/web/app/components/panels/OutputSchemaSelect.tsx` — add `disabled` prop

- [ ] **Step 0: Add `outputPrompt` to `RFNodeData` in graphTransformers.ts**

In `packages/web/app/utils/graphTransformers.ts`, add `outputPrompt` to the `RFNodeData` interface (line 58):

```ts
export interface RFNodeData extends Record<string, unknown> {
  nodeId: string;
  text: string;
  description: string;
  agent?: string;
  nextNodeIsUser?: boolean;
  fallbackNodeId?: string;
  global?: boolean;
  defaultFallback?: boolean;
  outputSchemaId?: string;
  outputPrompt?: string;     // NEW
  muted?: boolean;
  nodeWidth?: number | null;
}
```

Also update `schemaNodeToRFNode` to map `outputPrompt` from the schema node data.

- [ ] **Step 1: Add gating logic for output schema selector**

Before the `OutputSchemaSelect` render (line 236), compute the gating conditions:

```tsx
const hasMultipleOutgoing = outgoingEdges.length > 1;
const hasRoutingPreconditions = outgoingEdges.some((e) => {
  const pType = e.data?.preconditions?.[0]?.type;
  return pType === 'user_said' || pType === 'agent_decision' || pType === 'tool_call';
});
const hasContextPreconditions = outgoingEdges.some(
  (e) => e.data?.contextPreconditions !== undefined
);
const hasNextNodeIsUser = nodeData.nextNodeIsUser === true;
const outputSchemaDisabled =
  hasNextNodeIsUser || hasMultipleOutgoing || hasRoutingPreconditions || hasContextPreconditions;
```

Compute the disable reason for the alert:

```tsx
function getOutputSchemaDisableReason(/* params */): string | null {
  if (hasNextNodeIsUser) return t('outputSchemaDisabledNextNodeIsUser');
  if (hasMultipleOutgoing) return t('outputSchemaDisabledMultipleEdges');
  if (hasRoutingPreconditions) return t('outputSchemaDisabledPreconditions');
  if (hasContextPreconditions) return t('outputSchemaDisabledContextPreconditions');
  return null;
}
```

Extract this into a helper function (keeping within ESLint line limits).

- [ ] **Step 2: Wrap OutputSchemaSelect with gating**

```tsx
{node.type === 'agent' && (
  <div className="space-y-2">
    <OutputSchemaSelect
      schemas={outputSchemas}
      value={nodeData.outputSchemaId}
      onChange={(schemaId) => updateNodeData({ outputSchemaId: schemaId })}
      onAddSchema={/* ...existing... */}
      onEditSchema={onEditOutputSchema}
      disabled={outputSchemaDisabled}
    />
    {outputSchemaDisabled && disableReason !== null && (
      <p className="text-[10px] text-muted-foreground">{disableReason}</p>
    )}
  </div>
)}
```

Update `OutputSchemaSelect` props to accept `disabled?: boolean` and forward to `<Select>`.

- [ ] **Step 3: Add outputPrompt text field when schema is set**

After the `OutputSchemaSelect`, conditionally render the prompt field:

```tsx
{nodeData.outputSchemaId !== undefined && (
  <div className="space-y-2">
    <Label htmlFor="outputPrompt">{t('outputPrompt')}</Label>
    <Textarea
      id="outputPrompt"
      value={nodeData.outputPrompt ?? ''}
      onChange={(e) => updateNodeData({ outputPrompt: e.target.value })}
      rows={3}
      placeholder={t('outputPromptPlaceholder')}
    />
  </div>
)}
```

- [ ] **Step 4: Disable nextNodeIsUser when outputSchemaId is set**

Wrap the existing `nextNodeIsUser` checkbox with the mutual exclusion:

```tsx
<Checkbox
  id="nextNodeIsUser"
  checked={nodeData.nextNodeIsUser ?? false}
  onCheckedChange={(checked) =>
    updateNodeData({ nextNodeIsUser: checked === true || undefined })
  }
  disabled={nodeData.outputSchemaId !== undefined}
/>
```

- [ ] **Step 5: Add `disabled` prop to OutputSchemaSelect**

In `OutputSchemaSelect.tsx`, add the `disabled` prop. **Important:** This project uses `@base-ui/react` (not Radix). In base-ui, the `disabled` prop goes on `SelectTrigger`, NOT on the `Select` root:

```tsx
interface OutputSchemaSelectProps {
  // ...existing
  disabled?: boolean;
}

export function OutputSchemaSelect({
  schemas, value, onChange, onAddSchema, onEditSchema, disabled,
}: OutputSchemaSelectProps) {
  // ...existing code...
  return (
    <div className="space-y-2">
      <Label>{t('outputSchema')}</Label>
      <div className="flex items-center gap-1">
        <Select
          value={value ?? NONE_VALUE}
          onValueChange={(v) => handleChange(v, onChange, onAddSchema)}
        >
          <SelectTrigger className="h-8 flex-1 text-xs" disabled={disabled}>
            <span className="flex flex-1 text-left truncate">{displayLabel}</span>
          </SelectTrigger>
          {/* ...rest unchanged */}
        </Select>
        {/* ...edit button unchanged */}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Extract output-schema section into NodePanelOutputSchema.tsx**

The NodePanel function already has ~40 lines. Adding gating logic and the outputPrompt field will exceed the ESLint `max-lines-per-function: 40` limit. Extract the entire output-schema section (Steps 1-4) into a separate component:

```tsx
// packages/web/app/components/panels/NodePanelOutputSchema.tsx
'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';
import type { Edge, Node } from '@xyflow/react';
import { useTranslations } from 'next-intl';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { OutputSchemaSelect } from './OutputSchemaSelect';

interface NodePanelOutputSchemaProps {
  nodeData: RFNodeData;
  nodeType: string | undefined;
  outgoingEdges: Array<Edge<RFEdgeData>>;
  outputSchemas: OutputSchemaEntity[];
  onUpdateNodeData: (updates: Partial<RFNodeData>) => void;
  onAddOutputSchema: () => string;
  onEditOutputSchema: (id: string) => void;
}

function getDisableReason(/* params from props */): string | null {
  // gating logic from Steps 1-2
}

export function NodePanelOutputSchema(props: NodePanelOutputSchemaProps) {
  const t = useTranslations('nodePanel');
  // All output schema gating, outputPrompt, and nextNodeIsUser logic here
  // This keeps NodePanel itself under 40 lines
}
```

Then in `NodePanel.tsx`, replace the output-schema JSX block with:
```tsx
<NodePanelOutputSchema
  nodeData={nodeData}
  nodeType={node.type}
  outgoingEdges={outgoingEdges}
  outputSchemas={outputSchemas}
  onUpdateNodeData={updateNodeData}
  onAddOutputSchema={onAddOutputSchema}
  onEditOutputSchema={onEditOutputSchema}
/>
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/components/panels/NodePanel.tsx packages/web/app/components/panels/NodePanelOutputSchema.tsx packages/web/app/components/panels/OutputSchemaSelect.tsx packages/web/app/utils/graphTransformers.ts
git commit -m "feat(web): add output schema gating, outputPrompt field, and mutual exclusion in NodePanel"
```

---

### Task 14: Three-way field mode toggle component

**Files:**
- Create: `packages/web/app/components/panels/FieldModeToggle.tsx`

- [ ] **Step 1: Create the toggle component**

```tsx
// packages/web/app/components/panels/FieldModeToggle.tsx
'use client';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export type FieldMode = 'inferred' | 'fixed' | 'reference';

interface FieldModeToggleProps {
  mode: FieldMode;
  onModeChange: (mode: FieldMode) => void;
  fieldName: string;
  readOnly?: boolean;
}

const MODES: FieldMode[] = ['inferred', 'fixed', 'reference'];

function getModeLabel(mode: FieldMode, t: (key: string) => string): string {
  switch (mode) {
    case 'inferred':
      return t('agentInferred');
    case 'fixed':
      return t('fixedValue');
    case 'reference':
      return t('reference');
  }
}

export function FieldModeToggle({ mode, onModeChange, fieldName, readOnly }: FieldModeToggleProps) {
  const t = useTranslations('edgePanel');
  if (readOnly) return null;

  return (
    <div className="flex gap-1">
      {MODES.map((m) => (
        <Button
          key={m}
          variant={mode === m ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onModeChange(m)}
          className="h-5 px-1.5 text-[9px] font-medium"
        >
          {getModeLabel(m, t)}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/FieldModeToggle.tsx
git commit -m "feat(web): add FieldModeToggle component for three-way field value selection"
```

---

### Task 15: Update ToolParamsCard with three-way toggle

**Files:**
- Modify: `packages/web/app/components/panels/ToolParamsCard.tsx`

- [ ] **Step 1: Replace AgentInferredCheckbox with FieldModeToggle**

Replace the `AgentInferredCheckbox` component and update `PropertyRow` to use the three-way toggle. The `FieldMode` is derived from the `ToolFieldValue`:

```ts
function getFieldMode(field: ToolFieldValue | undefined): FieldMode {
  if (field === undefined) return 'inferred';
  return field.type;  // 'fixed' or 'reference'
}
```

Update the `handleToggle` function to become `handleModeChange`:

```ts
const handleModeChange = (fieldName: string, mode: FieldMode) => {
  if (!onToolFieldsChange) return;
  const current = toolFields ?? {};
  if (mode === 'inferred') {
    const rest = Object.fromEntries(Object.entries(current).filter(([k]) => k !== fieldName));
    onToolFieldsChange(Object.keys(rest).length > 0 ? rest : undefined);
  } else if (mode === 'fixed') {
    onToolFieldsChange({ ...current, [fieldName]: { type: 'fixed', value: '' } });
  } else {
    // 'reference' — open the reference dialog
    onOpenReference?.(fieldName);
  }
};
```

- [ ] **Step 2: Add reference display chip**

When a field has `type: 'reference'`, show a compact chip instead of the input:

```tsx
{fieldValue?.type === 'reference' && (
  <div className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700">
    <Check className="size-3" />
    <span>{t('referencesSet')}</span>
    <button
      type="button"
      onClick={() => onOpenReference?.(name)}
      className="ml-1 text-blue-500 hover:text-blue-700"
    >
      <Pencil className="size-2.5" />
    </button>
  </div>
)}
```

- [ ] **Step 3: Add onOpenReference callback to ToolParamsCardProps**

```ts
export interface ToolParamsCardProps {
  toolName: string;
  tools: DiscoveredTool[];
  toolFields?: Record<string, ToolFieldValue>;
  onToolFieldsChange?: (toolFields: Record<string, ToolFieldValue> | undefined) => void;
  readOnly?: boolean;
  onOpenReference?: (fieldName: string) => void;  // NEW
}
```

- [ ] **Step 4: Enrich SchemaProperty for nested objects**

Update the `SchemaProperty` interface:

```ts
interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
  properties?: Record<string, SchemaProperty>;  // NEW
  items?: SchemaProperty;                        // NEW
}
```

- [ ] **Step 5: Add recursive rendering for nested objects**

Create a `NestedPropertyRow` component that recursively renders sub-properties of object-typed params with indentation. Each sub-property gets its own `FieldModeToggle`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/components/panels/ToolParamsCard.tsx
git commit -m "feat(web): replace agent-inferred checkbox with three-way toggle in ToolParamsCard"
```

---

### Task 16: Reference configuration dialog

**Files:**
- Create: `packages/web/app/components/panels/ReferenceConfigDialog.tsx`
- Create: `packages/web/app/components/panels/referenceDialogHelpers.ts`

- [ ] **Step 1: Create pure helper functions**

```ts
// packages/web/app/components/panels/referenceDialogHelpers.ts
import type { OutputSchemaEntity, OutputSchemaField, ToolFieldValue } from '@daviddh/graph-types';
import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';

import type { ToolInputProperty } from '../../utils/typeCompatibility';
import { getCompatibleFields } from '../../utils/typeCompatibility';
import { checkFallbackCoverage, checkPathCoverage, findUpstreamOutputNodes } from '../../utils/pathCoverage';
import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';

type FlowNode = RFFlowNode<RFNodeData>;
type FlowEdge = RFFlowEdge<RFEdgeData>;

export interface UpstreamOption {
  nodeId: string;
  nodeName: string;
  fields: OutputSchemaField[];
}

export function getUpstreamOptions(
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceNode: string,
  outputSchemas: OutputSchemaEntity[],
  targetProp: ToolInputProperty
): UpstreamOption[] {
  const upstreamNodes = findUpstreamOutputNodes(nodes, edges, sourceNode);

  return upstreamNodes
    .map((node) => {
      const schema = outputSchemas.find((s) => s.id === node.data.outputSchemaId);
      if (schema === undefined) return null;
      const compatible = getCompatibleFields(schema.fields, targetProp);
      if (compatible.length === 0) return null;
      return { nodeId: node.id, nodeName: node.data.text || node.id, fields: compatible };
    })
    .filter((opt): opt is UpstreamOption => opt !== null);
}

export function isReferenceComplete(
  edges: FlowEdge[],
  target: string,
  ref: Partial<{ nodeId: string; path: string; fallbacks: ToolFieldValue[] }>,
  sourceFieldRequired: boolean,
  targetRequired: boolean
): boolean {
  if (ref.nodeId === undefined || ref.path === undefined) return false;

  const coverage = checkPathCoverage(edges, target, ref.nodeId);
  if (!coverage.covered) {
    // Need fallbacks to cover the gap
    if (ref.fallbacks === undefined || ref.fallbacks.length === 0) return false;
    // Check that at least one fallback provides coverage
    return hasCoveringFallback(edges, target, ref.fallbacks);
  }

  // Check optionality: if source field is optional and target is required, need a fallback
  if (!sourceFieldRequired && targetRequired) {
    return ref.fallbacks !== undefined && ref.fallbacks.length > 0;
  }

  return true;
}

function hasCoveringFallback(
  edges: FlowEdge[],
  target: string,
  fallbacks: ToolFieldValue[]
): boolean {
  for (const fb of fallbacks) {
    if (fb.type === 'fixed') return true; // Fixed values always cover
    if (fb.type === 'reference') {
      // Reference fallback: check if this node dominates the target
      const fbCoverage = checkPathCoverage(edges, target, fb.nodeId);
      if (fbCoverage.covered) return true;
      // Try this fallback's own fallbacks recursively
      if (fb.fallbacks !== undefined && hasCoveringFallback(edges, target, fb.fallbacks)) {
        return true;
      }
    }
  }
  return false;
}
```

- [ ] **Step 2: Create the dialog component**

```tsx
// packages/web/app/components/panels/ReferenceConfigDialog.tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type { OutputSchemaEntity, OutputSchemaField, ToolFieldValue } from '@daviddh/graph-types';
import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';
import { Check, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ToolInputProperty } from '../../utils/typeCompatibility';
import { checkPathCoverage } from '../../utils/pathCoverage';
import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { getUpstreamOptions } from './referenceDialogHelpers';

// Component implementation follows the design spec section 7.3.
// The dialog renders:
// 1. Node/field selector (grouped by upstream node)
// 2. Path coverage indicator (subtle, not warning)
// 3. Fallback selectors when coverage is incomplete
// 4. Apply/Cancel buttons (Apply disabled until 100% coverage)
//
// Full implementation left to the implementer subagent — the skeleton
// and helper functions are provided above.

interface ReferenceConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldName: string;
  targetProperty: ToolInputProperty;
  sourceNodeId: string;
  nodes: Array<RFFlowNode<RFNodeData>>;
  edges: Array<RFFlowEdge<RFEdgeData>>;
  outputSchemas: OutputSchemaEntity[];
  currentValue?: ToolFieldValue;
  onApply: (value: ToolFieldValue) => void;
}

export function ReferenceConfigDialog(props: ReferenceConfigDialogProps) {
  const t = useTranslations('referenceDialog');
  const {
    open, onOpenChange, fieldName, targetProperty, sourceNodeId,
    nodes, edges, outputSchemas, currentValue, onApply,
  } = props;

  const upstreamOptions = getUpstreamOptions(nodes, edges, sourceNodeId, outputSchemas, targetProperty);

  // Draft state for the reference being configured
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(
    currentValue?.type === 'reference' ? currentValue.nodeId : undefined
  );
  const [selectedPath, setSelectedPath] = useState<string | undefined>(
    currentValue?.type === 'reference' ? currentValue.path : undefined
  );

  const selectedOption = upstreamOptions.find((o) => o.nodeId === selectedNodeId);
  const coverage = selectedNodeId !== undefined
    ? checkPathCoverage(edges, sourceNodeId, selectedNodeId)
    : null;

  const isComplete = selectedNodeId !== undefined && selectedPath !== undefined && coverage?.covered === true;

  const handleApply = () => {
    if (selectedNodeId === undefined || selectedPath === undefined) return;
    onApply({
      type: 'reference',
      nodeId: selectedNodeId,
      path: selectedPath,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}: {fieldName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Node selector */}
          <div className="space-y-1">
            <Label className="text-xs">{t('selectNode')}</Label>
            {upstreamOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('noUpstreamNodes')}</p>
            ) : (
              <Select value={selectedNodeId ?? ''} onValueChange={setSelectedNodeId}>
                <SelectTrigger className="h-8 text-xs">
                  <span>{selectedOption?.nodeName ?? t('selectNode')}</span>
                </SelectTrigger>
                <SelectContent>
                  {upstreamOptions.map((opt) => (
                    <SelectItem key={opt.nodeId} value={opt.nodeId}>
                      {opt.nodeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Field selector */}
          {selectedOption !== undefined && (
            <div className="space-y-1">
              <Label className="text-xs">{t('selectField')}</Label>
              <Select value={selectedPath ?? ''} onValueChange={setSelectedPath}>
                <SelectTrigger className="h-8 text-xs">
                  <span>{selectedPath ?? t('selectField')}</span>
                </SelectTrigger>
                <SelectContent>
                  {selectedOption.fields.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.name} ({f.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Coverage indicator */}
          {coverage !== null && (
            <div className="flex items-start gap-2 rounded bg-muted/50 p-2 text-xs">
              {coverage.covered ? (
                <>
                  <Check className="mt-0.5 size-3 text-green-600 shrink-0" />
                  <span className="text-muted-foreground">{t('pathCovered')}</span>
                </>
              ) : (
                <>
                  <Info className="mt-0.5 size-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{t('pathNotCovered')}</span>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {t('cancel')}
          </DialogClose>
          <Button onClick={handleApply} disabled={!isComplete}>
            {t('apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/panels/ReferenceConfigDialog.tsx packages/web/app/components/panels/referenceDialogHelpers.ts
git commit -m "feat(web): add reference configuration dialog with upstream discovery and coverage"
```

---

## Chunk 5: Web Integration

### Task 17: Graph validation rules for output schema nodes

**Files:**
- Modify: `packages/web/app/utils/graphValidation.ts`

- [ ] **Step 1: Add validateOutputSchemaNodes function**

```ts
function validateOutputSchemaNodes(
  nodes: FlowNode[],
  edgesBySource: Map<string, FlowEdge[]>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    if (node.data.outputSchemaId === undefined) continue;
    const nodeEdges = edgesBySource.get(node.id) ?? [];
    errors.push(...validateSingleOutputSchemaNode(node, nodeEdges));
  }
  return errors;
}
```

Extract per-node checks into a helper:

```ts
function validateSingleOutputSchemaNode(
  node: FlowNode,
  nodeEdges: FlowEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const MAX_EDGES = 1;

  if (nodeEdges.length > MAX_EDGES) {
    errors.push({
      message: `Node "${node.id}": output schema nodes must have at most one outgoing edge`,
      nodeId: node.id,
    });
  }

  if (node.data.nextNodeIsUser === true) {
    errors.push({
      message: `Node "${node.id}": output schema and nextNodeIsUser are mutually exclusive`,
      nodeId: node.id,
    });
  }

  const hasForbiddenPreconditions = nodeEdges.some((e) => {
    const pType = e.data?.preconditions?.[0]?.type;
    return pType === 'user_said' || pType === 'agent_decision' || pType === 'tool_call';
  });
  if (hasForbiddenPreconditions) {
    errors.push({
      message: `Node "${node.id}": output schema nodes must not have routing preconditions`,
      nodeId: node.id,
    });
  }

  if (!node.data.outputPrompt || node.data.outputPrompt.trim() === '') {
    errors.push({
      message: `Node "${node.id}": output schema nodes must have an extraction prompt`,
      nodeId: node.id,
    });
  }

  return errors;
}
```

- [ ] **Step 2: Add validateReferences function for cross-cutting validation**

**Important:** `toolFields` is a property on individual `Precondition` objects (not on the edge data directly). Access it via `precondition.toolFields`. The `Precondition` type in `graph.schema.ts` has `toolFields?: Record<string, ToolFieldValue>`.

Also add context preconditions check to `validateSingleOutputSchemaNode`:

```ts
// Add to validateSingleOutputSchemaNode:
const hasContextPreconditions = nodeEdges.some(
  (e) => e.data?.contextPreconditions !== undefined &&
         e.data.contextPreconditions.preconditions.length > 0
);
if (hasContextPreconditions) {
  errors.push({
    message: `Node "${node.id}": output schema nodes must not have context preconditions`,
    nodeId: node.id,
  });
}
```

```ts
function validateReferences(
  nodes: FlowNode[],
  edges: FlowEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const edge of edges) {
    const preconditions = edge.data?.preconditions ?? [];
    for (const p of preconditions) {
      // toolFields is on each Precondition object
      if (p.toolFields === undefined) continue;
      for (const [fieldName, field] of Object.entries(p.toolFields)) {
        if (field.type !== 'reference') continue;
        errors.push(...validateSingleReference(nodes, edges, edge.source, fieldName, field));
      }
    }
  }
  return errors;
}
```

```ts
function validateSingleReference(
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceNode: string,
  fieldName: string,
  field: { nodeId: string; path: string }
): ValidationError[] {
  const errors: ValidationError[] = [];
  const refNode = nodes.find((n) => n.id === field.nodeId);

  if (refNode === undefined) {
    errors.push({
      message: `Edge from "${sourceNode}": reference "${fieldName}" points to non-existent node "${field.nodeId}"`,
      nodeId: sourceNode,
    });
    return errors;
  }

  if (refNode.data.outputSchemaId === undefined) {
    errors.push({
      message: `Edge from "${sourceNode}": reference "${fieldName}" points to node "${field.nodeId}" which has no output schema`,
      nodeId: sourceNode,
    });
  }

  return errors;
}
```

- [ ] **Step 3: Wire into validateGraph**

Add both new validators to the `validateGraph` return:

```ts
export function validateGraph(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
  // ...existing checks
  const edgesBySource = groupEdgesBySource(edges);

  return [
    ...initialStepErrors,
    ...validateAgentDecision(edgesBySource),
    ...validateUserSaid(nodes, edgesBySource),
    ...validatePreconditionConsistency(edgesBySource),
    ...validateReachability(nodes, edges),
    ...validateOutputSchemaNodes(nodes, edgesBySource),  // NEW
    ...validateReferences(nodes, edges),                  // NEW
  ];
}
```

**Important:** The file is currently 183 lines and the max is 300. The new validators add ~80 lines. Extract all new validation functions into `packages/web/app/utils/graphValidationOutputSchemas.ts`:

```ts
// packages/web/app/utils/graphValidationOutputSchemas.ts
import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';

import type { RFEdgeData, RFNodeData } from './graphTransformers';

type FlowNode = RFFlowNode<RFNodeData>;
type FlowEdge = RFFlowEdge<RFEdgeData>;

interface ValidationError {
  message: string;
  nodeId?: string;
}

// All output-schema and reference validation functions go here:
// - validateOutputSchemaNodes
// - validateSingleOutputSchemaNode
// - validateReferences
// - validateSingleReference
export function validateOutputSchemaNodes(/*...*/): ValidationError[] { /*...*/ }
export function validateReferences(/*...*/): ValidationError[] { /*...*/ }
```

In `graphValidation.ts`, import and wire:
```ts
import { validateOutputSchemaNodes, validateReferences } from './graphValidationOutputSchemas';
```

**Note:** Do NOT import `checkFallbackCoverage` from `pathCoverage.ts` into the validation module — it is only used by the reference dialog, not by graph validation. The graph validation checks structural rules; runtime coverage is checked by the dialog.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/utils/graphValidation.ts packages/web/app/utils/graphValidationOutputSchemas.ts
git commit -m "feat(web): add graph validation for output schema nodes and cross-cutting references"
```

---

### Task 18: Simulation structuredOutputs accumulation and SSE integration

**Files:**
- Create: `packages/web/app/utils/stableJsonHash.ts` — web copy of stable JSON utility
- Modify: `packages/api/src/types/tools.ts` — add `structuredOutputs` to `NodeProcessedEvent`
- Modify: `packages/backend/src/routes/simulateHandler.ts` — thread structuredOutputs in SSE
- Modify: `packages/web/app/lib/api.ts` — add `structuredOutputs` to `SimulateRequestBody`
- Modify: `packages/web/app/hooks/useSimulation.ts`
- Modify: `packages/web/app/hooks/useSimulationHelpers.ts`

- [ ] **Step 1: Create web-package stableJsonHash utility**

Since the web package doesn't depend on the API package, create a small duplicate:

```ts
// packages/web/app/utils/stableJsonHash.ts

/** JSON.stringify with sorted keys at every nesting level for deterministic output. */
export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}
```

- [ ] **Step 2: Add structuredOutputs to NodeProcessedEvent**

In `packages/api/src/types/tools.ts`:

```ts
export interface NodeProcessedEvent {
  nodeId: string;
  text?: string;
  toolCalls: Array<TypedToolCall<Record<string, Tool>>>;
  tokens: TokenLog;
  durationMs: number;
  structuredOutput?: { nodeId: string; data: unknown };  // NEW
}
```

Update `emitNodeProcessed` in `indexHelpers.ts` to include `structuredOutput` from the result.

- [ ] **Step 3: Update simulateHandler SSE to include structuredOutputs**

In `packages/backend/src/routes/simulateHandler.ts`, update `sendNodeProcessed`:

```ts
function sendNodeProcessed(res: Response, event: NodeProcessedEvent): void {
  writeSSE(res, {
    type: 'node_processed',
    nodeId: event.nodeId,
    text: event.text ?? '',
    toolCalls: event.toolCalls.map((tc) => ({
      toolName: tc.toolName,
      input: tc.input as unknown,
    })),
    tokens: event.tokens,
    durationMs: event.durationMs,
    structuredOutput: event.structuredOutput,  // NEW — optional, undefined for non-SO nodes
  });
}
```

Also pass `structuredOutputs` from request body to `executeWithCallbacks`:

```ts
const result = await executeWithCallbacks({
  context,
  messages: body.messages,
  currentNode: body.currentNode,
  toolsOverride: session.tools,
  logger: consoleLogger,
  structuredOutputs: body.structuredOutputs,  // NEW
  onNodeVisited: (nodeId) => sendNodeVisited(res, nodeId),
  onNodeProcessed: (event) => sendNodeProcessed(res, event),
});
```

- [ ] **Step 4: Add structuredOutputs to SimulateRequestBody**

In `packages/web/app/lib/api.ts`:

```ts
export interface SimulateRequestBody {
  graph: Record<string, unknown>;
  messages: unknown[];
  currentNode: string;
  apiKeyId: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  structuredOutputs?: Record<string, unknown[]>;  // NEW
}
```

- [ ] **Step 5: Add structuredOutputs state to useSimulationState**

In `useSimulation.ts`, add to `useSimulationState`:

```ts
const [structuredOutputs, setStructuredOutputs] = useState<Record<string, unknown[]>>({});
```

Add to `FullSetters` and the `setters` object:

```ts
setStructuredOutputs,
```

- [ ] **Step 6: Reset structuredOutputs on start and stop**

In `useSimulationStart`, add: `setters.setStructuredOutputs({});`
In `useSimulationStop`, add: `setters.setStructuredOutputs({});`

- [ ] **Step 7: Pass structuredOutputs in buildSimulateParams**

In `useSimulationHelpers.ts`, add `structuredOutputs` to `BuildSimulateParamsOptions` and include it in the `SimulateRequestBody`:

```ts
export interface BuildSimulateParamsOptions {
  // ...existing fields
  structuredOutputs?: Record<string, unknown[]>;  // NEW
}

export function buildSimulateParams(opts: BuildSimulateParamsOptions): SimulateRequestBody {
  // ...existing code...
  return {
    graph,
    messages: opts.allMessages,
    currentNode: opts.currentNode,
    apiKeyId: opts.apiKeyId,
    sessionID,
    tenantID,
    userID,
    data,
    quickReplies,
    structuredOutputs: opts.structuredOutputs,  // NEW
  };
}
```

- [ ] **Step 8: Merge structured outputs in onNodeProcessed callback**

In `buildStreamCallbacks`, when `onNodeProcessed` fires, check if the event includes a structured output and merge it into the state:

```ts
import { stableJsonStringify } from '../utils/stableJsonHash';

// In onNodeProcessed callback:
onNodeProcessed: (event) => {
  // ...existing result/token logic...

  if (event.structuredOutput !== undefined) {
    setters.setStructuredOutputs((prev: Record<string, unknown[]>) => {
      const { nodeId, data } = event.structuredOutput;
      const existing = prev[nodeId] ?? [];
      const hash = stableJsonStringify(data);
      const alreadyExists = existing.some((e) => stableJsonStringify(e) === hash);
      if (alreadyExists) return prev;
      return { ...prev, [nodeId]: [...existing, data] };
    });
  }
},
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/web/app/utils/stableJsonHash.ts packages/api/src/types/tools.ts packages/backend/src/routes/simulateHandler.ts packages/web/app/lib/api.ts packages/web/app/hooks/useSimulation.ts packages/web/app/hooks/useSimulationHelpers.ts
git commit -m "feat(web): accumulate structuredOutputs across simulation steps with SSE integration"
```

---

### Task 19: Full check and final commit

- [ ] **Step 1: Run full check**

Run: `npm run check`
Expected: PASS (format + lint + typecheck across all packages)

- [ ] **Step 2: Fix any remaining issues**

Address any ESLint line limit violations by extracting helper functions or splitting files.

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix: address lint and type issues from referenced tool field values feature"
```

---
