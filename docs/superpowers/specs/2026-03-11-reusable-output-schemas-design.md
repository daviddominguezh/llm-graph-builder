# Reusable Output Schemas — Design Spec

## Summary

Refactor output schemas from inline per-node data to reusable, named entities. Schemas are managed in the Settings panel and selected per-node via a dropdown. The schema builder dialog gets a premium UI overhaul — compact, dense, clean, soft colors, monospace field names.

## Data Model

### OutputSchema entity

```typescript
interface OutputSchema {
  id: string;          // nanoid
  name: string;        // user-facing name
  fields: OutputSchemaField[];  // reuses existing OutputSchemaField type
}
```

### Storage

- **New table:** `graph_output_schemas` (per-agent, like `graph_mcp_servers`)
  - `agent_id uuid references agents(id) on delete cascade`
  - `schema_id text not null`
  - `name text not null`
  - `fields jsonb not null default '[]'`
  - Primary key: `(agent_id, schema_id)`

- **Node reference:** `graph_nodes.output_schema_id text` (replaces `output_schema jsonb`)
  - Nodes store just the schema ID during staging
  - Drop the existing `output_schema` jsonb column

### Publishing (snapshot)

`publish_version_tx` resolves references at publish time:
- Each node's `outputSchema` in the published JSON becomes the full resolved schema (id + name + fields), not just the ID
- The `graph_output_schemas` table is also included as a top-level `outputSchemas` array in the published version for completeness

### Operation types

Follow the existing pattern (`operation-mcp.schema.ts`):

```typescript
// graph-types: operation-output-schema.schema.ts
insertOutputSchema  { data: { schemaId, name, fields } }
updateOutputSchema  { data: { schemaId, name, fields } }
deleteOutputSchema  { schemaId: string }
```

Node operations already carry `outputSchema` — this changes to `outputSchemaId: string | undefined`.

### Zod schemas

- `OutputSchemaEntitySchema` in `graph-types` — wraps existing `OutputSchemaFieldSchema` array with id + name
- Operation schemas follow the insert/update/delete pattern
- `NodeDataSchema` changes `outputSchema` → `outputSchemaId: z.string().optional()`

## UI: Settings Panel Section

### Placement

In `PresetsPanel`, between `ContextKeysSection` and `ContextPreconditionsSection`:

```
ApiKeySelectSection
ContextKeysSection
OutputSchemasSection  ← NEW
ContextPreconditionsSection
Testing Presets
McpServersSection
```

### OutputSchemasSection

Follows the exact same pattern as `ContextPreconditionsSection`:

- Header: "Output Schemas" label + Plus button
- List: each schema as a compact row showing name + field count + edit/delete buttons
- Plus button creates a new schema with default name `schema_XXXX` and opens the builder dialog
- Clicking edit (or the schema name) opens the builder dialog
- Delete shows confirmation AlertDialog

### State management

New hook `useOutputSchemas` (follows `useMcpServers` pattern):
- `schemas: OutputSchema[]`
- `addSchema(): string` — creates with default name, returns id
- `removeSchema(id: string): void`
- `updateSchema(id: string, updates: Partial<OutputSchema>): void`
- `setSchemas(schemas: OutputSchema[]): void` — for hydration from loaded graph
- Each mutation pushes an operation via `pushOperation`

Props flow: `SidePanels` → `PresetsAside` → `PresetsPanel` → `OutputSchemasSection`

## UI: Node Panel Selector

### Replace button with selector

Remove the `OutputSchemaDialog` trigger button from `NodePanel` header. Instead, add a `Select` dropdown in the node properties area (below the text fields, above the checkboxes), visible only for `node.type === 'agent'`:

- Label: "Output Schema"
- Options: all schemas by name + "New schema..." option at the bottom (separated)
- Selecting an existing schema sets `outputSchemaId` on the node
- Selecting "New schema..." creates a new schema, opens the builder dialog, then assigns it
- A small edit button (pencil icon) next to the selector opens the builder dialog for the currently selected schema
- "None" option to clear the selection

### Data flow

`updateNodeData({ outputSchemaId })` — same pattern as other node properties. The node stores the ID, not the fields.

## UI: Schema Builder Dialog (Premium Overhaul)

### Design principles

- **Compact + dense**: tight spacing, small text, no wasted pixels
- **Clean + soft**: muted colors, subtle borders, no harsh contrasts
- **Monospace field names**: `font-mono` on name inputs — signals "this is a code identifier"
- **Type-colored accents**: subtle left-border color per type on field cards
  - `string` → zinc/neutral (default)
  - `number` → blue
  - `boolean` → green
  - `enum` → amber
  - `object` → purple
  - `array` → orange
