# Agent tool selection — design

**Date**: 2026-04-25
**Status**: Brainstorm + spec-review feedback incorporated; awaiting final user review
**Sub-project**: A of the broader executor refactor (A → B+C+D → E)
**Revisions**: Amended after dual review (staff-engineer + UX) — see "Revisions" log at bottom.

---

## Purpose

Give users a way to declare, per agent, which tools the autonomous agent should have access to at runtime. Today every agent is implicitly granted a fixed set of system tools (dispatch + lead scoring) plus whatever MCP tools its graph references — there is no per-agent gating. The result is bloated tool prompts, no user control over what an agent can do, and no foundation for the executor refactor that follows (B+C+D, E).

## Non-goals

- Workflows. Workflows already encode their tools per node via `tool_call` edge preconditions; this design does not change that.
- Per-tool RBAC (who in the org can edit selections).
- Audit log entries for selection changes.
- Bulk import / export across agents.
- Concurrent-edit conflict resolution beyond last-writer-wins.

## Success criteria

1. A user editing an autonomous agent (`appType === 'agent'`) sees a list of every tool the platform exposes (system + MCP) with a checkbox per tool and a tri-state checkbox per provider group.
2. By default, every checkbox is unchecked — a freshly-created agent has zero tools.
3. The user's selections persist via auto-save (1.5 s debounce) and survive reload.
4. Workflows (`appType === 'workflow'`) see the existing read-only `ToolsPanel` — no checkboxes.
5. Hand-curated seed agents ship with `selected_tools` arrays so demos work out of the box.
6. Existing user agents (none in production today) get an empty `selected_tools` after migration; their owners reconfigure when they next visit the editor.
7. The runtime read path stays unchanged for sub-project A (used by D later).

---

## Decisions made during brainstorming

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Single unified list** of tools (system + MCP merged into one stack) | One mental model; matches existing `RegistryTool` shape; one storage field |
| Q2 | **Frozen set** semantics for "select all" | Explicit beats implicit for security-sensitive surfaces; tools added later don't silently enter agent prompts |
| Q3 | **All tools are gated**, including dispatch / lead scoring / finish | Consistency: one rule for every tool; zero-tool agents are a valid use case |
| Q4 | **Auto-save with 1.5 s debounce + subtle saved-state indicator** in panel header (`Saved` / `Saving…` / `Failed — retry`) | Tool grants are a permission surface — silent saves create a trust gap; the indicator is one small text element, not a banner. *Amended after UX review: original "no indicator" was wrong for this surface.* |
| Q5 | **Empty default for everyone**; seeds are curated by hand in git | No production data; old "always-on" set was historical accident, not design |
| Q6 | **Checkboxes only in agent mode** (`appType === 'agent'`) | No dead UI in workflows; smallest change |
| Approach | **State lifted to the agent editor (parent); `ToolsPanel` is controlled.** Parent owns `selectedTools` + the debounced save + revert. *Amended after UX review: panel can close mid-debounce; parent must hold the source of truth so revert has a target.* | Survives unmount; parent already holds the agent record |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ DB                                                            │
│   agents.selected_tools jsonb NOT NULL DEFAULT '[]'           │
│   CHECK (jsonb_typeof(selected_tools) = 'array')              │
│   shape: [{ providerType, providerId, toolName }, ...]        │
└────────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────┐
│ Backend (Express)                                             │
│   GET  /agents/by-slug/:slug    — extend SELECT to include   │
│                                    selected_tools, updated_at │
│   PATCH /agents/:agentId/selected-tools                       │
│       body: { tools: SelectedTool[],                          │
│               expectedUpdatedAt: ISO8601 }                    │
│       resp: 200 { selected_tools, updated_at }                │
│             409 { current_updated_at, current_tools }         │
│             4xx | 5xx                                         │
│       rate-limit: 30 req/min/org                              │
└────────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────┐
│ Web (Next.js)                                                 │
│   server action: updateAgentSelectedToolsAction(...)         │
│   AgentEditor (parent)                                        │
│     ─ owns selectedTools + updated_at                         │
│     ─ 1.5 s debounced save with revert + retry-once           │
│   ToolsPanel(agent?: { id, appType, selectedTools }, onChange)│
│     ─ controlled                                              │
│     ─ checkbox per ToolRow                                    │
│     ─ tri-state checkbox per ProviderGroup header             │
│     ─ stale-entry rows at top with Remove                     │
│     ─ hidden when appType !== 'agent'                         │
│     ─ saved-state indicator in panel header                   │
└───────────────────────────────────────────────────────────────┘
```

**Single source of truth**: the database. The agent editor (parent) hydrates from the agent fetch, holds the working copy, and syncs back via the server action. `ToolsPanel` is a controlled view — it can unmount safely without losing state.

---

## Data model

### Schema change

```sql
ALTER TABLE agents
  ADD COLUMN selected_tools jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agents
  ADD CONSTRAINT selected_tools_is_array
  CHECK (jsonb_typeof(selected_tools) = 'array');
