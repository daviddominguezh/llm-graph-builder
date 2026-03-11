# Output Schema Builder Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to visually define a structured output schema on `agent` nodes, persisted through the full pipeline to the database.

**Architecture:** New `outputSchema` field (JSONB array of field descriptors) added to the node schema across all layers: graph-types Zod schemas, web React Flow data, operation builders, backend row types, and database column. The UI is a `Dialog`-based recursive field builder opened from NodePanel, following the ConditionBuilder recursive pattern.

**Tech Stack:** Zod (graph-types), React + @xyflow/react (web), shadcn/ui Dialog/Card/Select/Input/Checkbox (web UI), Supabase/PostgreSQL (backend/database), next-intl (translations)

**Spec:** `docs/superpowers/specs/2026-03-11-output-schema-builder-design.md`

---

## Chunk 1: Data Layer (graph-types + backend + database)

### Task 1: Add OutputSchemaField Zod schema to graph-types

**Files:**
- Create: `packages/graph-types/src/schemas/output-schema.schema.ts`
- Modify: `packages/graph-types/src/schemas/node.schema.ts:20-31,33-45`
- Modify: `packages/graph-types/src/schemas/index.ts:4`
- Modify: `packages/graph-types/src/types/index.ts`

- [ ] **Step 1: Create the OutputSchemaField schema file**

Create `packages/graph-types/src/schemas/output-schema.schema.ts`:

```typescript
import { z } from 'zod';

export const OutputSchemaFieldTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'enum',
  'object',
  'array',
]);

export type OutputSchemaField = {
  name: string;
  type: z.infer<typeof OutputSchemaFieldTypeSchema>;
  required: boolean;
  description?: string;
  enumValues?: string[];
  items?: OutputSchemaField;
  properties?: OutputSchemaField[];
};

export const OutputSchemaFieldSchema: z.ZodType<OutputSchemaField> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: OutputSchemaFieldTypeSchema,
    required: z.boolean(),
    description: z.string().optional(),
    enumValues: z.array(z.string()).optional(),
    items: OutputSchemaFieldSchema.optional(),
    properties: z.array(OutputSchemaFieldSchema).optional(),
  })
);

export const OutputSchemaSchema = z.array(OutputSchemaFieldSchema).optional();
```

- [ ] **Step 2: Add `outputSchema` to NodeSchema and RuntimeNodeSchema**

In `packages/graph-types/src/schemas/node.schema.ts`:

Add import at the top:
```typescript
import { OutputSchemaSchema } from './output-schema.schema.js';
```

Add to `NodeSchema` (after line 29, before `position`):
```typescript
  outputSchema: OutputSchemaSchema,
```

Add to `RuntimeNodeSchema` (after line 43, before `position`):
```typescript
  outputSchema: OutputSchemaSchema,
```

- [ ] **Step 3: Re-export the new schema from index**

In `packages/graph-types/src/schemas/index.ts`, add after line 4:
```typescript
export { OutputSchemaFieldSchema, OutputSchemaFieldTypeSchema, OutputSchemaSchema } from './output-schema.schema.js';
export type { OutputSchemaField } from './output-schema.schema.js';
```

In `packages/graph-types/src/types/index.ts`, add the re-export of the type (it's already exported from the schema file, so just ensure it's available via the types barrel):
```typescript
export type { OutputSchemaField } from '../schemas/output-schema.schema.js';
```

- [ ] **Step 4: Add outputSchema to NodeDataSchema (operations)**

In `packages/graph-types/src/schemas/operation-node.schema.ts`:

Add import:
```typescript
import { OutputSchemaSchema } from './output-schema.schema.js';
```

Add to `NodeDataSchema` (after line 16, before the closing `});`):
```typescript
  outputSchema: OutputSchemaSchema,
```

- [ ] **Step 5: Build graph-types and verify**

Run: `npm run build -w packages/graph-types && npm run typecheck -w packages/graph-types`
Expected: Clean build, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/graph-types/
git commit -m "feat(graph-types): add OutputSchemaField schema to node types"
```

---

### Task 2: Add database migration

**Files:**
- Create: `supabase/migrations/20260311200000_add_output_schema_to_nodes.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260311200000_add_output_schema_to_nodes.sql`:

```sql
-- Add output_schema column to graph_nodes
alter table public.graph_nodes
  add column output_schema jsonb;

