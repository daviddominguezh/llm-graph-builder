# Sub-project 1 — Default-tenant subsystem

**Date:** 2026-06-22
**Status:** Design (rev 1) — pending user review
**Parent:** `2026-06-20-tenant-scoped-mcp-OVERVIEW.md`
**Supersedes for SP1:** §1 of `2026-06-20-tenant-scoped-mcp-config-design.md` (D7/D8)
**Depends on:** none (SP0 is independent). **Unblocks:** SP4 (per-tenant MCP) — guarantees "the default tenant always exists" as the discovery/reference tenant.

> Backend files live in `packages/backend/src/`; web files in `packages/web/app/`; migrations in `supabase/migrations/`. Slug validation is shared in `packages/shared-validation/src/`.

## Problem

Every org needs exactly one **default tenant** — the always-present discovery/reference tenant SP4 resolves the builder's canonical MCP tool list against, and the guaranteed minimum row in the per-tenant matrix. Today tenants are entirely user-authored: an org can have **zero** tenants (`getTenantsByOrg` returns `[]`), there is no notion of a default, and nothing is auto-created on org creation. SP4 cannot assume a reference tenant exists.

This sub-project introduces the default tenant: auto-created **atomically with its org**, **backfilled** for every existing org, with a **locked identity that mirrors the org** (name/slug/avatar), **undeletable**, but with editable operational config (channels, and later MCP values). The `is_default` flag must propagate cleanly through the row type, type guard, queries, and the tenant-list UI.

## Decisions (carried from D7/D8 — locked, not reopened here)

| # | Decision | Choice |
|---|---|---|
| D7 | One default tenant per org | Auto-created. Identity (name/slug/avatar) **locked**, mirrors the org. **Cannot be deleted.** Operational config (channels, MCP values) editable. |
| D8 | Backfill | Migration creates one org-named default tenant for **every existing org**; idempotent. |
| SP1-a | Slug source | Derive from the **org name** via `generateTenantSlug` (hyphen-free), **not** the org's slug (org slugs contain hyphens — incompatible with the tenant format CHECK). Collision-safe via the existing `findUniqueTenantSlug`. |
| SP1-b | Identity lock + delete guard | Enforced in **three layers**: backend route handlers (`PATCH`/`DELETE /tenants/:id`, org avatar/rename paths), DB guards (triggers), and web UI (suppress controls). DB guard is the backstop. |
| SP1-c | Avatar mirroring | Org avatar is the source of truth; the default tenant's avatar follows it on set/change/removal. **Mechanism is an open decision — see "Open decisions".** |

## Current state (verified, file:line)

### Tenants table + constraints
- **Table:** `tenants (id uuid pk, org_id uuid not null → organizations on delete cascade, name text not null, avatar_url text, created_at, updated_at, UNIQUE(org_id,name))` — `20260326200000_tenants_table.sql:3-11`. Index `idx_tenants_org_id` on `(org_id)` (`:13`).
- **`slug text not null`** added later — `20260420100000_tenants_slug.sql:4,31`. Was org-scoped unique (`tenants_org_slug_unique`, `:32`), then **dropped and replaced with global unique** `tenants_slug_unique UNIQUE(slug)` — `20260420300000_tenants_global_slug.sql:23,26`.
- **Format CHECK** `tenants_slug_format`: `slug ~ '^[a-z0-9]{1,40}$'` **AND** `slug NOT IN (`24-word denylist`)` — `20260420300000_tenants_global_slug.sql:28-36`. Denylist: `app,api,www,live,admin,assets,cdn,docs,status,root,support,help,blog,mail,email,auth,oauth,static,public,internal,staging,preview,dev,localhost`.
- **Web-channel columns:** `web_channel_enabled boolean not null default true`, `web_channel_allowed_origins text[] not null default '{}'` — `20260421100001_tenants_web_channel.sql:10-23`.
- **No `updated_at` trigger exists** — `updated_at` is set manually in update queries (`tenantQueries.ts:155,182`). New mirror/guard triggers are additive.

