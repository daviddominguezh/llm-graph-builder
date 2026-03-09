# Org-Level API Keys Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move OpenRouter API keys from browser localStorage to org-level database storage with CRUD, per-agent key selection (separate staging/production), and gating simulation/publish on key presence.

**Architecture:** New `org_api_keys` table stores named keys per org. Agents reference keys via `staging_api_key_id` and `production_api_key_id` FK columns. Editor loads available keys from server, user selects via dropdown. Publish copies staging key to production. Simulation and publish buttons disabled without a key.

**Tech Stack:** Supabase (Postgres + RLS), Next.js 16 App Router, React 19, shadcn/ui (base-ui/react), next-intl

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260309200000_add_org_api_keys.sql`

**Step 1: Write the migration**

```sql
-- ============================================================================
-- 1. Create org_api_keys table
-- ============================================================================

create table public.org_api_keys (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  key_value  text not null,
  created_at timestamptz not null default now()
);

create index idx_org_api_keys_org_id on public.org_api_keys(org_id);

-- ============================================================================
-- 2. RLS on org_api_keys
-- ============================================================================

alter table public.org_api_keys enable row level security;

create policy "Org members can read api keys"
  on public.org_api_keys for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_api_keys.org_id
        and org_members.user_id = auth.uid()
    )
  );

create policy "Org members can insert api keys"
  on public.org_api_keys for insert
  to authenticated
  with check (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_api_keys.org_id
        and org_members.user_id = auth.uid()
    )
  );

create policy "Org members can delete api keys"
  on public.org_api_keys for delete
  to authenticated
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_api_keys.org_id
        and org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. Add API key FK columns to agents
-- ============================================================================

alter table public.agents
  add column staging_api_key_id uuid references public.org_api_keys(id) on delete set null,
  add column production_api_key_id uuid references public.org_api_keys(id) on delete set null;
```

**Step 2: Apply the migration**

Run: `npx supabase db push` (or `supabase migration up` depending on local setup)

**Step 3: Commit**

```bash
git add supabase/migrations/20260309200000_add_org_api_keys.sql
git commit -m "feat: add org_api_keys table and agent FK columns"
```

---

### Task 2: Translations

**Files:**
- Modify: `packages/web/messages/en.json`

**Step 1: Add apiKeys namespace to en.json**

Add the following after the `"orgs"` block (before the closing `}`):

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

**Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add apiKeys translations"
```

---

### Task 3: API Keys CRUD Library

**Files:**
- Create: `packages/web/app/lib/api-keys.ts`

**Step 1: Write the library**

Follow the same patterns as `app/lib/orgs.ts` and `app/lib/agents.ts`: type predicates for narrowing, `{ result, error }` return tuples, no `any` types.

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ApiKeyRow {
  id: string;
  org_id: string;
  name: string;
  key_value: string;
  created_at: string;
}

function isApiKeyRow(value: unknown): value is ApiKeyRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'key_value' in value;
}

export async function getApiKeysByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: ApiKeyRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('org_api_keys')
    .select('id, org_id, name, key_value, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error !== null) return { result: [], error: error.message };
  const rows: ApiKeyRow[] = (data as ApiKeyRow[] | null) ?? [];
  return { result: rows, error: null };
}

export async function createApiKey(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  keyValue: string
): Promise<{ result: ApiKeyRow | null; error: string | null }> {
  const result = await supabase
    .from('org_api_keys')
    .insert({ org_id: orgId, name, key_value: keyValue })
    .select()
    .single();

  if (result.error !== null) return { result: null, error: result.error.message };
  if (!isApiKeyRow(result.data)) return { result: null, error: 'Invalid api key data' };
  return { result: result.data, error: null };
}

export async function deleteApiKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('org_api_keys').delete().eq('id', keyId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
```

**Step 2: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 3: Commit**

```bash
git add packages/web/app/lib/api-keys.ts
git commit -m "feat: add api-keys CRUD library"
```

---

### Task 4: API Keys Management UI — CreateApiKeyDialog

**Files:**
- Create: `packages/web/app/components/orgs/CreateApiKeyDialog.tsx`

**Step 1: Write the component**

Follow the exact same pattern as `CreateAgentDialog.tsx`: form with `handleSubmit`, `FormEvent`, validation error state, `useTranslations('apiKeys')`, Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter from shadcn, `toast.error` on failure.

```typescript
'use client';

import { createApiKey } from '@/app/lib/api-keys';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onCreated: () => void;
}

