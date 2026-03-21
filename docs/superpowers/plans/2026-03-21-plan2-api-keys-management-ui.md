# Plan 2: API Keys Management UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete CRUD interface for execution API keys — the Bearer tokens external callers use to invoke published agents via `POST /api/agents/:slug/:version`.

**Architecture:** Server page fetches initial data, passes to client section component. Section manages state and dialogs. Keys are generated server-side (crypto random), hashed (SHA-256), and only the hash is stored in DB. The full key is shown once at creation in a reveal dialog. Agent scoping uses the `agent_execution_key_agents` join table. Use impeccable skills (`frontend-design`, `critique`, `polish`) for UI quality.

**Tech Stack:** Next.js (App Router), shadcn/ui (Dialog, Card, Combobox multi-select, Badge), Supabase JS SDK, next-intl translations, lucide-react icons

**Note:** Key generation uses `base64url` encoding (not base62 as spec mentions) because Node.js has native support. Functionally equivalent for API key purposes.

**Spec:** `docs/superpowers/specs/2026-03-21-agent-execution-api-design.md` (Section 3)

**Depends on:** Plan 1 (migration with `agent_execution_keys` and `agent_execution_key_agents` tables)

---

## File Structure

### New files
- `packages/web/app/lib/execution-keys.ts` — Lib: types, key generation, hashing, CRUD via Supabase
- `packages/web/app/actions/execution-keys.ts` — Server actions wrapping lib functions
- `packages/web/app/components/orgs/execution-keys/ExecutionKeysSection.tsx` — Main section: key list, empty state, create/delete orchestration
- `packages/web/app/components/orgs/execution-keys/CreateExecutionKeyDialog.tsx` — Dialog: name input + agent multi-select
- `packages/web/app/components/orgs/execution-keys/KeyRevealDialog.tsx` — Dialog: shows full key once with copy button
- `packages/web/app/components/orgs/execution-keys/DeleteExecutionKeyDialog.tsx` — Confirmation dialog for key deletion
- `packages/web/app/components/orgs/execution-keys/ExecutionKeyRow.tsx` — Single key row with agent badges, metadata, actions

### Modified files
- `packages/web/app/orgs/[slug]/(dashboard)/api-keys/page.tsx` — Replace skeleton with real page
- `packages/web/messages/en.json` — Add `executionKeys` translation namespace

---

## Task 1: Create execution keys lib

**Files:**
- Create: `packages/web/app/lib/execution-keys.ts`

- [ ] **Step 1: Create types and type predicates**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExecutionKeyRow {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ExecutionKeyWithAgents extends ExecutionKeyRow {
  agents: ExecutionKeyAgent[];
}

export interface ExecutionKeyAgent {
  agent_id: string;
  agent_name: string;
  agent_slug: string;
}

export function isExecutionKeyRow(value: unknown): value is ExecutionKeyRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'key_prefix' in value &&
    'org_id' in value
  );
}
```

- [ ] **Step 2: Add key generation and hashing functions**

These run server-side only (in server actions). Generate a cryptographically random key with `clr_` prefix, return the full key and its SHA-256 hash.

```typescript
import { createHash, randomBytes } from 'node:crypto';

const KEY_PREFIX = 'clr_';
const KEY_BYTES = 48;
const DISPLAY_PREFIX_LENGTH = 12;

export function generateExecutionKey(): { fullKey: string; keyHash: string; keyPrefix: string } {
  const randomPart = randomBytes(KEY_BYTES).toString('base64url');
  const fullKey = `${KEY_PREFIX}${randomPart}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = fullKey.slice(0, DISPLAY_PREFIX_LENGTH) + '...';
  return { fullKey, keyHash, keyPrefix };
}

export function hashExecutionKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

- [ ] **Step 3: Add CRUD functions**

```typescript
function mapRows(data: unknown[]): ExecutionKeyRow[] {
  return data.reduce<ExecutionKeyRow[]>((acc, row) => {
    if (isExecutionKeyRow(row)) acc.push(row);
    return acc;
  }, []);
}

const COLUMNS = 'id, org_id, name, key_prefix, expires_at, created_at, last_used_at';

export async function getExecutionKeysByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: ExecutionKeyRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_keys')
    .select(COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function getAgentsForKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ result: ExecutionKeyAgent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_execution_key_agents')
    .select('agent_id, agents(name, slug)')
    .eq('key_id', keyId);

  if (error !== null) return { result: [], error: error.message };
  const rows = (data as unknown[] | null) ?? [];
  const agents: ExecutionKeyAgent[] = rows
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      agent_id: String(r.agent_id ?? ''),
      agent_name: String((r.agents as Record<string, unknown>)?.name ?? ''),
      agent_slug: String((r.agents as Record<string, unknown>)?.slug ?? ''),
    }));
  return { result: agents, error: null };
}

