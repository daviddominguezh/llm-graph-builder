# Knowledge Base — Multi-Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the implicit "one RAG + one KV per tenant" model with org-level named stores (N RAG stores, M KV stores per org). Users create stores via a new sidebar + dialog; each tenant fills them with its own content. KV entries are persisted; RAG file content remains client-side this iteration.

**Architecture:** New Supabase tables `rag_stores`, `kv_stores`, `kv_entries` (with RLS via `is_org_member`). Backend Express routers mirror the existing tenant pattern. Frontend gets a new App Router subtree: `knowledge-base/layout.tsx` owns the sidebar, with `rag/[storeSlug]/page.tsx` and `kv/[storeSlug]/page.tsx` rendering per-tenant tabs.

**Tech Stack:** Express/Supabase (backend), Next.js 16 App Router + React + shadcn/ui (frontend), Jest (backend tests), next-intl (i18n). ESM throughout. Strict TS, no `any`, no eslint disables, ≤300 lines/file, ≤40 lines/function.

**Reference spec:** `docs/superpowers/specs/2026-05-11-knowledge-base-multi-stores-design.md`

---

## File map

**Created:**
- `supabase/migrations/20260511120000_knowledge_base_stores.sql`
- `packages/backend/src/db/queries/ragStoresQueries.ts`
- `packages/backend/src/db/queries/kvStoresQueries.ts`
- `packages/backend/src/db/queries/kvEntriesQueries.ts`
- `packages/backend/src/db/queries/ragStoresQueries.test.ts`
- `packages/backend/src/db/queries/kvStoresQueries.test.ts`
- `packages/backend/src/routes/ragStores/ragStoresRouter.ts`
- `packages/backend/src/routes/ragStores/ragStoreHelpers.ts`
- `packages/backend/src/routes/ragStores/getRagStores.ts`
- `packages/backend/src/routes/ragStores/createRagStore.ts`
- `packages/backend/src/routes/ragStores/deleteRagStore.ts`
- `packages/backend/src/routes/kvStores/kvStoresRouter.ts`
- `packages/backend/src/routes/kvStores/kvStoreHelpers.ts`
- `packages/backend/src/routes/kvStores/getKvStores.ts`
- `packages/backend/src/routes/kvStores/createKvStore.ts`
- `packages/backend/src/routes/kvStores/deleteKvStore.ts`
- `packages/backend/src/routes/kvStores/getKvEntries.ts`
- `packages/backend/src/routes/kvStores/saveKvEntries.ts`
- `packages/web/app/lib/ragStores.ts`
- `packages/web/app/lib/kvStores.ts`
- `packages/web/app/lib/slugPreview.ts`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/layout.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/StoresSidebar.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/StoresSidebarGroup.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/CreateStoreDialog.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/StoreHeader.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/TenantTabs.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/KvStoreTableConnected.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/page.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagStorePageClient.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/kv/[storeSlug]/page.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/kv/[storeSlug]/KvStorePageClient.tsx`

**Modified:**
- `packages/backend/src/server.ts` (mount two new routers + add to SYSTEM_PUBLIC_UNAUTHED if needed — no, both go behind `withGate`)
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/page.tsx` (becomes empty state)
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/KvStoreTable.tsx` (controlled API)
- `packages/web/messages/en.json` (new keys + reword existing)

**Deleted:**
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/KnowledgeBaseClient.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/KnowledgeBaseUploader.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/TenantList.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/NoTenantsState.tsx`

---

# Phase 1 — Backend foundation

## Task 1: Supabase migration for stores + entries + RLS

**Files:**
- Create: `supabase/migrations/20260511120000_knowledge_base_stores.sql`

- [ ] **Step 1: Create the migration file** with this exact content:

```sql
-- Knowledge base: org-level RAG and KV store definitions plus per-(store, tenant) KV entries.
-- Slugs are alphanumeric only (matches tenants.slug format) and unique per (org_id).

CREATE TABLE public.rag_stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  UNIQUE (org_id, slug),
  CONSTRAINT rag_stores_slug_format CHECK (slug ~ '^[a-z0-9]{1,40}$')
);
CREATE INDEX idx_rag_stores_org ON public.rag_stores(org_id);

CREATE TABLE public.kv_stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  UNIQUE (org_id, slug),
  CONSTRAINT kv_stores_slug_format CHECK (slug ~ '^[a-z0-9]{1,40}$')
);
CREATE INDEX idx_kv_stores_org ON public.kv_stores(org_id);

CREATE TABLE public.kv_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kv_store_id  uuid NOT NULL REFERENCES public.kv_stores(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key          text NOT NULL,
  value        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kv_store_id, tenant_id, key)
);
CREATE INDEX idx_kv_entries_store_tenant ON public.kv_entries(kv_store_id, tenant_id);

-- SECURITY DEFINER helper: resolve a kv_store's org_id without hitting RLS (used in
-- kv_entries policies — direct subqueries against kv_stores under the user's RLS
-- context would be a recursion hazard).
CREATE OR REPLACE FUNCTION public.kv_store_org_id(p_kv_store_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id FROM public.kv_stores WHERE id = p_kv_store_id;
$$;

-- RLS: rag_stores
ALTER TABLE public.rag_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read rag_stores"
  ON public.rag_stores FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Org members can insert rag_stores"
  ON public.rag_stores FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Org members can update rag_stores"
  ON public.rag_stores FOR UPDATE USING (public.is_org_member(org_id));
CREATE POLICY "Org members can delete rag_stores"
  ON public.rag_stores FOR DELETE USING (public.is_org_member(org_id));

-- RLS: kv_stores
ALTER TABLE public.kv_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read kv_stores"
  ON public.kv_stores FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Org members can insert kv_stores"
  ON public.kv_stores FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Org members can update kv_stores"
  ON public.kv_stores FOR UPDATE USING (public.is_org_member(org_id));
CREATE POLICY "Org members can delete kv_stores"
  ON public.kv_stores FOR DELETE USING (public.is_org_member(org_id));

-- RLS: kv_entries (org membership resolved via the helper)
ALTER TABLE public.kv_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read kv_entries"
  ON public.kv_entries FOR SELECT
  USING (public.is_org_member(public.kv_store_org_id(kv_store_id)));
CREATE POLICY "Org members can insert kv_entries"
  ON public.kv_entries FOR INSERT
  WITH CHECK (public.is_org_member(public.kv_store_org_id(kv_store_id)));
CREATE POLICY "Org members can update kv_entries"
  ON public.kv_entries FOR UPDATE
  USING (public.is_org_member(public.kv_store_org_id(kv_store_id)));
CREATE POLICY "Org members can delete kv_entries"
  ON public.kv_entries FOR DELETE
  USING (public.is_org_member(public.kv_store_org_id(kv_store_id)));
```

- [ ] **Step 2: Commit** (do NOT apply the migration — user applies it manually per project policy)

```bash
git add supabase/migrations/20260511120000_knowledge_base_stores.sql
git commit -m "feat(db): add rag_stores, kv_stores, kv_entries tables"
```

---

## Task 2: Backend types and queries for rag_stores

**Files:**
- Create: `packages/backend/src/db/queries/ragStoresQueries.ts`
- Create: `packages/backend/src/db/queries/ragStoresQueries.test.ts`

- [ ] **Step 1: Write the failing test** in `packages/backend/src/db/queries/ragStoresQueries.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import { isRagStoreRow } from './ragStoresQueries.js';

describe('isRagStoreRow', () => {
  it('accepts rows with required fields', () => {
    const row = {
      id: 'r1', org_id: 'o1', name: 'Products', slug: 'products',
      created_at: 't', updated_at: 't',
    };
    expect(isRagStoreRow(row)).toBe(true);
  });
  it('rejects rows missing org_id', () => {
    expect(isRagStoreRow({ id: 'r1', name: 'x', slug: 'x' })).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(isRagStoreRow(null)).toBe(false);
    expect(isRagStoreRow('x')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -w packages/backend -- --testPathPattern=ragStoresQueries
```
Expected: FAIL with "Cannot find module './ragStoresQueries.js'".