function CreateApiKeyFields({
  nameError,
  keyError,
}: {
  nameError: string;
  keyError: string;
}) {
  const t = useTranslations('apiKeys');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="key-name">{t('name')}</Label>
        <Input id="key-name" name="name" placeholder={t('namePlaceholder')} required />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="key-value">{t('key')}</Label>
        <Input id="key-value" name="keyValue" placeholder={t('keyPlaceholder')} required />
        {keyError !== '' && <p className="text-destructive text-xs">{keyError}</p>}
      </div>
    </>
  );
}

// Form component handles submission logic
function CreateApiKeyForm({ orgId, onOpenChange, onCreated }: Omit<CreateApiKeyDialogProps, 'open'>) {
  const t = useTranslations('apiKeys');
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [keyError, setKeyError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const keyValue = (formData.get('keyValue') as string).trim();

    setNameError('');
    setKeyError('');

    if (name === '') { setNameError(t('nameRequired')); return; }
    if (keyValue === '') { setKeyError(t('keyRequired')); return; }

    setLoading(true);
    const supabase = createClient();
    const { error } = await createApiKey(supabase, orgId, name, keyValue);

    if (error !== null) {
      setLoading(false);
      toast.error(t('createError'));
      return;
    }

    setLoading(false);
    onOpenChange(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CreateApiKeyFields nameError={nameError} keyError={keyError} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>{t('add')}</Button>
      </DialogFooter>
    </form>
  );
}

export function CreateApiKeyDialog({ open, onOpenChange, orgId, onCreated }: CreateApiKeyDialogProps) {
  const t = useTranslations('apiKeys');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>
        <CreateApiKeyForm orgId={orgId} onOpenChange={onOpenChange} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 3: Commit**

```bash
git add packages/web/app/components/orgs/CreateApiKeyDialog.tsx
git commit -m "feat: add CreateApiKeyDialog component"
```

---

### Task 5: API Keys Management UI — DeleteApiKeyDialog

**Files:**
- Create: `packages/web/app/components/orgs/DeleteApiKeyDialog.tsx`

**Step 1: Write the component**

Follow the same pattern as `DangerZone.tsx` AlertDialog usage. Uses AlertDialog, AlertDialogContent, AlertDialogAction, etc.

```typescript
'use client';

import { deleteApiKey } from '@/app/lib/api-keys';
import { createClient } from '@/app/lib/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface DeleteApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string;
  keyName: string;
  onDeleted: () => void;
}

export function DeleteApiKeyDialog({
  open,
  onOpenChange,
  keyId,
  keyName,
  onDeleted,
}: DeleteApiKeyDialogProps) {
  const t = useTranslations('apiKeys');

  async function handleDelete() {
    const supabase = createClient();
    const { error } = await deleteApiKey(supabase, keyId);

    if (error !== null) {
      toast.error(t('deleteError'));
      return;
    }

    onOpenChange(false);
    onDeleted();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('deleteDescription', { name: keyName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete}>
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

**Step 2: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 3: Commit**

```bash
git add packages/web/app/components/orgs/DeleteApiKeyDialog.tsx
git commit -m "feat: add DeleteApiKeyDialog component"
```

---

### Task 6: API Keys Management UI — ApiKeysSection

**Files:**
- Create: `packages/web/app/components/orgs/ApiKeysSection.tsx`

**Step 1: Write the component**

This is the section for the org settings page. Lists existing keys (name + masked value + delete button), plus an "Add key" button. State management: `useState` for keys list, `useRouter().refresh()` after mutations OR re-fetch via `getApiKeysByOrg`.

Key masking: show last 4 chars like `••••••••ab3f`.

**Important:** Keep functions under 40 lines. Extract `ApiKeyRow` list item, masking helper, etc.

```typescript
'use client';

import type { ApiKeyRow } from '@/app/lib/api-keys';
import { getApiKeysByOrg } from '@/app/lib/api-keys';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { CreateApiKeyDialog } from './CreateApiKeyDialog';
import { DeleteApiKeyDialog } from './DeleteApiKeyDialog';

const MASK_VISIBLE_CHARS = 4;
const MASK_PREFIX = '••••••••';

function maskKeyValue(keyValue: string): string {
  return MASK_PREFIX + keyValue.slice(-MASK_VISIBLE_CHARS);
}

interface ApiKeyItemProps {
  apiKey: ApiKeyRow;
  onDeleteClick: (key: ApiKeyRow) => void;
}

function ApiKeyItem({ apiKey, onDeleteClick }: ApiKeyItemProps) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{apiKey.name}</span>
        <span className="text-muted-foreground text-xs font-mono">
          {maskKeyValue(apiKey.key_value)}
        </span>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={() => onDeleteClick(apiKey)}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

interface ApiKeysSectionProps {
  orgId: string;
  initialKeys: ApiKeyRow[];
}

export function ApiKeysSection({ orgId, initialKeys }: ApiKeysSectionProps) {
  const t = useTranslations('apiKeys');
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyRow | null>(null);

  const refreshKeys = useCallback(async () => {
    const supabase = createClient();
    const { result } = await getApiKeysByOrg(supabase, orgId);
    setKeys(result);
  }, [orgId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">{t('title')}</Label>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" className="size-3.5" />
          {t('add')}
        </Button>
      </div>
      <ApiKeysList keys={keys} onDeleteClick={setDeleteTarget} />
      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        onCreated={refreshKeys}
      />
      {deleteTarget !== null && (
        <DeleteApiKeyDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          keyId={deleteTarget.id}
          keyName={deleteTarget.name}
          onDeleted={refreshKeys}
        />
      )}
    </div>
  );
}

function ApiKeysList({
  keys,
  onDeleteClick,
}: {
  keys: ApiKeyRow[];
  onDeleteClick: (key: ApiKeyRow) => void;
}) {
  if (keys.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {keys.map((key) => (
        <ApiKeyItem key={key.id} apiKey={key} onDeleteClick={onDeleteClick} />
      ))}
    </div>
  );
}
```

**Step 2: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 3: Commit**

```bash
git add packages/web/app/components/orgs/ApiKeysSection.tsx
git commit -m "feat: add ApiKeysSection component for org settings"
```

---

### Task 7: Add ApiKeysSection to Org Settings Page

**Files:**
- Modify: `packages/web/app/orgs/[slug]/settings/page.tsx`

**Step 1: Update the settings page**

Import `getApiKeysByOrg` from `@/app/lib/api-keys` and `ApiKeysSection` from `@/app/components/orgs/ApiKeysSection`.

Fetch keys in the server component:

```typescript
const { result: apiKeys } = await getApiKeysByOrg(supabase, org.id);
```

Add `<ApiKeysSection orgId={org.id} initialKeys={apiKeys} />` between `<OrgSettingsForm>` and `<DangerZone>`.

The return JSX becomes:

```tsx
<div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
  <OrgSettingsHeader slug={slug} />
  <OrgSettingsForm org={org} />
  <ApiKeysSection orgId={org.id} initialKeys={apiKeys} />
  <DangerZone org={org} />
</div>
```

**Step 2: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 3: Commit**

```bash
git add packages/web/app/orgs/[slug]/settings/page.tsx
git commit -m "feat: add api keys section to org settings page"
```

---

### Task 8: Update AgentRow and Publish to Include Key IDs

**Files:**
- Modify: `packages/web/app/lib/agents.ts`

**Step 1: Add key ID fields to AgentRow**

Add to the `AgentRow` interface:

```typescript
staging_api_key_id: string | null;
production_api_key_id: string | null;
```

**Step 2: Add saveStagingKeyId function**

```typescript
export async function saveStagingKeyId(
  supabase: SupabaseClient,
  agentId: string,
  keyId: string | null
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { staging_api_key_id: keyId };
  const { error } = await supabase.from('agents').update(payload).eq('id', agentId);

  if (error !== null) return { error: error.message };
  return { error: null };
}
```

**Step 3: Update promoteToProduction to copy the key**

In the `promoteToProduction` function, add `staging_api_key_id` to the SELECT in `fetchStagingData`, and copy it to `production_api_key_id` in the update.

Change `fetchStagingData` to select `graph_data_staging, version, staging_api_key_id`:

```typescript
interface StagingRow {
  graph_data_staging: Record<string, unknown>;
  version: number;
  staging_api_key_id: string | null;
}
```

Update `fetchStagingData` select:

```typescript
.select('graph_data_staging, version, staging_api_key_id')
```

Update `promoteToProduction` update payload:

```typescript
.update({
  graph_data_production: row.graph_data_staging,
  version: newVersion,
  production_api_key_id: row.staging_api_key_id,
})
```

**Step 4: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 5: Commit**

```bash
git add packages/web/app/lib/agents.ts
git commit -m "feat: add staging/production key IDs to agents, copy on publish"
```

---

### Task 9: Update Editor Page to Fetch API Keys

**Files:**
- Modify: `packages/web/app/editor/[slug]/page.tsx`
- Modify: `packages/web/app/editor/[slug]/EditorClient.tsx`

**Step 1: Update EditorPage to fetch org's API keys**

The agent has `org_id`. Use it to fetch the org's keys.

Import `getApiKeysByOrg` from `@/app/lib/api-keys` and `type ApiKeyRow` from the same module.

After fetching the agent, fetch the keys:

```typescript
const { result: orgApiKeys } = await getApiKeysByOrg(supabase, agent.org_id);
```

Pass new props to EditorClient:

```tsx
<EditorClient
  agentId={agent.id}
  agentName={agent.name}
  initialGraphData={agent.graph_data_staging}
  initialProductionData={agent.graph_data_production}
  initialVersion={agent.version}
  orgApiKeys={orgApiKeys}
  stagingApiKeyId={agent.staging_api_key_id}
  productionApiKeyId={agent.production_api_key_id}
/>
```

**Step 2: Update EditorClient to pass through new props**

Add to `EditorClientProps`:

```typescript
import type { ApiKeyRow } from '@/app/lib/api-keys';

interface EditorClientProps {
  agentId: string;
  agentName: string;
  initialGraphData: Graph;
  initialProductionData: Graph;
  initialVersion: number;
  orgApiKeys: ApiKeyRow[];
  stagingApiKeyId: string | null;
  productionApiKeyId: string | null;
}
```

Pass them through to `<GraphBuilder>`.

**Step 3: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 4: Commit**

```bash
git add packages/web/app/editor/[slug]/page.tsx packages/web/app/editor/[slug]/EditorClient.tsx
git commit -m "feat: pass org api keys and key IDs to editor"
```

---

### Task 10: Update GraphBuilder to Accept and Pass API Keys

**Files:**
- Modify: `packages/web/app/components/GraphBuilder.tsx`

**Step 1: Update GraphBuilderProps**

Add to `GraphBuilderProps`:

```typescript
import type { ApiKeyRow } from '@/app/lib/api-keys';

export interface GraphBuilderProps {
  agentId?: string;
  agentName?: string;
  initialGraphData?: Graph;
  initialProductionData?: Graph;
  initialVersion?: number;
  orgApiKeys?: ApiKeyRow[];
  stagingApiKeyId?: string | null;
  productionApiKeyId?: string | null;
}
```

**Step 2: Wire through useGraphBuilderHooks**

In `useGraphBuilderHooks`, add state for the selected key IDs:

```typescript
const [stagingKeyId, setStagingKeyId] = useState<string | null>(props.stagingApiKeyId ?? null);
const [productionKeyId, setProductionKeyId] = useState<string | null>(props.productionApiKeyId ?? null);
```

When passing `apiKey` to `useSimulation`, resolve the actual key value from the keys list:

```typescript
const resolvedApiKey = useMemo(() => {
  if (stagingKeyId === null || props.orgApiKeys === undefined) return '';
  const found = props.orgApiKeys.find((k) => k.id === stagingKeyId);
  return found?.key_value ?? '';
}, [stagingKeyId, props.orgApiKeys]);
```

Replace `presetsHook.apiKey` with `resolvedApiKey` in the `useSimulation` call.

**Step 3: Pass key data through SidePanels**

Add to `SidePanelsProps` and pass down:
- `orgApiKeys: ApiKeyRow[]`
- `stagingKeyId: string | null`
- `productionKeyId: string | null`
- `onStagingKeyChange: (keyId: string | null) => void`

The `onStagingKeyChange` handler should:
1. Call `setStagingKeyId(keyId)`
2. Persist to database via `saveStagingKeyId(supabase, agentId, keyId)`

**Step 4: Update canPublish and Toolbar**

`canPublish` should also require `stagingKeyId !== null`.

Pass `stagingKeyId` to `Toolbar` so Play can be disabled.

Pass `stagingKeyId` to `PublishButton` so Publish can be disabled.

**Step 5: Update onPublished callback**

When `onPublished` fires, also set `setProductionKeyId(stagingKeyId)` since publish copies staging key to production.

**Step 6: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 7: Commit**

```bash
git add packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: wire api key selection through GraphBuilder"
```

---

### Task 11: Update SidePanels and PresetsPanel — Replace Input with Select

**Files:**
- Modify: `packages/web/app/components/SidePanels.tsx`
- Modify: `packages/web/app/components/panels/PresetsPanel.tsx`

**Step 1: Update SidePanelsProps**

Add to the `SidePanelsProps` interface:

```typescript
import type { ApiKeyRow } from '@/app/lib/api-keys';

// Add these fields:
orgApiKeys: ApiKeyRow[];
stagingKeyId: string | null;
productionKeyId: string | null;
onStagingKeyChange: (keyId: string | null) => void;
```

**Step 2: Update PresetsAside to pass key props**

In `PresetsAside`, pass the new props to `PresetsPanel`:

```tsx
<PresetsPanel
  // ... existing props ...
  orgApiKeys={props.orgApiKeys}
  stagingKeyId={props.stagingKeyId}
  productionKeyId={props.productionKeyId}
  onStagingKeyChange={props.onStagingKeyChange}
/>
```

**Step 3: Update PresetsPanelProps**

Replace `apiKey: string` and `onApiKeyChange` with:

```typescript
orgApiKeys: ApiKeyRow[];
stagingKeyId: string | null;
productionKeyId: string | null;
onStagingKeyChange: (keyId: string | null) => void;
```

**Step 4: Replace the API key input section**

Remove the `showApiKey` state and the Input+eye toggle. Replace with two Select dropdowns.

Create a helper component `ApiKeySelectSection`:

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function ApiKeySelectSection({
  orgApiKeys,
  stagingKeyId,
  productionKeyId,
  onStagingKeyChange,
}: {
  orgApiKeys: ApiKeyRow[];
  stagingKeyId: string | null;
  productionKeyId: string | null;
  onStagingKeyChange: (keyId: string | null) => void;
}) {
  const t = useTranslations('apiKeys');

  if (orgApiKeys.length === 0) {
    return (
      <div className="mb-4 space-y-1">
        <Label>{t('stagingKey')}</Label>
        <p className="text-muted-foreground text-xs">{t('noKeys')}</p>
        <Separator className="mt-3" />
      </div>
    );
  }

  const productionKeyName = orgApiKeys.find((k) => k.id === productionKeyId)?.name;

  return (
    <div className="mb-4 space-y-3">
      <StagingKeySelect
        orgApiKeys={orgApiKeys}
        stagingKeyId={stagingKeyId}
        onStagingKeyChange={onStagingKeyChange}
      />
      <ProductionKeyDisplay keyName={productionKeyName} />
      <Separator className="mt-3" />
    </div>
  );
}
```

Staging key select (extracted for line count):

```typescript
function StagingKeySelect({
  orgApiKeys,
  stagingKeyId,
  onStagingKeyChange,
}: {
  orgApiKeys: ApiKeyRow[];
  stagingKeyId: string | null;
  onStagingKeyChange: (keyId: string | null) => void;
}) {
  const t = useTranslations('apiKeys');

  return (
    <div className="space-y-1">
      <Label>{t('stagingKey')}</Label>
      <Select
        value={stagingKeyId ?? ''}
        onValueChange={(val) => onStagingKeyChange(val === '' ? null : val)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('selectKey')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{t('none')}</SelectItem>
          {orgApiKeys.map((key) => (
            <SelectItem key={key.id} value={key.id}>{key.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

Production key display (read-only):

```typescript
function ProductionKeyDisplay({ keyName }: { keyName: string | undefined }) {
  const t = useTranslations('apiKeys');

  return (
    <div className="space-y-1">
      <Label>{t('productionKey')}</Label>
      <p className="text-muted-foreground text-xs">
        {keyName ?? t('none')}
      </p>
    </div>
  );
}
```

**Step 5: Remove apiKey/onApiKeyChange from PresetsHook interface in SidePanels**

In `SidePanels.tsx`, remove `apiKey` and `setApiKey` from the `PresetsHook` interface since they're no longer needed. Also remove the `apiKey={presetsHook.apiKey}` prop from `PresetsAside` and any NodePanel references.

**Note:** NodePanel currently receives `apiKey` — keep that working by passing the resolved key or removing it if not needed. Check `NodePanel` usage to see if `apiKey` is required.

**Step 6: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 7: Commit**

```bash
git add packages/web/app/components/SidePanels.tsx packages/web/app/components/panels/PresetsPanel.tsx
git commit -m "feat: replace api key input with org-level key Select dropdowns"
```

---

### Task 12: Update usePresets — Remove localStorage API Key Logic

**Files:**
- Modify: `packages/web/app/hooks/usePresets.ts`

**Step 1: Remove useApiKey and related code**

Remove:
- `API_KEY_STORAGE_KEY` constant
- `loadApiKey()` function
- `useApiKey()` function
- `apiKey` and `setApiKey` from `PresetsState` interface
- The `useApiKey()` call in `usePresets()`
- `apiKey` and `setApiKey` from the return object

The `PresetsState` interface should no longer have `apiKey` or `setApiKey`.

**Step 2: Verify typecheck**

Run: `npm run typecheck -w packages/web`

This will likely surface errors in files that still reference `presetsHook.apiKey`. The previous tasks should have already updated those references to use the new resolved API key flow.

**Step 3: Commit**

```bash
git add packages/web/app/hooks/usePresets.ts
git commit -m "feat: remove localStorage api key from usePresets"
```

---

### Task 13: Update Toolbar — Disable Play Button Without Key + Tooltip

**Files:**
- Modify: `packages/web/app/components/panels/Toolbar.tsx`

**Step 1: Add stagingKeyId prop to ToolbarProps**

```typescript
interface ToolbarProps {
  // ... existing props ...
  stagingKeyId?: string | null;
}
```

**Step 2: Wrap Play button with Tooltip when disabled**

Import `Tooltip, TooltipTrigger, TooltipContent` from `@/components/ui/tooltip`.

Create a helper component for the Play button:

```typescript
function PlayButton({
  simulationActive,
  onPlay,
  disabled,
}: {
  simulationActive: boolean;
  onPlay?: () => void;
  disabled: boolean;
}) {
  const t = useTranslations('apiKeys');

  const button = (
    <Button
      className="h-10 w-10"
      variant={simulationActive ? 'default' : 'ghost'}
      size="sm"
      onClick={onPlay}
      disabled={disabled}
    >
      <Play className="size-4" />
    </Button>
  );

  if (!disabled) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{button}</TooltipTrigger>
      <TooltipContent>{t('requiresKey')}</TooltipContent>
    </Tooltip>
  );
}
```

Replace the inline Play button in `Toolbar` with:

```tsx
<PlayButton
  simulationActive={simulationActive ?? false}
  onPlay={onPlay}
  disabled={stagingKeyId === null || stagingKeyId === undefined}
/>
```

**Step 3: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 4: Commit**

```bash
git add packages/web/app/components/panels/Toolbar.tsx
git commit -m "feat: disable Play button without api key, add tooltip"
```

---

### Task 14: Update PublishButton — Disable Without Key + Tooltip

**Files:**
- Modify: `packages/web/app/components/panels/PublishButton.tsx`

**Step 1: Add hasApiKey prop**

```typescript
interface PublishButtonProps {
  agentId: string;
  canPublish: boolean;
  hasApiKey: boolean;
  onPublished: (newVersion: number) => void;
}
```

**Step 2: Wrap with Tooltip when disabled due to missing key**

The button should be disabled when `!canPublish || !hasApiKey`. When disabled specifically because of missing key (`!hasApiKey`), show the tooltip.

```typescript
function PublishButtonInner({ canPublish, hasApiKey, ...props }: PublishButtonProps) {
  const t = useTranslations('editor');
  const tKeys = useTranslations('apiKeys');
  // ... existing publishing state ...

  const disabled = !canPublish || !hasApiKey;

  const button = (
    <Button
      variant={canPublish && hasApiKey ? 'default' : 'ghost'}
      size="sm"
      onClick={handlePublish}
      disabled={disabled}
      className="h-10 gap-1.5 px-3"
    >
      <Upload className="size-4" />
      {t('publish')}
    </Button>
  );

  if (hasApiKey) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{button}</TooltipTrigger>
      <TooltipContent>{tKeys('requiresKey')}</TooltipContent>
    </Tooltip>
  );
}
```

**Step 3: Update GraphBuilder to pass hasApiKey**

In `GraphBuilderInner`, update the `publishSlot` to include `hasApiKey={stagingKeyId !== null}`.

**Step 4: Verify typecheck**

Run: `npm run typecheck -w packages/web`

**Step 5: Commit**

```bash
git add packages/web/app/components/panels/PublishButton.tsx packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: disable Publish button without api key, add tooltip"
```

---

### Task 15: Full Verification

**Step 1: Run full check suite**

Run: `npm run check`

This runs Prettier + ESLint + TypeScript across all packages. Fix any errors.

**Step 2: Run dev server and manually verify**

Run: `npm run dev -w packages/web`

Verify:
1. Org settings page shows API Keys section between avatar and danger zone
2. Can add a key with name + value
3. Key appears in list with masked value
4. Can delete a key with confirmation
5. Editor page shows staging/production key selects in PresetsPanel
6. Selecting a staging key persists (refresh and check)
7. Play button disabled when no key selected, tooltip shows on hover
8. Publish button disabled when no key selected, tooltip shows on hover
9. Simulation works when key is selected
10. Publishing copies staging key to production (production display updates)

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: address verification issues from full check"
```

---

## Summary of All Files

**New files (5):**
- `supabase/migrations/20260309200000_add_org_api_keys.sql`
- `packages/web/app/lib/api-keys.ts`
- `packages/web/app/components/orgs/CreateApiKeyDialog.tsx`
- `packages/web/app/components/orgs/DeleteApiKeyDialog.tsx`
- `packages/web/app/components/orgs/ApiKeysSection.tsx`

**Modified files (10):**
- `packages/web/messages/en.json` — Add apiKeys translations
- `packages/web/app/lib/agents.ts` — Add key ID columns, update publish
- `packages/web/app/editor/[slug]/page.tsx` — Fetch org's api keys
- `packages/web/app/editor/[slug]/EditorClient.tsx` — Pass through key props
- `packages/web/app/components/GraphBuilder.tsx` — Accept keys, resolve value, pass through
- `packages/web/app/components/SidePanels.tsx` — Pass key props to PresetsPanel
- `packages/web/app/components/panels/PresetsPanel.tsx` — Replace input with Select dropdowns
- `packages/web/app/hooks/usePresets.ts` — Remove localStorage API key
- `packages/web/app/components/panels/Toolbar.tsx` — Disable Play, add tooltip
- `packages/web/app/components/panels/PublishButton.tsx` — Disable Publish, add tooltip
- `packages/web/app/orgs/[slug]/settings/page.tsx` — Add ApiKeysSection
