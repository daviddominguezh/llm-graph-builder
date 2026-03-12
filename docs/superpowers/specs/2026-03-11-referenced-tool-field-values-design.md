# Referenced Tool Field Values — Design Spec

## Goal

Enable tool call parameters to reference structured outputs from previous nodes, creating data pipelines where upstream nodes extract structured data and downstream tool calls consume it. Includes full path-coverage validation, type safety, and fallback chains.

## Architecture

References extend the existing `ToolFieldValue` discriminated union. At design time, a graph-dominator algorithm validates that all execution paths provide the referenced data. At runtime, the executor resolves references by looking up a `structuredOutputs` map maintained by the caller. Output schema nodes produce structured data via dynamically-built Zod schemas passed to the Vercel AI SDK.

---

## 1. Data Model Changes

### 1.1 ToolFieldValue Schema (graph-types)

Current schema in `edge.schema.ts`:

```ts
// Current
{ type: 'fixed', value: string }
| { type: 'reference', nodeId: string, path: string }
```

Updated:

```ts
{ type: 'fixed', value: string }
| {
    type: 'reference',
    nodeId: string,       // ID of the node with the output schema
    path: string,         // top-level field name from the output schema
    fallbacks?: ToolFieldValue[]  // ordered fallback chain (fixed or reference)
  }
```

- `path` is a **top-level field name only** (no dot notation, no nested access).
- `fallbacks` is an ordered list tried in sequence when the primary reference is unavailable (node not visited) or null (optional field).
- Fallbacks that are themselves references can have their own fallbacks (recursive structure).

### 1.2 Node Schema: New `outputPrompt` Field

New optional field on the node schema:

```ts
outputPrompt?: string  // LLM instruction for structured output extraction
```

This is separate from the existing `description` field (which describes the node for the graph builder UI). `outputPrompt` is the actual text sent to the LLM telling it what to extract. Example: "Extract the team ID and creation timestamp from the conversation."

### 1.3 Node Constraints

**Mutual exclusion:** `outputSchemaId` and `nextNodeIsUser` are mutually exclusive.
- If a node has `outputSchemaId` set, `nextNodeIsUser` must be `false`.
- If a node has `nextNodeIsUser` set to `true`, `outputSchemaId` must be undefined.
- Enforced in both UI (disable checkbox) and validation.

**Output schema prompt:** When a node has `outputSchemaId`, it must also have a non-empty `outputPrompt`. In the Node Panel, when an output schema is selected, a "Prompt" text field becomes visible and is required. If missing, graph validation fails.

**Outgoing edge constraints:** Nodes with `outputSchemaId`:
- Must have **zero or one** outgoing edges (zero = terminal output node, one = pipeline step).
- Must NOT have outgoing edges with `user_said`, `agent_decision`, or `tool_call` preconditions.
- Must NOT have outgoing edges with context preconditions (for now — may be relaxed in a future version).
- The LLM output is the custom schema only (no `nextNodeID`, no `messageToUser`).
- If the node has one outgoing edge, routing is deterministic — always follow that edge.
- Enforced in graph validation.

**UI gating:** The output schema selector in the Node Panel is **disabled** when ANY of these conditions hold:
- The node has `nextNodeIsUser: true`.
- The node has more than one outgoing edge.
- Any outgoing edge has `user_said`, `agent_decision`, or `tool_call` preconditions.
- Any outgoing edge has context preconditions.
- An alert below the disabled selector explains the specific reason.

Conversely, when `outputSchemaId` is set:
- The "Next node is user" checkbox is disabled (greyed out, unchecked).

**Global nodes:** Global nodes always have `tool_call` outgoing edges and always return to the calling node. They cannot produce structured outputs and do not create alternative paths. The dominator check operates on the static graph and correctly ignores global node pseudo-edges.

### 1.4 StructuredOutputs Parameter

New parameter for `execute()` and `executeWithCallbacks()`:

```ts
structuredOutputs?: Record<string, unknown[]>
// keys = output node IDs, values = array of unique output objects produced by that node
// defaults to {} if not provided
```

Map of arrays for O(1) lookup by node ID. Each array contains **deduplicated** output objects (compared by JSON hash). The caller maintains this across calls, appending new unique outputs after each execution step.