### RLS + helpers
- Table RLS uses **2-arg** `is_org_member(org_id, auth.uid())` for select/insert/update/delete — `20260326200000_tenants_table.sql:17-31`.
- 2-arg helper: `is_org_member(p_org_id, p_user_id)` SECURITY DEFINER — `20260314000000_mcp_server_library.sql:70-78`. 1-arg recursion-safe helper `is_org_member(check_org_id)` (calls `auth.uid()` internally) — `20260309300000_fix_rls_self_reference.sql:9-19`.
- `tenant_org_id(p_tenant_id)` SECURITY DEFINER helper — `20260326200000_tenants_table.sql:34-39`.

### Org creation flow
- **Route:** `POST /orgs` → `handleCreateOrg` — `server.ts:80,170`. Handler: `createOrg.ts:39-69`. Generates slug (`generateSlug`), `findUniqueSlug(...,'organizations')`, then `insertOrg`, then `updateBloomFilter` + `provisionOpenRouterKey`.
- **Insert:** `insertOrg` is a **plain table insert** (no RPC) — `orgQueries.ts:101-109`. Triggers fire on it.
- **Existing trigger:** `add_org_creator` — `AFTER INSERT` on `organizations`, `SECURITY DEFINER set search_path=''`, **returns early when `auth.uid() is null`**, else inserts the creator into `org_members` as `owner` — `20260309100000_create_organizations.sql:115-133`. **This is the precedent for the atomic creation hook (and the auth.uid() concern).**
- `organizations (id, name, slug unique, avatar_url, created_at, updated_at)` — `20260309100000_create_organizations.sql:5-14`.

### Org rename + avatar paths (mirroring sync points)
- **Rename:** `handleUpdateOrg` (`updateOrg.ts:42-63`) updates `name` and (if changed) `slug`.
- **Avatar set:** `handleUploadAvatar` → `uploadOrgAvatar` (bucket `org-avatars`, path `{orgId}/avatar`, public) then `updateOrgFields(..., {avatar_url: url})` — `orgAvatar.ts:19-56`, `orgStorageQueries.ts:6-26`.
- **Avatar remove:** `handleRemoveAvatar` → `removeOrgAvatar` then `updateOrgFields(..., {avatar_url: null})` — `orgAvatar.ts:58-69`.
- **Org-avatars bucket** (public read, authenticated write) — `20260309100000_create_organizations.sql:252-280`.

### Tenant CRUD
- **Row type + guard (duplicated):** backend `TenantRow` + `isTenantRow` — `tenantQueries.ts:7-17,23-26`; web mirror — `lib/tenants.ts:8-18,29-39`. Web guard checks `web_channel_*` presence; backend guard only checks `id/name/org_id/slug`.
- **Queries:** `getTenantsByOrg` (`tenantQueries.ts:46-59`, ordered `created_at desc`), `createTenant` (`:61-77`), `updateTenant` (name only, `:145-161`), `updateTenantWebChannel` (`:178-197`), `deleteTenant` (`:199-207`). `LIST_COLUMNS` is the shared select list.
- **Routes:** `tenantRouter.ts:17-28` — `POST /` create, `PATCH /:tenantId` update name, `DELETE /:tenantId` delete, `POST/DELETE /:tenantId/avatar`, `PATCH /:tenantId/web-channel`. Handlers: `createTenant.ts:52-81` (slug resolve+collision via `resolveSlug`/`findUniqueTenantSlug`), `updateTenant.ts:14-41`, `deleteTenant.ts:14-35`.
- **Slug generation:** `generateTenantSlug(name)` strips all non-alphanumerics, caps at 37 chars — `slugQueries.ts:79-87`. `findUniqueTenantSlug` appends numeric suffix `base`, `base1`…`base999` — `tenantQueries.ts:132-143`. Validation `isValidTenantSlug` + `RESERVED_TENANT_SLUGS` + `TENANT_SLUG_REGEX` — `shared-validation/src/index.ts:1,5-36`. (Note: org `generateSlug` produces **hyphenated** slugs — incompatible with the tenant format CHECK — confirming SP1-a.)
- **Web actions/lib:** `getTenantsByOrgAction`/`createTenantAction`/`updateTenantAction`/`deleteTenantAction` — `actions/tenants.ts:14-62`; lib wrappers call backend over HTTP — `lib/tenants.ts:57-162`.