-- Update publish_version_tx to include output_schema in the node JSONB assembly
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
  -- Verify the calling user is a member of the agent's org
  if not exists (
    select 1
    from public.agents a
    join public.org_members om on om.org_id = a.org_id
    where a.id = p_agent_id and om.user_id = auth.uid()
  ) then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  -- Lock the agent row to serialize concurrent writes
  select start_node, staging_api_key_id
  into v_start_node, v_staging_api_key_id
  from public.agents
  where id = p_agent_id
  for update;

  if v_start_node is null then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  -- Assemble graph data from staging tables within the transaction
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
        'outputSchema', n.output_schema,
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

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add output_schema column to graph_nodes"
```

---

### Task 3: Update backend row types and operations

**Files:**
- Modify: `packages/backend/src/db/queries/graphRowTypes.ts:4-17`
- Modify: `packages/backend/src/db/queries/nodeOperations.ts:9-22,24-38`
- Modify: `packages/backend/src/db/queries/graphAssemblers.ts:39-51`

- [ ] **Step 1: Add output_schema to NodeRow in graphRowTypes.ts**

In `packages/backend/src/db/queries/graphRowTypes.ts`, add after line 16 (`position_y`), before the closing `}`:
```typescript
  output_schema: Record<string, unknown>[] | null;
```

- [ ] **Step 2: Add output_schema to the local NodeRow and buildNodeRow in nodeOperations.ts**

In `packages/backend/src/db/queries/nodeOperations.ts`, add to the local `NodeRow` interface after line 21 (`position_y`):
```typescript
  output_schema: Record<string, unknown>[] | undefined;
```

In `buildNodeRow`, add after line 37 (`position_y`):
```typescript
    output_schema: data.outputSchema as Record<string, unknown>[] | undefined,
```

- [ ] **Step 3: Add outputSchema to assembleNode in graphAssemblers.ts**

In `packages/backend/src/db/queries/graphAssemblers.ts`, add to `assembleNode` after line 50 (`position`):
```typescript
    outputSchema: (row.output_schema as Node['outputSchema']) ?? undefined,
```

- [ ] **Step 4: Typecheck backend**

Run: `npm run typecheck -w packages/backend`
Expected: Clean, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/
git commit -m "feat(backend): handle output_schema in node operations and assembly"
```

---

## Chunk 2: Web Data Layer (transformers + operation builders)

### Task 4: Add outputSchema to RFNodeData and transformers

**Files:**
- Modify: `packages/web/app/utils/graphTransformers.ts:49-60,84-93,109-129`
- Modify: `packages/web/app/utils/operationBuilders.ts:16-31,34-49`

- [ ] **Step 1: Add outputSchema to RFNodeData**

In `packages/web/app/utils/graphTransformers.ts`, add the import at the top:
```typescript
import type { OutputSchemaField } from '@daviddh/graph-types';
```

Add to `RFNodeData` interface after `defaultFallback` (line 57), before `muted`:
```typescript
  outputSchema?: OutputSchemaField[];
```

- [ ] **Step 2: Add outputSchema to schemaNodeToRFNode**

In `schemaNodeToRFNode`, add to the `data` object after `defaultFallback` (line 92):
```typescript
      outputSchema: node.outputSchema,
```

- [ ] **Step 3: Add outputSchema to resolveOptionalFields**

Update the `Pick` type on line 112 to include `outputSchema`:
```typescript
): Pick<SchemaNode, 'agent' | 'nextNodeIsUser' | 'fallbackNodeId' | 'global' | 'defaultFallback' | 'outputSchema'> {
```

In the `if (data === undefined)` branch (line 114-121), add:
```typescript
      outputSchema: original.outputSchema,
```

In the `return` branch (line 122-128), add:
```typescript
    outputSchema: data.outputSchema ?? original.outputSchema,
```

- [ ] **Step 4: Add outputSchema to operation builders**