**Stable JSON hashing:** Deduplication hashes must use **sorted-key serialization** (keys sorted alphabetically at every nesting level) to ensure deterministic comparison. Two objects with the same data but different key order must produce the same hash.

**Why arrays (cycle handling):** In a graph with cycles, the same node can be visited multiple times and produce different outputs each iteration. Instead of overwriting, all unique outputs are preserved. When resolving a reference:
- If only 1 unique output exists → use it directly as an EXACT value
- If 2+ unique outputs exist → inject all values into the prompt so the LLM can choose the most appropriate one based on context

**Internal accumulation:** Within a single `execute()` call, the executor maintains an internal copy of the map that includes both the caller's input AND outputs produced during the current flow. This mirrors how the `messages` array is accumulated — when the flow visits Node D (produces output) and then Node E (references D's output), D's output is available immediately. New outputs from the current flow are returned in `CallAgentOutput.structuredOutputs` for the caller to merge.

### 1.5 CallAgentOutput Extension

```ts
interface CallAgentOutput {
  // ...existing fields
  structuredOutputs?: Array<{ nodeId: string; data: unknown }>;
}
```

Array because a single `execute` call may visit multiple output-schema nodes during recursive flow processing. The caller deduplicates (by JSON hash) and appends to their `Record<string, unknown[]>` map for the next call.

---

## 2. Type Compatibility Rules

### 2.1 Type Matching Matrix

| Source (output) | Target (input) | Allowed? | Condition |
|---|---|---|---|
| string | string | Yes | — |
| number | number | Yes | — |
| number | integer (JSON Schema) | No | Unsafe — number may not be integer |
| integer (JSON Schema) | number | Yes | Safe — integer is a subset of number |
| boolean | boolean | Yes | — |
| enum | enum | Yes | Source values must be a **subset** of target values |
| enum | string | Yes | Always (enum is a string subset) |
| string | enum | No | — |
| number | string | No | — |
| string | number | No | — |
| boolean | string | No | — |
| array | array | Yes | Element types must match (single check — arrays are homogeneous) |
| object | object | N/A | Handled via approach B (see 2.3) |

Strict matching only. No implicit coercion. JSON Schema types other than `integer` are ignored for now (future version).

### 2.2 Required/Optional Rules

- **Required source → required target**: Allowed, no fallback needed.
- **Required source → optional target**: Allowed, no fallback needed.
- **Optional source → optional target**: Allowed, fallback is optional (user may provide one).
- **Optional source → required target**: Allowed, but fallback is **mandatory** (source might be null, target requires a value).

### 2.3 Object-to-Object Mapping

Objects are NOT mapped at the object level. Instead, they are **flattened**: each sub-property of the tool input independently gets its own fixed/inferred/reference toggle. The ToolParamsCard **recursively renders** nested object properties, each with the full three-way toggle (agent inferred / fixed / reference). This reuses the existing per-field mechanism and gives full flexibility (e.g., different sub-properties can reference different nodes).

### 2.4 JSON Schema Type Bridging

Tool input schemas use JSON Schema types. The current `SchemaProperty` interface in ToolParamsCard is flat and must be **enriched** to support nesting:

```ts
interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
  properties?: Record<string, SchemaProperty>;  // NEW: for nested objects
  items?: SchemaProperty;                        // NEW: for typed arrays
}
```

JSON Schema → our type system mapping for compatibility checks:
- `"string"` → `string`
- `"number"` → `number`
- `"integer"` → `number` (safe, integer is a subset)
- `"boolean"` → `boolean`
- `"string"` + `enum` array → `enum`
- `"array"` + `items` → `array` (check element type)
- `"object"` + `properties` → flattened (approach B)
- Other JSON Schema types (`null`, combinators like `anyOf`/`oneOf`) → ignored for now, field not eligible for references

---

## 3. Path Coverage Algorithm

### 3.1 Core Algorithm (Dominator Check)

Given target node T and referenced output node R:

1. Remove node R from the graph (remove all edges to/from R).
2. Check if T is still reachable from START.
3. If **NOT reachable** → R is a dominator of T. All paths pass through R. 100% coverage.
4. If **still reachable** → some paths bypass R. Fallbacks needed.

This handles cycles naturally without enumerating infinite paths.

### 3.2 Fallback Validation (Recursive)