- [ ] **Step 3: Write the queries module**

Create `packages/backend/src/db/queries/ragStoresQueries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RagStoreRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export function isRagStoreRow(value: unknown): value is RagStoreRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'org_id' in value && 'name' in value && 'slug' in value;
}

const LIST_COLUMNS = 'id, org_id, name, slug, created_at, updated_at';

function mapRows(data: unknown[]): RagStoreRow[] {
  return data.reduce<RagStoreRow[]>((acc, row) => {
    if (isRagStoreRow(row)) acc.push(row);
    return acc;
  }, []);
}

export async function getRagStoresByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: RagStoreRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_stores')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function createRagStore(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  slug: string
): Promise<{ result: RagStoreRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_stores')
    .insert({ org_id: orgId, name, slug })
    .select(LIST_COLUMNS)
    .single();
  if (error !== null) return { result: null, error: error.message };
  const row: unknown = data;
  if (!isRagStoreRow(row)) return { result: null, error: 'Invalid rag_store data' };
  return { result: row, error: null };
}

export async function deleteRagStore(
  supabase: SupabaseClient,
  storeId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('rag_stores').delete().eq('id', storeId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

const SUFFIX_QUERY_LIMIT = 1024;
const MAX_SUFFIX = 1000;
const MAX_SLUG_LENGTH = 40;
const FIRST_SUFFIX = 1;
const DIGIT_REGEX = /\d/v;

async function collectTakenStoreSlugs(
  supabase: SupabaseClient,
  table: 'rag_stores' | 'kv_stores',
  orgId: string,
  baseSlug: string
): Promise<Set<string>> {
  const exactPromise = supabase.from(table).select('slug').eq('org_id', orgId).eq('slug', baseSlug);
  const suffixedPromise = supabase
    .from(table)
    .select('slug')
    .eq('org_id', orgId)
    .ilike('slug', `${baseSlug}_%`)
    .limit(SUFFIX_QUERY_LIMIT);
  const [exact, suffixed] = await Promise.all([exactPromise, suffixedPromise]);
  const allRows = [...(exact.data ?? []), ...(suffixed.data ?? [])];
  const valid = allRows.filter((r): r is { slug: string } => typeof r === 'object' && 'slug' in r);
  const { length: baseLen } = baseSlug;
  const bounded = valid.filter((r) => {
    const next: string | undefined = r.slug[baseLen];
    return next === undefined || DIGIT_REGEX.test(next);
  });
  return new Set(bounded.map((r) => r.slug));
}

export async function findUniqueRagStoreSlug(
  supabase: SupabaseClient,
  orgId: string,
  baseSlug: string
): Promise<string> {
  if (baseSlug === '') throw new Error('baseSlug cannot be empty');
  const taken = await collectTakenStoreSlugs(supabase, 'rag_stores', orgId, baseSlug);
  if (!taken.has(baseSlug)) return baseSlug;
  for (let i = FIRST_SUFFIX; i < MAX_SUFFIX; i += 1) {
    const candidate = `${baseSlug}${String(i)}`;
    if (candidate.length > MAX_SLUG_LENGTH) throw new Error('baseSlug too long for suffix');
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Unable to find unique rag_store slug');
}

// Exported so kvStoresQueries can reuse the same helper without duplication.
export { collectTakenStoreSlugs };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -w packages/backend -- --testPathPattern=ragStoresQueries
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/ragStoresQueries.ts packages/backend/src/db/queries/ragStoresQueries.test.ts
git commit -m "feat(backend): add ragStoresQueries module"
```

---

## Task 3: Backend types and queries for kv_stores

**Files:**
- Create: `packages/backend/src/db/queries/kvStoresQueries.ts`
- Create: `packages/backend/src/db/queries/kvStoresQueries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';

import { isKvStoreRow } from './kvStoresQueries.js';

describe('isKvStoreRow', () => {
  it('accepts rows with required fields', () => {
    const row = { id: 'k1', org_id: 'o1', name: 'FAQs', slug: 'faqs',
      created_at: 't', updated_at: 't' };
    expect(isKvStoreRow(row)).toBe(true);
  });
  it('rejects rows missing slug', () => {
    expect(isKvStoreRow({ id: 'k1', org_id: 'o1', name: 'x' })).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(isKvStoreRow(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -w packages/backend -- --testPathPattern=kvStoresQueries
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the queries module**

Create `packages/backend/src/db/queries/kvStoresQueries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { collectTakenStoreSlugs } from './ragStoresQueries.js';

export interface KvStoreRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export function isKvStoreRow(value: unknown): value is KvStoreRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'org_id' in value && 'name' in value && 'slug' in value;
}

const LIST_COLUMNS = 'id, org_id, name, slug, created_at, updated_at';

function mapRows(data: unknown[]): KvStoreRow[] {
  return data.reduce<KvStoreRow[]>((acc, row) => {
    if (isKvStoreRow(row)) acc.push(row);
    return acc;
  }, []);
}

export async function getKvStoresByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: KvStoreRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_stores')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function getKvStoreBySlug(
  supabase: SupabaseClient,
  orgId: string,
  slug: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_stores')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isKvStoreRow(data)) return { result: null, error: 'Invalid kv_store data' };
  return { result: data, error: null };
}

export async function createKvStore(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  slug: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_stores')
    .insert({ org_id: orgId, name, slug })
    .select(LIST_COLUMNS)
    .single();
  if (error !== null) return { result: null, error: error.message };
  const row: unknown = data;
  if (!isKvStoreRow(row)) return { result: null, error: 'Invalid kv_store data' };
  return { result: row, error: null };
}