```

The CHECK is a structural guard only — it does not validate per-element shape. Per-element validation lives at the application layer (Zod) on both the frontend and the backend route.

### Encoding

Each entry is a structured object with three flat fields:

```ts
interface SelectedTool {
  providerType: 'builtin' | 'mcp';
  providerId: string;   // stable id within the providerType keyspace
  toolName: string;
}
```

`providerId` keyspace by `providerType`:

| `providerType` | `providerId` examples | Source |
|---|---|---|
| `builtin` | `composition`, `lead_scoring`, `forms`, `calendar` | Stable slugs defined in `packages/api`. These are part of the public contract — renaming requires a migration. |
| `mcp` | `9d3a2b71-...` (UUID) | `mcp_servers.id` for MCP server installations. |

**Why this shape (not strings):**

- Two namespaces (built-ins and MCP servers) live in genuinely different keyspaces. The `providerType` discriminator makes that explicit. Sub-project B's plugin registry can evolve the `builtin` keyspace independently of MCP UUIDs.
- No in-band delimiters. Tool names with `:` (or any other character) are safe. LLM-protocol naming rules can drift without breaking persisted data.
- Renames are still a migration — but with object shape, you can do `UPDATE … SET selected_tools = jsonb_path_query_array(...)` to rewrite a single field. With colon-strings, you'd parse and reconstruct every entry.
- Each field is independently constrained. `toolName` length, charset, etc. become first-class validation rules instead of a regex carrying multiple concerns.

Examples:

```jsonc
[
  { "providerType": "builtin", "providerId": "calendar", "toolName": "check_availability" },
  { "providerType": "builtin", "providerId": "composition", "toolName": "invoke_agent" },
  { "providerType": "mcp", "providerId": "9d3a2b71-...", "toolName": "hubspot_create_deal" }
]
```

### Validation

Frontend and backend both apply the same Zod schema:

```ts
const SelectedToolSchema = z.object({
  providerType: z.enum(['builtin', 'mcp']),
  providerId: z.string().min(1).max(100),
  toolName: z.string().min(1).max(100),
});

