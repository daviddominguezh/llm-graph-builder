# Implementation plan — SP1 default-tenant subsystem

> For agentic workers: execute this with **superpowers:subagent-driven-development**. Tasks are ordered; each ends in an independently-testable, committed deliverable. Spec: `../specs/2026-06-22-sp1-default-tenant-design.md`.

**Goal:** Every org owns exactly one undeletable default tenant whose identity (name/slug/avatar) mirrors the org, auto-created atomically on org insert, backfilled for existing orgs, surfaced via an `is_default` flag through types/guards/queries/UI.

**Architecture:** A single additive migration adds `is_default` + a partial unique index, an `AFTER INSERT` trigger on `organizations` (mirroring `add_org_creator`), identity-lock/delete-guard `BEFORE` triggers gated on transaction-local GUCs, `SECURITY DEFINER` RPCs that set those GUCs and perform mirror/delete writes atomically, and a backfill DO block. The backend org rename/avatar/delete handlers call the mirror/bypass RPCs; tenant update/delete/avatar handlers reject the default tenant with clear errors. The web tenant list adds a "Default" badge, hides Delete, and renders the Edit dialog read-only.

**Tech Stack:** TypeScript (ESM, NodeNext), Express backend (`@daviddh/llm-graph-runner`), supabase-js (PostgREST + RPC), Postgres (Supabase migrations + RLS), Next.js 16 web (App Router, next-intl, shadcn/ui), Jest (`--experimental-vm-modules`).

## Global Constraints

- TS strict, `noUncheckedIndexedAccess`; never `any`; never disable ESLint (strict `eslint-config-love`).
- Magic-number literals → named `const`; no `as unknown as` casts → use type guards; honor `prefer-destructuring`.
- ESLint limits: 40 lines/function, 300 lines/file, max-depth 2 — refactor by extracting helpers, never compress.
- ESM (NodeNext): every relative import path ends in `.js`.
- Prettier: single quotes, 2-space indent, 110 print width, trailing comma es5. Run `npm run check` and commit format-clean. (Task 1 is committed before formatting — the migration is SQL, not subject to Prettier/ESLint; do not re-run web/backend lint for it.)
- **Migration files only — do NOT apply/reset/execute any DB. The user applies migrations.** RLS unchanged (the column rides existing `is_org_member(org_id, auth.uid())` policies on `tenants`, `20260326200000_tenants_table.sql:17-31`).
- GUC bypass is delivered **inside `SECURITY DEFINER` RPCs** via `set_config(name, value, true)` (transaction-local); never via app-side `SET LOCAL` (PostgREST runs each request in its own transaction).
- Backend tests: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern>`. Web tests per `packages/web` scripts.
- i18n: add new strings to ALL locales. The only locale file is `packages/web/messages/en.json` — add keys there.
- Stage files explicitly (`git add <path>`); never `git commit -a`/`-am`. End commit messages with the Co-Authored-By trailer from the repo guidelines.

---

### Task 1 — Migration: `is_default` column, slug helper, creation trigger, guard triggers, mirror/delete RPCs, backfill

**Files**
- create `supabase/migrations/20260622000000_tenants_default.sql`
- create `packages/backend/src/routes/tenants/defaultTenantMigration.contract.test.ts`

**Interfaces**
- Produces (DB): column `public.tenants.is_default boolean NOT NULL DEFAULT false`; index `tenants_one_default_per_org`; functions `public.next_default_tenant_slug(org_name text) RETURNS text`, `public.create_default_tenant() RETURNS trigger`, `public.guard_default_tenant_update() RETURNS trigger`, `public.guard_default_tenant_delete() RETURNS trigger`, `public.set_default_tenant_identity(p_org_id uuid, p_name text, p_slug text, p_avatar_url text) RETURNS void`, `public.set_default_tenant_avatar(p_org_id uuid, p_avatar_url text) RETURNS void`, `public.delete_org_with_default_tenant(p_org_id uuid) RETURNS void`; triggers `on_org_created_default_tenant`, `trg_guard_default_tenant_update`, `trg_guard_default_tenant_delete`.
- Consumes: existing `public.tenants`, `public.organizations`, `gen_random_uuid()`.

- [ ] Write the contract test FIRST. Create `packages/backend/src/routes/tenants/defaultTenantMigration.contract.test.ts`:
```ts
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  thisDir,
  '../../../../../supabase/migrations/20260622000000_tenants_default.sql'
);