export async function deleteKvStore(
  supabase: SupabaseClient,
  storeId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('kv_stores').delete().eq('id', storeId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

const FIRST_SUFFIX = 1;
const MAX_SUFFIX = 1000;
const MAX_SLUG_LENGTH = 40;

export async function findUniqueKvStoreSlug(
  supabase: SupabaseClient,
  orgId: string,
  baseSlug: string
): Promise<string> {
  if (baseSlug === '') throw new Error('baseSlug cannot be empty');
  const taken = await collectTakenStoreSlugs(supabase, 'kv_stores', orgId, baseSlug);
  if (!taken.has(baseSlug)) return baseSlug;
  for (let i = FIRST_SUFFIX; i < MAX_SUFFIX; i += 1) {
    const candidate = `${baseSlug}${String(i)}`;
    if (candidate.length > MAX_SLUG_LENGTH) throw new Error('baseSlug too long for suffix');
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Unable to find unique kv_store slug');
}
```

Note: We don't need an analogous `getRagStoreBySlug` because the RAG page bundle uses the store from the list. (Add it later if needed.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -w packages/backend -- --testPathPattern=kvStoresQueries
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/kvStoresQueries.ts packages/backend/src/db/queries/kvStoresQueries.test.ts
git commit -m "feat(backend): add kvStoresQueries module"
```

---

## Task 4: Add getRagStoreBySlug to ragStoresQueries

The RAG store detail page also needs slug→id lookup. Add to the same file.

**Files:**
- Modify: `packages/backend/src/db/queries/ragStoresQueries.ts`

- [ ] **Step 1: Append to `ragStoresQueries.ts`** (above the `export { collectTakenStoreSlugs };` line):

```ts
export async function getRagStoreBySlug(
  supabase: SupabaseClient,
  orgId: string,
  slug: string
): Promise<{ result: RagStoreRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_stores')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isRagStoreRow(data)) return { result: null, error: 'Invalid rag_store data' };
  return { result: data, error: null };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/db/queries/ragStoresQueries.ts
git commit -m "feat(backend): add getRagStoreBySlug"
```

---

## Task 5: Queries for kv_entries (bulk replace)

**Files:**
- Create: `packages/backend/src/db/queries/kvEntriesQueries.ts`

- [ ] **Step 1: Write the queries module**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface KvEntryRow {
  key: string;
  value: string;
}

export interface KvEntryDbRow extends KvEntryRow {
  id: string;
  kv_store_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

function isKvEntryDbRow(value: unknown): value is KvEntryDbRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'key' in value && 'value' in value && 'kv_store_id' in value && 'tenant_id' in value;
}

export async function getKvEntries(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string
): Promise<{ result: KvEntryRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('kv_entries')
    .select('key, value, kv_store_id, tenant_id, id, created_at, updated_at')
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const mapped: KvEntryRow[] = rows.reduce<KvEntryRow[]>((acc, row) => {
    if (isKvEntryDbRow(row)) acc.push({ key: row.key, value: row.value });
    return acc;
  }, []);
  return { result: mapped, error: null };
}

function dedupe(items: KvEntryRow[]): KvEntryRow[] {
  const seen = new Set<string>();
  const out: KvEntryRow[] = [];
  for (const item of items) {
    if (item.key === '') continue;
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push({ key: item.key, value: item.value });
  }
  return out;
}

export async function replaceKvEntries(
  supabase: SupabaseClient,
  kvStoreId: string,
  tenantId: string,
  items: KvEntryRow[]
): Promise<{ error: string | null }> {
  const cleaned = dedupe(items);
  const { error: deleteError } = await supabase
    .from('kv_entries')
    .delete()
    .eq('kv_store_id', kvStoreId)
    .eq('tenant_id', tenantId);
  if (deleteError !== null) return { error: deleteError.message };
  if (cleaned.length === 0) return { error: null };
  const rows = cleaned.map((item) => ({
    kv_store_id: kvStoreId,
    tenant_id: tenantId,
    key: item.key,
    value: item.value,
  }));
  const { error: insertError } = await supabase.from('kv_entries').insert(rows);
  if (insertError !== null) return { error: insertError.message };
  return { error: null };
}
```

Note: bulk replace is delete-then-insert per partition. The (kv_store_id, tenant_id, key) UNIQUE constraint prevents duplicate keys at the DB layer; `dedupe` enforces it client-side first so the insert can be a single batched call. This is racy across concurrent writes (last write wins per partition) — acceptable for v1 per spec.

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/db/queries/kvEntriesQueries.ts
git commit -m "feat(backend): add kvEntriesQueries module"
```

---

## Task 6: Shared route helpers for stores

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragStoreHelpers.ts`
- Create: `packages/backend/src/routes/kvStores/kvStoreHelpers.ts`

- [ ] **Step 1: Create `ragStoreHelpers.ts`**

```ts
import type { Request } from 'express';

interface OrgIdParams { orgId?: string }
interface StoreIdParams { storeId?: string }

export function getOrgIdParam(req: Request): string | undefined {
  const { orgId }: OrgIdParams = req.params;
  if (typeof orgId === 'string' && orgId !== '') return orgId;
  return undefined;
}

export function getStoreIdParam(req: Request): string | undefined {
  const { storeId }: StoreIdParams = req.params;
  if (typeof storeId === 'string' && storeId !== '') return storeId;
  return undefined;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function parseStringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}
```

- [ ] **Step 2: Create `kvStoreHelpers.ts`** — same content, plus tenant/entries parsing:

```ts
import type { Request } from 'express';

interface OrgIdParams { orgId?: string }
interface StoreIdParams { storeId?: string }
interface TenantIdParams { tenantId?: string }

export function getOrgIdParam(req: Request): string | undefined {
  const { orgId }: OrgIdParams = req.params;
  if (typeof orgId === 'string' && orgId !== '') return orgId;
  return undefined;
}

export function getStoreIdParam(req: Request): string | undefined {
  const { storeId }: StoreIdParams = req.params;
  if (typeof storeId === 'string' && storeId !== '') return storeId;
  return undefined;
}

export function getTenantIdParam(req: Request): string | undefined {
  const { tenantId }: TenantIdParams = req.params;
  if (typeof tenantId === 'string' && tenantId !== '') return tenantId;
  return undefined;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function parseStringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

export interface KvEntryInput { key: string; value: string }

export function parseEntriesBody(body: unknown): KvEntryInput[] | null {
  if (!Array.isArray(body)) return null;
  const out: KvEntryInput[] = [];
  for (const item of body) {
    if (typeof item !== 'object' || item === null) return null;
    const { key, value } = item as Record<string, unknown>;
    if (typeof key !== 'string' || typeof value !== 'string') return null;
    out.push({ key, value });
  }
  return out;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/ragStores/ragStoreHelpers.ts packages/backend/src/routes/kvStores/kvStoreHelpers.ts
git commit -m "feat(backend): add helper modules for store routes"
```

---

## Task 7: RAG stores route handlers

**Files:**
- Create: `packages/backend/src/routes/ragStores/getRagStores.ts`
- Create: `packages/backend/src/routes/ragStores/createRagStore.ts`
- Create: `packages/backend/src/routes/ragStores/deleteRagStore.ts`

- [ ] **Step 1: `getRagStores.ts`**

```ts
import type { Request } from 'express';

import { getRagStoresByOrg } from '../../db/queries/ragStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgIdParam } from './ragStoreHelpers.js';

export async function handleGetRagStores(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgIdParam(req);
  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID is required' });
    return;
  }
  try {
    const { result, error } = await getRagStoresByOrg(supabase, orgId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2: `createRagStore.ts`**

```ts
import type { Request } from 'express';

import { generateTenantSlug } from '../../db/queries/slugQueries.js';
import { createRagStore, findUniqueRagStoreSlug } from '../../db/queries/ragStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './ragStoreHelpers.js';

const SLUG_RADIX = 36;
const SLUG_START = 2;
const SLUG_END = 10;

function fallbackSlug(): string {
  return `store${Math.random().toString(SLUG_RADIX).slice(SLUG_START, SLUG_END)}`;
}

export async function handleCreateRagStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  if (orgId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }
  try {
    const generated = generateTenantSlug(name);
    const base = generated === '' ? fallbackSlug() : generated;
    const slug = await findUniqueRagStoreSlug(supabase, orgId, base);
    const { result, error } = await createRagStore(supabase, orgId, name, slug);
    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create rag_store' });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 3: `deleteRagStore.ts`**

```ts
import type { Request } from 'express';

import { deleteRagStore } from '../../db/queries/ragStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam } from './ragStoreHelpers.js';

export async function handleDeleteRagStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  if (storeId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Store ID is required' });
    return;
  }
  try {
    const { error } = await deleteRagStore(supabase, storeId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/ragStores/
git commit -m "feat(backend): add rag_store route handlers"
```

---

## Task 8: RAG stores router

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragStoresRouter.ts`

- [ ] **Step 1: Create the router**

```ts
import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateRagStore } from './createRagStore.js';
import { handleDeleteRagStore } from './deleteRagStore.js';
import { handleGetRagStores } from './getRagStores.js';

export const ragStoresRouter = express.Router();
ragStoresRouter.use(requireAuth);

ragStoresRouter.get('/:orgId', handleGetRagStores);
ragStoresRouter.post('/', handleCreateRagStore);
ragStoresRouter.delete('/:storeId', handleDeleteRagStore);
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/routes/ragStores/ragStoresRouter.ts
git commit -m "feat(backend): add rag_stores router"
```

---

## Task 9: KV stores route handlers

**Files:**
- Create: `packages/backend/src/routes/kvStores/getKvStores.ts`
- Create: `packages/backend/src/routes/kvStores/createKvStore.ts`
- Create: `packages/backend/src/routes/kvStores/deleteKvStore.ts`
- Create: `packages/backend/src/routes/kvStores/getKvEntries.ts`
- Create: `packages/backend/src/routes/kvStores/saveKvEntries.ts`

- [ ] **Step 1: `getKvStores.ts`**

```ts
import type { Request } from 'express';

import { getKvStoresByOrg } from '../../db/queries/kvStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getOrgIdParam } from './kvStoreHelpers.js';

export async function handleGetKvStores(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = getOrgIdParam(req);
  if (orgId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Org ID is required' });
    return;
  }
  try {
    const { result, error } = await getKvStoresByOrg(supabase, orgId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2: `createKvStore.ts`**

```ts
import type { Request } from 'express';

import { generateTenantSlug } from '../../db/queries/slugQueries.js';
import { createKvStore, findUniqueKvStoreSlug } from '../../db/queries/kvStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './kvStoreHelpers.js';

const SLUG_RADIX = 36;
const SLUG_START = 2;
const SLUG_END = 10;

function fallbackSlug(): string {
  return `store${Math.random().toString(SLUG_RADIX).slice(SLUG_START, SLUG_END)}`;
}

export async function handleCreateKvStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  if (orgId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }
  try {
    const generated = generateTenantSlug(name);
    const base = generated === '' ? fallbackSlug() : generated;
    const slug = await findUniqueKvStoreSlug(supabase, orgId, base);
    const { result, error } = await createKvStore(supabase, orgId, name, slug);
    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create kv_store' });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 3: `deleteKvStore.ts`**

```ts
import type { Request } from 'express';

import { deleteKvStore } from '../../db/queries/kvStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam } from './kvStoreHelpers.js';

export async function handleDeleteKvStore(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  if (storeId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Store ID is required' });
    return;
  }
  try {
    const { error } = await deleteKvStore(supabase, storeId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 4: `getKvEntries.ts`**

```ts
import type { Request } from 'express';

import { getKvEntries } from '../../db/queries/kvEntriesQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam, getTenantIdParam } from './kvStoreHelpers.js';

export async function handleGetKvEntries(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = getTenantIdParam(req);
  if (storeId === undefined || tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId and tenantId are required' });
    return;
  }
  try {
    const { result, error } = await getKvEntries(supabase, storeId, tenantId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 5: `saveKvEntries.ts`**

```ts
import type { Request } from 'express';

import { replaceKvEntries } from '../../db/queries/kvEntriesQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { getStoreIdParam, getTenantIdParam, parseEntriesBody } from './kvStoreHelpers.js';

export async function handleSaveKvEntries(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = getTenantIdParam(req);
  if (storeId === undefined || tenantId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId and tenantId are required' });
    return;
  }
  const entries = parseEntriesBody(req.body);
  if (entries === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Body must be an array of { key, value }' });
    return;
  }
  try {
    const { error } = await replaceKvEntries(supabase, storeId, tenantId, entries);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/kvStores/
git commit -m "feat(backend): add kv_store route handlers"
```

---

## Task 10: KV stores router

**Files:**
- Create: `packages/backend/src/routes/kvStores/kvStoresRouter.ts`

- [ ] **Step 1: Create**

```ts
import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateKvStore } from './createKvStore.js';
import { handleDeleteKvStore } from './deleteKvStore.js';
import { handleGetKvEntries } from './getKvEntries.js';
import { handleGetKvStores } from './getKvStores.js';
import { handleSaveKvEntries } from './saveKvEntries.js';

export const kvStoresRouter = express.Router();
kvStoresRouter.use(requireAuth);

kvStoresRouter.get('/:orgId', handleGetKvStores);
kvStoresRouter.post('/', handleCreateKvStore);
kvStoresRouter.delete('/:storeId', handleDeleteKvStore);
kvStoresRouter.get('/:storeId/entries/:tenantId', handleGetKvEntries);
kvStoresRouter.put('/:storeId/entries/:tenantId', handleSaveKvEntries);
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/routes/kvStores/kvStoresRouter.ts
git commit -m "feat(backend): add kv_stores router"
```

---

## Task 11: Mount the routers in `server.ts`

**Files:**
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Add imports** at the existing import block (alphabetical order under `routes/`):

```ts
import { kvStoresRouter } from './routes/kvStores/kvStoresRouter.js';
import { ragStoresRouter } from './routes/ragStores/ragStoresRouter.js';
```

- [ ] **Step 2: Register inside `mountGatedRoutes`** — add these two lines after the `tenantRouter` mount (around line 173):

```ts
  app.use('/rag-stores', withGate(ragStoresRouter));
  app.use('/kv-stores', withGate(kvStoresRouter));
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck -w packages/backend
npm run lint -w packages/backend
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/server.ts
git commit -m "feat(backend): mount rag_stores and kv_stores routers"
```

---

# Phase 2 — Frontend lib (proxy fetchers)

## Task 12: Client-side slug helper

**Files:**
- Create: `packages/web/app/lib/slugPreview.ts`

- [ ] **Step 1: Create the file** mirroring the backend `generateTenantSlug` algorithm:

```ts
const TENANT_SLUG_BASE_MAX_LENGTH = 37;
const A_CODE = 97;
const Z_CODE = 122;
const ZERO_CODE = 48;
const NINE_CODE = 57;

function isAlphanumeric(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= A_CODE && code <= Z_CODE) || (code >= ZERO_CODE && code <= NINE_CODE);
}

export function previewStoreSlug(name: string): string {
  const lower = name.toLowerCase();
  let out = '';
  for (const char of lower) {
    if (isAlphanumeric(char)) out += char;
    if (out.length >= TENANT_SLUG_BASE_MAX_LENGTH) break;
  }
  return out;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/lib/slugPreview.ts
git commit -m "feat(web): client-side store slug preview helper"
```

---

## Task 13: Web proxy fetchers for rag_stores

**Files:**
- Create: `packages/web/app/lib/ragStores.ts`

- [ ] **Step 1: Create**

```ts
import { fetchFromBackend } from './backendProxy';

export interface RagStoreRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export function isRagStoreRow(value: unknown): value is RagStoreRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'org_id' in value && 'name' in value && 'slug' in value;
}

function isRagStoreRowArray(val: unknown): val is RagStoreRow[] {
  return Array.isArray(val);
}

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export async function getRagStoresByOrg(
  orgId: string
): Promise<{ result: RagStoreRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/rag-stores/${encodeURIComponent(orgId)}`);
    if (!isRagStoreRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function createRagStore(
  orgId: string,
  name: string
): Promise<{ result: RagStoreRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/rag-stores', { orgId, name });
    if (!isRagStoreRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteRagStore(storeId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/rag-stores/${encodeURIComponent(storeId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/lib/ragStores.ts
git commit -m "feat(web): rag_stores proxy fetchers"
```

---

## Task 14: Web proxy fetchers for kv_stores (incl. entries)

**Files:**
- Create: `packages/web/app/lib/kvStores.ts`

- [ ] **Step 1: Create**

```ts
import { fetchFromBackend } from './backendProxy';

export interface KvStoreRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface KvEntry {
  key: string;
  value: string;
}

export function isKvStoreRow(value: unknown): value is KvStoreRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'org_id' in value && 'name' in value && 'slug' in value;
}

function isKvStoreRowArray(val: unknown): val is KvStoreRow[] {
  return Array.isArray(val);
}

function isKvEntry(value: unknown): value is KvEntry {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.key === 'string' && typeof r.value === 'string';
}

function isKvEntryArray(val: unknown): val is KvEntry[] {
  return Array.isArray(val) && val.every(isKvEntry);
}

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export async function getKvStoresByOrg(
  orgId: string
): Promise<{ result: KvStoreRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend('GET', `/kv-stores/${encodeURIComponent(orgId)}`);
    if (!isKvStoreRowArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function createKvStore(
  orgId: string,
  name: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  try {
    const data = await fetchFromBackend('POST', '/kv-stores', { orgId, name });
    if (!isKvStoreRow(data)) return { result: null, error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function deleteKvStore(storeId: string): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend('DELETE', `/kv-stores/${encodeURIComponent(storeId)}`);
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function getKvEntries(
  storeId: string,
  tenantId: string
): Promise<{ result: KvEntry[]; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/kv-stores/${encodeURIComponent(storeId)}/entries/${encodeURIComponent(tenantId)}`
    );
    if (!isKvEntryArray(data)) return { result: [], error: 'Invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export async function saveKvEntries(
  storeId: string,
  tenantId: string,
  entries: KvEntry[]
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend(
      'PUT',
      `/kv-stores/${encodeURIComponent(storeId)}/entries/${encodeURIComponent(tenantId)}`,
      entries
    );
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/lib/kvStores.ts
git commit -m "feat(web): kv_stores proxy fetchers"
```

---

# Phase 3 — Frontend i18n

## Task 15: Add new translation keys

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Open `en.json`** and locate the `"knowledgeBase": { ... }` block (around line 814).

- [ ] **Step 2: Replace the entire `knowledgeBase` block** with the expanded version. Locate the closing `}` of the old block by matching braces; replace from `"knowledgeBase": {` through that closing `}` with:

```json
"knowledgeBase": {
  "title": "Documents",
  "description": "Files your agents can search and reference.",
  "addFiles": "Add files",
  "extensions": "pdf · docx · pptx · xlsx · html · jpg · png · gif · tiff · bmp · webp",
  "emptyTitle": "No files yet",
  "emptyDescription": "Drag files anywhere or click Add files.",
  "dropToAdd": "Release to add",
  "totalSize": "{count, plural, =1 {# file · {size}} other {# files · {size}}}",
  "clearAll": "Clear",
  "filesSkipped": "{count, plural, =1 {1 file skipped (unsupported type)} other {# files skipped (unsupported types)}}",
  "remove": "Remove",
  "tabRag": "RAG DB",
  "tabKv": "KV Store",
  "storesSidebar": {
    "ragHeader": "RAG Stores",
    "kvHeader": "KV Stores",
    "newRag": "New RAG store",
    "newKv": "New KV store",
    "empty": "No stores yet"
  },
  "create": {
    "titleRag": "Create RAG store",
    "titleKv": "Create KV store",
    "nameLabel": "Name",
    "namePlaceholder": "e.g. Product FAQ",
    "slugPreview": "URL slug: {slug}",
    "slugFallback": "Type a name to see the slug",
    "submit": "Create",
    "cancel": "Cancel",
    "slugChangedNotice": "Saved as \"{final}\" — \"{requested}\" was already taken."
  },
  "delete": {
    "title": "Delete store?",
    "description": "This action cannot be undone. All per-tenant data inside this store will be deleted.",
    "confirm": "Delete",
    "cancel": "Cancel"
  },
  "storeHeader": {
    "slugLabel": "Slug",
    "delete": "Delete store"
  },
  "tenantTabs": {
    "label": "Tenant",
    "noTenants": "No tenants yet. Create a tenant before adding content."
  },
  "emptyPage": {
    "title": "Pick a store",
    "description": "Select a RAG or KV store from the sidebar, or create a new one."
  },
  "kv": {
    "search": "Search keys and values…",
    "headerKey": "Key",
    "headerValue": "Value",
    "remove": "Remove",
    "keyPlaceholder": "key",
    "valuePlaceholder": "value",
    "addKeyPlaceholder": "Add a key…",
    "addValuePlaceholder": "value",
    "noResults": "No matches for \"{query}\"",
    "entries": "{count, plural, =1 {1 entry} other {# entries}}",
    "pageOf": "{page} / {total}",
    "prevPage": "Previous page",
    "nextPage": "Next page",
    "duplicateKey": "Duplicate key",
    "deleteTitle": "Delete entry?",
    "deleteDescription": "This action cannot be undone.",
    "deleteConfirm": "Delete",
    "deleteCancel": "Cancel"
  }
}
```

The old `tenantList`, `noTenantsTitle`, `noTenantsDescription`, `goToTenants` keys are removed (their components are deleted in later tasks).

- [ ] **Step 3: Verify it parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/web/messages/en.json','utf8')); console.log('ok')"
```
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat(web): translations for multi-store knowledge base"
```

---

# Phase 4 — Frontend components

## Task 16: Refactor `KvStoreTable` to a controlled component

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/KvStoreTable.tsx`

- [ ] **Step 1: Change the export signature.** Replace the bottom `export function KvStoreTable()` (lines ~380-434) and the `useKvEntries` hook (lines ~360-378) with:

```tsx
export interface KvStoreTableProps {
  entries: { key: string; value: string }[];
  onEntriesChange: (entries: { key: string; value: string }[]) => void;
}

interface KvEntriesApi {
  entries: KvEntry[];
  update: (id: string, field: 'key' | 'value', value: string) => void;
  remove: (id: string) => void;
}

function entriesWithIds(rows: { key: string; value: string }[]): KvEntry[] {
  return rows.map((r) => ({ id: makeId(), key: r.key, value: r.value }));
}

function stripIds(rows: KvEntry[]): { key: string; value: string }[] {
  return rows
    .filter((r) => !(r.key === '' && r.value === ''))
    .map((r) => ({ key: r.key, value: r.value }));
}

function useControlledKvEntries(
  external: { key: string; value: string }[],
  onChange: (rows: { key: string; value: string }[]) => void,
  onAddedRow: (newRealCount: number) => void
): KvEntriesApi {
  const [entries, setEntries] = useState<KvEntry[]>(() =>
    ensureTrailingEmpty(entriesWithIds(external))
  );
  const externalKey = JSON.stringify(external);
  const lastSyncedRef = useRef<string>(externalKey);
  if (lastSyncedRef.current !== externalKey) {
    lastSyncedRef.current = externalKey;
    setEntries(ensureTrailingEmpty(entriesWithIds(external)));
  }

  function commit(next: KvEntry[]) {
    setEntries(next);
    onChange(stripIds(next));
  }

  function update(id: string, field: 'key' | 'value', value: string) {
    const idx = entries.findIndex((e) => e.id === id);
    const last = entries[entries.length - 1];
    const wasTrailing = idx === entries.length - 1 && last !== undefined && isEmptyEntry(last);
    const next = entries.map((e) => (e.id === id ? { ...e, [field]: value } : e));
    const final = ensureTrailingEmpty(next);
    commit(final);
    if (wasTrailing) onAddedRow(final.length - 1);
  }

  function remove(id: string) {
    const next = ensureTrailingEmpty(entries.filter((e) => e.id !== id));
    commit(next);
  }

  return { entries, update, remove };
}

export function KvStoreTable({ entries: external, onEntriesChange }: KvStoreTableProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  function navigateAfterAdd(realCount: number) {
    setPage(Math.max(1, Math.ceil(realCount / PAGE_SIZE)));
  }

  const { entries, update, remove } = useControlledKvEntries(external, onEntriesChange, navigateAfterAdd);
  const d = useKvDerived(entries, query, page);
  const duplicateKeys = useMemo(() => computeDuplicateKeys(entries), [entries]);
  const showNoResults = query.trim() !== '' && d.filtered.length === 0;

  function handleConfirmDelete() {
    if (deleteTargetId !== null) {
      remove(deleteTargetId);
      setDeleteTargetId(null);
    }
  }

  return (
    <>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <SearchInput query={query} onChange={setQuery} />
          </div>
          <KvTableView
            entries={d.pageEntries}
            trailingEmpty={d.isLastPage && query.trim() === '' ? d.trailingEmpty : null}
            duplicateKeys={duplicateKeys}
            showNoResults={showNoResults}
            query={query}
            onUpdate={update}
            onRequestRemove={setDeleteTargetId}
          />
        </div>
        <div className="mt-auto border-t border-border/30 pt-4">
          <KvFooter
            count={d.filtered.length}
            page={d.clampedPage}
            totalPages={d.totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>
      <KvDeleteDialog
        open={deleteTargetId !== null}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
```

- [ ] **Step 2: Add `useRef` to the React import** at the top of the file. Change:

```tsx
import { type KeyboardEvent, useMemo, useState } from 'react';
```
to:

```tsx
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 3: Delete the old `useKvEntries` function** (the un-controlled version that took an `onAddedRow` callback and used internal state) — replaced by `useControlledKvEntries` above.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck -w packages/web
```
Expected: passes. If `KnowledgeBaseUploader.tsx` errors because the new signature requires props — that's expected (we delete it in Task 24). Skip ahead and confirm there are no other errors first.

If the file exceeds 300 lines, extract the cell subcomponents (`KvKeyCell`, `KvValueCell`, `KvRow`) into a new `KvStoreTableRow.tsx` file in the same folder and import them.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/KvStoreTable.tsx
git commit -m "refactor(web): KvStoreTable is now a controlled component"
```

---

## Task 17: `StoresSidebar` + `StoresSidebarGroup` + `CreateStoreDialog`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/StoresSidebarGroup.tsx`
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/StoresSidebar.tsx`
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/CreateStoreDialog.tsx`

- [ ] **Step 1: Create `CreateStoreDialog.tsx`**

```tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { previewStoreSlug } from '@/app/lib/slugPreview';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type StoreType = 'rag' | 'kv';

interface CreateStoreDialogProps {
  type: StoreType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<{ ok: boolean; slug?: string; requestedSlug?: string }>;
}

export function CreateStoreDialog({
  type,
  open,
  onOpenChange,
  onCreate,
}: CreateStoreDialogProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.create');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const previewedSlug = previewStoreSlug(name);
  const title = type === 'rag' ? t('titleRag') : t('titleKv');
  const slugLine = previewedSlug === '' ? t('slugFallback') : t('slugPreview', { slug: previewedSlug });

  async function handleSubmit() {
    if (name.trim() === '' || submitting) return;
    setSubmitting(true);
    const res = await onCreate(name.trim());
    setSubmitting(false);
    if (res.ok) {
      setName('');
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{slugLine}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="store-name">{t('nameLabel')}</Label>
          <Input
            id="store-name"
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={name.trim() === '' || submitting}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `StoresSidebarGroup.tsx`**

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface SidebarItem {
  id: string;
  slug: string;
  name: string;
}

interface StoresSidebarGroupProps {
  header: string;
  items: SidebarItem[];
  hrefFor: (slug: string) => string;
  isActiveSlug: (slug: string) => boolean;
  newLabel: string;
  emptyLabel: string;
  onNewClick: () => void;
}

function itemClassName(selected: boolean): string {
  const base =
    'flex items-center gap-2 w-full px-2 py-1.5 rounded-[5px] text-left text-xs transition-colors cursor-pointer';
  const state = selected
    ? 'bg-primary/8 text-primary font-semibold'
    : 'hover:bg-sidebar-accent text-muted-foreground hover:text-foreground';
  return `${base} ${state}`;
}

export function StoresSidebarGroup({
  header,
  items,
  hrefFor,
  isActiveSlug,
  newLabel,
  emptyLabel,
  onNewClick,
}: StoresSidebarGroupProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 pt-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
          {header}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label={newLabel}
          onClick={onNewClick}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {items.length === 0 ? (
        <span className="px-2 text-[11px] italic text-muted-foreground/60">{emptyLabel}</span>
      ) : (
        items.map((item) => (
          <Link key={item.id} href={hrefFor(item.slug)} className={itemClassName(isActiveSlug(item.slug))}>
            <span className="truncate flex-1">{item.name}</span>
          </Link>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `StoresSidebar.tsx`**

```tsx
'use client';

import { Scrollable } from '@/app/components/Scrollable';
import { createKvStore, type KvStoreRow } from '@/app/lib/kvStores';
import { createRagStore, type RagStoreRow } from '@/app/lib/ragStores';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { CreateStoreDialog, type StoreType } from './CreateStoreDialog';
import { StoresSidebarGroup } from './StoresSidebarGroup';

interface StoresSidebarProps {
  orgId: string;
  orgSlug: string;
  initialRagStores: RagStoreRow[];
  initialKvStores: KvStoreRow[];
}

export function StoresSidebar({
  orgId,
  orgSlug,
  initialRagStores,
  initialKvStores,
}: StoresSidebarProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.storesSidebar');
  const router = useRouter();
  const pathname = usePathname();
  const [openType, setOpenType] = useState<StoreType | null>(null);
  const [ragStores, setRagStores] = useState(initialRagStores);
  const [kvStores, setKvStores] = useState(initialKvStores);

  const ragPrefix = `/orgs/${orgSlug}/knowledge-base/rag/`;
  const kvPrefix = `/orgs/${orgSlug}/knowledge-base/kv/`;
  const isRagActive = (slug: string) => pathname === `${ragPrefix}${slug}`;
  const isKvActive = (slug: string) => pathname === `${kvPrefix}${slug}`;

  async function handleCreate(name: string): Promise<{ ok: boolean; slug?: string; requestedSlug?: string }> {
    if (openType === 'rag') {
      const { result } = await createRagStore(orgId, name);
      if (result === null) return { ok: false };
      setRagStores([result, ...ragStores]);
      router.push(`${ragPrefix}${result.slug}`);
      return { ok: true, slug: result.slug };
    }
    if (openType === 'kv') {
      const { result } = await createKvStore(orgId, name);
      if (result === null) return { ok: false };
      setKvStores([result, ...kvStores]);
      router.push(`${kvPrefix}${result.slug}`);
      return { ok: true, slug: result.slug };
    }
    return { ok: false };
  }

  return (
    <aside className="w-56 shrink-0 border-r flex flex-col">
      <Scrollable className="min-h-0 flex-1">
        <div className="p-2 flex flex-col gap-3">
          <StoresSidebarGroup
            header={t('ragHeader')}
            items={ragStores}
            hrefFor={(slug) => `${ragPrefix}${slug}`}
            isActiveSlug={isRagActive}
            newLabel={t('newRag')}
            emptyLabel={t('empty')}
            onNewClick={() => setOpenType('rag')}
          />
          <StoresSidebarGroup
            header={t('kvHeader')}
            items={kvStores}
            hrefFor={(slug) => `${kvPrefix}${slug}`}
            isActiveSlug={isKvActive}
            newLabel={t('newKv')}
            emptyLabel={t('empty')}
            onNewClick={() => setOpenType('kv')}
          />
        </div>
      </Scrollable>
      <CreateStoreDialog
        type={openType ?? 'rag'}
        open={openType !== null}
        onOpenChange={(o) => {
          if (!o) setOpenType(null);
        }}
        onCreate={handleCreate}
      />
    </aside>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck -w packages/web
```
Expected: passes for these new files (`KnowledgeBaseUploader.tsx` errors are still expected — deleted in Task 24).

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/StoresSidebar.tsx \
        packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/StoresSidebarGroup.tsx \
        packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/CreateStoreDialog.tsx
git commit -m "feat(web): stores sidebar and create dialog"
```

---

## Task 18: `StoreHeader`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/StoreHeader.tsx`

- [ ] **Step 1: Create**

```tsx
'use client';

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
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface StoreHeaderProps {
  name: string;
  slug: string;
  onDelete: () => Promise<void>;
}

export function StoreHeader({ name, slug, onDelete }: StoreHeaderProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
    setConfirmOpen(false);
  }

  return (
    <div className="flex items-center justify-between border-b pb-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold">{name}</h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t('storeHeader.slugLabel')}: {slug}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('storeHeader.delete')}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('delete.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleConfirm}>
              {t('delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/StoreHeader.tsx
git commit -m "feat(web): StoreHeader with delete confirmation"
```

---

## Task 19: `TenantTabs`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/TenantTabs.tsx`

- [ ] **Step 1: Create**

```tsx
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TenantRow } from '@/app/lib/tenants';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TenantTabsProps {
  tenants: TenantRow[];
  renderTab: (tenantId: string) => React.ReactNode;
}

export function TenantTabs({ tenants, renderTab }: TenantTabsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.tenantTabs');
  const firstId = tenants[0]?.id ?? '';
  const [active, setActive] = useState(firstId);

  if (tenants.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        {t('noTenants')}
      </div>
    );
  }

  return (
    <Tabs value={active} onValueChange={setActive} className="flex flex-1 flex-col">
      <TabsList variant="line">
        {tenants.map((tenant) => (
          <TabsTrigger key={tenant.id} value={tenant.id} className="cursor-pointer">
            {tenant.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {tenants.map((tenant) => (
        <TabsContent key={tenant.id} value={tenant.id} className="flex flex-1 flex-col">
          {tenant.id === active ? renderTab(tenant.id) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
```

The `tenant.id === active` guard avoids mounting all tabs at once — only the active tab pays the load cost.

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/TenantTabs.tsx
git commit -m "feat(web): TenantTabs component"
```

---

## Task 20: `KvStoreTableConnected` (load/save lifecycle)

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/KvStoreTableConnected.tsx`

- [ ] **Step 1: Create**

```tsx
'use client';

import { getKvEntries, type KvEntry, saveKvEntries } from '@/app/lib/kvStores';
import { useEffect, useRef, useState } from 'react';

import { KvStoreTable } from './KvStoreTable';

interface KvStoreTableConnectedProps {
  storeId: string;
  tenantId: string;
}

const SAVE_DEBOUNCE_MS = 600;

export function KvStoreTableConnected({
  storeId,
  tenantId,
}: KvStoreTableConnectedProps): React.JSX.Element | null {
  const [entries, setEntries] = useState<KvEntry[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadKey = `${storeId}::${tenantId}`;
  const lastLoadedRef = useRef<string>('');

  useEffect(() => {
    if (lastLoadedRef.current === loadKey) return;
    lastLoadedRef.current = loadKey;
    setEntries(null);
    let cancelled = false;
    void (async () => {
      const { result } = await getKvEntries(storeId, tenantId);
      if (!cancelled) setEntries(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, tenantId, loadKey]);

  function scheduleSave(next: KvEntry[]) {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveKvEntries(storeId, tenantId, next);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleChange(next: KvEntry[]) {
    setEntries(next);
    scheduleSave(next);
  }

  if (entries === null) return null;
  return <KvStoreTable entries={entries.map((e) => ({ ...e, id: '' }))} onEntriesChange={handleChange} />;
}
```

```tsx
'use client';

import { getKvEntries, type KvEntry, saveKvEntries } from '@/app/lib/kvStores';
import { useEffect, useRef, useState } from 'react';

import { KvStoreTable } from './KvStoreTable';

interface KvStoreTableConnectedProps {
  storeId: string;
  tenantId: string;
}

const SAVE_DEBOUNCE_MS = 600;

export function KvStoreTableConnected({
  storeId,
  tenantId,
}: KvStoreTableConnectedProps): React.JSX.Element | null {
  const [entries, setEntries] = useState<KvEntry[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadKey = `${storeId}::${tenantId}`;
  const lastLoadedRef = useRef<string>('');

  useEffect(() => {
    if (lastLoadedRef.current === loadKey) return;
    lastLoadedRef.current = loadKey;
    setEntries(null);
    let cancelled = false;
    void (async () => {
      const { result } = await getKvEntries(storeId, tenantId);
      if (!cancelled) setEntries(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, tenantId, loadKey]);

  function scheduleSave(next: KvEntry[]) {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveKvEntries(storeId, tenantId, next);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleChange(next: KvEntry[]) {
    setEntries(next);
    scheduleSave(next);
  }

  if (entries === null) return null;
  return <KvStoreTable entries={entries} onEntriesChange={handleChange} />;
}
```


- [ ] **Step 2: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/KvStoreTableConnected.tsx
git commit -m "feat(web): KvStoreTableConnected with load/save lifecycle"
```

---

## Task 21: Layout (with sidebar) and empty page

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/layout.tsx`
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/page.tsx`

- [ ] **Step 1: Create `layout.tsx`**

```tsx
import { getKvStoresByOrg } from '@/app/lib/kvStores';
import { getOrgBySlug } from '@/app/lib/orgs';
import { getRagStoresByOrg } from '@/app/lib/ragStores';
import { redirect } from 'next/navigation';

import { StoresSidebar } from './StoresSidebar';

interface KnowledgeBaseLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function KnowledgeBaseLayout({
  children,
  params,
}: KnowledgeBaseLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) {
    redirect('/');
  }

  const [{ result: ragStores }, { result: kvStores }] = await Promise.all([
    getRagStoresByOrg(org.id),
    getKvStoresByOrg(org.id),
  ]);

  return (
    <div className="relative flex h-[calc(100%-var(--spacing)*2.5)] overflow-hidden border mr-2.5 rounded-xl bg-background">
      <StoresSidebar
        orgId={org.id}
        orgSlug={slug}
        initialRagStores={ragStores}
        initialKvStores={kvStores}
      />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `page.tsx`** with the empty state:

```tsx
import { useTranslations } from 'next-intl';

export default function KnowledgeBaseEmptyPage(): React.JSX.Element {
  return <KnowledgeBaseEmptyPageInner />;
}

function KnowledgeBaseEmptyPageInner(): React.JSX.Element {
  const t = useTranslations('knowledgeBase.emptyPage');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
    </div>
  );
}
```

Note: server components can't call `useTranslations` from `next-intl` (it requires client context); for static text on a server page, use `getTranslations` instead. Adjusted version:

```tsx
import { getTranslations } from 'next-intl/server';

export default async function KnowledgeBaseEmptyPage(): Promise<React.JSX.Element> {
  const t = await getTranslations('knowledgeBase.emptyPage');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
    </div>
  );
}
```

Use the `getTranslations` version.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck -w packages/web
```
Expected: passes for these files (`KnowledgeBaseUploader.tsx` and `KnowledgeBaseClient.tsx` errors are still expected — deleted in Task 24).

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/layout.tsx \
        packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/page.tsx
git commit -m "feat(web): knowledge-base layout with sidebar and empty page"
```

---

## Task 22: RAG store detail page

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/page.tsx`
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagStorePageClient.tsx`

- [ ] **Step 1: Create `page.tsx`**

```tsx
import { getOrgBySlug } from '@/app/lib/orgs';
import { getRagStoresByOrg } from '@/app/lib/ragStores';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { notFound, redirect } from 'next/navigation';

import { RagStorePageClient } from './RagStorePageClient';

interface RagStorePageProps {
  params: Promise<{ slug: string; storeSlug: string }>;
}

export default async function RagStorePage({ params }: RagStorePageProps): Promise<React.JSX.Element> {
  const { slug, storeSlug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const [{ result: stores }, { result: tenants }] = await Promise.all([
    getRagStoresByOrg(org.id),
    getTenantsByOrg(org.id),
  ]);
  const store = stores.find((s) => s.slug === storeSlug);
  if (store === undefined) notFound();

  return <RagStorePageClient orgSlug={slug} store={store} tenants={tenants} />;
}
```

- [ ] **Step 2: Create `RagStorePageClient.tsx`**

The RAG content remains the existing file-queue UI per tenant. The `useFileQueue` hook is reused; one queue instance per (store, tenant) pair is created lazily inside the tab content.

```tsx
'use client';

import type { RagStoreRow } from '@/app/lib/ragStores';
import type { TenantRow } from '@/app/lib/tenants';
import { deleteRagStore } from '@/app/lib/ragStores';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useRef } from 'react';

import { AddFilesButton } from '../../AddFilesButton';
import { FileList } from '../../FileList';
import { KnowledgeBaseEmptyState } from '../../KnowledgeBaseEmptyState';
import { StoreHeader } from '../../StoreHeader';
import { TenantTabs } from '../../TenantTabs';
import { UploaderFooter } from '../../UploaderFooter';
import { ACCEPT_ATTR } from '../../uploaderHelpers';
import { useFileQueue } from '../../useFileQueue';

interface RagStorePageClientProps {
  orgSlug: string;
  store: RagStoreRow;
  tenants: TenantRow[];
}

function RagTenantContent({ tenantId: _tenantId }: { tenantId: string }): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  const queue = useFileQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const isEmpty = queue.files.length === 0;

  function open() {
    inputRef.current?.click();
  }
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files !== null && e.target.files.length > 0) {
      queue.add(e.target.files);
      e.target.value = '';
    }
  }

  return (
    <Card className="bg-background ring-0 flex flex-1 flex-col">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <AddFilesButton onAdd={open} kbdPressed={false} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {isEmpty ? (
          <KnowledgeBaseEmptyState isDragging={false} onAdd={open} />
        ) : (
          <FileList files={queue.files} onRemove={queue.remove} />
        )}
        {!isEmpty && <UploaderFooter files={queue.files} onClear={queue.clear} />}
      </CardContent>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        onChange={handleChange}
        className="hidden"
      />
    </Card>
  );
}

export function RagStorePageClient({
  orgSlug,
  store,
  tenants,
}: RagStorePageClientProps): React.JSX.Element {
  const router = useRouter();

  async function handleDelete() {
    await deleteRagStore(store.id);
    router.push(`/orgs/${orgSlug}/knowledge-base`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 min-h-0">
      <StoreHeader name={store.name} slug={store.slug} onDelete={handleDelete} />
      <TenantTabs
        tenants={tenants}
        renderTab={(tenantId) => <RagTenantContent tenantId={tenantId} />}
      />
    </div>
  );
}
```

Note: drag-and-drop is intentionally dropped for v1 since the file queue is per-tab and the wrapper layout doesn't know which tab is active. If we want drop-anywhere back, that's a follow-up — add a `useNativeDropArea` inside `RagTenantContent` scoped to a per-tab ref.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/
git commit -m "feat(web): RAG store detail page"
```

---

## Task 23: KV store detail page

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/kv/[storeSlug]/page.tsx`
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/kv/[storeSlug]/KvStorePageClient.tsx`

- [ ] **Step 1: Create `page.tsx`**

```tsx
import { getKvStoresByOrg } from '@/app/lib/kvStores';
import { getOrgBySlug } from '@/app/lib/orgs';
import { getTenantsByOrg } from '@/app/lib/tenants';
import { notFound, redirect } from 'next/navigation';

import { KvStorePageClient } from './KvStorePageClient';

interface KvStorePageProps {
  params: Promise<{ slug: string; storeSlug: string }>;
}

export default async function KvStorePage({ params }: KvStorePageProps): Promise<React.JSX.Element> {
  const { slug, storeSlug } = await params;
  const { result: org } = await getOrgBySlug(slug);
  if (!org) redirect('/');

  const [{ result: stores }, { result: tenants }] = await Promise.all([
    getKvStoresByOrg(org.id),
    getTenantsByOrg(org.id),
  ]);
  const store = stores.find((s) => s.slug === storeSlug);
  if (store === undefined) notFound();

  return <KvStorePageClient orgSlug={slug} store={store} tenants={tenants} />;
}
```

- [ ] **Step 2: Create `KvStorePageClient.tsx`**

```tsx
'use client';

import type { KvStoreRow } from '@/app/lib/kvStores';
import { deleteKvStore } from '@/app/lib/kvStores';
import type { TenantRow } from '@/app/lib/tenants';
import { useRouter } from 'next/navigation';

import { KvStoreTableConnected } from '../../KvStoreTableConnected';
import { StoreHeader } from '../../StoreHeader';
import { TenantTabs } from '../../TenantTabs';

interface KvStorePageClientProps {
  orgSlug: string;
  store: KvStoreRow;
  tenants: TenantRow[];
}

export function KvStorePageClient({
  orgSlug,
  store,
  tenants,
}: KvStorePageClientProps): React.JSX.Element {
  const router = useRouter();

  async function handleDelete() {
    await deleteKvStore(store.id);
    router.push(`/orgs/${orgSlug}/knowledge-base`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 min-h-0">
      <StoreHeader name={store.name} slug={store.slug} onDelete={handleDelete} />
      <TenantTabs
        tenants={tenants}
        renderTab={(tenantId) => <KvStoreTableConnected storeId={store.id} tenantId={tenantId} />}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/kv/
git commit -m "feat(web): KV store detail page"
```

---

## Task 24: Remove obsolete components

**Files:**
- Delete: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/KnowledgeBaseClient.tsx`
- Delete: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/KnowledgeBaseUploader.tsx`
- Delete: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/TenantList.tsx`
- Delete: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/NoTenantsState.tsx`

- [ ] **Step 1: Verify these files are not imported elsewhere**

```bash
grep -rln "KnowledgeBaseClient\|KnowledgeBaseUploader\|NoTenantsState" packages/web --include="*.tsx" --include="*.ts" | grep -v "/orgs/\[slug\]/(dashboard)/knowledge-base/"
grep -rln "from.*['\"]\\./TenantList['\"]\\|/knowledge-base/TenantList" packages/web --include="*.tsx" --include="*.ts"
```
Expected: no output for the first command (no external consumers). The `TenantList` lookup confirms it's only used inside the knowledge-base folder (which we're removing) — but `TenantList` is a generic name, so verify hits only point to `knowledge-base/TenantList.tsx`.

- [ ] **Step 2: Delete the files**

```bash
git rm packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/KnowledgeBaseClient.tsx \
       packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/KnowledgeBaseUploader.tsx \
       packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/TenantList.tsx \
       packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/NoTenantsState.tsx
```

- [ ] **Step 3: Typecheck the whole repo**

```bash
npm run typecheck
```
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(web): remove obsolete knowledge-base components"
```

---

# Phase 5 — Verification

## Task 25: Full check + smoke instructions

- [ ] **Step 1: Run the project check**

```bash
npm run check
```
Expected: format passes, lint passes, typecheck passes.

If lint complains about `max-lines` on `KvStoreTable.tsx` (it's near the limit after the refactor), split the cell subcomponents (`KvKeyCell`, `KvValueCell`, `KvRow`) into a new file `KvStoreTableRow.tsx` in the same folder and re-import. Re-run `npm run check`. Recommit:

```bash
git commit -am "refactor(web): split KvStoreTable subcomponents to satisfy max-lines"
```

- [ ] **Step 2: Run backend tests**

```bash
npm run test -w packages/backend
```
Expected: all tests pass, including the new `ragStoresQueries.test.ts` and `kvStoresQueries.test.ts`.

- [ ] **Step 3: Smoke test (manual — requires running stack)**

The user is responsible for applying the migration (per project policy). After they apply it:

1. Start the backend (`packages/backend`) and web (`npm run dev -w packages/web`).
2. Open `http://localhost:3101/orgs/<some-org-slug>/knowledge-base`.
3. Verify the sidebar shows two empty groups ("RAG Stores" and "KV Stores") with `+` buttons.
4. Click `+` under "KV Stores", type "Product FAQ" — confirm the slug preview reads `productfaq`. Submit. URL should navigate to `/knowledge-base/kv/productfaq`.
5. The page should show "Product FAQ" + `Slug: productfaq` at top, with one tab per tenant in the org.
6. Type some entries; refresh the page — entries should persist for the active tenant and be empty under the other tabs.
7. Click `+` under "RAG Stores", create another store — verify slug uniqueness (try a name that produces the same slug as an existing one; the new store should be suffixed `1`, `2`, …).
8. Delete a store via the trash icon; confirm — should return to the empty page.

- [ ] **Step 4: Stop here.** Do not push or open a PR unless the user explicitly asks.

---

## Self-review summary (writer's notes)

- Each task is small (one logical unit per task, 2-5 minutes per step).
- All code blocks are complete — no `// implement` stubs.
- Cross-task type consistency: backend `RagStoreRow` / `KvStoreRow` shapes match the web `RagStoreRow` / `KvStoreRow` (same field names, snake_case from DB).
- `KvStoreTable` controlled props use `{ key, value }[]` (not the internal `{ id, key, value }`), so consumers like `KvStoreTableConnected` work against the canonical server shape (see Task 20 callout that fixes the Task 16 type).
- Spec coverage:
  - Data model ✅ Task 1
  - Backend routes ✅ Tasks 2-11
  - Web proxy fetchers ✅ Tasks 12-14
  - i18n keys ✅ Task 15
  - Sidebar + create dialog ✅ Task 17
  - Store header + delete ✅ Task 18
  - Per-tenant tabs ✅ Task 19
  - KV persistence ✅ Task 20
  - Pages + layout ✅ Tasks 21-23
  - Removal of old UI ✅ Task 24
- No `any`, no eslint disables, no `!important`. All shadcn imports use existing `components/ui/` modules.
- Drag-and-drop was dropped in this iteration (flagged in Task 22). Worth confirming with the user if they want it back.
