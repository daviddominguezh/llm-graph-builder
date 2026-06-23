# Two-step trigger modal with backend persistence

**Date:** 2026-06-23
**Status:** Approved (pending spec review)

## Problem

The Triggers tab inside the agent/workflow editor lets a user build a schedule
(recurring / once / after-event), but:

1. The modal captures only the *schedule*. It does not capture the **initial
   user message** the workflow/agent should receive when the trigger fires.
2. Triggers live only in client memory (`useTriggers` holds a
   `Record<tenantId, Trigger[]>`); they are lost on refresh and never reach the
   backend.

We need a two-step modal — step 1 is the existing schedule builder, step 2
captures the initial message — and on create the trigger must be persisted
through the established **Client → Next.js (server action) → dedicated backend**
flow.

## Scope

- **Read + Write + Delete** of triggers via the backend. **No update/patch.**
- Triggers are scoped to **agent + tenant** (the agent comes from the editor's
  `agentSlug`/`agentId`; the tenant from the existing tenant sidebar).
- Editing an existing trigger is **dropped**: rows expose delete only. Changing
  a schedule means deleting and re-creating.

Out of scope: after-event triggers (still "coming soon"), backend scheduler /
execution, the dedicated backend's own implementation of the endpoints (defined
here as a contract, implemented in that separate service — exactly as
`/agents/by-org/:orgId` is consumed today).

## Data model

`packages/web/app/components/agents/triggers/types.ts`

Add `initialMessage` to the form state so the message travels with the schedule:

```ts
export interface TriggerFormState {
  mode: ScheduleMode;
  recurring: RecurringConfig;
  onceDateTime: string;
  initialMessage: string; // NEW
}
```

`DEFAULT_TRIGGER_STATE.initialMessage = ''`. `Trigger` continues to extend
`TriggerFormState` with `id`.

## UI — two-step modal

`packages/web/app/components/agents/triggers/TriggerFormDialog.tsx`

`FormBody` gains a `step` state: `'schedule' | 'message'`.

- **Step 1 — Schedule.** The existing content (ModeSelector + active fields +
  preview). Footer: `Cancel` · **`Next`**. `Next` advances to step 2 and is
  always enabled (schedule has valid defaults — parity with today's Save, which
  had no validation).
- **Step 2 — Message.** A labeled shadcn `Textarea` bound to
  `state.initialMessage`. Footer: **`Back`** (returns to step 1, preserving all
  state) · **`Create`**. `Create` is **disabled while
  `state.initialMessage.trim() === ''`**. Clicking `Create` calls `onSave(state)`
  and closes.

The dialog keeps its fixed height; step 2 reuses the same scroll container.

### File/lint structure (ESLint: 40 lines/fn, 300 lines/file, depth 2)

To stay within limits, extract:

- `ScheduleStep.tsx` — the current schedule body (ModeSelector + `ActiveContent`
  + `PreviewSection`), moved out of `TriggerFormDialog.tsx`.
- `MessageStep.tsx` — the textarea + label.
- A small `StepFooter` (inline in the dialog or its own file) rendering the two
  footer variants.

`FormBody` orchestrates: holds `state` + `step`, renders the active step
component and the matching footer.

## Persistence — server action, mirroring the tenants pattern

New files, structured exactly like `app/lib/tenants.ts` + `app/actions/tenants.ts`:

### `app/lib/triggers.ts`

- `TriggerRow` type (backend row, snake_case) + `isTriggerRow` /
  `isTriggerRowArray` type guards + `extractError` helper.
- `toTrigger(row: TriggerRow): Trigger` mapper.
- `fetchFromBackend` calls (Read / Write / Delete), each returning
  `{ result, error }`.

```ts
export interface TriggerRow {
  id: string;
  agent_id: string;
  tenant_id: string;
  mode: ScheduleMode;
  recurring: RecurringConfig;
  once_datetime: string;
  initial_message: string;
  created_at: string;
}
```

### `app/actions/triggers.ts`

`'use server'` wrappers with `serverLog` / `serverError`, returning
`{ result, error }`:

- `listTriggersAction(agentId, tenantId)` → `{ result: Trigger[]; error }`
- `createTriggerAction(agentId, tenantId, form: TriggerFormState)` →
  `{ result: Trigger | null; error }`
- `deleteTriggerAction(agentId, triggerId)` → `{ error }`

### Backend contract (consumed here; implemented in the dedicated backend)

Uses **explicit flat fields** in the payload (not an opaque blob); `recurring`
remains a nested object.

| Op     | Method · path                                       | Body                                                       | Returns        |
| ------ | --------------------------------------------------- | ---------------------------------------------------------- | -------------- |
| Read   | `GET /agents/:agentId/triggers?tenantId=:tenantId`  | —                                                          | `TriggerRow[]` |
| Write  | `POST /agents/:agentId/triggers`                    | `{ tenantId, mode, recurring, onceDateTime, initialMessage }` | `TriggerRow`   |
| Delete | `DELETE /agents/:agentId/triggers/:triggerId`       | —                                                          | `{}` / 204     |

`agentId` is URL-encoded into the path (matching `/agents/by-org/${encodeURIComponent(orgId)}`).

## Wiring

- **`EditorTabs.tsx`** — pass `agentId` into `<TriggersPanel>`. (`agentId` is
  already an `EditorTabsProps` field; `TriggersPanel` currently receives only
  `orgId`/`orgSlug`.)
- **`TriggersPanel.tsx`** — accept `agentId`; thread it into `useTriggers` and
  the list. Drop the `onEdit`/edit-state path; keep add + delete.
- **`useTriggers(agentId, tenantId)`** — becomes async:
  - Loads via `listTriggersAction` on mount and whenever `(agentId, tenantId)`
    change; exposes `triggers`, `loading`, `error`.
  - `addTrigger(form)` → `createTriggerAction`; on success append the returned
    `Trigger`.
  - `deleteTrigger(id)` → `deleteTriggerAction`; on success remove locally.
  - Guards against empty `agentId`/`tenantId` (current hook already guards
    empty tenant).
- **`TriggersListView` / `TriggerRow`** — remove the edit affordance; show a
  triggers-list loading/error state.

## i18n

Single locale file: `packages/web/messages/en.json`, under `editor.triggers`.
New keys: `next`, `back`, `create`, `messageStepTitle`, `messageLabel`,
`messagePlaceholder`, and list-level `listLoading` / `listError`.

## Error handling

- Server actions catch via `extractError` and return `{ error }` strings (never
  throw to the client) — same as tenants/agents.
- `Create` disabled on empty message prevents empty submissions client-side.
- List load failure renders an error state in the panel; create/delete failures
  surface inline (toast or inline error — consistent with existing panel
  behavior).

## Testing / verification

- `npm run check` (format + lint + typecheck) must pass — watch the 40-line and
  300-line ESLint limits during extraction.
- Manual: open the Triggers tab for an agent, add a trigger, confirm `Create`
  is disabled until a message is typed, confirm the POST payload shape and that
  the row appears; delete it; reload and confirm Read repopulates from the BE.
```