When primary reference to R doesn't have 100% coverage:

1. User provides a fallback value (fixed or reference to another node F).
2. If fallback is `fixed` → chain is complete (fixed values are always available).
3. If fallback is `reference` to node F:
   - **If R's field is required:** Remove R from the graph (paths through R are guaranteed to have a non-null value, so only paths that bypass R need coverage). In this reduced graph, check if F dominates T.
   - **If R's field is optional:** Do NOT remove R from the graph (R might be on the path but produce null, so F must cover ALL paths to T, including those through R). In the full graph, check if F dominates T.
   - If F dominates T (in the appropriate graph) → chain is complete.
   - If F does NOT dominate T → user must provide another fallback for F.
   - If F's own field is optional and the target is required, the same optionality rules apply recursively — another fallback is needed.

### 3.3 Optionality Fallbacks

When a referenced field is optional (nullable):
- The same fallback chain handles it — at runtime, if the value is null, the executor moves to the next fallback.
- At design time, if the source field is optional and the target is required, at least one fallback must be provided.
- The fallback chain is unified — path-coverage fallbacks and null-fallbacks share the same `fallbacks` array.

### 3.4 Upstream Node Discovery

To populate the reference dialog's node/field selector, we need to find all output-schema nodes that are **upstream** of the current tool call's source node S.

**Algorithm:** Node R is upstream of S if:
1. R ≠ S (a node cannot reference its own output)
2. R is reachable from START in the directed graph (R is part of the active graph)
3. S is reachable from R in the directed graph (R comes before S on at least one path)

Implementation: two BFS/DFS calls per candidate node, or a single pre-computation of all ancestors of S.

**Optimization:** Pre-compute the set of ancestors of S (all nodes from which S is reachable via a reverse BFS from S). Then filter to those with `outputSchemaId` set. This is O(V + E) and only needs to run once when the reference dialog opens.

**Note:** S is the **source node** of the tool call edge (the node whose outgoing edge has the `tool_call` precondition), not the target. The tool is called when the flow is at S.

### 3.5 Validation Rules

- A reference is **valid** only when 100% coverage is guaranteed (path + optionality).
- The Apply button in the reference dialog is disabled until valid.
- The `reference` type is never persisted in an incomplete state.

---

## 4. Runtime Resolution

### 4.1 Reference Resolution Algorithm

For each tool field with `type: 'reference'`:

1. Check `structuredOutputs[nodeId]` exists and has at least one entry.
   - If no → try next item in `fallbacks`.
2. Extract the `path` field from all entries in `structuredOutputs[nodeId]`.
3. Deduplicate the extracted values (by JSON hash).
4. Filter out null values.
   - If all values are null → try next item in `fallbacks`.
5. If exactly **one** unique non-null value → use it as an EXACT value.
6. If **multiple** unique non-null values → inject all into the prompt (see 4.2).
7. If no values resolved from any fallback → should never happen (design-time validation guarantees resolution).

For fallbacks:
- If fallback is `fixed` → use the fixed value.
- If fallback is `reference` → apply same algorithm recursively.

### 4.2 Prompt Injection

**Single value** — resolved references are injected identically to fixed values:

```
For the following parameters, use these EXACT values:
- teamId: "abc-123"
- timestamp: "2026-03-11T10:00:00Z"
```

**Multiple values (from cycles)** — when a node was visited multiple times and produced different values:

```
For the following parameters, use these EXACT values:
- timestamp: "2026-03-11T10:00:00Z"

For the following parameters, multiple values are available from different executions. Choose the most appropriate based on context:
- teamId: one of ["abc-123", "def-456"]
```

From the LLM's perspective, single-value references are deterministic (EXACT). Multi-value references give the LLM a constrained choice. Complex types (objects/arrays) are JSON-serialized.

### 4.3 Executor Flow

**Output schema node processing:**
- When the current node has `outputSchemaId`, look up the schema from `graph.outputSchemas`.
- The node's `outputPrompt` field is used as the LLM prompt (telling the model what to extract).
- Convert `OutputSchemaField[]` to a Zod schema via `outputSchemaToZod()`.
- In `modelCaller.ts`, pass the dynamic schema to `Output.object({ schema })` instead of the hardcoded `{nextNodeID, messageToUser}`.
- The parsed output is added to the internal `structuredOutputs` accumulator and collected into `CallAgentOutput.structuredOutputs`.
- **Message history:** The structured output node's prompt and the LLM's structured response are added to the conversation history, like any other node. This keeps the LLM context coherent across multi-step flows.
- Routing follows the single outgoing edge (if any) or terminates (if no outgoing edges).