### Tenant UI
- **List page:** `TenantsSection.tsx` — per-row (`:206-230`): `Link` to `/orgs/{orgSlug}/tenant/{slug}` with `TenantAvatar` + name, `CopyableId`, created date, and `TenantRowActions`.
- **Row actions:** `TenantRowActions` (`TenantsSection.tsx:116-161`) — Edit (Pencil → `onEdit`) and Delete (Trash2 destructive → `onDelete`) buttons, hover-revealed.
- **Edit dialog:** `EditTenantDialog.tsx:45-102` — edits **avatar** (`AvatarUpload`) + **name** (`Input`), saves via `updateTenantAction` + `uploadTenantAvatarAction`/`removeTenantAvatarAction`.
- **Avatar:** `TenantAvatar.tsx:12-34` — renders `avatar_url` via image proxy, else initial fallback. Used in list, `ChannelsTable.tsx:72-93` (tenant rows), and `TenantSidebar.tsx:51-58`.
- **i18n:** namespace `tenants` in `messages/en.json` (title, name, editTitle, deleteTitle, deleteDescription, save, etc.). Channels use `editor.channels`.
- **No `is_default` anywhere** — absent from both `TenantRow` types.

### Tenant-avatars storage
- Bucket `tenant-avatars` (public) — `20260326200000_tenants_table.sql:42-43`. Policies (after fix `20260331400000_fix_tenant_avatar_policies.sql:10-42`): public SELECT; INSERT/UPDATE/DELETE for authenticated where `is_org_member(tenant_org_id((storage.foldername(name))[1]::uuid))` (1-arg helper + `tenant_org_id`). Path convention is `{tenantId}/...`.

---

## Architecture by area

### 1. Schema: `is_default` + partial unique index

Migration `<ts>_tenants_default.sql`:

```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- exactly one default tenant per org
CREATE UNIQUE INDEX IF NOT EXISTS tenants_one_default_per_org
  ON public.tenants (org_id) WHERE is_default;
```

No RLS change (the column rides existing policies). The column is added to `LIST_COLUMNS` (`tenantQueries.ts`) so every read surfaces it.

### 2. Atomic org-creation hook

The default tenant **must** be created in the same transaction as the org row — no window where an org has no default tenant. Two viable mechanisms (see Open decisions (b)); both must solve the **`auth.uid()` is NULL in SECURITY DEFINER** caveat that `add_org_creator` already documents (`:121-123`).

**Recommended: an `AFTER INSERT` trigger on `organizations`** mirroring `add_org_creator` (same file, same transaction, runs before `insertOrg` returns):

```sql
CREATE OR REPLACE FUNCTION public.create_default_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE base text; candidate text; n int := 0;
BEGIN
  -- derive hyphen-free base from org name, cap 37, fallback if empty
  base := substr(regexp_replace(lower(new.name), '[^a-z0-9]', '', 'g'), 1, 37);
  IF base = '' OR base IN (<denylist>) THEN base := 'tenant'; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = candidate) LOOP
    n := n + 1; candidate := base || n::text;       -- global-unique slug
  END LOOP;
  INSERT INTO public.tenants (org_id, name, slug, is_default)
  VALUES (new.id, new.name, candidate, true);        -- name = org name (UNIQUE(org_id,name) safe: org is brand-new)
  RETURN new;
END; $$;

CREATE TRIGGER on_org_created_default_tenant
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_default_tenant();
```