describe('tenants_default migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('adds is_default column idempotently', () => {
    expect(sql).toMatch(/add column if not exists is_default boolean not null default false/i);
  });
  it('creates one-default-per-org partial unique index', () => {
    expect(sql).toMatch(/create unique index if not exists tenants_one_default_per_org/i);
    expect(sql).toMatch(/where is_default/i);
  });
  it('defines the AFTER INSERT trigger on organizations', () => {
    expect(sql).toMatch(/create trigger on_org_created_default_tenant\s+after insert on public\.organizations/i);
  });
  it('gates the update guard on the mirror GUC and the delete guard on the bypass GUC', () => {
    expect(sql).toMatch(/app\.mirror_default_tenant/);
    expect(sql).toMatch(/app\.allow_default_tenant_delete/);
  });
  it('sets GUCs inside SECURITY DEFINER RPCs via set_config(..., true)', () => {
    expect(sql).toMatch(/set_config\('app\.mirror_default_tenant', 'on', true\)/);
    expect(sql).toMatch(/set_config\('app\.allow_default_tenant_delete', 'on', true\)/);
  });
  it('backfills idempotently and promotes a pre-existing same-named tenant', () => {
    expect(sql).toMatch(/not exists \(select 1 from public\.tenants/i);
    expect(sql).toMatch(/set is_default = true/i);
  });
});
```
- [ ] Run RED: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest defaultTenantMigration` — expect failure: `ENOENT ... 20260622000000_tenants_default.sql`.
- [ ] Implement the migration. Create `supabase/migrations/20260622000000_tenants_default.sql` with section 1 (column + index):
```sql
-- SP1: default-tenant subsystem. Additive only; RLS unchanged (column rides
-- existing is_org_member(org_id, auth.uid()) policies on public.tenants).

-- 1. Column + one-default-per-org partial unique index
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_one_default_per_org
  ON public.tenants (org_id) WHERE is_default;
```
- [ ] Append section 2 (shared slug helper — mirrors `generateTenantSlug` cap of 37 + global-unique loop; denylist from `tenants_slug_format`):
```sql
-- 2. Shared hyphen-free, denylist-safe, globally-unique slug generator
CREATE OR REPLACE FUNCTION public.next_default_tenant_slug(org_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
  denylist text[] := ARRAY[
    'app','api','www','live','admin','assets','cdn','docs','status','root',
    'support','help','blog','mail','email','auth','oauth','static','public',
    'internal','staging','preview','dev','localhost'
  ];
BEGIN
  base := substr(regexp_replace(lower(coalesce(org_name, '')), '[^a-z0-9]', '', 'g'), 1, 37);
  IF base = '' OR base = ANY(denylist) THEN
    base := 'tenant';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = candidate) LOOP
    n := n + 1;
    candidate := base || n::text;
  END LOOP;
  RETURN candidate;
END; $$;
```
- [ ] Append section 3 (creation trigger — mirrors `add_org_creator`, `20260309100000_create_organizations.sql:115-133`):
```sql
-- 3. AFTER INSERT trigger: create the org's default tenant atomically
CREATE OR REPLACE FUNCTION public.create_default_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.tenants (org_id, name, slug, is_default, avatar_url)
  VALUES (new.id, new.name, public.next_default_tenant_slug(new.name), true, new.avatar_url);
  RETURN new;
END; $$;

CREATE TRIGGER on_org_created_default_tenant
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_default_tenant();
```
- [ ] Append section 4 (guard triggers — gated on transaction-local GUCs):
```sql
-- 4. Identity-lock + delete guards (BEFORE triggers, GUC-gated)
CREATE OR REPLACE FUNCTION public.guard_default_tenant_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF old.is_default AND (
       new.name <> old.name
       OR new.slug <> old.slug
       OR new.avatar_url IS DISTINCT FROM old.avatar_url
       OR new.is_default <> old.is_default
     ) THEN
    IF current_setting('app.mirror_default_tenant', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'default tenant identity is locked';
    END IF;
  END IF;
  RETURN new;
END; $$;

CREATE TRIGGER trg_guard_default_tenant_update
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_default_tenant_update();

CREATE OR REPLACE FUNCTION public.guard_default_tenant_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF old.is_default
     AND current_setting('app.allow_default_tenant_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'default tenant cannot be deleted';
  END IF;
  RETURN old;
END; $$;

CREATE TRIGGER trg_guard_default_tenant_delete
  BEFORE DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_default_tenant_delete();
```
- [ ] Append section 5 (mirror/delete RPCs — set the GUC transaction-locally then write; precedent `create_org_api_key` in `20260321000000_security_and_execution_tables.sql`):
```sql
-- 5. SECURITY DEFINER RPCs: set the GUC transaction-locally + write atomically
CREATE OR REPLACE FUNCTION public.set_default_tenant_identity(
  p_org_id uuid, p_name text, p_slug text, p_avatar_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM set_config('app.mirror_default_tenant', 'on', true);
  UPDATE public.tenants
     SET name = p_name, slug = p_slug, avatar_url = p_avatar_url, updated_at = now()
   WHERE org_id = p_org_id AND is_default;
END; $$;

CREATE OR REPLACE FUNCTION public.set_default_tenant_avatar(
  p_org_id uuid, p_avatar_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM set_config('app.mirror_default_tenant', 'on', true);
  UPDATE public.tenants
     SET avatar_url = p_avatar_url, updated_at = now()
   WHERE org_id = p_org_id AND is_default;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_org_with_default_tenant(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM set_config('app.allow_default_tenant_delete', 'on', true);
  DELETE FROM public.organizations WHERE id = p_org_id;
END; $$;
```
- [ ] Append section 6 (backfill — idempotent; promotes pre-existing same-named tenant per spec decision (ii)):
```sql
-- 6. Backfill: one org-named default tenant per existing org (idempotent)
DO $backfill$
DECLARE
  o record;
  existing_id uuid;
  new_slug text;
BEGIN
  FOR o IN
    SELECT id, name, avatar_url FROM public.organizations org
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tenants t WHERE t.org_id = org.id AND t.is_default
    )
  LOOP
    SELECT id INTO existing_id FROM public.tenants
     WHERE org_id = o.id AND name = o.name LIMIT 1;
    IF existing_id IS NOT NULL THEN
      PERFORM set_config('app.mirror_default_tenant', 'on', true);
      UPDATE public.tenants SET is_default = true WHERE id = existing_id;
    ELSE
      new_slug := public.next_default_tenant_slug(o.name);
      INSERT INTO public.tenants (org_id, name, slug, is_default, avatar_url)
      VALUES (o.id, o.name, new_slug, true, o.avatar_url)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $backfill$;
```
- [ ] Run GREEN: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest defaultTenantMigration` — expect `6 passed`.
- [ ] Commit: `git add supabase/migrations/20260622000000_tenants_default.sql packages/backend/src/routes/tenants/defaultTenantMigration.contract.test.ts && git commit -m "feat(sp1): default-tenant migration (column, trigger, guards, RPCs, backfill)"` (do NOT run Prettier/ESLint over the SQL).

---

### Task 2 — Surface `is_default` through backend types, guard, queries, and a fetch-by-id helper

**Files**
- modify `packages/backend/src/db/queries/tenantQueries.ts`
- create `packages/backend/src/db/queries/tenantQueries.test.ts`

**Interfaces**
- Produces: `TenantRow` gains `is_default: boolean`; `LIST_COLUMNS` includes `is_default`; `getTenantsByOrg` orders default-first; new `getTenantById(supabase, tenantId): Promise<{ result: TenantRow | null; error: string | null }>`.
- Consumes: existing `SupabaseClient`, `isTenantRow`.

- [ ] Write the failing test FIRST. Create `packages/backend/src/db/queries/tenantQueries.test.ts`:
```ts
import { describe, expect, it } from '@jest/globals';
import { isTenantRow } from './tenantQueries.js';