**Reference resolution in tool calls:**
- In `buildFixedFieldsPrompt` (stateMachine), extend to handle `type: 'reference'` by resolving from the `structuredOutputs` map using the algorithm in 4.1.
- After resolution, format identically to fixed values.
- The `structuredOutputs` map must be threaded through the full config chain: `execute()` → `CallAgentInput` → `FlowState` → `buildNextAgentConfig()` → `getNextOptions()` → `buildToolCallOptions()` → `buildFixedFieldsPrompt()`. Each function in this chain receives and forwards the map.

**Dispatch for output schema nodes:**
- Output schema nodes do NOT introduce a new `kind`. They use the existing `agent` kind.
- In `getNextOptions`, BEFORE the terminal-node early return (`edges.length === 0`), check if the current node has `outputSchemaId`. If so, return a new `structured_output` options variant with the output prompt and schema (even if there are zero edges — terminal output nodes are valid).
- In the node processor dispatch, if the node has `outputSchemaId`, route to a new `processStructuredOutputNode()` function instead of `processReplyNode()`. This function:
  1. Uses the `outputPrompt` as the system prompt
  2. Builds the dynamic Zod schema via `outputSchemaToZod()`
  3. Calls the model with `Output.object({ schema })`
  4. Collects the structured output into the accumulator
  5. Follows the single outgoing edge (if any) or terminates

---

## 5. Dynamic Zod Schema Generation

### 5.1 Location

New file: `packages/api/src/utils/outputSchemaToZod.ts`

### 5.2 Conversion Rules

```
OutputSchemaField.type → Zod type
  string   → z.string()
  number   → z.number()
  boolean  → z.boolean()
  enum     → z.enum([...enumValues])
  array    → z.array(<element type zod>)
  object   → z.object({...recursive field conversion})
```

- Required fields: `z.<type>()`
- Optional fields: `z.<type>().nullable()`
- The field is always present in the JSON but can be `null` when optional.

### 5.3 Integration

In `modelCaller.ts`, the `executeModelCall` function:
- Currently: if no `expectedTool`, uses hardcoded `z.object({nextNodeID, messageToUser})`.
- New: if the node has an output schema, uses the dynamically-built Zod schema instead.
- The node's output schema must be passed through the config chain (from `buildNextAgentConfig` → `SMConfig` → executor → `callModel`).

---

## 6. API Changes

### 6.1 execute() Signature

```ts
export const execute = async (
  context: Context,
  messages: Message[],
  structuredOutputs?: Record<string, unknown[]>,  // NEW, defaults to {}
  currentNode?: string,
  logger?: Logger
): Promise<CallAgentOutput | null>
```

### 6.2 executeWithCallbacks() Signature

```ts
interface ExecuteWithCallbacksOptions {
  // ...existing fields
  structuredOutputs?: Record<string, unknown[]>;  // NEW, defaults to {}
}
```

### 6.3 CallAgentOutput

```ts
interface CallAgentOutput {
  // ...existing fields
  structuredOutputs?: Array<{ nodeId: string; data: unknown }>;  // NEW
}
```

---

## 7. UI Changes

### 7.1 Node Panel: Output Schema Gating

The output schema selector is **disabled** when ANY of these conditions hold:
- `nextNodeIsUser` is true (alert: "Disable 'next node is user' to set an output schema").
- The node has more than one outgoing edge (alert: "Output schemas require at most one outgoing edge").
- Any outgoing edge has `user_said`, `agent_decision`, or `tool_call` preconditions (alert: "Remove preconditions from outgoing edges to set an output schema").
- Any outgoing edge has context preconditions (alert: "Remove context preconditions from outgoing edges to set an output schema").

When an output schema is selected:
- A **"Prompt"** text field (`outputPrompt`) becomes visible. This is a **separate field** from Description — it instructs the LLM what to extract. **Required** — graph validation fails if empty.
- The "Next node is user" checkbox is disabled.

