# Forms — Design Spec

**Date:** 2026-04-24
**Linear ticket:** [OF-4 — Capability: Structured Data Collection](https://linear.app/open-flow/issue/OF-4/capability-structured-data-collection)
**Status:** Approved (revised 2026-04-24 post-review)

## Summary

"Forms" let an agent collect structured data from end-users during a conversation and export it as CSV. A form is an agent-scoped object with a **stable UUID** and a **human-readable slug** (label), bound to an existing output schema, with optional per-field validation rules. Agents read and write form data through two tools (`set_form_fields`, `get_form_field`). Collected data lives in `conversations.metadata.forms[<formUuid>]` (stable under rename/recreate). Users configure forms in the agent editor's Data tab via a two-step dialog, inspect collected data in the chats dashboard's right panel, and export it via a streaming Route Handler.

This revision addresses the staff-engineering and UX reviews: SQL-side atomic writes, UUID-keyed storage, Route Handler for CSV streaming, correct JSONB index, server-side tenant verification, progressive-disclosure right panel, two-step dialog, Name-first + auto-slug UX, and more (see "Review resolutions" at the end).

## Goals & non-goals

### Goals
- Per-agent form definitions with UUID + slug pair, bound to reusable output schemas.
- Per-field validation rules (format, date/time constraints, length/range).
- Tools that persist validated data atomically (at the DB statement level) and report structured errors.
- UI for configuration (Data tab), inspection (right panel), and export (streaming CSV).
- Filter-aware, tenant-scoped CSV export with a 15-day-max time window.
- Cross-surface cohesion: right-panel links to form edit, export modal links to chat-list filters.

### Non-goals (MVP)
- Conditional fields (shown only when another field has a specific value).
- Resuming partial forms across sessions from the UI.
- A separate form-builder UI distinct from the output-schema builder.
- Pre-fill from CRM.
- Multi-locale translations (repo is English-only today).
- Automatic migration of existing `conversations.metadata` when a schema field is renamed (warnings + stale-key cleanup only).
- Per-form access control beyond existing agent/tenant membership.
- Cross-form querying (form data is JSONB; no relational lookups across conversations).

## Data model

### New table `graph_forms`

```sql
CREATE TABLE public.graph_forms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  form_slug   text NOT NULL,
  schema_id   text NOT NULL,
  validations jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT graph_forms_agent_slug_unique UNIQUE (agent_id, form_slug),

  FOREIGN KEY (agent_id, schema_id)
    REFERENCES graph_output_schemas(agent_id, schema_id)
    ON DELETE RESTRICT,

  CONSTRAINT form_slug_format
    CHECK (form_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT form_slug_length
    CHECK (char_length(form_slug) BETWEEN 1 AND 64),
  CONSTRAINT form_slug_not_reserved
    CHECK (form_slug NOT IN ('new', 'all', 'any', 'none', 'edit', 'delete', 'create',
                             'export', 'import', 'settings', 'admin', 'api', 'null', 'undefined'))
);

CREATE INDEX graph_forms_schema_idx
  ON public.graph_forms (agent_id, schema_id);

CREATE TRIGGER graph_forms_update_updated_at
  BEFORE UPDATE ON public.graph_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

- **`id uuid`** is the stable identifier used as the key in `conversations.metadata.forms[…]`. Slug is a human label.
- Slug uniqueness is **per-agent** (secondary UNIQUE), not global, and enforced by DB constraint.
- Length, format, and reserved-word constraints are all at the DB level (belt-and-braces with UI validation).
- `ON DELETE RESTRICT` on the schema FK is the DB-level safety net behind the UI warning.
- `graph_forms_schema_idx` backs the reverse-lookup ("which forms use this schema?") used by the schema-edit warning banner.
- RLS policies follow the existing `is_org_member`/agent-owner pattern used by `graph_output_schemas`.

### `conversations.metadata` shape — keyed by form UUID

```jsonc
{
  "lead_score": 85,
  "userName": "John",
  "forms": {
    "7f3e...": {                        // form UUID, not slug
      "name": "John Doe",
      "email": "john@example.com",
      "addresses": [{ "firstLine": "123 Main St" }]
    },
    "9a12...": { "budget": 5000 }
  }
}
```

**Why UUID not slug.** Keying by UUID makes three classes of bug impossible:
1. Renaming a slug does not require data migration.
2. Deleting a form then recreating with the same slug gets a new UUID → no silent data resurrection.
3. Display can always show the current slug as a label while keying stays stable.

Slug stays as the human-facing tool argument (LLMs work better with readable names); the service layer resolves slug → UUID at tool-call time.

### `validations` JSONB shape

Keyed by the **canonical schema field path** — dotted, with `[]` for array slots (no concrete indices). At runtime, paths like `addresses[2].firstLine` parse to `addresses[].firstLine` for validation lookup.

```jsonc
{
  "name":                      { "kind": "twoWordName" },
  "email":                     { "kind": "email" },
  "age":                       { "kind": "length", "min": 18, "max": 100 },
  "addresses[].firstLine":     { "kind": "length", "exact": 50 },
  "phones[]":                  { "kind": "length", "min": 7, "max": 15 }
}
```

**Stale-key cleanup.** When the Forms UI loads a form for editing, it diffs the validation keys against the current schema's canonical paths. Keys that no longer match a path are shown in a muted "stale — click to remove" row. This surfaces orphaned validations caused by schema renames and prevents silent accumulation.

### Migrations (apply in order, all dated 2026-04-24)

1. `20260424000000_graph_forms_table.sql` — create `graph_forms`, indexes, constraints, trigger, RLS.
2. `20260424000001_conversations_forms_metadata_index.sql`:
   ```sql
   CREATE INDEX conversations_metadata_forms_key_idx
     ON public.conversations USING gin ((metadata -> 'forms'));
   ```
   Uses the default `jsonb_ops` opclass (supports `?` key-existence). Scoped to `metadata -> 'forms'` to keep the index narrow.

## Validations

Validations live on the form (not the schema). The same schema can power two forms with different rules.

| Kind | Payload | Applies to | UI label |
|---|---|---|---|
| `email` | — | string | Valid email |
| `twoWordName` | — | string | Two-word name (≥2 words, each ≥2 chars) |
| `pastDate` | — | string (ISO `YYYY-MM-DD`) | Past date |
| `futureDate` | — | string (ISO `YYYY-MM-DD`) | Future date |
| `pastHour` | — | string (`HH:mm`) | Past hour |
| `futureHour` | — | string (`HH:mm`) | Future hour |
| `length` | `{ min?, max?, exact? }` | string OR number | "Length" (strings) / "Range" (numbers) |

**Naming change:** `fullName` → `twoWordName` — more honest; avoids implying that `"Madonna"`, `"Li Wei"`, or many international names are "not full names."

For `length`:
- On strings → character count.
- On numbers → numeric value.
- `exact` and `min/max` are mutually exclusive in the UI (radio: "Range" vs "Exact").

### Path grammar (explicit, parser not regex)

A field path is parsed by the following grammar (BNF):

```
Path      := Segment ("." Segment)*
Segment   := FieldName Index*
FieldName := [a-zA-Z_][a-zA-Z0-9_]*
Index     := "[" IndexValue "]"
IndexValue:= Integer      (concrete, runtime) | ""  (canonical, config)
Integer   := [0-9]+
```

Consequences:
- Field names cannot contain `[`, `]`, or `.` — enforced in the output-schema builder.
- Multi-dimensional arrays are supported (`matrix[0][1]` runtime ↔ `matrix[][]` canonical).
- `addresses[-1]`, `addresses[abc]`, `addresses[].` (trailing dot), or an empty `[]` at runtime are all parser errors, returned via the tool's `pathError`.

A `normalizePath(runtimePath) → canonicalPath` helper replaces every concrete `[Integer]` with `[]`. Implementation: tokenizer + state machine in `packages/api/src/lib/forms/normalizePath.ts`, ~60 lines.

### Two-pass validation in `set_form_fields`

1. **Type pass (Zod, dynamic):** build a Zod validator for each field path from the form's output schema; check every `fieldValue`. Catches type mismatches and unknown paths.
2. **Rule pass:** for fields that pass the type pass, look up `validations[canonicalPath]` and run `runValidation`.

Both passes accumulate errors before returning, so the agent receives all problems in one round-trip.

### Atomicity (statement-level, under row lock)

See Tools → "SQL-side atomic write" below for the concrete mechanism. The validation step runs **after** acquiring the row lock, so length/range rules are checked against the true current state, not a stale read.

## Tools

### Names
- `set_form_fields`
- `get_form_field`

Registered under `OpenFlow/Forms` in `packages/web/app/lib/toolRegistry.ts`, mirroring the `OpenFlow/LeadScoring` pattern.

### File layout

```
packages/api/src/lib/forms/
  applyFormFields.ts       — pure; (form, currentData, fields) → ApplyResult
  readFormField.ts         — pure; (data, fieldPath) → value | error
  normalizePath.ts         — parser; runtime "addresses[2].firstLine" → canonical "addresses[].firstLine"
  parsePath.ts             — grammar-based tokenizer, returns segments or ParseError
  zodForFieldPath.ts       — walks OutputSchemaField[] → Zod validator for a path
  runValidation.ts         — applies one ValidationRule to a value
  collectFieldPaths.ts     — (used by CSV) walks schema → canonical paths for leaves
  expandArrayColumns.ts    — (used by CSV) expands [] paths to [0], [1], … with a cap
  formatCsvRow.ts          — RFC 4180 escaping

packages/api/src/services/formsService.ts
  interface FormsService {
    getFormDefinitions,          // load forms for an agent at run init
    getFormData,                 // read metadata->forms->:formUuid (no lock)
    applyFormFieldsAtomic,       // SELECT ... FOR UPDATE → validate → jsonb_set → COMMIT
    recordFailedAttempt,         // bounded write to metadata->forms_diagnostics
  }
  (interface only; concrete impl lives in packages/web)

packages/api/src/tools/formsTools.ts
  buildFormsTools(services, forms) → { set_form_fields, get_form_field }
```

The pure lib functions are reused by the right-panel "collected data" view, the CSV Route Handler, and unit tests.

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

**Acknowledged trade-off on `z.unknown()`.** The LLM sees no structural hint at the SDK schema layer — only the prose description. Models set structured fields better with typed schemas, so per-form dynamic tool variants (`set_form_fields__<slug>`) with a typed `fields` schema would raise accuracy. Kept out of MVP to avoid combinatorial tool explosions; revisit after evals. This is the only known MVP quality compromise.

### Tool description (LLM-facing, dynamically generated)

```
set_form_fields — Persist one or more field values into a form.

Available forms on this agent:
  • lead-capture (schema: LeadCapture)
      name: string (validation: two-word name — ≥2 words, each ≥2 chars)
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

### `set_form_fields` execute flow — SQL-side atomic write

1. Look up form by slug → UUID via `context.forms`. If slug unknown → `{ ok: false, errors: [{ reason: "Form <slug> not found. Available: [...]" }] }`.
2. Type pass (Zod) against the field-path schema. Collect errors.
3. If any type errors → return all, do not persist.
4. **Open a transaction:**
   1. `SELECT metadata FROM conversations WHERE id = :convId FOR UPDATE;` — lock the row.
   2. Rule pass: run `runValidation` against the **just-read** state for every incoming field. Collect errors. Critical for length/range rules that depend on array size.
   3. If any rule errors → `ROLLBACK`, return all errors, do not persist. In a **separate** follow-up transaction, call `recordFailedAttempt(convId, formUuid, errors)` so the failure is visible in the dashboard. (Separate transaction so a failure in the diagnostic write can never block the error return to the agent.)
   4. Build the new fields patch as a JSONB object. Write:
      ```sql
      UPDATE conversations
         SET metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               ARRAY['forms', :formUuid],
               COALESCE(metadata->'forms'->:formUuid, '{}'::jsonb) || :newFieldsJsonb,
               true
             )
       WHERE id = :convId;
      ```
      The `||` merge is field-level only; array items are replaced, not deep-merged (documented LLM contract).
   5. `COMMIT`.
5. Return `{ ok: true, applied: [{ fieldPath }, ...] }`.

### `get_form_field` execute flow

1. Slug → UUID (same not-found handling).
2. Read `metadata->'forms'->:formUuid` from the current conversation (no lock; stale-tolerant).
3. Parse `fieldPath`, resolve against the data.
4. Return `{ ok: true, value }`, or `{ ok: false, reason: "Field <path> has not been set yet", expectedType: "…" }`, or `{ ok: false, reason: "Path <path> does not exist on form <slug>", availablePaths: [...] }`.

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

### Failed attempts (for operator visibility)

When a `set_form_fields` call fails rule validation, the service writes a truncated diagnostic record into the same conversation row — so the dashboard can read it without a new table or shared in-memory store:

```jsonc
// conversations.metadata
{
  "forms": { "<formUuid>": { /* live data */ } },
  "forms_diagnostics": {
    "<formUuid>": {
      "lastFailures": [
        { "at": "2026-04-24T12:34:56Z", "errors": [{ "fieldPath": "email", "status": "validationError", "reason": "Expected a valid email" }] }
      ]
    }
  }
}
```

Persisted with the same `jsonb_set` + row-lock pattern as form data writes, capped at the **last 3 entries** per form (older ones dropped on write). The right panel reads this alongside the main conversation query and surfaces the most recent one inline when non-empty. Bounded JSONB (~1 KB worst case), tolerates deploys, no new table.

### Context plumbing

- At agent-run initialization, the current agent's forms (definitions + validations) are loaded once into `context.forms: FormDefinition[]`.
- `buildFormsTools(services, context.forms)` creates the tool functions, bound to this run's forms.
- `services` is the web-side `FormsService` implementation that runs the SQL above.

**`context.forms` staleness (documented).** A form edited mid-conversation doesn't take effect until the next agent run. The Data-tab form editor surfaces this with a footnote: "Changes apply to future messages; in-flight conversations keep their current rules." Acceptable for MVP.

## Data-tab UI (form configuration)

A new `FormsSection` in `DataTabContent`, rendered below `OutputSchemasSection`. Same collapsible section pattern.

**Section description (onboarding):** directly under the section header —
> Structured data your agent collects during conversations, exportable as CSV.

`OutputSchemasSection` gets a parallel one-liner to disambiguate:
> Reusable data shapes. Forms use schemas to decide what to collect.

### Files

```
packages/web/app/components/panels/
  FormsSection.tsx                — collapsible wrapper + section description + empty-state + list
  FormsEmptyState.tsx             — two-mode empty state (no schemas vs no forms)
  FormsList.tsx                   — list rows with edit/delete
  FormDialog.tsx                  — two-step dialog shell (step router)
  FormDialogStep1.tsx             — Name + slug + schema
  FormDialogStep2.tsx             — Validations editor
  FormDialogNameSlug.tsx          — "Name" input + auto-derived slug (readonly w/ Edit)
  FormDialogSchemaPicker.tsx      — output-schema select
  FormDialogValidationsEditor.tsx — search + filter + grouped validation rows
  FormValidationRow.tsx           — one row: field path + type badge + kind dropdown
  FormValidationLengthInput.tsx   — Range/Exact secondary controls
  FormDialogStaleValidations.tsx  — "stale — click to remove" rows
```

Every file stays under 300 lines; every function under 40.

### Empty states (dashed border, icon-in-muted-box, two text lines, action — mirrors the tenants page)

**Mode A — no output schemas yet** (with CTA):
> No forms yet
> Forms are built from output schemas. Create a schema to get started.
>
> **[+ Create output schema]** → opens the OutputSchemaDialog directly (skips the intermediate navigation).

**Mode B — schemas exist, no forms:**
> No forms yet
> Forms let your agent collect structured data during conversations and export it as CSV.
>
> **[+ Create form]**

### Two-step create dialog

```
Step 1 of 2 — Name your form
  Name:       [Customer Lead Form_________________]    required
  Identifier: lead-capture  ( Edit )                   (auto-derived)
  Schema:     [Select a schema ▾]                      required
                                                [Cancel]  [Next →]

Step 2 of 2 — Validations (3 of 18 configured)
  [ Search fields… ]  [ All · Configured · Unconfigured ]

  ▾ name          string  [ Two-word name        ▾ ]
  ▾ email         string  [ Valid email          ▾ ]
  ▾ addresses[]   array
      firstLine   string  [ Length: exact 50     ▾ ]
  ▾ phones[]      string  [ Length: 7–15         ▾ ]
  …
                                                [← Back]  [Create form]
```

#### Step 1 — Name + slug + schema

- **Name** is the primary input. Placeholder: `"e.g. Customer Lead Form"`. Auto-derives the slug on every keystroke: lowercase → replace whitespace/underscores with `-` → strip all characters outside `[a-z0-9-]` → collapse repeated `-` → trim leading/trailing `-` → truncate to 64.
- **Identifier** shows the derived slug as a pill with an inline `Edit` affordance. Clicking `Edit` switches it to a text input where the user can override (same normalization still applies, plus inline uniqueness error states).
- **Async uniqueness check** states:
  - *Idle* — no indicator.
  - *Checking* — muted spinner at the right edge of the input, visible after 200ms to avoid flicker.
  - *Available* — muted check icon (no text).
  - *Taken* — red underline + inline text "Already in use" **on blur or 800ms after last keystroke** (never mid-type).
  - *Invalid* — red underline + "Can only contain lowercase letters, numbers, and hyphens" shown immediately (format is predictable, no debounce needed).
- **Schema** is a `Select` sourced from `graph_output_schemas` for the current agent. Required. If there are zero schemas the entire Step 1 is replaced by the empty-state from Mode A.
- **Next** is disabled until all three fields are valid + unique.

#### Step 2 — Validations

- Header shows live count: `<N> of <M> configured`.
- **Search** filters the field list by substring (matches field path or display label).
- **Filter** chips: `All`, `Configured`, `Unconfigured`. Default `All`.
- **Grouping**: sub-fields indent under their parent (e.g. `addresses[].firstLine` nests under `addresses`). Parent rows show the count of configured children.
- Simple leaves (string, number) get a kind dropdown. Enums and composed containers are listed but the dropdown is replaced by a muted "—" (no validation available for this type).
- Dropdown options gated by field type:
  - string → None, Valid email, Two-word name, Past date, Future date, Past hour, Future hour, Length.
  - number → None, Range.
- Length/Range → radio `Range` (min + max inputs) vs `Exact` (single input). At least one of min/max required for Range; Exact requires a single value.
- **Stale validations** (from previous schemas edits) surface as a muted pill at the top: `3 validation rule(s) no longer match the current schema — review and remove`. Clicking expands the list.

#### Create button enable rule

Slug valid + unique + schema selected + every validation row either "None" or fully configured + no stale rules (user must either remove stale rules or confirm "keep for now").

#### Keyboard contract

| Key | Effect |
|---|---|
| `Tab` / `Shift+Tab` | Move through fields in visual order. |
| `Enter` on Step 1 | Advance to Step 2 if valid. |
| `Cmd/Ctrl+Enter` on Step 2 | Submit create. |
| `Esc` | Cancel & close (with unsaved-changes confirm if Step 2 has edits). |
| Arrow keys inside `Select` / `Combobox` | Native navigation. |
| `/` when focused inside Step 2 | Focuses the search box. |

Focus is trapped inside the dialog; initial focus on Step 1 = Name input; on Step 2 = first unconfigured row's dropdown.

### Edit dialog

Same two-step shell, but Step 1's Name/slug/schema are **readonly** with a helper: *"To change the name or schema, delete this form and create a new one."* Step 2 is fully editable. Stale-validation pill shows automatically.

### Delete

Confirmation dialog:

> Delete form `<slug>`?
>
> Past conversations that collected `<slug>` data will keep that data, but it will no longer appear in the dashboard or CSV export.
>
> A future form with the same name will **not** inherit this old data (data is keyed by a stable identifier, not the name).
>
> **[Cancel]** **[Delete]**

### Schema-coupling warnings (actionable copy)

Land in the existing output-schema UI (not Forms UI). Reworded from "scary" to "consequence + action":

1. **OutputSchemaDialog (edit)** — persistent banner when the schema is used by ≥1 form:
   > This schema is used by N form(s): `lead-capture`, `qualification`.
   > Renaming a field here keeps existing data under the old name — older conversations will show the old name in exports.
   > Rename only if you're okay with that divergence.

2. **OutputSchemaFieldCard (rename/remove)** — inline helper under the affected action:
   > Used by form `<slug>`. Renaming leaves old data under the old name.

3. **Schema delete** — blocked outright (`ON DELETE RESTRICT` + pre-check):
   > This schema is used by N form(s) and can't be deleted.
   > Remove these forms first: `lead-capture`, `qualification`. (Each links to its edit dialog.)

## Chats-dashboard UI

### Right panel — "Form data" section (summary-first)

Inserted below the bot-active toggle (`RightPanel.tsx:359`), above Notes. Follows the existing collapsible-section pattern.

**Default collapsed view** — one row per form on the conversation's agent:

```
Form data
  • lead-capture    3/8 fields collected
  • qualification   1/2 fields collected
```

Each form row is its own clickable expander. Clicking expands in place:

```
Form data
  ▾ lead-capture    3/8 fields collected          [ Edit form ]
      name:                    John Doe
      email:                   john@example.com
      addresses[0].firstLine:  123 Main St
      ▾ 5 empty fields
          age:                 —
          phone:               —
          ...
```

- **Filled fields listed first**, then an "N empty fields" sub-disclosure with the rest.
- Array fields: one listing per existing array instance (`addresses[0].firstLine`, `addresses[1].firstLine`, …). Empty array → single muted row `addresses[]: —`.
- **Per-form collapse state persists to localStorage**, keyed by form UUID, so an operator who always cares about `lead-capture` sees it expanded across conversations.
- **"Edit form" link** next to the form header deep-links to the Data tab with the form's edit dialog open (cross-surface cohesion).
- **Failed attempts indicator**: if `metadata.forms_diagnostics[<formUuid>].lastFailures` has entries, show a muted diagnostic line under the form summary: `Last attempt failed: email format invalid (2 min ago)`. Click expands the stored error list (up to 3 entries).
- Section hidden entirely if the agent has zero forms.
- Section header shows a roll-up badge: `Forms: 4/10` across all forms on this conversation.

**Mobile** (chats dashboard accessed on phone): the right panel shifts to a bottom drawer. Form data stays in summary-first mode; expand interactions are sheet pushes rather than inline expanders.

### Left panel — "Export as CSV" ghost button

Drops into the existing `left-panel-bottom` slot (`LeftPanel.tsx:131`).
- `<Button variant="ghost" size="sm">` with `Download` icon + label `Export as CSV`.
- Full-width of sidebar.
- `onClick` → opens the CSV export dialog.

### Chat list — agent filter

An agent `Combobox` (shadcn — searchable, keyboard-navigable) next to the existing search input in the chat-list middle panel.
- Placeholder: `All agents`.
- Options: every agent in the current tenant.
- Search: type-to-filter; ↑/↓ to navigate, Enter to select, Esc to close.
- Narrows the conversation list (ANDed with existing status filters).
- **Pre-fills** the CSV dialog's agent on open. After the dialog is open, the two are independent — clearing the chat-list filter does not touch the dialog.

### CSV export dialog

Opens from the ghost button. Fields top-to-bottom:

| Field | Behavior |
|---|---|
| **Date range** | Two date pickers (`from` / `to`). Default = today − 15d → today. The picker **disables** dates outside the permitted window (`from ≤ today`, `to ≤ today`, `to - from ≤ 15 days`). Persistent helper text: `Max range: 15 days`. Tooltip (ⓘ icon): `Exports run against the live database; longer ranges are available via a scheduled export (coming soon).` |
| **Agent** | `Combobox`, pre-filled from the chat-list filter. Required. |
| **Form** | `Select`, **disabled until agent chosen**, populated with that agent's forms. Required. |
| **Match count** | Live summary line under the three fields: `<N> conversations match · <M> with <formSlug> data`. Debounced 400ms after the last input change. |

Footer: `[Cancel]  [Export]`. Export disabled until all three valid.

**On Export:**
1. Export button switches to loading spinner + `Generating…`. Modal becomes non-dismissable; Cancel button replaces `[Cancel]` with `[Abort]`.
2. Fetch request to the Route Handler (see next section). The handler streams `text/csv`.
3. Client pipes the stream to a `Blob` via `response.blob()`, then triggers an anchor click with `download=<filename>`.
4. Success: brief success toast `Exported <N> conversations`. Modal closes.
5. Abort: `AbortController.abort()` cancels the fetch; server detects client disconnect and halts the stream.

**Empty-state (diagnostic, not silent):**
If the match-count preview already says `0 with <form> data`, the Export button is disabled with a tooltip: `No <form> data in this range. Try expanding the range or picking a different form.` No network call is made.

If the preview says non-zero but the stream still closes with zero data rows (race — data deleted between preview and export), the modal stays open and shows: `All matching conversations were deleted during export. Refresh and try again.`

### Files

```
packages/web/app/components/messages/components/RightPanel/
  FormDataSection.tsx
  FormDataSummaryRow.tsx
  FormDataExpandedView.tsx
  FormDataFailedAttempts.tsx

packages/web/app/components/messages/components/LeftPanel/
  ExportCsvButton.tsx

packages/web/app/components/messages/components/ChatList/
  AgentFilterCombobox.tsx   (edits to existing search-bar wrapper to host it)

packages/web/app/components/messages/components/ExportCsv/
  ExportCsvDialog.tsx
  ExportCsvDateRange.tsx
  ExportCsvAgentCombobox.tsx
  ExportCsvFormSelect.tsx
  ExportCsvMatchCount.tsx
```

## CSV export — streaming Route Handler

### Transport choice
Route Handler at `packages/web/app/api/agents/[agentId]/forms/[formSlug]/export/route.ts` returning `text/csv` via a `ReadableStream`. Server Actions are the wrong primitive: they serialize the result into the RSC stream (Vercel's 4.5 MB response cap) and keep the whole CSV in server memory.

### Auth
1. Resolve session → `callerUserId`.
2. Load agent `WHERE id = :agentId` — require `agent.user_id = callerUserId` (or caller is an org member of the agent owner's org; matches the RLS policy used by other agent-scoped reads).
3. Require `is_org_member(tenant_org_id(:tenantId), callerUserId)`.
4. Resolve form slug → UUID within `:agentId`. 404 if not found.

Rejection responses: `401 Unauthorized` for missing session, `403 Forbidden` for ownership/membership mismatch, `404 Not Found` for missing form.

### Query parameters

```
GET /api/agents/:agentId/forms/:formSlug/export
      ?tenantId=<uuid>
      &from=YYYY-MM-DD
      &to=YYYY-MM-DD
      &statusFilter=<json>
```

Server validates that `to - from ≤ 15 days`; returns `400 Bad Request` with `{ error: 'invalid-range' }` if not.

### Query (keyset-paginated, streamed)

```sql
SELECT id, user_channel_id, channel, created_at, last_message_at, status,
       metadata -> 'forms' -> :formUuid AS form_data,
       metadata ->> 'userName'          AS user_name
  FROM conversations
 WHERE tenant_id = :tenantId
   AND agent_id  = :agentId
   AND created_at >= :from
   AND created_at < :to
   AND (/* status-filter SQL */)
   AND metadata -> 'forms' ? :formUuid
   AND (created_at, id) > (:cursorCreatedAt, :cursorId)
 ORDER BY created_at ASC, id ASC
 LIMIT 500;
```

The Route Handler loops keyset-paginated queries, transforms each batch into CSV rows, and enqueues to the stream. Batches are 500 rows; memory is bounded regardless of result size.

### Column-expansion cap (DoS mitigation)

Arrays are expanded to columns up to a cap of **50 per path** (`ARRAY_EXPANSION_CAP`). If any row's array exceeds 50, the remaining items are serialized as a single JSON-encoded cell under `<path>[50+]`, and a `X-Forms-Truncated: true` response header is set. The client surfaces this in the success toast: `Exported N conversations (some fields truncated — too many array items)`.

To compute max array lengths without two passes, we use a **two-stage stream**:
1. **Pass 1** (keyset-paginated): scan only `jsonb_array_length` of each array path across all rows → determine `observedMax[path] = min(max(arrayLen), 50)`. This is cheap (JSONB function, no row body returned).
2. **Pass 2**: the main stream, emitting the header row and then data rows using `observedMax`.

Pass 1 must complete before pass 2 can emit the header, so Pass 1 runs serially and its output buffers briefly on the server. For 15 days × typical volume this is milliseconds.

### Assembly pipeline

Pure helpers in `packages/api/src/lib/forms/`:
1. `collectFieldPaths(form)` → canonical paths for all leaves.
2. `expandArrayColumns(paths, observedMax)` → dynamic column list.
3. `rowToCells(row, expandedPaths)` → resolves values, coerces to string.
4. `formatCsvRow(cells)` → RFC 4180 escaping.

Fixed columns first: `conversation_id, user_name, channel, started_at, last_message_at, status`. Then expanded dynamic columns. Rows where every dynamic cell is empty are dropped (the "≥1 filled field" rule).

### Filename

`openflow-<tenantSlug>-<agentSlug>-<formSlug>-<from>-<to>.csv`

Slugs already conform to `[a-z0-9-]+` ≤ 64, so the filename is filesystem-safe by construction. Total length capped at 200 chars — if the generated name exceeds, it's truncated with a stable 8-char hash suffix.

### CSV escaping

RFC 4180: wrap cells containing `,`, `"`, or newline in double quotes; escape `"` as `""`. BOM prefix (`﻿`) included so Excel auto-detects UTF-8.

### Match-count preview endpoint

`GET /api/agents/:agentId/forms/:formSlug/export/count?…` returns `{ conversationsInRange, conversationsWithData }`. Reused by the dialog's live match-count line; reuses the same auth.

## i18n

New keys under `forms.*` in `packages/web/messages/en.json`:

```
forms.section.title
forms.section.description
forms.empty.noSchemas.title
forms.empty.noSchemas.description
forms.empty.noSchemas.cta
forms.empty.noForms.title
forms.empty.noForms.description
forms.empty.noForms.cta
forms.dialog.create.step1.title
forms.dialog.create.step2.title
forms.dialog.edit.step1.title
forms.dialog.edit.step2.title
forms.dialog.stepsCount
forms.dialog.next
forms.dialog.back
forms.dialog.cancel
forms.dialog.create
forms.dialog.save
forms.dialog.immutableHelp
forms.field.name.label
forms.field.name.placeholder
forms.field.identifier.label
forms.field.identifier.edit
forms.field.identifier.invalidFormat
forms.field.identifier.taken
forms.field.identifier.checking
forms.field.identifier.available
forms.field.schema.label
forms.field.schema.placeholder
forms.validations.title
forms.validations.countProgress
forms.validations.search.placeholder
forms.validations.filter.all
forms.validations.filter.configured
forms.validations.filter.unconfigured
forms.validations.stale.banner
forms.validations.stale.remove
forms.validations.stale.keep
forms.validations.kind.none
forms.validations.kind.email
forms.validations.kind.twoWordName
forms.validations.kind.pastDate
forms.validations.kind.futureDate
forms.validations.kind.pastHour
forms.validations.kind.futureHour
forms.validations.kind.length
forms.validations.kind.range
forms.validations.kind.unavailable
forms.validations.length.mode.range
forms.validations.length.mode.exact
forms.validations.length.min
forms.validations.length.max
forms.validations.length.exact
forms.delete.title
forms.delete.body
forms.delete.slugReuseWarning
forms.delete.cancel
forms.delete.confirm
forms.rightPanel.title
forms.rightPanel.rollupBadge
forms.rightPanel.summary.progress
forms.rightPanel.editForm
forms.rightPanel.emptyFieldsCount
forms.rightPanel.notSet
forms.rightPanel.emptyArray
forms.rightPanel.failedAttempts.title
forms.rightPanel.failedAttempts.item
forms.chatList.agentFilter.placeholder
forms.chatList.agentFilter.search.placeholder
forms.export.button
forms.export.dialog.title
forms.export.dateRange.label
forms.export.dateRange.max15Days
forms.export.dateRange.tooltip
forms.export.agent.label
forms.export.form.label
forms.export.matchCount
forms.export.matchCount.noData.tooltip
forms.export.matchCount.noData.suggestion
forms.export.cancel
forms.export.export
forms.export.generating
forms.export.abort
forms.export.success
forms.export.success.truncated
forms.export.error.raceEmpty
outputSchemas.section.description
outputSchemas.warnings.usedByForms
outputSchemas.warnings.fieldUsed
outputSchemas.warnings.deleteBlocked
```

**Translation notes for future i18n work (flagged, not implemented):**
- `forms.validations.kind.twoWordName` — "≥2 words, each ≥2 chars" is a Western-language construct; languages without word boundaries (CJK) will need a different heuristic or to hide this rule.
- `forms.validations.countProgress` — ICU message format with `{configured}/{total}` so translators can reorder.
- Composite labels are avoided; each phrase is a whole sentence or a single noun.

## Accessibility

- Every input in the form dialog and export dialog has a visible label and a `Label` association.
- Validation errors use `aria-invalid` and `aria-describedby` pointing at the inline error text.
- The two-step dialog uses `role="dialog"` and announces step changes via an `aria-live="polite"` region: `Step 2 of 2 — Validations`.
- Focus trap + initial focus rules per the keyboard contract.
- Type badge in the validation list uses `aria-label="type: string"` (the visual pill also has a title attr).
- The right-panel's form expanders are real buttons with `aria-expanded` and `aria-controls`; not `<div onClick>`.
- The CSV export's match-count line uses `aria-live="polite"` so screen readers announce updates.
- Color is never the sole signal: stale validations, "not set" cells, and failed attempts all use both color and text.

## Engineering constraints

- Every new file under 300 lines; every function under 40.
- No `eslint-disable` comments or config relaxations.
- No `any`; explicit TypeScript types throughout.
- No `!important` in CSS or Tailwind.
- shadcn/ui components only; no hand-rolled replacements.
- No direct Supabase calls from client components (forms writes happen in the API package via the service interface; CSV export happens via the Route Handler; previews via the count endpoint).
- Route Handler pagination is keyset (not OFFSET) to keep memory and query time bounded.
- Transaction boundaries: `set_form_fields` uses exactly one transaction spanning lock → validate → write → commit. No cross-conversation transactions.

## Acceptance criteria (mapped from Linear ticket)

1. **Define 5 fields on an agent → agent collects all 5 naturally in conversation.**
   - Output schema defines fields; form references schema and adds optional validations.
   - `set_form_fields` tool is wired and receives per-form field catalogue in its description.
2. **Agent extracts multiple fields from a single message.**
   - `set_form_fields` accepts `fields: [{ fieldPath, fieldValue }]` and applies atomically under row lock.
3. **Collected data appears as structured JSON on the conversation record.**
   - Stored under `conversations.metadata.forms[<formUuid>]`. Displayed in the right panel with summary-first UX.
4. **CSV export for a given agent/tenant/date range.**
   - Streaming Route Handler + dialog with 15-day-max range + form picker + agent picker + live match-count.
5. **Agent re-asks for required fields that were skipped or invalid.**
   - Required-ness inherited from the output schema field's existing `required` flag.
   - `set_form_fields` returns structured errors with `expectedType` so the LLM can correct.
   - Failed attempts surfaced to the operator inline in the right panel.

## Out of scope (parked)

- Conditional fields (shown only when another field has a specific value).
- Resume partial forms from UI.
- Pre-fill from CRM.
- Multi-locale (only `en.json` today; flagged translation notes above).
- Background migration of existing form data when a schema field is renamed.
- Per-form access control.
- Persistent failure log for `set_form_fields` (in-memory ring buffer only for MVP).
- Per-form dynamic tool variants with typed `fields` schemas (accuracy optimization; revisit after evals).
- Longer-than-15-day exports via a scheduled pipeline.
- Cross-form querying.

## Review resolutions

This spec was reviewed by (1) a staff engineer and (2) a UI/UX designer. Every finding's resolution:

### Blocking (engineering)
- **Race in `jsonb_set`** → resolved: single-statement SQL upsert (`jsonb_set` + `||` merge) under `SELECT … FOR UPDATE`; validation runs after acquiring the lock.
- **GIN index wrong opclass** → resolved: dropped `jsonb_path_ops`, switched to default `jsonb_ops` on `metadata -> 'forms'` (supports `?`).
- **CSV transport / memory** → resolved: Route Handler streaming `text/csv` with keyset-paginated queries, 50-item array-expansion cap, `X-Forms-Truncated` header, abort-on-disconnect.
- **Server Action tenant auth** → resolved: Route Handler auth checks (a) agent ownership, (b) `is_org_member(tenant_org_id(tenantId))`; `tenantId` never trusted from the client beyond being one half of a checked pair.

### High-impact (UX)
- **"Slug" jargon** → resolved: Name-first + auto-derived Identifier with `Edit` affordance.
- **Immutable schema + orphan resurrection** → resolved: UUID-keyed storage eliminates silent data inheritance. Delete dialog explicitly says so.
- **Right panel "every field visible"** → resolved: summary-first layout (`3/8 fields collected`), expand to see filled, further expand for empty.
- **Mode A empty-state dead-end** → resolved: CTA directly opens the schema-create dialog.
- **"No data to export" silent** → resolved: live match-count in the dialog; export disabled when zero with actionable tooltip; diagnostic copy for race cases.
- **Failed-validation invisibility** → resolved: in-memory failed-attempts ring buffer surfaced inline in the right panel.

### Staff-engineering should-fix
- Reverse-lookup index `graph_forms_schema_idx (agent_id, schema_id)` → added.
- Slug length CHECK + reserved-words CHECK → added.
- `fullName` rule renamed to `twoWordName`; label updated → done.
- Path grammar promoted from regex to an explicit parser; multi-dim arrays supported → done.
- `updated_at` trigger → added.
- Validation key staleness → cleanup UX on form load (stale-rules banner).
- `context.forms` staleness → documented with in-UI footnote.
- CSV filename sanitization + length cap → specified.
- `fieldValue: z.unknown()` trade-off → acknowledged in MVP; per-form typed variants parked.

### UX medium
- Length/Range label switching → the schema is read-only once a form is created, so the label is stable for the form's lifetime; documented.
- Async slug states → enumerated (idle / checking / available / taken / invalid) with timing.
- Validation list search/filter/group → built into Step 2.
- Schema warnings → rewritten as "consequence + action" copy.
- CSV loading/cancel/success → specified with `[Abort]` affordance.
- 15-day cap communication → persistent helper text, disabled dates in picker, tooltip explains why.
- Agent filter → `Combobox` with search.
- Keyboard contract → explicit table.
- Discovery → section descriptions on both Data-tab sections.

### UX low
- Per-form collapse persisted to localStorage → specified.
- `twoWordName` i18n caveat → flagged in translation notes.
- Mobile layout → specified: bottom drawer, sheet-push expanders.
- Filename length cap → 200 chars with hash suffix.
- Success state copy → `Exported <N> conversations`.

### Cohesion
- Right-panel → form edit deep link → specified.
- Export modal → match-count preview → specified.