- **Clear nesting hierarchy**: colored left borders get progressively indented, background gets subtly darker per level

### Dialog changes

- Now takes `schema: OutputSchema` + `onChange: (updates: Partial<OutputSchema>) => void`
- Adds a name input at the top of the dialog (editable schema name)
- Title changes to show the schema name
- No longer triggered from NodePanel — triggered from OutputSchemasSection or NodePanel's "edit" button

### Field card redesign

Each field is a tight horizontal strip (not a card with padding):

```
[colored-left-border] [name: mono input] [type: select] [req: toggle] [desc: collapsed icon] [delete]
```

- **Name input**: `font-mono`, compact height (`h-6`), no label — placeholder is enough
- **Type select**: fixed width, compact
- **Required**: small toggle/switch instead of checkbox + label — saves space
- **Description**: collapsed by default — small info icon that expands to show a description input below when clicked. Only shows the icon when description is empty; shows a filled icon when description has content.
- **Delete**: ghost icon button, only visible on hover (reduces visual noise)
- **No Card wrapper** — use a simple `div` with left border color and subtle `hover:bg-muted/30` instead of Card component

### Nested fields

- Object properties: indented with colored left border (purple), slightly darker background
- Array items: indented with colored left border (orange)
- "Add field" button at each nesting level is just a subtle `+ Add` text button
- Max 3 levels enforced by hiding object/array from type selector at depth 3

### Enum values

Compact inline pills/tags instead of separate input rows:
- Show as inline comma-separated editable inputs
- Small `+` button to add a new value
- Each value has a tiny `×` to remove

## Pipeline Touch Points

| Layer | File | Change |
|-------|------|--------|
| graph-types | `schemas/output-schema.schema.ts` | Add `OutputSchemaEntitySchema`, change export |
| graph-types | `schemas/operation-output-schema.schema.ts` | New: insert/update/delete operations |
| graph-types | `schemas/operation.schema.ts` | Register new operation types |
| graph-types | `schemas/operation-node.schema.ts` | `outputSchema` → `outputSchemaId` |
| graph-types | `schemas/node.schema.ts` | `outputSchema` → `outputSchemaId` on Node, keep `outputSchema` on RuntimeNode for published snapshots |
| database | New migration | Create `graph_output_schemas`, alter `graph_nodes`, update `publish_version_tx` |
| backend | `db/queries/outputSchemaOperations.ts` | New: insert/update/delete for `graph_output_schemas` |
| backend | `db/queries/graphRowTypes.ts` | Add `OutputSchemaRow`, change `NodeRow` |
| backend | `db/queries/graphAssemblers.ts` | Add `assembleOutputSchemas`, update `assembleNode` |
| backend | `db/queries/graphFetchers.ts` | Fetch `graph_output_schemas` rows |
| backend | `db/queries/operationDispatch.ts` | Handle new operation types |
| backend | `db/queries/nodeOperations.ts` | `output_schema` → `output_schema_id` |
| web | `utils/graphTransformers.ts` | `outputSchema` → `outputSchemaId` on `RFNodeData` |
| web | `utils/operationBuilders.ts` | `outputSchema` → `outputSchemaId`, add schema operation builders |
| web | `hooks/useOutputSchemas.ts` | New hook |
| web | `components/panels/OutputSchemasSection.tsx` | New settings section |
| web | `components/panels/OutputSchemaDialog.tsx` | Refactor: takes schema entity, adds name input |
| web | `components/panels/OutputSchemaFieldCard.tsx` | Complete UI overhaul |
| web | `components/panels/outputSchemaTypes.ts` | Add type color map, entity helpers |
| web | `components/panels/NodePanel.tsx` | Replace button with Select dropdown |
| web | `components/panels/PresetsPanel.tsx` | Add OutputSchemasSection |
| web | `components/SidePanels.tsx` | Wire useOutputSchemas hook |
| web | `messages/en.json` | New/updated translation keys |

## Translations

New/updated keys under `nodePanel` and new `outputSchemas` namespace:

```
outputSchemas.sectionTitle: "Output Schemas"
outputSchemas.newSchema: "New schema..."
outputSchemas.deleteTitle: "Delete schema?"
outputSchemas.deleteDescription: "This will remove the schema \"{name}\" and unassign it from any nodes using it."
outputSchemas.schemaName: "Schema name"
outputSchemas.fieldCount: "{count} fields"
outputSchemas.none: "None"
outputSchemas.editSchema: "Edit schema"

nodePanel.outputSchema: "Output Schema"  (keep existing)
nodePanel.outputSchemaDescription → remove (no longer needed in dialog)
nodePanel.outputSchemaEmpty → keep
```