export async function createExecutionKey(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  agentIds: string[],
  expiresAt: string | null
): Promise<{ result: { key: ExecutionKeyRow; fullKey: string } | null; error: string | null }> {
  const { fullKey, keyHash, keyPrefix } = generateExecutionKey();

  // Insert key
  const { data, error } = await supabase
    .from('agent_execution_keys')
    .insert({ org_id: orgId, name, key_hash: keyHash, key_prefix: keyPrefix, expires_at: expiresAt })
    .select(COLUMNS)
    .single();

  if (error !== null) return { result: null, error: error.message };
  if (!isExecutionKeyRow(data)) return { result: null, error: 'Invalid key data' };

  // Insert agent scoping
  if (agentIds.length > 0) {
    const rows = agentIds.map((agentId) => ({ key_id: data.id, agent_id: agentId }));
    const { error: joinError } = await supabase.from('agent_execution_key_agents').insert(rows);
    if (joinError !== null) {
      // Rollback: delete the key
      await supabase.from('agent_execution_keys').delete().eq('id', data.id);
      return { result: null, error: joinError.message };
    }
  }

  return { result: { key: data, fullKey }, error: null };
}

export async function updateExecutionKeyAgents(
  supabase: SupabaseClient,
  keyId: string,
  agentIds: string[]
): Promise<{ error: string | null }> {
  // Delete existing, re-insert
  const { error: delError } = await supabase
    .from('agent_execution_key_agents')
    .delete()
    .eq('key_id', keyId);
  if (delError !== null) return { error: delError.message };

  if (agentIds.length > 0) {
    const rows = agentIds.map((agentId) => ({ key_id: keyId, agent_id: agentId }));
    const { error: insError } = await supabase.from('agent_execution_key_agents').insert(rows);
    if (insError !== null) return { error: insError.message };
  }
  return { error: null };
}

