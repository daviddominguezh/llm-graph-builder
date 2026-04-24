# Forms — Design Spec

**Date:** 2026-04-24
**Linear ticket:** [OF-4 — Capability: Structured Data Collection](https://linear.app/open-flow/issue/OF-4/capability-structured-data-collection)
**Status:** Approved

## Summary

"Forms" let an agent collect structured data from end-users during a conversation and export it as CSV. A form is an agent-scoped object with a unique slug, bound to an existing output schema, with optional per-field validation rules. Agents read and write form data through two tools (`set_form_fields`, `get_form_field`). Collected data lives in `conversations.metadata.forms[formSlug]`. Users configure forms in the agent editor's Data tab, inspect collected data in the chats dashboard's right panel, and export it via a modal-driven CSV download.

## Goals & non-goals

### Goals
- Per-agent form definitions with unique slugs, bound to reusable output schemas.
- Per-field validation rules (format, date/time constraints, length/range).
- Tools that persist validated data atomically and report structured errors.
- UI surfaces for configuration (Data tab), inspection (right panel), and export (CSV).
- Filter-aware, tenant-scoped CSV export with a 15-day-max time window.

### Non-goals (MVP)
- Conditional fields (shown only when another field has a specific value).
- Resuming partial forms across sessions from the UI.
- A separate form-builder UI distinct from the output-schema builder.
- Pre-fill from CRM.
- Multi-locale translations (repo is English-only today).
- Automatic migration of existing `conversations.metadata` when a schema field is renamed (warnings only).
- Per-form access control beyond existing agent/tenant membership.

## Data model

### New table `graph_forms`

```sql
CREATE TABLE public.graph_forms (
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  form_slug   text NOT NULL,
  schema_id   text NOT NULL,
  validations jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (agent_id, form_slug),
  FOREIGN KEY (agent_id, schema_id)
    REFERENCES graph_output_schemas(agent_id, schema_id)
    ON DELETE RESTRICT,
  CONSTRAINT form_slug_format CHECK (form_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
```

- Slug is normalized to lowercase before insert/update.
- PK `(agent_id, form_slug)` mirrors `graph_output_schemas (agent_id, schema_id)`; slug uniqueness is per-agent, not global.
- `ON DELETE RESTRICT` on the schema FK is the DB-level safety net behind the UI's "schema is used by N forms" warning.
- RLS policies follow the existing `is_org_member` pattern used by `graph_output_schemas`.

### `conversations.metadata` shape

Form data is namespaced under a single top-level key so it cannot collide with existing keys (`lead_score`, `userName`):

```jsonc
{
  "lead_score": 85,
  "userName": "John",
  "forms": {
    "lead-capture": {
      "name": "John Doe",
      "email": "john@example.com",
      "addresses": [{ "firstLine": "123 Main St" }]
    },
    "qualification": { "budget": 5000 }
  }
}
```

- `metadata.forms[formSlug]` holds the entire form's data, shaped exactly like its schema.
- Multiple forms per conversation live side-by-side as independent objects.
- Writes use a single JSONB upsert (`jsonb_set`) statement to avoid read-modify-write races.

### `validations` JSONB shape

Keyed by the **canonical schema field path** — dotted, with `[]` for array slots (no concrete indices). At runtime, paths like `addresses[2].firstLine` normalize to `addresses[].firstLine` for validation lookup.

```jsonc
{
  "name":                      { "kind": "fullName" },
  "email":                     { "kind": "email" },
  "age":                       { "kind": "length", "min": 18, "max": 100 },
  "addresses[].firstLine":     { "kind": "length", "exact": 50 },
  "phones[]":                  { "kind": "length", "min": 7, "max": 15 }
}
```

### Migrations (apply in order)

1. `20260424000000_graph_forms_table.sql` — create `graph_forms`, RLS, FK, slug check.
2. `20260424000001_conversations_forms_gin_index.sql` — `CREATE INDEX … ON conversations USING gin (metadata jsonb_path_ops)` to speed the `metadata->'forms' ? :formSlug` lookup used by the CSV export.

## Validations

Validations live on the form (not the schema). The same schema can power two forms with different rules.

| Kind | Payload | Applies to | UI label |
|---|---|---|---|
| `email` | — | string | Valid email |
| `fullName` | — | string | Valid full name (≥2 words, each ≥2 chars) |
| `pastDate` | — | string (ISO `YYYY-MM-DD`) | Past date |
| `futureDate` | — | string (ISO `YYYY-MM-DD`) | Future date |
| `pastHour` | — | string (`HH:mm`) | Past hour |
| `futureHour` | — | string (`HH:mm`) | Future hour |
| `length` | `{ min?, max?, exact? }` | string OR number | "Length" (strings) / "Range" (numbers) |

For `length`:
- On strings → character count.
- On numbers → numeric value.
- `exact` and `min/max` are mutually exclusive in the UI (radio: "Range" vs "Exact").

### Two-pass validation in the `set_form_fields` tool

1. **Type pass (Zod, dynamic):** build a Zod validator for each field path from the form's output schema; check every `fieldValue`. Catches type mismatches and unknown paths.
2. **Rule pass:** for fields that pass the type pass, look up `validations[canonicalPath]` and run `runValidation`.

Both passes accumulate errors before returning, so the agent receives all problems in one round-trip.

### Atomicity

If any field fails in either pass, nothing is persisted. The tool returns every error. This keeps `conversations.metadata` from ever reaching a half-valid state and makes retries straightforward for the LLM.

## Tools

### Names
- `set_form_fields`
- `get_form_field`

Registered under `OpenFlow/Forms` in `packages/web/app/lib/toolRegistry.ts`, mirroring the `OpenFlow/LeadScoring` pattern.

### File layout

```
packages/api/src/lib/forms/
  applyFormFields.ts     — pure; (form, currentData, fields) → ApplyResult
  readFormField.ts       — pure; (data, fieldPath) → value | error
  normalizePath.ts       — runtime "addresses[2].firstLine" → canonical "addresses[].firstLine"
  zodForFieldPath.ts     — walks OutputSchemaField[] → Zod validator for a path
  runValidation.ts       — applies one ValidationRule to a value
  collectFieldPaths.ts   — (used by CSV) walks schema → canonical paths for leaves
  expandArrayColumns.ts  — (used by CSV) expands [] paths to [0], [1], … given max observed
  formatCsvRow.ts        — RFC 4180 escaping

packages/api/src/services/formsService.ts
  interface FormsService { getFormDefinitions, getFormData, setFormData }
  (interface only; concrete impl lives in packages/web)

packages/api/src/tools/formsTools.ts
  buildFormsTools(services, forms) → { set_form_fields, get_form_field }
```

The pure lib functions are reused by the right-panel "collected data" view, the CSV export server action, and unit tests.

### Tool input schemas

```ts
const setFormFieldsInput = z.object({
  formSlug: z.string().min(1),
  fields: z.array(z.object({
    fieldPath:  z.string().min(1),    // "name" or "addresses[2].firstLine"
    fieldValue: z.unknown(),           // validated dynamically against the schema
  })).min(1),
});

const getFormFieldInput = z.object({
  formSlug:  z.string().min(1),
  fieldPath: z.string().min(1),
});
```

`fieldValue` is declared as `z.unknown()` because its concrete type depends on the target field; the LLM learns the expected types from the **tool description**, which is generated per-agent-run.

### Tool description (LLM-facing, dynamically generated)

```
set_form_fields — Persist one or more field values into a form.

Available forms on this agent:
  • lead-capture (schema: LeadCapture)
      name: string (validation: full name — two words, each ≥2 chars)
      email: string (validation: valid email)
      addresses: array of objects
        addresses[].firstLine: string (validation: length exactly 50)
  • qualification (schema: Qualification)
      budget: number (validation: range 100-1000000)
      tags[]: string

Call shape:
  { formSlug, fields: [{ fieldPath, fieldValue }, ...] }

Use dotted paths with numeric indices for array items, e.g. "addresses[0].firstLine".
All fields must validate or none will be saved. Errors include expected type and
validation reason so you can self-correct.
```

Both tools receive the same per-form catalogue.

### `set_form_fields` execute flow

1. Look up form definition. If slug unknown → `{ ok: false, errors: [{ reason: "Form <slug> not found. Available: [...]" }] }`.
2. Type pass: for each field, resolve canonical path, fetch Zod validator via `zodForFieldPath`, run it. Collect errors.
3. Rule pass: for fields that pass, run `runValidation` with the field's rule (if any). Collect errors.
4. If any errors in either pass → return all errors, do not persist.
5. If clean → merge into existing form data, call `services.setFormData(formSlug, mergedData)`. Return `{ ok: true, applied: [{ fieldPath }, ...] }`.

### `get_form_field` execute flow

1. Look up form definition (same not-found handling).
2. Resolve path against current form data.
3. Return `{ ok: true, value }`, or `{ ok: false, reason: "Field <path> has not been set yet", expectedType: "…" }`, or `{ ok: false, reason: "Path <path> does not exist on form <slug>", availablePaths: [...] }`.

### Error response shape (all variants)

```ts
{
  ok: false,
  errors: [{
    fieldPath:    "email",
    status:       "typeError" | "pathError" | "validationError",
    reason:       "Expected a string matching email format",
    expectedType: "string (email)",
  }]
}
```

`expectedType` is always included so the agent can self-correct.

### Context plumbing

- At agent-run initialization, the current agent's forms (definitions + validations) are loaded once into `context.forms: FormDefinition[]`.
- `buildFormsTools(services, context.forms)` creates the tool functions, bound to this run's forms.
- `services` is the web-side `FormsService` implementation that reads/writes `conversations.metadata.forms[formSlug]`.

## Data-tab UI (form configuration)

A new `FormsSection` in `DataTabContent`, rendered below `OutputSchemasSection`. Same collapsible section pattern.

### Files

```
packages/web/app/components/panels/
  FormsSection.tsx             — collapsible wrapper + empty-state + list
  FormsEmptyState.tsx          — two-mode empty state (no schemas vs no forms)
  FormsList.tsx                — list rows with edit/delete
  FormDialog.tsx               — create/edit dialog shell
  FormDialogSlugField.tsx      — slug input + live validation
  FormDialogSchemaPicker.tsx   — output-schema select
  FormDialogValidations.tsx    — walks selected schema, renders one row per simple leaf
  FormValidationRow.tsx        — one row: field path + type badge + kind dropdown
  FormValidationLengthInput.tsx — Range/Exact secondary controls
```

Every file stays under 300 lines; every function under 40.

### Empty states (dashed border, icon-in-muted-box, two text lines, action — mirrors the tenants page)

**Mode A — no output schemas yet**

> No forms can be created yet
> Forms are built from output schemas. Create an output schema first to get started.
> *(No button. Message points at the section directly above.)*

**Mode B — schemas exist, no forms**

> No forms yet
> Forms let your agent collect structured data during conversations and export it as CSV.
> **[+ Create form]**

### Create dialog

Three stacked groups:

1. **Slug** — text input with live validation:
   - Regex `^[a-z0-9]+(-[a-z0-9]+)*$`, lowercase on input (`"Lead Capture"` → `"lead-capture"`).
   - Async uniqueness check against `graph_forms` (debounced 300ms, scoped to `agent_id`).
   - Inline errors: `Invalid format`, `Already in use`.
2. **Schema** — `Select` sourced from `graph_output_schemas` for the current agent. Required.
3. **Validations** — appears only after a schema is picked. Walks the schema depth-first, renders one `FormValidationRow` per **simple leaf** (string or number). Enums and composed containers are skipped; their leaves surface naturally.

Validation row layout: `<path>  <type badge>  <kind dropdown>  <optional payload>`.
Dropdown options gated by field type:
- string → None, Valid email, Valid full name, Past date, Future date, Past hour, Future hour, Length.
- number → None, Range.
Length/Range → radio `Range` (min + max inputs) vs `Exact` (single input). At least one of min/max required for Range; Exact requires a single value.

**Create button enable rule:** slug valid + unique + schema selected + every validation row either "None" or fully configured.

### Edit dialog

- **Slug readonly** — PK of the row and the key under `conversations.metadata.forms[…]`; renaming would orphan data.
- **Schema readonly** — changing it would invalidate collected data. Helper text: "To use a different schema, delete this form and create a new one."
- **Only validations are editable.**

### Delete

Confirmation dialog:

> Delete form `<slug>`?
> Data collected in past conversations stays in the database but will no longer appear in the dashboard or CSV export.
> **[Cancel]** **[Delete]**

Orphaned data at `conversations.metadata.forms[<deletedSlug>]` is left untouched; no migration.

### Schema-coupling warnings ("literal, everywhere")

Land in the existing output-schema UI (not Forms UI):

1. **OutputSchemaDialog (edit)** — persistent banner when the schema is used by ≥1 form:
   > ⚠️ This schema is used by N form(s): `lead-capture`, `qualification`. Renaming or removing fields here will orphan data already collected in those forms.

2. **OutputSchemaFieldCard (rename/remove)** — inline warning:
   > ⚠️ Used by form `<slug>`. Renaming will orphan collected data.

3. **Schema delete** — blocked outright (`ON DELETE RESTRICT` + pre-check):
   > This schema is used by N form(s) and can't be deleted. Remove those forms first: `lead-capture`, `qualification`.

## Chats-dashboard UI

### Right panel — "Form data" section

Inserted below the bot-active toggle (around `RightPanel.tsx:359`), above Notes. Follows the existing collapsible-section pattern.

Structure:

```
Form data                                  [v]
  ├─ lead-capture
  │   name:                     John Doe
  │   email:                    john@example.com
  │   addresses[0].firstLine:   123 Main St
  │   phones[0]:                —                   (muted)
  └─ qualification
      budget:                   $5,000
```

- One sub-block per form defined on this conversation's agent. Form slug as muted sub-header.
- **Non-array schema fields**: listed in schema order, whether filled or not. Filled → value; unfilled → muted `—`.
- **Array schema fields**: one listing per actual existing array instance in the data (`addresses[0].firstLine`, `addresses[1].firstLine`, …). If the array is empty, the array's sub-fields are not listed at all — instead a single muted row `addresses[]: —` is shown under that key.
- Nested paths shown with dotted notation (matches tool contract and CSV).
- Section hidden entirely if the agent has zero forms.
- Initially collapsed unless ≥1 filled field exists on any form.

**New file:** `packages/web/app/components/messages/components/RightPanel/FormDataSection.tsx`

### Left panel — "Download CSV" ghost button

Drops into the existing `left-panel-bottom` slot (`LeftPanel.tsx:131`).
- `<Button variant="ghost" size="sm">` with `Download` icon + label `Export as CSV`.
- Full width of sidebar, aligned with nav rows above it.
- `onClick` → opens the CSV export modal.

**New file:** `packages/web/app/components/messages/components/LeftPanel/ExportCsvButton.tsx`

### Chat list — agent filter

An agent `Select` next to the existing search input in the chat-list middle panel.
- Placeholder: `All agents`.
- Options: every agent in the current tenant.
- Narrows the conversation list (ANDed with existing status filters).
- Becomes the default selected agent in the CSV export modal.
- If not set, the CSV modal opens with the agent select empty and the form select disabled.

**New file:** `packages/web/app/components/messages/components/ChatList/AgentFilterSelect.tsx` (+ edit to the existing search-bar wrapper to host it).

### CSV export modal

Opens from the ghost button. Fields top-to-bottom:

| Field | Behavior |
|---|---|
| **Date range** | Two date pickers (`from` / `to`). Default = today − 15d → today. Validators: `to - from ≤ 15 days`, `from ≤ to`. Errors inline. |
| **Agent** | `Select`, prepopulated from chat-list agent filter. Required. |
| **Form** | `Select`, **disabled until agent chosen**, populated with that agent's forms. Required. |

Footer: `[Cancel]  [Export]`. Export disabled until all three valid.

**On Export:**
1. Call server action `exportFormCsv({ tenantId, agentId, formSlug, from, to, statusFilter })`. `statusFilter` is the currently-active chat-list filter.
2. Server queries `conversations` by `tenant_id + agent_id + created_at range + status`, reads `metadata.forms[formSlug]`, keeps rows where ≥1 field is filled.
3. Zero valid rows → modal stays open, shows muted `No data to export for the selected range.` No download.
4. Else → generate CSV, browser download, close modal.

**New files:**
```
packages/web/app/components/messages/components/ExportCsv/
  ExportCsvDialog.tsx
  ExportCsvDateRange.tsx
  ExportCsvAgentSelect.tsx
  ExportCsvFormSelect.tsx
```

## CSV export server action

### Transport
Server Action at `packages/web/app/actions/forms.ts`. Matches the existing data-access rule (Client → Next.js backend → dedicated backend) and avoids a redundant REST surface.

### Signature

```ts
type ExportFormCsvInput = {
  tenantId: string;
  agentId: string;
  formSlug: string;
  from: string;    // ISO date
  to: string;      // ISO date
  statusFilter:
    | { kind: 'all' }
    | { kind: 'yourInbox'; userId: string }
    | { kind: 'withAgent' }
    | { kind: 'unassigned' }
    | { kind: 'open' | 'blocked' | 'closed' };
};

type ExportFormCsvResult =
  | { ok: true; filename: string; csv: string }
  | { ok: false; reason: 'no-data' | 'invalid-range' | 'forbidden' };
```

### Query

```sql
SELECT id, user_channel_id, channel, created_at, last_message_at, status,
       metadata->'forms'->:formSlug AS form_data,
       metadata->>'userName' AS user_name
FROM conversations
WHERE tenant_id = :tenantId
  AND agent_id = :agentId
  AND created_at >= :from AND created_at < :to
  AND (/* status-filter SQL */)
  AND metadata->'forms' ? :formSlug
ORDER BY created_at ASC;
```

RLS (`is_org_member` on `conversations`) handles authorization; the action also verifies the caller owns the agent/tenant combo at entry.

### Assembly

Pipeline reuses the pure lib:

1. `collectFieldPaths(form)` → canonical paths for all leaves.
2. `expandArrayColumns(paths, rows)` → expands `[]` to `[0]`, `[1]`, … using max observed array length.
3. `rowToCells(row, expandedPaths)` → resolves value for each path from `form_data`, coerces to string (dates → ISO, numbers → as-is, nulls → empty).
4. `formatCsvRow(cells)` → RFC 4180 escaping.

Fixed columns first: `conversation_id, user_name, channel, started_at, last_message_at, status`. Then expanded dynamic columns. Rows where every dynamic cell is empty are dropped (the "≥1 filled field" rule). If zero rows remain → `{ ok: false, reason: 'no-data' }`.

### Filename

`openflow-<tenantSlug>-<agentSlug>-<formSlug>-<from>-<to>.csv`

### CSV escaping

RFC 4180: wrap cells containing `,`, `"`, or newline in double quotes; escape `"` as `""`.

### Client download

Modal receives `{ csv, filename }`, constructs a `Blob`, and triggers a hidden-anchor click. Standard browser pattern.

## i18n

New keys under `forms.*` in `packages/web/messages/en.json`:

```
forms.section.title
forms.section.description
forms.empty.noSchemas.title
forms.empty.noSchemas.description
forms.empty.noForms.title
forms.empty.noForms.description
forms.empty.noForms.cta
forms.dialog.create.title
forms.dialog.edit.title
forms.field.slug.label
forms.field.slug.placeholder
forms.field.slug.invalidFormat
forms.field.slug.taken
forms.field.schema.label
forms.field.schema.placeholder
forms.field.schema.immutableHelp
forms.validations.title
forms.validations.kind.none
forms.validations.kind.email
forms.validations.kind.fullName
forms.validations.kind.pastDate
forms.validations.kind.futureDate
forms.validations.kind.pastHour
forms.validations.kind.futureHour
forms.validations.kind.length
forms.validations.kind.range
forms.validations.length.mode.range
forms.validations.length.mode.exact
forms.validations.length.min
forms.validations.length.max
forms.validations.length.exact
forms.delete.title
forms.delete.body
forms.delete.cancel
forms.delete.confirm
forms.rightPanel.title
forms.rightPanel.noData
forms.rightPanel.notSet
forms.chatList.agentFilter.placeholder
forms.export.button
forms.export.dialog.title
forms.export.dateRange.label
forms.export.dateRange.max15Days
forms.export.agent.label
forms.export.form.label
forms.export.cancel
forms.export.export
forms.export.noData
forms.export.success
outputSchemas.warnings.usedByForms
outputSchemas.warnings.fieldUsed
outputSchemas.warnings.deleteBlocked
```

## Engineering constraints

- Every new file under 300 lines; every function under 40.
- No `eslint-disable` comments or config relaxations.
- No `any`; explicit TypeScript types throughout.
- No `!important` in CSS or Tailwind.
- shadcn/ui components only; no hand-rolled replacements.
- No direct Supabase calls from client components (forms writes happen in the API package; CSV export happens via a Server Action).
- Root cause anything that fights these constraints — extract helpers, split files.

## Acceptance criteria (mapped from Linear ticket)

1. **Define 5 fields on an agent → agent collects all 5 naturally in conversation.**
   - Output schema defines fields; form references schema and adds optional validations.
   - `set_form_fields` tool is wired and receives per-form field catalog in its description.
2. **Agent extracts multiple fields from a single message.**
   - `set_form_fields` accepts `fields: [{ fieldPath, fieldValue }]` and applies atomically.
3. **Collected data appears as structured JSON on the conversation record.**
   - Stored under `conversations.metadata.forms[formSlug]`.
4. **CSV export for a given agent/tenant/date range.**
   - Server action `exportFormCsv` + modal with 15-day-max range + form picker + agent picker.
5. **Agent re-asks for required fields that were skipped or invalid.**
   - Required-ness is inherited from the output schema field's existing `required` flag.
   - `set_form_fields` returns structured errors with `expectedType` so the LLM can correct.

## Out of scope (parked)

- Conditional fields (shown only when another field has a specific value).
- Resume partial forms from UI.
- Pre-fill from CRM.
- Multi-locale.
- Background migration of existing form data when a schema field is renamed.
- Per-form access control.