In `packages/web/app/utils/operationBuilders.ts`, add to `buildInsertNodeOp` data object after `defaultFallback` (line 28):
```typescript
      outputSchema: node.data.outputSchema,
```

Add the same to `buildUpdateNodeOp` data object after `defaultFallback` (line 45), before `position`:
```typescript
      outputSchema: node.data.outputSchema,
```

- [ ] **Step 5: Typecheck web package**

Run: `npm run typecheck -w packages/web`
Expected: Clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/utils/
git commit -m "feat(web): add outputSchema to RFNodeData and operation builders"
```

---

## Chunk 3: UI Components

### Task 5: Create outputSchemaTypes.ts

**Files:**
- Create: `packages/web/app/components/panels/outputSchemaTypes.ts`

- [ ] **Step 1: Create the types/helpers file**

Create `packages/web/app/components/panels/outputSchemaTypes.ts`:

```typescript
import type { OutputSchemaField } from '@daviddh/graph-types';

export type OutputSchemaFieldType = OutputSchemaField['type'];

export const FIELD_TYPES: OutputSchemaFieldType[] = [
  'string',
  'number',
  'boolean',
  'enum',
  'object',
  'array',
];

export const MAX_DEPTH = 3;

const FIELD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isValidFieldName(name: string): boolean {
  return FIELD_NAME_REGEX.test(name);
}

export function createEmptyField(): OutputSchemaField {
  return { name: '', type: 'string', required: true };
}

export function getAvailableTypes(depth: number): OutputSchemaFieldType[] {
  if (depth >= MAX_DEPTH) {
    return FIELD_TYPES.filter((t) => t !== 'object' && t !== 'array');
  }
  return FIELD_TYPES;
}

export function hasDuplicateName(fields: OutputSchemaField[], name: string, excludeIndex: number): boolean {
  return fields.some((f, i) => i !== excludeIndex && f.name === name);
}

export function updateFieldInList(
  fields: OutputSchemaField[],
  index: number,
  updates: Partial<OutputSchemaField>
): OutputSchemaField[] {
  return fields.map((f, i) => (i === index ? { ...f, ...updates } : f));
}

