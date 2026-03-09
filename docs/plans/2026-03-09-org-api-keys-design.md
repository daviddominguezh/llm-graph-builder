# Org-Level API Keys Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move OpenRouter API keys from browser localStorage to org-level database storage with CRUD, per-agent key selection (separate staging/production), and gating simulation/publish on key presence.

**Architecture:** New `org_api_keys` table stores named keys per org. Agents reference keys via `staging_api_key_id` and `production_api_key_id` FK columns. Editor loads available keys from server, user selects via dropdown. Publish copies staging key to production. Simulation and publish buttons disabled without a key.

**Tech Stack:** Supabase (Postgres + RLS), Next.js 16 App Router, React 19, shadcn/ui, next-intl

---

## Database

```sql
org_api_keys (
  id UUID PK DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL FK → organizations ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

- RLS: org members can SELECT/INSERT/DELETE (membership check via org_members)
- Keys stored as plain text (consistent with current approach — sent in plaintext to simulate endpoint)

Agent columns:
- `staging_api_key_id UUID FK → org_api_keys ON DELETE SET NULL` (nullable)
- `production_api_key_id UUID FK → org_api_keys ON DELETE SET NULL` (nullable)
- SET NULL on delete: if an org key is deleted, agents lose their selection

On publish: `staging_api_key_id` is copied to `production_api_key_id` (same pattern as graph data).

---

## UI: API Keys Management

Located in org settings page (`/orgs/[slug]/settings`) between avatar section and danger zone.

- Section heading: "API Keys"
- "Add key" button opens Dialog with name + key value inputs
- List of existing keys: name, masked value (last 4 chars like `••••••••ab3f`), delete button
- Delete opens AlertDialog confirmation
- No edit flow — delete and recreate if key needs changing

---

## UI: Agent Editor Key Selection

In PresetsPanel (left sidebar), replace the "OpenRouter API Key" text input:

- **Staging API Key:** Select dropdown listing org's keys by name. Selecting saves `staging_api_key_id` immediately (auto-save pattern).
- **Production API Key:** Read-only display showing the production key name. Set on publish (copied from staging).
- If no keys in org: "No API keys configured. Add keys in org settings."

Toolbar gating:
- **Play button:** disabled when `staging_api_key_id` is null. Tooltip on hover: "Set an OpenRouter API key first"
- **Publish button:** disabled when `staging_api_key_id` is null (in addition to existing checks). Same tooltip.

Data flow:
- Old: localStorage → usePresets → useSimulation → API request
- New: database (agent.staging_api_key_id) → look up key value from org_api_keys list → useSimulation → API request
- Key values fetched once when editor loads (server component), kept in memory

---

## Translations

```json
"apiKeys": {
  "title": "API Keys",
  "add": "Add key",
  "name": "Name",
  "namePlaceholder": "My API Key",
  "nameRequired": "Key name is required.",
  "key": "Key",
  "keyPlaceholder": "sk-or-...",
  "keyRequired": "API key is required.",
  "createError": "Failed to add key. Please try again.",
  "deleteTitle": "Delete API key",
  "deleteDescription": "This will delete \"{name}\". Agents using this key will need a new one selected.",
  "deleteConfirm": "Delete",
  "deleteCancel": "Cancel",
  "deleteError": "Failed to delete key. Please try again.",
  "noKeys": "No API keys configured. Add keys in org settings.",
  "stagingKey": "Staging API Key",
  "productionKey": "Production API Key",
  "selectKey": "Select a key",
  "none": "None",
  "requiresKey": "Set an OpenRouter API key first"
}
```

---

## New Files

- `supabase/migrations/..._add_org_api_keys.sql`
- `app/lib/api-keys.ts`
- `app/components/orgs/ApiKeysSection.tsx`
- `app/components/orgs/CreateApiKeyDialog.tsx`
- `app/components/orgs/DeleteApiKeyDialog.tsx`

## Modified Files

- `app/components/panels/PresetsPanel.tsx` — Replace input with Select dropdowns
- `app/components/panels/Toolbar.tsx` — Disable Play/Publish, add tooltips
- `app/components/GraphBuilder.tsx` — Pass api keys and selected key ID
- `app/hooks/usePresets.ts` — Remove localStorage API key logic
- `app/hooks/useSimulation.ts` — Resolve key value from keys list
- `app/components/SidePanels.tsx` — Pass api keys to PresetsPanel
- `app/orgs/[slug]/settings/page.tsx` — Add ApiKeysSection
- `app/editor/[slug]/page.tsx` — Fetch org's api keys
- `app/lib/agents.ts` — Add key ID columns, update publish
- `messages/en.json` — Add apiKeys.* keys