### 7.2 Three-Way Field Toggle (ToolParamsCard)

Replace the "Agent inferred" checkbox with a three-option selector:
- **Agent inferred** (default) — LLM determines the value
- **Fixed** — text input for a hardcoded value (current behavior)
- **Reference** — opens the reference configuration dialog

The ToolParamsCard **recursively renders** nested object parameters. Each sub-property of an object-typed parameter gets its own three-way toggle, indented to show nesting.

### 7.3 Reference Configuration Dialog

Opens when user selects "Reference". Contains:

1. **Node/field selector**: dropdown showing eligible upstream nodes grouped by node name. Only nodes with output schemas that are upstream of the current node are shown. Only type-compatible fields are listed.

2. **Path coverage section**: after selecting a field, shows coverage status:
   - 100% coverage → subtle checkmark
   - Incomplete → soft info indicator (not orange/warning) explaining "Some paths don't pass through [Node Name]" with a fallback selector below

3. **Fallback selectors**: each uncovered case shows a fixed/reference selector. If reference is chosen, the same validation runs recursively.

4. **Optionality fallbacks**: if the selected field is optional and target is required, a fallback selector appears with soft info text.

5. **Apply button**: disabled until 100% coverage + all required fallbacks provided. Persists the reference atomically.

6. **Cancel button**: reverts to previous state. No partial reference is ever saved.

### 7.4 Compact Reference Display

After a reference is applied, the field in ToolParamsCard shows:
- A compact chip: "References set" with a check icon
- A small edit button that re-opens the reference dialog

### 7.5 Simulation

The simulation feature (`useSimulation.ts`) calls `executeWithCallbacks` across steps, maintaining `messages` state. It must also maintain `structuredOutputs: Record<string, unknown[]>` across steps:
- Initialize as `{}` when simulation starts
- After each step, merge `result.structuredOutputs` into the map (deduplicate by JSON hash per nodeId)
- Pass the full map on each subsequent `executeWithCallbacks` call

### 7.6 Graph Validation

**Output schema node rules:**
- Nodes with `outputSchemaId` must have zero or one outgoing edges.
- Nodes with `outputSchemaId` must not have outgoing edges with `user_said`, `agent_decision`, or `tool_call` preconditions.
- Nodes with `outputSchemaId` must not have outgoing edges with context preconditions (for now).
- Nodes with `outputSchemaId` cannot have `nextNodeIsUser: true`.
- Nodes with `outputSchemaId` must have a non-empty `outputPrompt` (the LLM extraction instruction).
- Nodes with `outputSchemaId` must reference a schema that has at least one field (empty schemas are invalid).

**Cross-cutting reference validation** (checked on every graph validation pass):
- For every `reference` type in any edge's `toolFields`, the referenced `nodeId` must exist and have an `outputSchemaId` set.
- The referenced `path` (field name) must exist in the referenced node's output schema.
- Path coverage must still be 100% for the current graph topology (re-run dominator check). This catches cases where the user added/removed edges after setting up a reference.
- Fallbacks in the chain are recursively validated with the same rules.

---

## 8. Database Migration

New migration required:

```sql
ALTER TABLE graph_nodes ADD COLUMN output_prompt TEXT;
```

Additionally, the `publish_version_tx` SQL function must include `output_prompt` in the version JSONB snapshot so published versions preserve the prompt.

Backend plumbing:
- `graphRowTypes.ts`: Add `output_prompt: string | null` to `NodeRow`
- `nodeOperations.ts`: Read/write `output_prompt` in insert/update operations
- `graphAssemblers.ts`: Parse `output_prompt` into the assembled node object
- `graphFetchers.ts`: Include `output_prompt` in the SELECT query

Graph-types:
- `NodeSchema`: Add `outputPrompt: z.string().optional()`
- `RuntimeNodeSchema`: Also add `outputPrompt` (published versions need it)

---

## 9. Packages Affected