const PatchBodySchema = z.object({
  tools: z.array(SelectedToolSchema).max(100),
  expectedUpdatedAt: z.string().datetime(),
});
```

Cap is **100 tools per agent**. Rationale: realistic ceiling is ~70 (10–14 built-ins + 3–5 MCP servers × 10–15 tools each). Beyond ~100, the LLM call's tool-definition prompt overwhelms whatever model context is left for the conversation, so the agent stops working *anyway*. The cap is a self-preservation guard, not a security control. Raise if real users hit it.

Backend Zod is the authoritative gate; frontend Zod is defense in depth.

### Migration order

1. **Migration**: add column + CHECK constraint. Default `'[]'` applies to all existing rows.
2. **No backfill** for user agents (Q5).
3. **Curate seeds** as a follow-up commit: edit demo JSON files (e.g. `packages/web/app/data/*.json`) to add `selectedTools` arrays where the demo's behaviour requires tools to be available.

The seed-curation pass is its own task in the implementation plan, not part of the migration.

### Workflows

The column lives on every `agents` row, including `appType === 'workflow'`. Workflows ignore it. No CHECK forcing it empty for workflows — keeps the schema simple and leaves the door open for future selective-exposure features without another migration.

---

## API surface

### Backend route

```
PATCH /agents/:agentId/selected-tools         (gated by requireAuth + rate limit)
Body:  {
  tools: SelectedTool[],
  expectedUpdatedAt: string  // ISO8601 of the agent's last-known updated_at
}
Resp:  200 { selected_tools: SelectedTool[], updated_at: string }
       400 invalid body (Zod failure)
       403 user not in agent's org (or otherwise lacks edit rights)
       404 agent not found
       409 { current_updated_at: string, current_tools: SelectedTool[] }
           — concurrent edit detected; client reconciles
       429 rate-limited
       5xx transient
```

Mounted in `agentRouter.ts` next to the existing `PATCH /:agentId/{visibility,category,metadata}` routes; same auth model.

### Concurrency control

The PATCH includes `expectedUpdatedAt` from the client's last-known agent record. The handler reads the current `updated_at` and compares:

- **Match** → write transactionally (`UPDATE … SET selected_tools = ?, updated_at = now() WHERE id = ? AND updated_at = ?`); return 200 with the new `updated_at`.
- **Mismatch** → return 409 with the current row. Client refetches, presents the merged state, and the user re-applies their change. (For now: the saved-state indicator flips to `Conflict — refresh`; a future enhancement could merge automatically.)

This solves the two-tabs scenario the staff-engineer review flagged: silent overwrites are no longer possible.

### Rate limiting

30 requests / minute / org on this route. Reuses whatever per-org limiter is already in place (`express-rate-limit` or equivalent — verify during planning). 30/min is generous for a 1.5 s debounce (theoretical max from one user is 40/min) but prevents abuse. The cap is per-org, not per-user, because an org owner could legitimately edit several agents in parallel.

### Read path

`GET /agents/by-slug/:slug` already returns the agent record. Add `selected_tools` and `updated_at` to the SELECT projection in `executeFetcher.ts` and to the `AgentRow` TypeScript type. The agent editor already loads this on mount — no new GET endpoint needed.

### Web layer

```ts
// packages/web/app/actions/agents.ts (extend existing or new file)
'use server';
export async function updateAgentSelectedToolsAction(
  agentId: string,
  tools: SelectedTool[],
  expectedUpdatedAt: string
): Promise<
  | { ok: true; updatedAt: string; tools: SelectedTool[] }
  | { ok: false; kind: 'validation' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'transient'; message: string; conflict?: { currentUpdatedAt: string; currentTools: SelectedTool[] } }
> {
  // Zod-validate, then fetchFromBackend('PATCH', `/agents/${agentId}/selected-tools`, body)
  // Map status codes to discriminated kinds so the UI can choose retry vs revert vs reconcile.
}
```

The discriminated `kind` is what the UI uses to decide:
- `validation` / `forbidden` / `not_found` → toast + revert (no retry).
- `conflict` → toast `Conflict — refreshing` + refetch agent + show new state (no retry).
- `rate_limited` → toast + small backoff + retry once.
- `transient` (5xx, network) → silent retry once (no toast on first failure); if the retry also fails, toast + revert.

This addresses the engineer-review note that "generic toast" silently reverts on transient 502s.

### Concurrency on unmount

If the panel closes (or the editor unmounts) with a pending debounced save, the parent **flushes the pending save synchronously** before tearing down. If the synchronous flush is unreliable in React 19 / Next 16 (open question — verify during planning), fall back to `navigator.sendBeacon` with a JSON-content-type endpoint dedicated for unmount writes (or use `fetch` with `keepalive: true`). Flagged as a planning-time concern, not a spec-level decision.

### Out of scope

- Per-tool permissions / RBAC.
- Audit log entries for selection changes.
- Bulk import / export across agents.
- Idempotency keys (deferred until audit logs land).
- Optimistic locking on the *agent record itself* (only on `selected_tools`).

### Read path

`GET /agents/by-slug/:slug` already returns the agent record. Add `selected_tools` to the SELECT projection in `executeFetcher.ts` (or wherever the agent row type is centralised) and to the `AgentRow` TypeScript type. The agent editor already loads this on mount — no new GET endpoint needed.

### Web layer

```ts
// packages/web/app/actions/agents.ts (extend existing or new file)
'use server';
export async function updateAgentSelectedToolsAction(
  agentId: string,
  tools: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Zod-validate, then fetchFromBackend('PATCH', `/agents/${agentId}/selected-tools`, { tools })
  // Return ok/error so the caller can revert + toast on failure.
}
```

Matches existing server-action conventions in the codebase (`@/app/actions/apiKeys`, `@/app/actions/orgEnvVariables`).

### Concurrency

The 1.5 s debounce coalesces rapid clicks into one PATCH. Pending PATCH on unmount is flushed synchronously. Cross-device concurrent edits are last-writer-wins; an `updated_at` precondition can be added later if it becomes a problem (it won't, at MVP).

### Out of scope

- Per-tool permissions / RBAC.
- Audit log entries for selection changes.
- Bulk import / export across agents.

---

## UI specification

### Mode detection + control

`ToolsPanel` is now controlled. New props:

```ts
interface ToolsPanelProps {
  // existing...
  agent?: {
    id: string;
    appType: 'agent' | 'workflow';
  };
  selectedTools?: SelectedTool[];                      // current value (parent owns)
  saveState?: 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
  staleEntries?: SelectedTool[];                       // saved entries with no live registry match
  onChange?: (next: SelectedTool[]) => void;           // toggle/cascade
  onRemoveStale?: (entry: SelectedTool) => void;
}
```

When `agent === undefined` or `agent.appType === 'workflow'` → render the existing read-only variant (no checkboxes, no save indicator, no stale entries). When `agent.appType === 'agent'` → render the selectable variant.

The agent editor (parent) is responsible for:
- Hydrating `selectedTools` from the agent fetch on mount.
- Computing `staleEntries` by diffing `selectedTools` against the live registry.
- Owning the 1.5 s debounce, calling `updateAgentSelectedToolsAction`.
- Mapping the action's discriminated result to the appropriate `saveState`.
- Reverting `selectedTools` to last-known-good on `error` / `conflict` (or applying the conflict's `currentTools` directly).

This resolves the unmount issue: the parent persists the state across `ToolsPanel` open/close cycles. Closing the panel mid-debounce is a no-op for state; only the network call matters, and it is flushed synchronously on parent unmount (see "Concurrency on unmount" above).

### Layout (agent mode)

```
╭──────────────────────── Tools ────────────────────────╮
│ 🔍 Search tools…                       Saved · 3s ago │  ← saved-state indicator
├────────────────────────────────────────────────────────┤
│ ⚠ Stale entries (provider removed)                     │  ← shown only when staleEntries.length > 0
│   ☑ hubspot:legacy_deal_create  [Remove]               │
│                                                        │
│ ☐ OpenFlow/Calendar                                    │  ← tri-state header
│   ☐ check_availability                                 │
│   ☐ list_calendars                                     │
│   ☐ book_appointment                                   │
│   ☐ list_events                                        │
│                                                        │
│ ◐ OpenFlow/Forms                            (2 of 4)  │  ← indeterminate
│   ☑ set_form_fields                                    │
│   ☑ get_form_field                                     │
│   ☐ submit_form                                        │
│   ☐ validate_form                                      │
│                                                        │
│ ☑ HubSpot CRM                                  (all)  │  ← all checked
│   ☑ create_contact                                     │
│   ☑ update_contact                                     │
╰────────────────────────────────────────────────────────╯
```

**Empty agent state** (`selectedTools.length === 0` and no `staleEntries`):

- A subtle dot indicator on the toolbar Tools button (neutral, not red — just a "configurable state present" cue).
- Inside the panel, a single muted line above the first provider group: `agentTools.noToolsHint` — *"No tools enabled. This agent can only converse."*
- No banner, no CTA — honest statement of state.

### Component decomposition

```
ToolsPanel
  ├─ SaveStateIndicator        (Saved · Saving… · Failed — retry · Conflict — refreshing)
  ├─ EmptyStateHint            (when selectedTools.length === 0 in agent mode)
  ├─ StaleEntriesGroup         (only when staleEntries.length > 0)
  │    └─ StaleRow[]           (provider unavailable + Remove button)
  └─ ToolsList
       └─ ProviderGroup        (per group)
            ├─ ProviderHeader   (name + tri-state checkbox + count + provider description)
            └─ ToolRow[]        (per tool — checkbox + name + description)
```

`SaveStateIndicator`, `EmptyStateHint`, `StaleEntriesGroup`, `StaleRow`, `ProviderHeader`, `ToolRow` are new components in `packages/web/app/components/panels/`. The agent-mode `ToolRow` replaces the existing inline row markup conditionally.

**Provider header descriptions** — the registry (`buildToolRegistry`) carries each group's description from the source. Display it as muted text under the provider name (one line, truncate). Helps users new to a provider understand the scope of its tools without clicking each row.

### Cascade behaviour

- **Provider header click**:
  - State `unchecked` or `indeterminate` → check all tools currently in that group (filtered or unfiltered — see search rule below).
  - State `checked` → uncheck all tools in that group.
  - Indeterminate is *displayed*, not a separate click target — clicks always normalise.
- **Tool row click**: toggle that single tool. Header state recomputes against the **currently displayed** scope (not the universe of tools), to keep the visible header state coherent with what the user can see. Specifically:
  - When **no search**: header reflects all tools in the group.
  - When **search active**: header reflects only the tools currently visible in the filtered list. The count format changes accordingly.
- **Count display in the header**:
  - No search: `(N of M)` — selected count out of group total — or `(all)` when N === M.
  - Search active: `(N of M visible · K total)` — N selected among M visible filtered, K is the group's universe. Example: HubSpot has 12 tools all selected; user searches "create" → 2 match → header shows `(2 of 2 visible · 12 total)`. Clicking the header now clearly toggles only the 2 visible.

This replaces the original "split semantics with notice line" approach (which the UX review flagged as confusing). One explicit format that carries all the information, no separate notice.

### Search behaviour

Search matches:
- Tool name
- Tool description
- **Provider/group display name** (so searching "calendar" finds Google Calendar tools whose names are `book_appointment` etc.)

A tool is visible if any of those substrings match the lowercased query.

### Visual treatment

- Use the existing shadcn `Checkbox` (`components/ui/checkbox.tsx`).
- **No dimming** of unchecked rows. The checkbox itself is the signal; dimming adds noise.
- Provider header: same row style as today, plus a leading checkbox, the count format above, and a one-line muted description below the name.
- Existing `group-hover/tool` reveal of the Play test button stays — orthogonal to selection.
- **Saved-state indicator**: small text element in the panel header (right-aligned, in the same row as the search input). State → text:
  - `idle` → blank.
  - `saving` → `Saving…` (no spinner; the text alone is enough).
  - `saved` → `Saved` for ~2 s, then fades to blank.
  - `error` → `Failed — retry` as a clickable text-button that retries the last save.
  - `conflict` → `Conflict — refreshing` for ~1 s, then blank after the agent refetches.
  - All states use muted foreground; only `error` uses destructive token.
- **Stale entries group**: rendered above all provider groups, with a `⚠` icon (lucide `AlertTriangle`, size-3.5) and a muted "Stale entries (provider removed)" label. Each row keeps the existing checkbox UI but replaced with a `[Remove]` text button. Clicking Remove pops that entry from `selectedTools` (and from `staleEntries` once the parent re-derives).
- **Power affordances** (in the panel header, only in agent mode):
  - `Clear` text button — clears all selected tools (acts on filtered set when search is active, full set otherwise).
  - `Select all` is *not* added globally — too dangerous for a permission surface and there's already a per-group cascade.

### Empty selection

No special banner. The user knows they haven't picked tools. Runtime behaviour (LLM with no tools) is the natural feedback.

### Keyboard

- Search input retains focus-on-open.
- Checkboxes reach via Tab; `Space` toggles.
- No new shortcuts.

### State management (per the approach decision)

```ts
const [tools, setTools] = useState(agent.selectedTools);

const debouncedSave = useDebouncedCallback(
  async (next: string[]) => {
    const result = await updateAgentSelectedToolsAction(agent.id, next);
    if (!result.ok) {
      toast.error(t('saveError'));
      setTools(agent.selectedTools); // revert
    }
  },
  1500
);

function toggle(qualifiedName: string): void {
  setTools((prev) => {
    const next = prev.includes(qualifiedName)
      ? prev.filter((t) => t !== qualifiedName)
      : [...prev, qualifiedName];
    debouncedSave(next);
    return next;
  });
}
```

Use `use-debounce` if already a dependency, otherwise a 5-line custom hook. **Flush on unmount.**

### Translations (en.json `agentTools` namespace)

- `agentTools.selectAll` — header tooltip
- `agentTools.clear` — `Clear` button label
- `agentTools.countOfTotal` — `{n} of {total}`
- `agentTools.countOfTotalVisible` — `{n} of {visible} visible · {total} total`
- `agentTools.allSelected` — `all`
- `agentTools.noToolsHint` — `No tools enabled. This agent can only converse.`
- `agentTools.staleHeader` — `Stale entries (provider removed)`
- `agentTools.removeStale` — `Remove`
- `agentTools.runInProgressNote` — `Changes apply to the next run.`  *(shown when a test run is active and the user toggles)*
- `agentTools.saveStates.saving` — `Saving…`
- `agentTools.saveStates.saved` — `Saved`
- `agentTools.saveStates.error` — `Failed — retry`
- `agentTools.saveStates.conflict` — `Conflict — refreshing`
- `agentTools.saveError` — toast on failed save

---

## Error handling

| Failure | Surface | Response |
|---|---|---|
| PATCH 400 (Zod validation) | Server action `{ ok: false, kind: 'validation' }` | Toast `agentTools.saveError`, revert local state to last-known-good. Console-log the Zod error in dev. **No retry** — input is broken. |
| PATCH 403 (lost org membership / permission) | `{ kind: 'forbidden' }` | Toast + revert. **No retry.** |
| PATCH 404 (agent deleted) | `{ kind: 'not_found' }` | Toast + revert. The editor will redirect on next interaction. **No retry.** |
| PATCH 409 (concurrent edit, two-tab scenario) | `{ kind: 'conflict', conflict: { currentUpdatedAt, currentTools } }` | Apply `currentTools` directly to local state, set `saveState = 'conflict'` for ~1 s. The user sees their state replaced with the other tab's writes. **No retry** — the user must re-decide what they wanted. |
| PATCH 429 (rate-limited) | `{ kind: 'rate_limited' }` | Backoff 5 s, then **retry once.** If the retry also fails, toast + revert. |
| PATCH 5xx / network | `{ kind: 'transient' }` | Silent **retry once** with 2 s backoff. If both attempts fail, toast + revert + `saveState = 'error'` with a `Failed — retry` clickable text-button to manually retry. |
| Stale entries (saved tool no longer in registry) | Editor: shown as a `Stale entries` group with a `Remove` button. Runtime executor (sub-project D): **silently dropped** with a server-side warning log once per execution per missing tool. | Re-saving (or clicking Remove) prunes the entry. |
| MCP server uninstalled while tools are selected | Editor surfaces those entries in the stale group on next refresh of the registry. | Same — Remove button or implicit prune on next save. |
| User toggles while a previous PATCH is in flight | Debounce coalesces; older save replaced by newer. The 1.5 s timer restarts on each click. | Last-write-wins, expected behaviour. |
| User navigates away with pending debounce | Parent component unmounts | Flush the pending save synchronously (`debouncedSave.flush()`); fall back to `keepalive: true` fetch if synchronous flush is unreliable in the runtime. |
| Test run in progress when user toggles tools | Saved-state indicator shows the standard transitions; an inline note `Changes apply to next run` shows under the indicator while the test is active. | The current run's tools are frozen at run start (sub-project D's responsibility). |

### Explicitly not handled

- Concurrent edits **on different fields of the same agent** (e.g. someone editing visibility while you edit tools). Only `selected_tools` writes use the version token; the broader agent record uses last-writer-wins.
- Partial-success states (some tool names valid, some invalid): the whole PATCH is atomic.
- Cross-device live state sync (tab B does not know tab A made a change until tab B tries to save and gets 409). Push-based sync is out of scope.
- Idempotency keys (deferred until audit logs land).

---

## Testing

### Backend / api unit tests

- Zod validator for the PATCH body — accept valid arrays, reject:
  - empty strings
  - missing colon
  - multiple colons
  - oversized array (>500)
  - non-array bodies
- Backend route handler — happy path + 400 + 403 + 404. Mock the supabase client.

### Backend integration

- Round-trip: PATCH writes, GET returns the saved value. Confirms the column flows through `executeFetcher`'s SELECT projection.

### Frontend

- Pure-function unit tests for header tri-state computation: given `(visibleTools, selectedTools)`, produce `'checked' | 'unchecked' | 'indeterminate'`.
- Pure-function unit test for toggle logic.
- If a custom debounce hook is added, test flush-on-unmount; if `use-debounce` is used, trust the library.

### Out of scope

- Browser-level visual cascade testing (Playwright / Storybook).
- Migration test — single column add with CHECK; trust Postgres.
- Toast rendering — sonner is library code.

### Forward-pointing test (belongs to sub-project D)

Stale-entry handling in the executor: given a registry `[A, B, C]` and `selected_tools` `[A, X, B]`, the resolved set is `[A, B]` and `X` is logged as a warning. **This test is part of sub-project D's work**, not A's — flagged here so the cross-reference exists.

---

## Observability

Metrics emitted from the backend route + the executor read path:

| Metric | Type | Tags | Purpose |
|---|---|---|---|
| `agent_tools.write.count` | counter | `org_id`, `result` (`ok`, `validation`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `transient`) | Track usage; spot abuse or systemic failure. |
| `agent_tools.write.latency_ms` | histogram | — | p50 / p99 PATCH latency. |
| `agent_tools.write.payload_size` | histogram | — | Bytes of payload; early signal if the 100-cap is too tight. |
| `agent_tools.stale_drop.count` | counter | `provider_type`, `provider_id` | Per execution per missing tool. Spikes signal an MCP rename incident or platform tool removal. |
| `agent_tools.stale_present.count` | gauge | `org_id` | How many agents have at least one stale entry. Long-tail of unmaintained agents. |

Logging:

- Backend route: structured log on every non-2xx response (already standard for `agentRouter` handlers).
- Stale drops in the executor: `WARN` once per `(execution_id, qualified_name)` with `org_id`, `agent_id`, the resolved registry size, and the missing entry. Aggregated to the metric above.

These are not blockers for ship — but they are the early-warning system that makes "silent drop at runtime" safe. **Without them, sub-project D ships blind and the first MCP rename incident is invisible.** The implementation plan must include them as part of A.

---

## Files touched

| Path | Change |
|---|---|
| `supabase/migrations/<ts>_agents_selected_tools.sql` | Add column + CHECK |
| `packages/api/src/types/selectedTool.ts` (new) | Shared `SelectedTool` type, builtin `providerId` constants, `equalsSelectedTool` helper |
| `packages/backend/src/routes/agents/updateSelectedTools.ts` (new) | PATCH handler with `expectedUpdatedAt` precondition |
| `packages/backend/src/routes/agents/agentRouter.ts` | Mount the new route + per-org rate limit |
| `packages/backend/src/routes/execute/executeFetcher.ts` | Add `selected_tools`, `updated_at` to SELECT + AgentRow |
| `packages/backend/src/db/queries/agentQueries.ts` | Update agent row type (location may need verification during planning) |
| `packages/backend/src/observability/metrics.ts` (or equivalent) | Register the 5 metrics in the Observability table |
| `packages/web/app/actions/agents.ts` | `updateAgentSelectedToolsAction` returning discriminated result |
| `packages/web/app/components/agents/AgentEditor.tsx` (or equivalent) | Hoist `selectedTools` + `updatedAt` + debounce + flush-on-unmount |
| `packages/web/app/components/panels/ToolsPanel.tsx` | Accept controlled props; render selectable variant; render save indicator + stale group + empty hint |
| `packages/web/app/components/panels/SaveStateIndicator.tsx` (new) | The 5-state header indicator |
| `packages/web/app/components/panels/StaleEntriesGroup.tsx` (new) | Stale entries + Remove |
| `packages/web/app/components/panels/EmptyToolsHint.tsx` (new) | One-line hint above first group |
| `packages/web/app/components/panels/ProviderHeader.tsx` (new) | Provider name + tri-state checkbox + count + description |
| `packages/web/app/components/panels/ToolRow.tsx` (new) | Per-tool checkbox + name + description + Play button |
| `packages/web/app/lib/agentTools.ts` (new) | Header tri-state computation, equality helpers, `registryHas` predicate |
| `packages/web/messages/en.json` | `agentTools` namespace |
| `packages/web/app/data/<seed>.json` (multiple) | Curated `selectedTools` for demos |

---

## Open dependencies on later sub-projects

- **Sub-project D** consumes `selected_tools` at execution start for autonomous agents. It must:
  - Filter out stale entries (drop, don't error).
  - Use the qualified name to find the right `RegistryTool` and route to the right resolver.
  - Log warnings for stale entries once per execution.
- **Sub-project B (plugin registry)** will likely change *how* the executor resolves a tool name to a service, but the storage shape defined here (`sourceId:toolName`) is registry-agnostic — the registry is keyed by `sourceId`, the tool name is the call.

Nothing in this design pre-commits B / C / D / E to a specific shape.

---

## Status

- Brainstorming: complete.
- Written spec: this document, v2 (post-review).
- Spec review: completed by staff-engineer + UX subagents (2026-04-25).
- Awaiting: user review of this v2 spec.
- After approval: brainstorm B+C+D, then E, then implementation plans for all.

---

## Revisions

### v2 — 2026-04-25

Amendments incorporated from staff-engineer + UX dual review:

**Data model:**
- Storage: `"sourceId:toolName"` strings → `{ providerType, providerId, toolName }` objects. Reason: in-band string concat is fragile across LLM-protocol naming drift; objects give two real keyspaces (`builtin` vs `mcp`), free typed indexing, and renames become single-field migrations.
- Built-in IDs: `__double_underscore__` sentinels → stable slugs (`calendar`, `forms`, `lead_scoring`, `composition`). The sentinels were going to leak into sub-project B's plugin registry as persistent technical debt.
- Cap: 500 → 100. The 500 was paranoia; 100 is the realistic ceiling above which prompt-size economics kill the agent regardless.

**Concurrency:**
- PATCH now requires `expectedUpdatedAt` (last-known agent `updated_at`). Server returns 409 with current state on mismatch. Reason: two-tab scenario silently overwrites under last-writer-wins; full-array PATCH compounds the loss.

**Operations:**
- Added per-org rate limit (30 req/min/org).
- Discriminated server-action error result so the UI distinguishes 4xx (revert, no retry) from 5xx (silent retry once) from 409 (apply current state) from 429 (backoff + retry).
- Added Observability section with 5 metrics + structured warn-log on stale drops.

**UX:**
- Saved-state indicator added to the panel header (`Saving…` / `Saved` / `Failed — retry` / `Conflict — refreshing`). Reason: tool grants are a permission surface; silent saves create a trust gap. Q4's "no indicator" decision was wrong for this surface.
- Empty-state hint: subtle dot on toolbar Tools button + one-line muted hint inside panel when `selectedTools.length === 0` in agent mode. Reason: fresh users with no tools selected get confusing LLM behaviour as the only feedback signal.
- Stale entries: now displayed in editor as a top-of-list group with `Remove` action. Previously silently dropped at runtime only; users had no way to see or clean up state-registry mismatches.
- Cascade-during-search: replaced "split semantics with notice" with single inline format `(N of M visible · K total)`; cascade applies to visible only. UX review flagged the original as a footgun.
- Search now matches provider/group display name in addition to tool name + description.
- Power affordance: added `Clear` text button in panel header. Did *not* add `Select all` globally — too dangerous for a permission surface.

**State management approach:**
- Lifted state from `ToolsPanel` to the agent editor (parent). `ToolsPanel` is now controlled. Reason: outside-click closes the panel mid-debounce; if save fails after unmount the original "local state" approach has nothing to revert. Parent ownership solves it cleanly and matches how the parent already holds the agent record.

**Forward-compat:**
- Built-in `providerId` keyspace explicitly named as a public contract; renaming requires migration. Sub-project B's plugin registry consumes this keyspace directly without re-encoding.
