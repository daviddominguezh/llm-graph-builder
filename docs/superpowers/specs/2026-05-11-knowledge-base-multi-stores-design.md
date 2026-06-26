# Knowledge Base — Multiple RAG and KV stores per org

**Date:** 2026-05-11
**Status:** Design approved (pending written-spec review)

## Problem

The knowledge-base page (`/orgs/[slug]/knowledge-base`) today assumes an implicit "one RAG and one KV per tenant" model. The left sidebar is a tenants list; the right pane shows a file uploader and a KV table that operate on the selected tenant. Neither is persisted to the backend yet (the file queue is client-side, the KV table is in-memory).

We want to replace this with **org-level named stores**. An org defines N RAG stores and M KV stores. Each store has a user-provided name and a generated, unique slug. Each tenant has its own data inside each store (RAG files for that tenant, KV entries for that tenant).

## Goals

- Users can create, list, and delete RAG stores and KV stores at the org level.
- When creating a store, the user types a name and sees the generated slug live before submitting.
- The knowledge-base page sidebar lists the org's RAG and KV stores instead of tenants.
- Selecting a store shows its definition (name + slug) and a row of per-tenant tabs; each tab shows the per-tenant content UI scoped to `(store, tenant)`.
- KV entries are persisted to the backend per `(store, tenant, key)`.
- All Supabase access happens from `packages/backend`. The Next.js layer proxies via the existing `fetchFromBackend`.

## Non-goals

- RAG file content persistence (storage bucket, vector embeddings, file metadata table). The existing client-side file queue continues to behave as it does today.
- Store rename or edit-after-create.
- Schema/typing for KV stores (e.g. declaring required keys).
- Tenant management UI on this page. Tenants are managed elsewhere.

## Data model