- Runs in the org-insert transaction → atomic, no app-level multi-await window. Does **not** depend on `auth.uid()` (unlike `add_org_creator`'s member insert) — the tenant is org-scoped, so the SECURITY-DEFINER null-uid concern doesn't block it. Keep the slug-loop logic identical to the backfill helper (extract a shared SQL function `public.next_default_tenant_slug(org_name text)` used by both trigger and backfill to avoid drift).
- The web/backend `createOrg` path is **unchanged** — the trigger does the work.

### 3. Identity lock + delete guard (three layers)

**DB backstop (triggers in the same migration):**

```sql
CREATE OR REPLACE FUNCTION public.guard_default_tenant_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF old.is_default AND (new.name <> old.name OR new.slug <> old.slug
       OR new.avatar_url IS DISTINCT FROM old.avatar_url
       OR new.is_default <> old.is_default) THEN
    -- allow the avatar-mirror path + rename-mirror path to set these via a session GUC flag
    IF current_setting('app.mirror_default_tenant', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'default tenant identity is locked';
    END IF;
  END IF;
  RETURN new;
END; $$;
CREATE TRIGGER trg_guard_default_tenant_update BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_default_tenant_update();

CREATE OR REPLACE FUNCTION public.guard_default_tenant_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF old.is_default THEN RAISE EXCEPTION 'default tenant cannot be deleted'; END IF;
  RETURN old;
END; $$;
CREATE TRIGGER trg_guard_default_tenant_delete BEFORE DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_default_tenant_delete();
```

The update guard permits identity changes only when the **mirror path** opts in via a transaction-local GUC (`SET LOCAL app.mirror_default_tenant = 'on'`), so legitimate org→tenant mirroring is allowed while user edits are rejected. `is_default` itself is immutable. `org_id` cascade-delete of the org still removes the tenant (the DELETE guard fires per-row but the org deletion is the legitimate path — gate the guard on `current_setting('app.allow_default_tenant_delete', true)` set by the org-delete path, OR rely on `ON DELETE CASCADE` from `organizations` not firing this BEFORE DELETE on tenants — **verify**: cascade deletes DO fire row triggers, so the org-delete path must set the bypass GUC).

**Backend route guards (defense in depth + clean error):**
- `handleUpdateTenant` (`updateTenant.ts`): fetch the row; if `is_default`, reject name change with 409/403 `default_tenant_locked` (the name is mirror-only).
- `handleDeleteTenant` (`deleteTenant.ts`): if `is_default`, reject with 403 `default_tenant_undeletable`.
- Tenant avatar handlers (`POST/DELETE /:tenantId/avatar`): reject direct avatar edits on the default tenant (its avatar is org-mirrored).
- Web-channel + future MCP-value updates stay **allowed** (operational config is editable).

**Web UI:** see area 6.

### 4. Identity mirroring (name + slug on org rename)

The default tenant's `name` mirrors the org name and its `slug` is derived from it. On **org rename** (`handleUpdateOrg`, `updateOrg.ts`), after the org update succeeds, update the org's default tenant: `name := newOrgName`; recompute slug only if the derived base changed (collision-safe via `findUniqueTenantSlug`), inside the mirror GUC. Edge case: `UNIQUE(org_id,name)` — if the org is renamed to collide with an existing **non-default** tenant's name in the same org, the mirror update fails; handle by suffixing the default tenant's name or surfacing a clear error (recommend: append nothing to name but let slug stay unique; if name collides, reject the org rename with a descriptive error rather than silently diverging identity). Add a backend query `updateDefaultTenantIdentity(orgId, name)` that sets the GUC and updates name+slug.

### 5. Avatar mirroring

Org avatar is the source of truth; default tenant avatar follows it at three points: `handleUploadAvatar` (set/change), `handleRemoveAvatar` (clear), and the creation trigger/backfill (copy current org avatar). **Mechanism is Open decision (a).** Whichever is chosen, the sync is invoked from the backend org-avatar handlers (after `updateOrgFields`), writing `tenants.avatar_url` for the org's default tenant under the mirror GUC. The tenant Edit UI hides the avatar control for the default tenant regardless.

### 6. `is_default` propagation (types, guards, queries, UI)

- **Row type:** add `is_default: boolean` to **both** `TenantRow` (`tenantQueries.ts:7-17`, `lib/tenants.ts:8-18`).
- **Type guards:** add `'is_default' in value` to web `isTenantRow` (`lib/tenants.ts:29-39`); backend guard (`tenantQueries.ts:23-26`) optionally — keep minimal but include for parity.
- **Queries:** add `is_default` to `LIST_COLUMNS`; keep `getTenantsByOrg` ordering but **sort default first** (e.g. `.order('is_default', {ascending:false}).order('created_at',{ascending:false})`) so SP4's "default tenant first" matrix requirement is satisfied at the data layer.
- **UI per-row special-casing** (`TenantsSection.tsx`):
  - `TenantRowActions` (`:116-161`): when `tenant.is_default`, **hide the Delete button** and render a small **"Default" badge** next to the name. Edit-button treatment is Open decision (c).
  - The row `Link` stays (default tenant is navigable like any other).
  - `EditTenantDialog.tsx`: hide the `AvatarUpload` control and make `name` read-only for the default tenant (mirrors org).
  - `ChannelsTable.tsx` / `TenantSidebar.tsx`: optional "Default" marker; no behavioral change (channels remain editable).
- **i18n:** add to `tenants` namespace: `defaultBadge` ("Default"), `defaultLockedHint` ("Name and avatar mirror the organization"), `defaultUndeletable` (delete error). Add translations to **all** locale files, not just `en.json`.

## Migration & backfill

Single migration `<ts>_tenants_default.sql` (ordered): (1) add column + partial unique index; (2) shared slug helper `next_default_tenant_slug`; (3) `create_default_tenant` trigger; (4) guard triggers; (5) **backfill**.

**Backfill** — one org-named default tenant per existing org, idempotent:

```sql
DO $backfill$
DECLARE o record; slug text;
BEGIN
  FOR o IN SELECT id, name, avatar_url FROM public.organizations
           WHERE NOT EXISTS (SELECT 1 FROM public.tenants t
                             WHERE t.org_id = organizations.id AND t.is_default)
  LOOP
    slug := public.next_default_tenant_slug(o.name);   -- global-unique, format-safe, denylist-safe
    INSERT INTO public.tenants (org_id, name, slug, is_default, avatar_url)
    VALUES (o.id, o.name, slug, true, o.avatar_url)     -- mirror current org avatar (URL or copied per Open decision a)
    ON CONFLICT DO NOTHING;                              -- idempotent vs the partial unique index
  END LOOP;
END $backfill$;
```

- **Idempotent:** the `NOT EXISTS ... is_default` guard + `ON CONFLICT DO NOTHING` make re-runs safe. Per CLAUDE.md, this is a **migration file only** — the user applies it.
- **Name collision risk:** if an existing org already has a non-default tenant named exactly the org name, `UNIQUE(org_id,name)` blocks the insert. Backfill must detect this and either (i) skip + log (org keeps zero default — bad for SP4) or (ii) promote that existing same-named tenant to `is_default=true` instead of inserting. **Recommend (ii):** `UPDATE ... SET is_default=true WHERE org_id=o.id AND name=o.name` when an exact-name tenant exists, else INSERT. This avoids creating a phantom duplicate and satisfies "exactly one default."
- **Slug collisions** across orgs handled by `next_default_tenant_slug`'s global-unique loop.

## Error handling

- Direct user edit of default-tenant name/slug/avatar, or delete: blocked at DB (raises), surfaced by backend as `default_tenant_locked` / `default_tenant_undeletable` with a clear message; web hides the controls so this is a backstop.
- Org rename colliding with an existing tenant name in the org: reject the org rename with a descriptive error (don't let identity diverge).
- Backfill encountering an org with a same-named non-default tenant: promote it (decision (ii) above), never silently leave the org without a default.
- Org cascade-delete: org-delete path sets the bypass GUC so the default tenant deletes with its org; verify cascade triggers fire and are bypassed.
- Mirror path failure (e.g. avatar copy fails): log + leave tenant avatar stale rather than failing the org operation; org avatar remains source of truth and a later sync corrects it.

## Testing

- **DB/migration:** column + partial unique index (second `is_default` insert for same org rejected); `create_default_tenant` trigger fires on org insert (atomic — org with no default never observable); slug helper produces format-valid, denylist-safe, globally-unique slugs incl. collision suffixing and empty/all-symbol org names; backfill creates exactly one default per org, idempotent on re-run, promotes a pre-existing same-named tenant rather than duplicating.
- **Guards:** update guard rejects name/slug/avatar change on default tenant; permits when mirror GUC set; permits web-channel/MCP-value edits; `is_default` immutable; delete guard rejects default-tenant delete but allows org cascade-delete via bypass GUC.
- **Mirroring:** org rename updates default tenant name+slug (collision-safe); org avatar set/change/remove updates default tenant avatar; rename-to-existing-tenant-name rejected.
- **Backend routes:** `PATCH /tenants/:id` and `DELETE /tenants/:id` reject the default tenant with the right status/code before hitting the DB; non-default unaffected (regression).
- **Types/guards:** `isTenantRow` accepts rows with `is_default`; `LIST_COLUMNS` surfaces it; default sorts first.
- **Web (component):** default tenant shows "Default" badge, no Delete button, Edit dialog avatar hidden + name read-only (or per decision (c)); non-default rows unchanged.
- **i18n:** new keys present in all locales.

## Open decisions (need user input)

**(a) Avatar mirroring mechanism.** Options: (i) **copy the org avatar bytes** into `tenant-avatars/{tenantId}/avatar` on every sync (self-contained tenant bucket, matches existing tenant-avatar path/policy convention, but duplicates storage and adds a copy step + failure mode); (ii) **store the cross-bucket `org-avatars` URL** directly in `tenants.avatar_url` (zero copy, always in sync by reference, but couples the tenant to the org bucket and means `TenantAvatar` renders an `org-avatars` URL — fine since both buckets are public and `TenantAvatar` just proxies any URL). **Recommendation: (ii) cross-bucket URL reference** — simplest, no copy failure mode, inherently stays in sync; the avatar control is hidden for the default tenant anyway so no one edits it through the tenant bucket. The backfill and mirror paths just write `org.avatar_url` into the tenant row.

**(b) Org-creation atomicity mechanism.** Options: (i) **`AFTER INSERT` trigger** on `organizations` (atomic in the insert transaction, mirrors the proven `add_org_creator`, no app changes, independent of `auth.uid()` since the tenant is org-scoped); (ii) **wrap org+tenant creation in an RPC/transaction** called from `createOrg.ts` (explicit, testable in app code, but is a larger refactor of the current plain-insert flow and still must run `provisionOpenRouterKey`/bloom-filter outside it). **Recommendation: (i) trigger** — smallest, atomic, consistent with the existing org-creation trigger pattern; the `auth.uid()` NULL caveat that constrains `add_org_creator` does not apply because creating an org-scoped tenant needs no user id.

**(c) Default-tenant Edit dialog treatment.** Options: (i) **suppress the Edit button entirely** for the default tenant (cleanest — nothing user-editable is exposed there today since channels/MCP live elsewhere; but loses a place to view identity); (ii) **render the Edit dialog read-only** (name disabled, avatar control hidden, with a "mirrors the organization" hint) so users understand *why* it's locked. **Recommendation: (ii) read-only dialog with explanatory hint** — discoverability and consistency (the row still has an Edit affordance), and it sets up SP4 where the same dialog/row will host editable operational config; suppressing the button now would force re-adding it in SP4.

## Out of scope

- Per-tenant MCP config, matrix UI, discovery, snapshot/runtime resolution (SP4).
- Making the default tenant's channels/MCP values special — they are ordinary editable operational config.
- Tenant-avatar bucket policy changes (existing policies suffice for whichever mirroring mechanism is chosen).
- `org_env_variables` / OAuth tenant-scoping (SP4 / stays org-scoped).
- Removing the duplicated `TenantRow`/`isTenantRow` definitions (pre-existing; out of SP1's blast radius — just keep both in sync for `is_default`).