const BASE = {
  id: 't1',
  org_id: 'o1',
  slug: 'acme',
  name: 'Acme',
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  web_channel_enabled: true,
  web_channel_allowed_origins: [],
};

describe('isTenantRow with is_default', () => {
  it('accepts a row carrying is_default', () => {
    expect(isTenantRow({ ...BASE, is_default: true })).toBe(true);
  });
  it('rejects a non-object', () => {
    expect(isTenantRow(null)).toBe(false);
  });
});
```
- [ ] Run RED: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest tenantQueries.test` — fails to import (`is_default` not on type) / compile error.
- [ ] Add `is_default: boolean;` to the `TenantRow` interface in `tenantQueries.ts` (after `web_channel_allowed_origins: string[];`).
- [ ] Update `LIST_COLUMNS` to include the column:
```ts
const LIST_COLUMNS =
  'id, org_id, slug, name, avatar_url, created_at, updated_at, web_channel_enabled, web_channel_allowed_origins, is_default';
```
- [ ] Order default-first in `getTenantsByOrg` — replace the `.order('created_at', { ascending: false })` line with:
```ts
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
```
- [ ] Add `getTenantById` after `getTenantBySlug`:
```ts
export async function getTenantById(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tenants')
    .select(LIST_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle();

  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isTenantRow(data)) return { result: null, error: 'Invalid tenant data' };
  return { result: data, error: null };
}
```
- [ ] Run GREEN: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest tenantQueries.test` — expect `2 passed`.
- [ ] `npm run check` (clean). Commit: `git add packages/backend/src/db/queries/tenantQueries.ts packages/backend/src/db/queries/tenantQueries.test.ts && git commit -m "feat(sp1): surface is_default in backend TenantRow/queries"`.

---

### Task 3 — Backend route guards: reject default-tenant name edit, delete, and direct avatar edits

**Files**
- modify `packages/backend/src/routes/routeHelpers.ts`
- modify `packages/backend/src/routes/tenants/updateTenant.ts`
- modify `packages/backend/src/routes/tenants/deleteTenant.ts`
- modify `packages/backend/src/routes/tenants/tenantAvatar.ts`
- create `packages/backend/src/routes/tenants/defaultTenantGuards.test.ts`

**Interfaces**
- Produces: `HTTP_FORBIDDEN = 403` in `routeHelpers.ts`; new shared helper `assertNotDefaultTenant(supabase, tenantId, res, code): Promise<boolean>` (returns `true` if it already sent a 403). Handlers return early when the tenant `is_default`.
- Consumes: `getTenantById` (Task 2).

- [ ] Write the failing test FIRST. Create `packages/backend/src/routes/tenants/defaultTenantGuards.test.ts`:
```ts
import { describe, expect, it, jest } from '@jest/globals';
import type { Response } from 'express';