| Package | Changes |
|---|---|
| `graph-types` | Update `ToolFieldValue` reference variant with `fallbacks` (requires `z.lazy()` for recursive type), add `outputPrompt` to node schema |
| `api` | New `outputSchemaToZod` util, update `execute`/`executeWithCallbacks` signatures, update `modelCaller` for dynamic schemas, update `buildFixedFieldsPrompt` to resolve references (single + multi-value), internal `structuredOutputs` accumulation with deduplication, collect structured outputs during flow, new prompt kind for output schema nodes |
| `web` | Three-way toggle in ToolParamsCard (with recursive nested params via enriched `SchemaProperty`), reference dialog with upstream discovery, path coverage algorithm (dominator check), type compatibility checker (with JSON Schema bridging), node panel gating + `outputPrompt` field, graph validation rules |
| `backend` | Pass-through: store/retrieve updated `toolFields` with references (no logic changes — schema already supports the `reference` type), store/retrieve new `outputPrompt` field on nodes |

---

## 10. Key Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Routing for output schema nodes | Zero or one outgoing edge, no routing decision | Clean separation: nodes either route or produce data |
| messageToUser | Not produced by output schema nodes | They're data-extraction steps, not conversational turns |
| outputSchemaId vs nextNodeIsUser | Mutually exclusive | Clean invariant, simplifies both UI and runtime |
| Output schema prompt | New `outputPrompt` field (separate from `description`), required | Clean separation: description for UI, prompt for LLM |
| Fallback model | Unified ordered chain (`fallbacks: ToolFieldValue[]`) | Better DX than separate path/null fallback arrays |
| Path coverage algorithm | Dominator check (remove node, test reachability). Fallback validation: remove R only when R's field is required; when optional, validate in full graph | Handles cycles, no infinite path enumeration. Correct for optional fields |
| Upstream discovery | Reverse BFS from source node, filter to output-schema nodes | O(V+E), runs once when dialog opens |
| Object mapping | Flatten to per-property references (approach B), recursive ToolParamsCard | Simpler, reuses existing mechanism, more flexible |
| Type matching | Strict, no coercion. `integer` → `number` safe, `number` → `integer` blocked | Avoids subtle runtime bugs |
| JSON Schema bridging | Enrich `SchemaProperty` with `properties`/`items` for nesting | Required for recursive ToolParamsCard |
| enum compatibility | Source must be subset of target | Source can never produce a value target doesn't accept |
| Field paths | Top-level only (no dot notation) | Simpler for v1, covers primary use case |
| Optional fields in Zod | `.nullable()` | Field always present in JSON, can be null |
| Reference persistence | Atomic (dialog Apply/Cancel) | Never save incomplete references |
| Reference UI | Dialog (not inline panel) | Complex fallback UI doesn't fit in thin side panel |
| structuredOutputs param | `Record<string, unknown[]>` (map of arrays), optional, defaults to `{}` | O(1) lookup, preserves cycle outputs |
| Cycle handling | Deduplicate by stable JSON hash (sorted keys), inform LLM when multiple unique values exist | LLM gets constrained choice instead of silent overwrite, deterministic dedup |
| Internal accumulation | Executor accumulates outputs during flow, like messages | Same-call references work (D → E where E refs D) |
| Coverage indicators | Soft/info style, not warning orange | Subtle, explains why more selections are needed |
| Schema selector gating | Disabled when >1 edge, any preconditions, or nextNodeIsUser | Prevents invalid states at the UI level |
| Context preconditions on output nodes | Blocked for now | Simplifies v1, can relax later |
| Global nodes | Not a concern — always return to caller, only tool_call edges | Cannot produce structured outputs or create bypass paths |
| Recursive Zod schema | `ToolFieldValueSchema` uses `z.lazy()` for fallbacks | Required for recursive discriminated union |
| Execution dispatch | `outputSchemaId` check before terminal-node early return; routes to `processStructuredOutputNode()` | No new kind needed, just a new processor function |
| Message history | Structured output nodes add prompt + response to conversation history | Keeps LLM context coherent across multi-step flows |
| structuredOutputs threading | Passed through full function chain (6 functions), not on Context | Explicit data flow, no hidden state |
| Cross-cutting reference validation | Graph validation re-checks all references on every pass | Catches invalidation from graph edits after reference setup |
| Empty output schemas | Blocked by validation (must have ≥1 field) | Prevents useless `{}` outputs |
| Simulation | `useSimulation` maintains structuredOutputs across steps | References work in simulated flows |
| Database | New `output_prompt` column, publish function updated | Persistent storage + version snapshots |