export async function updateExecutionKeyName(
  supabase: SupabaseClient,
  keyId: string,
  name: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agent_execution_keys')
    .update({ name })
    .eq('id', keyId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function deleteExecutionKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('agent_execution_keys').delete().eq('id', keyId);
  if (error !== null) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/execution-keys.ts
git commit -m "feat: add execution keys lib with types, generation, and CRUD"
```

---

## Task 2: Create execution keys server actions

**Files:**
- Create: `packages/web/app/actions/execution-keys.ts`

- [ ] **Step 1: Create server actions file**

Follow the exact pattern from `packages/web/app/actions/api-keys.ts`. Create all CRUD actions:

```typescript
'use server';

import type { ExecutionKeyAgent, ExecutionKeyRow } from '@/app/lib/execution-keys';
import {
  createExecutionKey as createLib,
  deleteExecutionKey as deleteLib,
  getAgentsForKey as getAgentsLib,
  getExecutionKeysByOrg as getByOrgLib,
  updateExecutionKeyAgents as updateAgentsLib,
  updateExecutionKeyName as updateNameLib,
} from '@/app/lib/execution-keys';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';
```

Actions to create:
- `getExecutionKeysByOrgAction(orgId)` → `{ result: ExecutionKeyRow[]; error: string | null }`
- `getAgentsForKeyAction(keyId)` → `{ result: ExecutionKeyAgent[]; error: string | null }`
- `createExecutionKeyAction(orgId, name, agentIds, expiresAt)` → `{ result: { key: ExecutionKeyRow; fullKey: string } | null; error: string | null }`
- `updateExecutionKeyAgentsAction(keyId, agentIds)` → `{ error: string | null }`
- `updateExecutionKeyNameAction(keyId, name)` → `{ error: string | null }`
- `deleteExecutionKeyAction(keyId)` → `{ error: string | null }`

Each follows the pattern: create supabase client, call lib function, log with serverLog/serverError, return result.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/actions/execution-keys.ts
git commit -m "feat: add execution keys server actions"
```

---

## Task 3: Add translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add `executionKeys` namespace to translations**

Add a new `executionKeys` object at the top level of the JSON (alongside existing `apiKeys`, `envVariables`, etc.):

```json
{
  "executionKeys": {
    "title": "Execution API Keys",
    "description": "Create API keys to authenticate external callers invoking your published agents. Keys are shown only once at creation.",
    "add": "Create key",
    "name": "Key name",
    "namePlaceholder": "e.g. Production, Staging, WhatsApp Bot",
    "nameRequired": "Key name is required.",
    "agents": "Agents",
    "agentsDescription": "Select which published agents this key can access.",
    "agentsRequired": "Select at least one agent.",
    "agentsPlaceholder": "Search agents...",
    "expiresAt": "Expiration",
    "expiresAtDescription": "Optional. Leave empty for no expiration.",
    "noExpiration": "No expiration",
    "createError": "Failed to create key. Please try again.",
    "keyCreated": "API Key Created",
    "keyCreatedDescription": "Copy this key now. You won't be able to see it again.",
    "copyKey": "Copy key",
    "keyCopied": "Key copied to clipboard",
    "deleteTitle": "Delete API key",
    "deleteDescription": "This will permanently delete \"{name}\". Any external callers using this key will stop working.",
    "deleteConfirm": "Delete",
    "deleteCancel": "Cancel",
    "deleteError": "Failed to delete key. Please try again.",
    "noKeys": "No execution API keys yet. Create your first key to start using your agents via API.",
    "prefix": "Key",
    "created": "Created",
    "lastUsed": "Last used",
    "never": "Never",
    "expired": "Expired",
    "agentCount": "{count} agents",
    "editAgents": "Edit agents",
    "editName": "Edit name",
    "updateError": "Failed to update key. Please try again."
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add execution keys translations"
```

---

## Task 4: Build the API Keys page and section component

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/api-keys/page.tsx`
- Create: `packages/web/app/components/orgs/execution-keys/ExecutionKeysSection.tsx`
- Create: `packages/web/app/components/orgs/execution-keys/ExecutionKeyRow.tsx`

- [ ] **Step 1: Update the page to fetch and pass data**

Rewrite `packages/web/app/orgs/[slug]/(dashboard)/api-keys/page.tsx` as a server component (remove the existing `useTranslations` client hook — server components don't use hooks).

```typescript
import { ExecutionKeysSection } from '@/app/components/orgs/execution-keys/ExecutionKeysSection';
import { getAgentsForKey, getExecutionKeysByOrg } from '@/app/lib/execution-keys';
import { getAgentsByOrg } from '@/app/lib/agents';
import type { AgentMetadata } from '@/app/lib/agents';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';
import { redirect } from 'next/navigation';
```

Pattern: call lib functions directly from the server component (same as settings page — NOT server actions). Fetch:
1. Org by slug
2. Execution keys for the org
3. Agents for the org — **filter to published only**: `agents.filter(a => a.published_at !== null)`
4. For each key, fetch its scoped agents via `getAgentsForKey` — combine into `ExecutionKeyWithAgents[]`

Pass `initialKeys: ExecutionKeyWithAgents[]`, `agents: AgentMetadata[]` (published only), `orgId` to the section component.

- [ ] **Step 2: Create ExecutionKeyRow component**

`packages/web/app/components/orgs/execution-keys/ExecutionKeyRow.tsx`:

A row displaying: name, key prefix (monospace), agents (expandable: shows count badge, click to expand and see individual agent names as small badges), created date, last used date, expired badge if applicable, and action buttons (edit agents, delete).

Use:
- `Badge` for agent count — clickable to toggle expand/collapse
- When expanded, show individual agent names as `Badge variant="secondary"` items
- `Button variant="ghost" size="icon-sm"` for actions
- `Pencil`, `Trash2` icons from lucide-react
- `formatRelativeTime` (check if it exists in `app/utils/`) for dates
- If `expires_at` is in the past, show an "Expired" badge in red

- [ ] **Step 3: Create ExecutionKeysSection component**

`packages/web/app/components/orgs/execution-keys/ExecutionKeysSection.tsx`:

Client component with props: `orgId`, `initialKeys`, `agents` (for create dialog).

State:
- `keys: ExecutionKeyWithAgents[]`
- `createOpen: boolean`
- `revealKey: string | null` (the full key to show in reveal dialog)
- `deleteTarget: { id: string; name: string } | null`

Features:
- Card with title, description, and "Create key" button
- List of ExecutionKeyRow components
- Empty state when no keys
- `refreshKeys()` callback that fetches updated keys + agents per key
- Integrates CreateExecutionKeyDialog, KeyRevealDialog, DeleteExecutionKeyDialog

- [ ] **Step 4: Create stub dialog files so typecheck passes**

Create minimal stub exports for `CreateExecutionKeyDialog.tsx`, `KeyRevealDialog.tsx`, and `DeleteExecutionKeyDialog.tsx` with just the component signature and an empty `<Dialog>` return. This ensures the section component can import them. The stubs will be fully implemented in Task 5.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS (stubs satisfy imports)

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/orgs/[slug]/(dashboard)/api-keys/page.tsx
git add packages/web/app/components/orgs/execution-keys/
git commit -m "feat: add execution keys page, section component, and dialog stubs"
```

---

## Task 5: Create key dialogs

**Files:**
- Create: `packages/web/app/components/orgs/execution-keys/CreateExecutionKeyDialog.tsx`
- Create: `packages/web/app/components/orgs/execution-keys/KeyRevealDialog.tsx`
- Create: `packages/web/app/components/orgs/execution-keys/DeleteExecutionKeyDialog.tsx`

- [ ] **Step 1: Create CreateExecutionKeyDialog**

Dialog with:
- **Name field**: text input, required
- **Agents field**: multi-select using `Combobox` + `ComboboxChips` from shadcn. Shows published agents. At least one required.
- **Expiration field**: optional date input (can be left empty for no expiration)
- **Submit**: calls `createExecutionKeyAction`, then if successful, calls `onCreated({ key, fullKey })` — the parent opens the reveal dialog

Props: `open`, `onOpenChange`, `orgId`, `agents: AgentMetadata[]`, `onCreated: (result: { key: ExecutionKeyRow; fullKey: string }) => void`

Follow the pattern from `CreateApiKeyDialog.tsx`: separate validation function, field-level errors, loading state, toast on error.

- [ ] **Step 2: Create KeyRevealDialog**

Dialog with:
- Title: "API Key Created"
- Description: "Copy this key now. You won't be able to see it again."
- Key display: monospace text in a bordered container
- Copy button: uses `navigator.clipboard.writeText()`, shows toast on success
- Close button: standard dialog close
- **Important**: Key is only available in this dialog. Once closed, it's gone.

Props: `open`, `onOpenChange`, `fullKey: string`

- [ ] **Step 3: Create DeleteExecutionKeyDialog**

Follow the exact pattern from `DeleteApiKeyDialog.tsx`:
- AlertDialog with confirmation message
- Shows key name in the message
- Calls `deleteExecutionKeyAction(keyId)` on confirm
- Toast on error, calls `onDeleted()` on success

Props: `open`, `onOpenChange`, `keyId`, `keyName`, `onDeleted: () => void`

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 5: Run full check**

Run: `npm run check`
Expected: format + lint + typecheck pass. If max-lines issues, extract sub-components.

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/components/orgs/execution-keys/
git commit -m "feat: add execution key dialogs (create, reveal, delete)"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run `npm run check`**

Expected: format, lint, typecheck pass. Fix any issues.

- [ ] **Step 2: Verify translations are complete**

Check that all `t('executionKeys.xxx')` calls in the components have corresponding keys in `messages/en.json`.

- [ ] **Step 3: Start dev server and verify**

Run: `npm run dev -w packages/web`

Verify:
1. Navigate to `/orgs/closer/api-keys`
2. Page loads with empty state message
3. "Create key" button opens the dialog
4. Agent multi-select shows agents from the org
5. Creating a key shows the reveal dialog with the full key
6. Copy button works
7. After closing reveal, the key appears in the list with prefix + agent count
8. Delete button shows confirmation and removes the key

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix: address verification issues for execution keys UI"
```