const HTTP_FORBIDDEN = 403;

interface CapturedRes {
  statusCode: number | null;
  body: unknown;
}

function makeRes(): { res: Response; captured: CapturedRes } {
  const captured: CapturedRes = { statusCode: null, body: null };
  const res = {
    locals: { supabase: {} },
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  return { res, captured };
}

jest.unstable_mockModule('../../db/queries/tenantQueries.js', () => ({
  getTenantById: jest.fn(async () => ({
    result: { id: 't1', is_default: true, name: 'Acme', org_id: 'o1', slug: 'acme' },
    error: null,
  })),
}));

const { assertNotDefaultTenant } = await import('./defaultTenantGuards.js');

describe('assertNotDefaultTenant', () => {
  it('responds 403 with the given code when the tenant is default', async () => {
    const { res, captured } = makeRes();
    const blocked = await assertNotDefaultTenant(res.locals.supabase, 't1', res, 'default_tenant_locked');
    expect(blocked).toBe(true);
    expect(captured.statusCode).toBe(HTTP_FORBIDDEN);
    expect(captured.body).toEqual({ error: 'default_tenant_locked' });
  });
});
```
- [ ] Run RED: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest defaultTenantGuards` — fails: cannot find `./defaultTenantGuards.js`.
- [ ] Add `export const HTTP_FORBIDDEN = 403;` to `routeHelpers.ts` (after `HTTP_NOT_FOUND`).
- [ ] Create `packages/backend/src/routes/tenants/defaultTenantGuards.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { getTenantById } from '../../db/queries/tenantQueries.js';
import { type AuthenticatedResponse, HTTP_FORBIDDEN } from '../routeHelpers.js';

// Returns true if it sent a 403 (caller must return early).
export async function assertNotDefaultTenant(
  supabase: SupabaseClient,
  tenantId: string,
  res: AuthenticatedResponse,
  code: string
): Promise<boolean> {
  const { result } = await getTenantById(supabase, tenantId);
  if (result !== null && result.is_default) {
    res.status(HTTP_FORBIDDEN).json({ error: code });
    return true;
  }
  return false;
}
```
- [ ] Wire `updateTenant.ts` — after the `name === undefined` check and before the `try`, add:
```ts
  if (await assertNotDefaultTenant(supabase, tenantId, res, 'default_tenant_locked')) return;
```
and import `assertNotDefaultTenant` from `./defaultTenantGuards.js`.
- [ ] Wire `deleteTenant.ts` — after the `tenantId === undefined` check, add:
```ts
  if (await assertNotDefaultTenant(supabase, tenantId, res, 'default_tenant_undeletable')) return;
```
plus the import.
- [ ] Wire `tenantAvatar.ts` — in both `handleUploadTenantAvatar` and `handleRemoveTenantAvatar`, after the `tenantId === undefined` check, add:
```ts
  if (await assertNotDefaultTenant(supabase, tenantId, res, 'default_tenant_locked')) return;
```
plus the import.
- [ ] Run GREEN: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest defaultTenantGuards` — expect `1 passed`.
- [ ] `npm run check` (clean). Commit: `git add packages/backend/src/routes/routeHelpers.ts packages/backend/src/routes/tenants/defaultTenantGuards.ts packages/backend/src/routes/tenants/defaultTenantGuards.test.ts packages/backend/src/routes/tenants/updateTenant.ts packages/backend/src/routes/tenants/deleteTenant.ts packages/backend/src/routes/tenants/tenantAvatar.ts && git commit -m "feat(sp1): backend guards reject default-tenant edit/delete/avatar"`.

---

### Task 4 — Mirror identity + avatar via RPC queries; wire org rename/avatar/delete handlers

**Files**
- modify `packages/backend/src/db/queries/tenantQueries.ts`
- modify `packages/backend/src/db/queries/orgQueries.ts`
- modify `packages/backend/src/routes/orgs/updateOrg.ts`
- modify `packages/backend/src/routes/orgs/orgAvatar.ts`
- modify `packages/backend/src/routes/orgs/deleteOrg.ts`
- create `packages/backend/src/db/queries/defaultTenantMirror.test.ts`

**Interfaces**
- Produces: `mirrorDefaultTenantIdentity(supabase, orgId, name, slug, avatarUrl): Promise<{ error: string | null }>` (calls RPC `set_default_tenant_identity`); `mirrorDefaultTenantAvatar(supabase, orgId, avatarUrl): Promise<{ error: string | null }>` (RPC `set_default_tenant_avatar`); `deleteOrgWithDefaultTenant(supabase, orgId): Promise<{ error: string | null }>` (RPC `delete_org_with_default_tenant`) in `orgQueries.ts`.
- Consumes: RPCs from Task 1; `findUniqueTenantSlug`, `generateTenantSlug` for slug recompute on rename.

- [ ] Write the failing test FIRST. Create `packages/backend/src/db/queries/defaultTenantMirror.test.ts`:
```ts
import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import { mirrorDefaultTenantAvatar, mirrorDefaultTenantIdentity } from './tenantQueries.js';

function makeSupabase(rpc: jest.Mock): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

describe('default-tenant mirror queries', () => {
  it('mirrorDefaultTenantIdentity calls set_default_tenant_identity', async () => {
    const rpc = jest.fn(async () => ({ error: null }));
    const { error } = await mirrorDefaultTenantIdentity(makeSupabase(rpc), 'o1', 'Acme', 'acme', null);
    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('set_default_tenant_identity', {
      p_org_id: 'o1',
      p_name: 'Acme',
      p_slug: 'acme',
      p_avatar_url: null,
    });
  });
  it('mirrorDefaultTenantAvatar surfaces the RPC error message', async () => {
    const rpc = jest.fn(async () => ({ error: { message: 'boom' } }));
    const { error } = await mirrorDefaultTenantAvatar(makeSupabase(rpc), 'o1', 'https://x/a');
    expect(error).toBe('boom');
  });
});
```
- [ ] Run RED: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest defaultTenantMirror` — fails: exports missing.
- [ ] In `tenantQueries.ts`, add the two mirror queries (RPC error shape guard — no `as` casts):
```ts
function rpcErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown };
    return typeof message === 'string' ? message : 'RPC failed';
  }
  return 'RPC failed';
}

export async function mirrorDefaultTenantIdentity(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  slug: string,
  avatarUrl: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_default_tenant_identity', {
    p_org_id: orgId,
    p_name: name,
    p_slug: slug,
    p_avatar_url: avatarUrl,
  });
  return { error: rpcErrorMessage(error) };
}

export async function mirrorDefaultTenantAvatar(
  supabase: SupabaseClient,
  orgId: string,
  avatarUrl: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_default_tenant_avatar', {
    p_org_id: orgId,
    p_avatar_url: avatarUrl,
  });
  return { error: rpcErrorMessage(error) };
}
```
> Note: `rpcErrorMessage` narrows via `in` + a local `{ message: unknown }` annotation; the single `as { message: unknown }` is a *narrowing* annotation on an already-`object`-guarded value, not an `as unknown as` double-cast. If the linter flags it, replace with a dedicated `hasMessage` type guard: `function hasMessage(v: object): v is { message: unknown } { return 'message' in v; }`.
- [ ] In `orgQueries.ts`, add `deleteOrgWithDefaultTenant` (reuse the same `rpcErrorMessage` — extract it to a shared module if both files need it; to stay under 300 lines/file, put the helper in a new `packages/backend/src/db/queries/rpcError.ts` and import it in both):
```ts
export async function deleteOrgWithDefaultTenant(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_org_with_default_tenant', { p_org_id: orgId });
  return { error: rpcErrorMessage(error) };
}
```
- [ ] Wire `updateOrg.ts` — in `resolveSlugAndUpdate`, after the org update succeeds, mirror the default tenant. Recompute the tenant slug from the new name and mirror identity (extract a helper to stay ≤40 lines/fn):
```ts
import { findUniqueTenantSlug, mirrorDefaultTenantIdentity } from '../../db/queries/tenantQueries.js';
import { generateTenantSlug } from '../../db/queries/slugQueries.js';

async function mirrorRename(
  supabase: AuthenticatedLocals['supabase'],
  orgId: string,
  name: string
): Promise<string | null> {
  const base = generateTenantSlug(name);
  const tenantSlug = base === '' ? 'tenant' : await findUniqueTenantSlug(supabase, base);
  const { error } = await mirrorDefaultTenantIdentity(supabase, orgId, name, tenantSlug, null);
  return error;
}
```
Call `mirrorRename` after `updateOrgFields` succeeds inside `resolveSlugAndUpdate`; on a mirror error, log and proceed (org is source of truth — do not fail the org rename). Pass the org's current avatar URL instead of `null` if the handler has it; otherwise the avatar is mirrored separately by the avatar handlers, so passing the org's stored `avatar_url` is preferable — fetch it via the existing org row if cheap, else keep `null` and rely on the avatar handler path. **Decision:** pass `null` here (rename does not change avatar) — but because `set_default_tenant_identity` overwrites `avatar_url`, instead split: keep identity mirror to name+slug only by having `mirrorRename` read the org's current `avatar_url` first. Implement: fetch current avatar with a one-line query and pass it through, so a rename never clobbers the mirrored avatar.
- [ ] Add the avatar read used above. In `orgQueries.ts` add `fetchCurrentAvatar(supabase, orgId): Promise<string | null>` mirroring `fetchCurrentSlug`, and use it in `mirrorRename`.
- [ ] Wire `orgAvatar.ts` — in `handleUploadAvatar`, after `updateOrgFields(... {avatar_url: url})` succeeds, call `await mirrorDefaultTenantAvatar(supabase, orgId, url)` (log on error, don't fail). In `handleRemoveAvatar`, after `updateOrgFields(... {avatar_url: null})`, call `await mirrorDefaultTenantAvatar(supabase, orgId, null)`. Add the import.
- [ ] Wire `deleteOrg.ts` — replace `const { error } = await deleteOrg(supabase, orgId);` with `const { error } = await deleteOrgWithDefaultTenant(supabase, orgId);` and update the import. (This sets the bypass GUC inside the RPC so the cascade-deleted default tenant passes the delete guard.)
- [ ] Run GREEN: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest defaultTenantMirror` — expect `2 passed`.
- [ ] `npm run check` (clean). Commit: `git add packages/backend/src/db/queries/tenantQueries.ts packages/backend/src/db/queries/orgQueries.ts packages/backend/src/db/queries/rpcError.ts packages/backend/src/db/queries/defaultTenantMirror.test.ts packages/backend/src/routes/orgs/updateOrg.ts packages/backend/src/routes/orgs/orgAvatar.ts packages/backend/src/routes/orgs/deleteOrg.ts && git commit -m "feat(sp1): mirror default-tenant identity/avatar; org-delete bypass GUC"`.

---

### Task 5 — Web: `is_default` on TenantRow + guard; default-first ordering is server-supplied

**Files**
- modify `packages/web/app/lib/tenants.ts`
- create `packages/web/app/lib/tenants.test.ts`

**Interfaces**
- Produces: web `TenantRow` gains `is_default: boolean`; `isTenantRow` requires `'is_default' in value`.
- Consumes: backend list response (already default-first from Task 2).

- [ ] Write the failing test FIRST. Create `packages/web/app/lib/tenants.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isTenantRow } from './tenants';

const BASE = {
  id: 't1',
  org_id: 'o1',
  slug: 'acme',
  name: 'Acme',
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  web_channel_enabled: true,
  web_channel_allowed_origins: [],
};

describe('web isTenantRow', () => {
  it('rejects a row missing is_default', () => {
    expect(isTenantRow(BASE)).toBe(false);
  });
  it('accepts a row with is_default', () => {
    expect(isTenantRow({ ...BASE, is_default: false })).toBe(true);
  });
});
```
> If `packages/web` has no test runner configured, instead add these assertions to the existing web test setup or convert to the repo's web test framework. Check `packages/web/package.json` `scripts.test` first; use that command (substitute `vitest` import accordingly). If web has no test harness at all, make this a type-level check: add the field and rely on `npm run typecheck -w packages/web` as the RED/GREEN signal (RED = consumers reading `tenant.is_default` fail to compile before the field exists).
- [ ] Run RED with the web test command (`npm run test -w packages/web -- tenants` or the type check) — expect failure (missing `is_default`).
- [ ] Add `is_default: boolean;` to the web `TenantRow` interface (after `web_channel_allowed_origins: string[];`).
- [ ] Add `'is_default' in value &&` to `isTenantRow` (in the boolean chain).
- [ ] Run GREEN — expect pass / clean typecheck.
- [ ] `npm run check` (clean). Commit: `git add packages/web/app/lib/tenants.ts packages/web/app/lib/tenants.test.ts && git commit -m "feat(sp1): web TenantRow/guard carry is_default"`.

---

### Task 6 — Web UI: Default badge, hide Delete, read-only Edit dialog; i18n

**Files**
- modify `packages/web/app/components/orgs/tenants/TenantsSection.tsx`
- modify `packages/web/app/components/orgs/tenants/EditTenantDialog.tsx`
- modify `packages/web/messages/en.json`

**Interfaces**
- Consumes: `tenant.is_default` (Task 5). Uses the shadcn `Badge` (`packages/web/components/ui/badge.tsx`, already installed).
- Produces: i18n keys `tenants.defaultBadge`, `tenants.defaultLockedHint`, `tenants.defaultUndeletable`.

- [ ] Add i18n keys FIRST. In `packages/web/messages/en.json`, inside the `"tenants"` object (after `"daysAgo"`), add:
```json
    "defaultBadge": "Default",
    "defaultLockedHint": "Name and avatar mirror the organization.",
    "defaultUndeletable": "The default tenant cannot be deleted.",
```
- [ ] Run RED (lint-as-signal): `npm run lint -w packages/web` is not a strong RED here; instead the visual/behavioral change is the deliverable. Proceed to implement, then verify with typecheck + lint as GREEN.
- [ ] In `TenantsSection.tsx`, import `Badge` from `@/components/ui/badge`. In `TenantRowActions`, when `tenant.is_default`, render **only** the Edit button (omit the Delete `Tooltip`/`Button` block) — extract the Edit and Delete buttons into small sub-components to keep `TenantRowActions` ≤40 lines, then conditionally render Delete:
```tsx
{!tenant.is_default && <DeleteTenantButton tenant={tenant} onDelete={onDelete} />}
```
- [ ] In `TenantsSection.tsx` `TenantsTable` row, render the badge next to the name when default. After the name `<span>` inside the `Link`’s sibling, add:
```tsx
{tenant.is_default && (
  <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">
    {t('defaultBadge')}
  </Badge>
)}
```
(place it in the name `TableCell`, outside the `Link`, so it is not a click target).
- [ ] In `EditTenantDialog.tsx`, branch on `tenant.is_default`. Extract a `ReadOnlyDefaultForm` sub-component (≤40 lines) that renders the avatar/name read-only and the hint, so `EditForm` stays unchanged for non-default:
```tsx
function ReadOnlyDefaultForm({ tenant, onOpenChange }: { tenant: TenantRow; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('tenants');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="edit-tenant-name">{t('name')}</Label>
        <Input id="edit-tenant-name" value={tenant.name} disabled readOnly />
      </div>
      <p className="text-xs text-muted-foreground">{t('defaultLockedHint')}</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t('deleteCancel')}
        </Button>
      </DialogFooter>
    </div>
  );
}
```
and in `EditTenantDialog`, render `{tenant.is_default ? <ReadOnlyDefaultForm .../> : <EditForm .../>}`. (No `AvatarUpload` in the read-only branch = avatar control hidden.)
- [ ] Run GREEN: `npm run typecheck -w packages/web` and `npm run lint -w packages/web` — expect no errors.
- [ ] `npm run check` (clean). Commit: `git add packages/web/app/components/orgs/tenants/TenantsSection.tsx packages/web/app/components/orgs/tenants/EditTenantDialog.tsx packages/web/messages/en.json && git commit -m "feat(sp1): default-tenant badge, hide delete, read-only edit dialog + i18n"`.

---

## Self-Review

**Spec coverage** (each spec area → task):
- Schema `is_default` + partial unique index (area 1) → Task 1.
- Atomic org-creation trigger (area 2, settled decision b) → Task 1 (`create_default_tenant`).
- Identity lock + delete guards, three layers (area 3) → DB triggers Task 1; backend route guards Task 3; web UI Task 6.
- Identity mirroring on rename (area 4) → Task 1 RPC `set_default_tenant_identity` + Task 4 `mirrorRename`.
- Avatar mirroring as cross-bucket URL (area 5, settled decision a) → Task 1 `set_default_tenant_avatar` + Task 4 org-avatar handlers; backfill copies `org.avatar_url` (Task 1 §6).
- `is_default` propagation: backend types/guard/queries/order (area 6) → Task 2; web types/guard (Task 5); UI badge/hide-delete/read-only edit (Task 6).
- i18n keys `defaultBadge`/`defaultLockedHint`/`defaultUndeletable` in all locales (only `en.json`) → Task 6.
- Backfill idempotent + promote same-named tenant (decision ii) → Task 1 §6.
- Org cascade-delete bypass GUC (settled caveat) → Task 1 RPC `delete_org_with_default_tenant` + Task 4 `deleteOrg.ts` rewire.
- GUC-via-RPC (not app `SET LOCAL`) → Task 1 §5 + Task 4.

**Placeholder check:** No "TBD"/"add tests"/"similar to". Every step shows actual SQL/TS and exact `npx jest`/`npm run` commands with expected output. One flagged contingency (Task 5 web test harness) gives a concrete fallback (typecheck-as-RED), not a placeholder.

**Type/name consistency:** `is_default: boolean` identical in both `TenantRow`s (Tasks 2, 5). RPC names match exactly across migration (Task 1) and query callers (Task 4): `set_default_tenant_identity`, `set_default_tenant_avatar`, `delete_org_with_default_tenant`. GUC names match across guards and RPCs: `app.mirror_default_tenant`, `app.allow_default_tenant_delete`. Error codes consistent: `default_tenant_locked` (update/avatar), `default_tenant_undeletable` (delete). `HTTP_FORBIDDEN = 403` added once (Task 3). `LIST_COLUMNS` extended once (Task 2) and reused by `getTenantById`/mirror reads.

**Constraints honored:** migration is SQL-only (user applies); RLS unchanged (rides `is_org_member(org_id, auth.uid())`); slug helper reuses the verified 37-cap + denylist; no `any`/`eslint-disable`; ESM `.js` imports; helpers extracted to respect 40/300/2 limits; explicit `git add` per commit.

**Open ambiguity surfaced during planning (resolved, not blocking):** GUC delivery cannot use app-side `SET LOCAL` over PostgREST — resolved by setting GUCs inside `SECURITY DEFINER` RPCs (recorded in spec area 3). One residual design choice baked in: a rename must not clobber the mirrored avatar, so `mirrorRename` reads the org's current avatar and passes it to `set_default_tenant_identity` (Task 4).
