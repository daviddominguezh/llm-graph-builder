# Output Schema Builder — Design Spec

## Summary

Allow users to define a structured output schema on `agent` type nodes via a visual builder dialog. The schema describes the shape of the LLM's structured output. The schema is persisted to the database as JSONB and flows through the full operation pipeline.

**Scope:** Frontend UI + full persistence pipeline (graph-types, web, backend, database). Runtime consumption by `packages/api` is out of scope for this iteration.

## Data Model

### OutputSchemaField

```typescript
interface OutputSchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array';
  required: boolean;
  description?: string;
  enumValues?: string[];            // only when type === 'enum'; min 1 value, unique
  items?: OutputSchemaField;        // only when type === 'array'; single element schema
  properties?: OutputSchemaField[]; // only when type === 'object'
}
```

### Validation rules

- **Field names:** Must match `^[a-zA-Z_][a-zA-Z0-9_]*$`. No duplicates among siblings.
- **Enum values:** At least 1 value required when `type === 'enum'`. Values must be unique, non-empty.
- **Nesting depth:** Max 3 levels (enforced in UI by hiding `object`/`array` from type selector at depth 3).
- **`items` is singular** (one element schema per array), matching JSON Schema's `items` semantics.

### Storage

- Column: `graph_nodes.output_schema jsonb` (new migration)
- Wire format: `OutputSchemaField[]` — array of top-level field descriptors
- Only meaningful for `kind === 'agent'` nodes. For `agent_decision` nodes, the column stores `null` and the UI hides the button.
- `undefined`/`null`/`[]` all mean "no output schema defined" — treated identically.

### Zod schema approach

The `OutputSchemaField` type is recursive. In graph-types Zod schemas, define it with `z.lazy()` and an explicit TypeScript type annotation to avoid inference issues:

```typescript
const OutputSchemaFieldSchema: z.ZodType<OutputSchemaField> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'enum', 'object', 'array']),
    required: z.boolean(),
    description: z.string().optional(),
    enumValues: z.array(z.string()).optional(),
    items: OutputSchemaFieldSchema.optional(),
    properties: z.array(OutputSchemaFieldSchema).optional(),
  })
);
```

Then add to `NodeSchema` / `RuntimeNodeSchema` / `NodeDataSchema`:
```typescript
outputSchema: z.array(OutputSchemaFieldSchema).optional()
```

### Pipeline touch points

| Layer | File (relative to package src/) | Change |
|-------|------|--------|
| graph-types | `schemas/node.schema.ts` | Add `outputSchema` to `NodeSchema` and `RuntimeNodeSchema` |
| graph-types | `schemas/operation-node.schema.ts` | Add `outputSchema` to `NodeDataSchema` |
| web | `app/utils/graphTransformers.ts` | Add to `RFNodeData`, `schemaNodeToRFNode`, `rfNodeToSchemaNode` |
| web | `app/utils/operationBuilders.ts` | Add to `buildInsertNodeOp` and `buildUpdateNodeOp` |
| backend | `src/db/queries/graphRowTypes.ts` | Add `output_schema` to `NodeRow` |
| backend | `src/db/queries/nodeOperations.ts` | Add to `buildNodeRow` |
| backend | `src/db/queries/graphAssemblers.ts` | Add to `assembleNode` |
| database | New migration file | Add column + update `publish_version_tx` SQL function |

## UI Structure

### Entry point

A button in `NodePanel` header, visible only when `node.type === 'agent'`. Uses the `Braces` icon from lucide. Shows a small badge/count when fields are defined.

### Dialog

`Dialog` component (non-destructive editing) with `className="sm:max-w-2xl h-[80vh] flex flex-col"` for a wide, tall layout.

- **Header:** Title "Output Schema" + description text
- **Body (scrollable):** Field list — each field as a card
- **Footer:** "Add field" button + Close

### Field card

Each field rendered as a `Card`:

- Field name — `Input` (validated against `^[a-zA-Z_][a-zA-Z0-9_]*$`)
- Type — `Select` dropdown (string, number, boolean, enum, object, array)
- Required — `Checkbox`
- Description — `Input` (optional)
- Delete button
- Conditional sub-sections by type:
  - `enum` — list of values with add/remove (min 1 value enforced)
  - `object` — nested field list (recursive, indented with left border like ConditionBuilder)
  - `array` — element type config (can itself be object with nested fields)

At depth 3, `object` and `array` are hidden from the type selector.

### File structure

All new files in `packages/web/app/components/panels/`:

- `OutputSchemaDialog.tsx` — dialog wrapper, top-level field list management
- `OutputSchemaField.tsx` — single field card component (recursive for object/array)
- `outputSchemaTypes.ts` — `OutputSchemaField` interface, type constants, empty field factory, depth helpers

## Save Flow

- No "Save" button — changes persist in real-time like all node properties
- Dialog calls `updateNodeData({ outputSchema })` on every change
- Flows through: `buildUpdateNodeOp` -> auto-save flush (5s debounce) -> proxy -> backend -> Supabase
- The existing auto-save debounce in `useAutoSave` handles rapid edits (keystroke batching)

## Translations

New keys under `nodePanel` in `packages/web/messages/en.json`:

- `outputSchema`, `outputSchemaDescription`, `outputSchemaEmpty`
- `addField`, `fieldName`, `fieldNamePlaceholder`, `fieldType`
- `fieldRequired`, `fieldDescription`, `fieldDescriptionPlaceholder`
- `enumValues`, `enumValuePlaceholder`, `addEnumValue`
- `arrayItems`, `objectProperties`, `deleteField`, `maxDepthReached`