export function removeFieldFromList(fields: OutputSchemaField[], index: number): OutputSchemaField[] {
  return fields.filter((_, i) => i !== index);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/outputSchemaTypes.ts
git commit -m "feat(web): add output schema type helpers"
```

---

### Task 6: Create OutputSchemaField component

**Files:**
- Create: `packages/web/app/components/panels/OutputSchemaFieldCard.tsx`

- [ ] **Step 1: Create the recursive field card component**

Create `packages/web/app/components/panels/OutputSchemaFieldCard.tsx`. This component renders a single field and recurses for `object`/`array` types.

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OutputSchemaField } from '@daviddh/graph-types';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OutputSchemaFieldType } from './outputSchemaTypes';
import {
  createEmptyField,
  getAvailableTypes,
  isValidFieldName,
  removeFieldFromList,
  updateFieldInList,
} from './outputSchemaTypes';

interface OutputSchemaFieldCardProps {
  field: OutputSchemaField;
  depth: number;
  onChange: (updated: OutputSchemaField) => void;
  onRemove: () => void;
}

function EnumValuesEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations('nodePanel');
  return (
    <div className="ml-4 mt-1 space-y-1">
      <Label className="text-[10px]">{t('enumValues')}</Label>
      {values.map((v, i) => (
        <div key={i} className="flex gap-1">
          <Input
            value={v}
            onChange={(e) => onChange(values.map((val, j) => (j === i ? e.target.value : val)))}
            className="h-6 text-xs"
          />
          <Button variant="ghost" size="icon-xs" onClick={() => onChange(values.filter((_, j) => j !== i))}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange([...values, ''])}>
        <Plus className="h-3 w-3 mr-1" />
        {t('addEnumValue')}
      </Button>
    </div>
  );
}

function FieldHeader({
  field,
  availableTypes,
  onChange,
  onRemove,
}: {
  field: OutputSchemaField;
  availableTypes: OutputSchemaFieldType[];
  onChange: (updates: Partial<OutputSchemaField>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('nodePanel');
  const nameInvalid = field.name !== '' && !isValidFieldName(field.name);
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={field.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={t('fieldNamePlaceholder')}
        className={`h-6 text-xs flex-1 ${nameInvalid ? 'border-destructive' : ''}`}
      />
      <Select value={field.type} onValueChange={(v) => onChange({ type: v as OutputSchemaFieldType })}>
        <SelectTrigger className="h-6 text-xs w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableTypes.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Checkbox
          checked={field.required}
          onCheckedChange={(checked) => onChange({ required: checked === true })}
        />
        <span className="text-[10px] text-muted-foreground">{t('fieldRequired')}</span>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={onRemove} title={t('deleteField')}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function FieldDescription({
  description,
  onChange,
}: {
  description: string | undefined;
  onChange: (desc: string | undefined) => void;
}) {
  const t = useTranslations('nodePanel');
  return (
    <Input
      value={description ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={t('fieldDescriptionPlaceholder')}
      className="h-6 text-xs"
    />
  );
}

function NestedFieldList({
  fields,
  depth,
  label,
  onChange,
}: {
  fields: OutputSchemaField[];
  depth: number;
  label: string;
  onChange: (fields: OutputSchemaField[]) => void;
}) {
  const t = useTranslations('nodePanel');
  return (
    <div className="ml-3 mt-1 border-l-2 border-zinc-200 pl-3 space-y-2">
      <Label className="text-[10px]">{label}</Label>
      {fields.map((f, i) => (
        <OutputSchemaFieldCard
          key={i}
          field={f}
          depth={depth + 1}
          onChange={(updated) => onChange(updateFieldInList(fields, i, updated))}
          onRemove={() => onChange(removeFieldFromList(fields, i))}
        />
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange([...fields, createEmptyField()])}>
        <Plus className="h-3 w-3 mr-1" />
        {t('addField')}
      </Button>
    </div>
  );
}

export function OutputSchemaFieldCard({ field, depth, onChange, onRemove }: OutputSchemaFieldCardProps) {
  const t = useTranslations('nodePanel');
  const availableTypes = getAvailableTypes(depth);

  const handleChange = (updates: Partial<OutputSchemaField>) => {
    const merged = { ...field, ...updates };
    // Reset type-specific fields when type changes
    if (updates.type !== undefined && updates.type !== field.type) {
      merged.enumValues = updates.type === 'enum' ? [''] : undefined;
      merged.properties = updates.type === 'object' ? [] : undefined;
      merged.items = updates.type === 'array' ? createEmptyField() : undefined;
    }
    onChange(merged);
  };

  return (
    <Card className="p-2 space-y-1.5">
      <FieldHeader field={field} availableTypes={availableTypes} onChange={handleChange} onRemove={onRemove} />
      <FieldDescription description={field.description} onChange={(d) => handleChange({ description: d })} />
      {field.type === 'enum' && (
        <EnumValuesEditor values={field.enumValues ?? ['']} onChange={(v) => handleChange({ enumValues: v })} />
      )}
      {field.type === 'object' && (
        <NestedFieldList
          fields={field.properties ?? []}
          depth={depth}
          label={t('objectProperties')}
          onChange={(p) => handleChange({ properties: p })}
        />
      )}
      {field.type === 'array' && field.items && (
        <div className="ml-3 mt-1 border-l-2 border-orange-200 pl-3">
          <Label className="text-[10px]">{t('arrayItems')}</Label>
          <OutputSchemaFieldCard
            field={field.items}
            depth={depth + 1}
            onChange={(updated) => handleChange({ items: updated })}
            onRemove={() => handleChange({ items: createEmptyField() })}
          />
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/OutputSchemaFieldCard.tsx
git commit -m "feat(web): add OutputSchemaFieldCard recursive component"
```

---

### Task 7: Create OutputSchemaDialog component

**Files:**
- Create: `packages/web/app/components/panels/OutputSchemaDialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `packages/web/app/components/panels/OutputSchemaDialog.tsx`:

```typescript
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { OutputSchemaField } from '@daviddh/graph-types';
import { Braces, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OutputSchemaFieldCard } from './OutputSchemaFieldCard';
import { createEmptyField, removeFieldFromList, updateFieldInList } from './outputSchemaTypes';

interface OutputSchemaDialogProps {
  fields: OutputSchemaField[];
  onChange: (fields: OutputSchemaField[]) => void;
}

function EmptyState() {
  const t = useTranslations('nodePanel');
  return <p className="text-xs text-muted-foreground text-center py-8">{t('outputSchemaEmpty')}</p>;
}

function FieldList({
  fields,
  onChange,
}: {
  fields: OutputSchemaField[];
  onChange: (fields: OutputSchemaField[]) => void;
}) {
  return (
    <div className="space-y-3">
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

export function OutputSchemaDialog({ fields, onChange }: OutputSchemaDialogProps) {
  const t = useTranslations('nodePanel');
  const fieldCount = fields.length;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" title={t('outputSchema')}>
            <Braces className="h-4 w-4" />
            {fieldCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
                {fieldCount}
              </span>
            )}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('outputSchema')}</DialogTitle>
          <DialogDescription>{t('outputSchemaDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-2">
          {fields.length === 0 ? <EmptyState /> : <FieldList fields={fields} onChange={onChange} />}
        </div>
        <DialogFooter showCloseButton>
          <Button variant="outline" onClick={() => onChange([...fields, createEmptyField()])}>
            <Plus className="h-4 w-4 mr-1" />
            {t('addField')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/OutputSchemaDialog.tsx
git commit -m "feat(web): add OutputSchemaDialog component"
```

---

### Task 8: Wire OutputSchemaDialog into NodePanel

**Files:**
- Modify: `packages/web/app/components/panels/NodePanel.tsx:147-155`

- [ ] **Step 1: Add import and render the dialog in NodePanel header**

In `packages/web/app/components/panels/NodePanel.tsx`:

Add import at the top (after other panel imports):
```typescript
import { OutputSchemaDialog } from './OutputSchemaDialog';
```

In the header `<div className="flex items-center">` block (around line 147), add the `OutputSchemaDialog` before `NodePromptDialog`, gated on `node.type === 'agent'`:

```tsx
            {node.type === 'agent' && (
              <OutputSchemaDialog
                fields={nodeData.outputSchema ?? []}
                onChange={(outputSchema) => updateNodeData({ outputSchema })}
              />
            )}
            <NodePromptDialog
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck -w packages/web`
Expected: Clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/NodePanel.tsx
git commit -m "feat(web): wire OutputSchemaDialog into NodePanel for agent nodes"
```

---

### Task 9: Add translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add nodePanel translation keys**

In `packages/web/messages/en.json`, extend the `nodePanel` section (which currently has `disabledByToolCall`):

```json
  "nodePanel": {
    "disabledByToolCall": "Disabled — this node routes through a tool call edge.",
    "outputSchema": "Output Schema",
    "outputSchemaDescription": "Define the structured output format for this agent node.",
    "outputSchemaEmpty": "No fields defined. Add fields to define the output structure.",
    "addField": "Add field",
    "fieldNamePlaceholder": "e.g. sentiment",
    "fieldRequired": "Required",
    "fieldDescriptionPlaceholder": "What this field represents...",
    "enumValues": "Values",
    "addEnumValue": "Add value",
    "arrayItems": "Array element",
    "objectProperties": "Properties",
    "deleteField": "Delete field"
  },
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat(i18n): add output schema builder translations"
```

---

### Task 10: Full check and final commit

- [ ] **Step 1: Build graph-types (needed by downstream packages)**

Run: `npm run build -w packages/graph-types`
Expected: Clean build.

- [ ] **Step 2: Run full check**

Run: `npm run check`
Expected: All format, lint, and typecheck pass across all packages.

- [ ] **Step 3: Fix any lint issues**

If `max-lines` or `max-lines-per-function` violations occur in the new files, extract helpers into smaller functions or split into additional files as needed. Do NOT compress code onto single lines.

- [ ] **Step 4: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix: resolve lint issues in output schema builder"
```