One new migration `supabase/migrations/20260511_<n>_knowledge_base_stores.sql` (exact number assigned at write time, following the project's `YYYYMMDDhhmmss` convention):

```sql
CREATE TABLE public.rag_stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  UNIQUE (org_id, slug)
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
  UNIQUE (org_id, slug)
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
```

**RLS:** All three tables get RLS enabled with `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies that check `is_org_member(org_id)`. For `kv_entries`, the policy resolves `org_id` via the parent `kv_stores` row, using a `SECURITY DEFINER` helper `kv_store_org_id(kv_store_id uuid) returns uuid` (mirrors the existing `tenant_org_id` pattern in storage policies — avoids subquery-under-user-RLS pitfalls).

**Slug uniqueness scope:** per `(org_id, store type)`. RAG and KV slugs live under different URL prefixes (`/knowledge-base/rag/...` vs `/knowledge-base/kv/...`), so a name like "products" can exist as both a RAG store and a KV store in the same org.

## Backend (`packages/backend`)

Mirror the existing tenant pattern in `src/routes/tenants/*` and `src/queries/tenantQueries.ts`.

**New files:**

```
src/routes/ragStores/ragStoresRouter.ts
src/routes/kvStores/kvStoresRouter.ts
src/queries/ragStoresQueries.ts
src/queries/kvStoresQueries.ts
src/queries/kvEntriesQueries.ts
```

**Routes:**

```
GET    /rag-stores/:orgId                      → RagStore[]
POST   /rag-stores                             body: { orgId, name }      → RagStore (slug generated)
DELETE /rag-stores/:storeId                    → { ok: true }

GET    /kv-stores/:orgId                       → KvStore[]
POST   /kv-stores                              body: { orgId, name }      → KvStore (slug generated)
DELETE /kv-stores/:storeId                     → { ok: true }

GET    /kv-stores/:storeId/entries/:tenantId   → { key, value }[]
PUT    /kv-stores/:storeId/entries/:tenantId   body: { key, value }[]     → { ok: true }
```

`PUT entries` is a **bulk replace** for the `(storeId, tenantId)` partition: backend deletes rows not in the payload and upserts the rest in a single transaction. This matches the table-editor UX (debounced save of the whole edited set) and avoids per-row CRUD churn from the client.

**Slug helper:** extract the existing `generateTenantSlug` algorithm from `src/queries/slugQueries.ts` into a generic helper:

```ts
function generateSlug(name: string): string;                              // pure, used by client preview
async function findUniqueSlug(table: 'rag_stores' | 'kv_stores' | 'tenants',
                              orgId: string, name: string): Promise<string>;
```

The algorithm matches today's `generateTenantSlug`: lowercase, non-alphanumeric runs → `-`, trim, truncate to 37 chars, append numeric suffix on collision (`-1`, `-2`, ...).

## Frontend (`packages/web`)

### Routes (App Router)

```
app/orgs/[slug]/(dashboard)/knowledge-base/
├── layout.tsx                    server component — fetches stores + tenants, renders sidebar
├── page.tsx                      empty state (no store selected)
├── rag/[storeSlug]/page.tsx      RAG store detail
└── kv/[storeSlug]/page.tsx       KV store detail
```

The shared `layout.tsx` is the single fetch point for the sidebar data. Each detail page fetches its store by slug and renders the per-tenant tabs.

### Components

```
knowledge-base/
├── StoresSidebar.tsx                 replaces TenantList. Two collapsible groups: RAG Stores, KV Stores, each with a "+ New" button.
├── StoresSidebarGroup.tsx            single group (header + items + new button). Keeps StoresSidebar under the 300-line cap.
├── CreateStoreDialog.tsx             modal: name input + live slug preview line. Type-aware (rag | kv).
├── StoreHeader.tsx                   store name + slug pill + delete button (with confirm).
├── TenantTabs.tsx                    horizontal tab row (one tab per tenant); manages active tenant via local state.
├── KvStoreTableConnected.tsx         wraps the existing KvStoreTable. Owns load/save lifecycle for (storeId, tenantId).
├── (existing) KvStoreTable.tsx       reused as-is — pure UI, given entries + onChange.
├── (existing) RagTabContent + uploader + useFileQueue   reused as-is inside the per-tenant tab on the RAG detail page. Still client-side only.
└── (removed) TenantList.tsx, NoTenantsState.tsx — no longer used here
```

### Data flow

- **Sidebar:** layout server-fetches `rag_stores` + `kv_stores` + `tenants` for the org via `fetchFromBackend`. Passes everything to a client `StoresSidebar`.
- **Active store:** derived from the URL (`/rag/[slug]` or `/kv/[slug]`).
- **Active tenant:** local state in `TenantTabs`, defaults to the first tenant. Not persisted to the URL in v1 (keep URLs short; revisit if user feedback wants deep links).
- **KV editor:** on `(storeId, tenantId)` change, GET entries via a server action (`getKvEntriesAction(storeId, tenantId)`). On edit, debounced PUT bulk replace through a server action (`saveKvEntriesAction(storeId, tenantId, entries)`).
- **RAG editor:** unchanged — file queue lives in `useFileQueue` per `(storeId, tenantId)` and is not persisted.
- **No tenants in org:** sidebar renders fine. Detail page shows a "create a tenant first" notice in place of the tabs.

### Create-dialog UX

The dialog is the same for both RAG and KV (passes `type` as a prop):

1. Modal with a single text input ("Name").
2. Below the input, a read-only line: `URL slug: <preview>` where `<preview>` is computed client-side from the typed name via `generateSlug(name)`. Updates live.
3. Submit calls `createStoreAction({ type, orgId, name })`. Backend runs `findUniqueSlug`, which may add a `-N` suffix if the slug collides with an existing store in the same `(org, type)`.
4. On success, navigate to `/orgs/[orgSlug]/knowledge-base/<type>/<finalSlug>`. If `finalSlug !== preview` (collision), surface a toast: `Saved as "<finalSlug>" — "<preview>" was already taken.`

### Sidebar scrolling

`StoresSidebar` uses the `Scrollable` wrapper from `app/components/Scrollable.tsx` — store additions/removals dynamically change the direct children of the scroll host, which would otherwise trip the `GlobalScrollbarOverlay` `removeChild` crash documented in `CLAUDE.md`.

### Server actions

New file `app/actions/knowledgeBase.ts` (or split into `ragStores.ts` / `kvStores.ts` / `kvEntries.ts` if it grows past 300 lines):

```ts
createRagStoreAction(orgId, name)             → RagStore
deleteRagStoreAction(storeId)
createKvStoreAction(orgId, name)              → KvStore
deleteKvStoreAction(storeId)
getKvEntriesAction(storeId, tenantId)         → { key, value }[]
saveKvEntriesAction(storeId, tenantId, items)
```

All actions go through `fetchFromBackend`. No direct Supabase calls anywhere in `packages/web`.

## i18n

Extend the `knowledgeBase` namespace in `en.json` (only English is in use):

```jsonc
{
  "knowledgeBase": {
    // ... existing keys preserved ...
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
    }
  }
}
```

Existing `rag.*` and `kv.*` keys are preserved.

## Code-quality compliance

- **`max-lines-per-function: 40`, `max-lines: 300`, `max-depth: 2`**: each component is split early. `StoresSidebar` delegates per-group rendering to `StoresSidebarGroup`. `CreateStoreDialog` extracts the slug-preview line into a tiny sub-component if needed. The bulk-replace handler in `kvEntriesQueries.ts` extracts the diff/upsert into helpers.
- **No `any`, no ESLint disables.** All new types are explicit. Types (`RagStore`, `KvStore`, `KvEntry`) are declared narrowly in each package (`packages/backend/src/types/` and `packages/web/app/types/` — wherever the existing `Tenant` type lives in each). The Zod schemas for create payloads live alongside route handlers in `packages/backend`.
- **shadcn/ui** for Dialog, Input, Button, Tabs (already in `components/ui/`).
- **No `!important`** in Tailwind.

## Risks and notes

- The bulk-replace KV save is racy if two tabs edit the same `(store, tenant)` concurrently — last write wins. Acceptable in v1; flag for follow-up if it becomes a problem.
- The new `kv_entries.org_id` is intentionally absent (resolved through `kv_store_id`). The `kv_store_org_id` helper handles RLS; if we later need `org_id` indexed on `kv_entries` directly for analytics, add a denormalized column then.
- Removing `TenantList` from this page is safe — tenant management lives elsewhere in the dashboard. Confirm during implementation that no other page imports it.

## Open questions

None blocking.

## Out of scope (for follow-up)

- RAG file persistence (storage bucket, file metadata, vector embedding pipeline).
- Store rename / edit-after-create.
- KV store schema (typed keys, required fields, validation).
- Per-tenant URL persistence on detail pages (deep links into a specific tenant's tab).
