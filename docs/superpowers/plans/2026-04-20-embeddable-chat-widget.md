# Embeddable Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the mock/visual phase of OF-2 — a JavaScript snippet that any third-party website can embed to render an AI chat bubble, with the same URL rendering a fullscreen ChatGPT-style chat when visited directly. Everything is wired end-to-end to the production request path, but the Express backend returns hardcoded responses instead of running the LLM.

**Architecture:** New workspace package `packages/widget` built with Vite producing static files (loader IIFE + SPA) for a wildcard-CDN host (`*.live.openflow.build`). Browser → Next.js route (`/api/chat/*`) → Express backend (`/api/mock-execute/*` now, `/api/agents/*` in step 2). All SSE events follow the existing `PublicExecutionEvent` contract so step 2 is a URL swap.

**Tech Stack:** TypeScript, React 19, Vite 6, Tailwind 4, idb 8, lucide-react, Next.js 16, Express, Jest (backend + web) / Vitest (widget — natural fit with Vite). Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-04-20-embeddable-chat-widget-design.md` — read before starting any task.

---

## Conventions used in this plan

- **Commit after every task.** Commit message format: `<scope>: <imperative summary>` where scope is one of `widget`, `web`, `backend`, `db`, `shared-validation`, `docs`.
- **Stage explicitly.** Never use `git commit -a` or `-am` — always `git add -- <path>` with exact paths. The user works on multiple things in parallel.
- **Run the relevant local test** after writing it and after implementing. Exact commands are given per task.
- **Tests first** where TDD applies (pure helpers, mappers, reducers). For scaffolding tasks (config files, new packages), the "test" is a build/typecheck.
- **Run `npm run check` at the root before the final QA task.** Format + lint + typecheck all packages. This is a project convention from CLAUDE.md.

## Dependency order and handoff checkpoints

```
Group 1  shared-validation package                       (independent)
Group 2  tenant slug refactor (DB + backend)             (needs G1)
Group 3  agent slug CHECK + Zod                          (needs G1)
Group 4  Express mock routes                             (independent of G2/G3 but after G1)
Group 5  Next.js proxy routes                            (needs G4)
Group 6  widget scaffolding (Vite, Tailwind, primitives) (needs G1)
Group 7  widget routing + hostname + UUID + i18n         (needs G6)
Group 8  widget UI port                                  (needs G6)
Group 9  widget storage                                  (needs G6)
Group 10 widget API client                               (needs G6, G8)
Group 11 widget accessibility                            (needs G6)
Group 12 widget modes (embed + standalone)               (needs G7–G11)
Group 13 widget loader                                   (needs G12)
Group 14 widget debug + telemetry                        (needs G13)
Group 15 local dev integration                           (needs G5, G13)
Group 16 manual QA                                       (everything)
```

Groups 4/5 and groups 6–12 can be worked in parallel once Group 1 lands.

---

# Group 1 — Shared validation package

### Task 1: Scaffold `packages/shared-validation`

**Files:**
- Create: `packages/shared-validation/package.json`
- Create: `packages/shared-validation/tsconfig.json`
- Create: `packages/shared-validation/src/index.ts` (empty stub)
- Create: `packages/shared-validation/.gitignore`
- Modify: `package.json` (root) — add `packages/shared-validation` to `workspaces` if not already covered by `packages/*`

- [ ] **Step 1: Create `packages/shared-validation/package.json`**

```json
{
  "name": "@openflow/shared-validation",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --noEmit",
    "test": "NODE_OPTIONS='--experimental-vm-modules' npx jest"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "jest": "^30.2.0",
    "ts-jest": "^29.4.6",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create `packages/shared-validation/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"]
}
```

(If `tsconfig.base.json` doesn't exist at repo root, copy the `compilerOptions` from `packages/backend/tsconfig.json` and adjust; confirm by reading `packages/backend/tsconfig.json` first.)

- [ ] **Step 3: Create empty `src/index.ts` and `.gitignore`**

`src/index.ts`:
```ts
export {};
```

`.gitignore`:
```
dist/
node_modules/
```

- [ ] **Step 4: Run install and typecheck**

```bash
npm install
npm run typecheck -w packages/shared-validation
```

Expected: install succeeds; typecheck passes (empty module).

- [ ] **Step 5: Commit**

```bash
git add -- packages/shared-validation/
git add -- package.json package-lock.json
git commit -m "shared-validation: scaffold workspace package"
```

---

### Task 2: Implement slug validators with tests

**Files:**
- Modify: `packages/shared-validation/src/index.ts`
- Create: `packages/shared-validation/src/index.test.ts`
- Create: `packages/shared-validation/jest.config.js`

- [ ] **Step 1: Create `jest.config.js`**

```js
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
};
```

- [ ] **Step 2: Write failing test `src/index.test.ts`**

```ts
import {
  isValidTenantSlug,
  isValidAgentSlug,
  TENANT_SLUG_REGEX,
  AGENT_SLUG_REGEX,
  RESERVED_TENANT_SLUGS,
} from './index.js';

describe('tenant slug', () => {
  it('accepts lowercase alphanumerics within length', () => {
    expect(isValidTenantSlug('acme')).toBe(true);
    expect(isValidTenantSlug('a1b2c3')).toBe(true);
    expect(isValidTenantSlug('a'.repeat(40))).toBe(true);
  });
  it('rejects hyphens, uppercase, unicode, out-of-range length, empty', () => {
    expect(isValidTenantSlug('acme-corp')).toBe(false);
    expect(isValidTenantSlug('Acme')).toBe(false);
    expect(isValidTenantSlug('cafés')).toBe(false);
    expect(isValidTenantSlug('a'.repeat(41))).toBe(false);
    expect(isValidTenantSlug('')).toBe(false);
  });
  it('rejects reserved', () => {
    for (const r of RESERVED_TENANT_SLUGS) expect(isValidTenantSlug(r)).toBe(false);
  });
});

describe('agent slug', () => {
  it('accepts single-char and hyphenated', () => {
    expect(isValidAgentSlug('a')).toBe(true);
    expect(isValidAgentSlug('customer-care')).toBe(true);
    expect(isValidAgentSlug('sales-bot-v2')).toBe(true);
  });
  it('rejects leading/trailing/double dashes, uppercase, too long', () => {
    expect(isValidAgentSlug('-bad')).toBe(false);
    expect(isValidAgentSlug('bad-')).toBe(false);
    expect(isValidAgentSlug('bad--case')).toBe(false);
    expect(isValidAgentSlug('Bad')).toBe(false);
    expect(isValidAgentSlug('a'.repeat(41))).toBe(false);
    expect(isValidAgentSlug('')).toBe(false);
  });
});

describe('regex exports are used by consumers', () => {
  it('exposes both regex constants for external composition', () => {
    expect(TENANT_SLUG_REGEX.source).toBeTruthy();
    expect(AGENT_SLUG_REGEX.source).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test — expect failure**

```bash
npm test -w packages/shared-validation
```

Expected: test file fails to import (members missing).

- [ ] **Step 4: Implement `src/index.ts`**

```ts
export const TENANT_SLUG_REGEX = /^[a-z0-9]{1,40}$/;
export const AGENT_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const AGENT_SLUG_MAX_LENGTH = 40;

export const RESERVED_TENANT_SLUGS = new Set<string>([
  'app', 'api', 'www', 'live', 'admin', 'assets', 'cdn', 'docs', 'status',
  'root', 'support', 'help', 'blog', 'mail', 'email', 'auth', 'oauth',
  'static', 'public', 'internal', 'staging', 'preview', 'dev', 'localhost',
]);

export function isValidTenantSlug(s: string): boolean {
  if (typeof s !== 'string') return false;
  if (!TENANT_SLUG_REGEX.test(s)) return false;
  return !RESERVED_TENANT_SLUGS.has(s);
}

export function isValidAgentSlug(s: string): boolean {
  return typeof s === 'string' && AGENT_SLUG_REGEX.test(s);
}

export function sortedReservedTenantSlugs(): string[] {
  return [...RESERVED_TENANT_SLUGS].sort();
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
npm test -w packages/shared-validation
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -- packages/shared-validation/src/ packages/shared-validation/jest.config.js
git commit -m "shared-validation: slug validators with reserved list"
```

---

# Group 2 — Tenant slug refactor (DB + backend)

### Task 3: Migration — global tenant slugs, CHECK constraint, new RPC

**Files:**
- Create: `supabase/migrations/20260420300000_tenants_global_slug.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Move tenant slugs from org-scoped to globally unique, add format CHECK,
-- and repoint the tenant_id_by_slug RPC. No tenant rows exist yet
-- (confirmed with product); backfill/normalization unnecessary.

-- Preflight: fail loudly with a descriptive message if staging has rows
-- from the old slug generator (which inserts hyphens). Without this, the
-- CHECK constraint below would fail with a bare check_violation.
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug !~ '^[a-z0-9]{1,40}$') THEN
    RAISE EXCEPTION
      'tenants.slug contains rows incompatible with the hyphen-free format. '
      'Review and normalize before retrying. '
      'Query: SELECT id, slug FROM public.tenants WHERE slug !~ ''^[a-z0-9]{1,40}$'';';
  END IF;
END
$preflight$;

-- Drop RPC first so dependency errors (if any RLS policy references the
-- old signature) surface before schema changes, not after partial success.
DROP FUNCTION IF EXISTS public.tenant_id_by_slug(uuid, text);

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_org_slug_unique;
DROP INDEX IF EXISTS public.idx_tenants_org_slug;

ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);

ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_format
  CHECK (
    slug ~ '^[a-z0-9]{1,40}$'
    AND slug NOT IN (
      'app','api','www','live','admin','assets','cdn','docs','status','root',
      'support','help','blog','mail','email','auth','oauth','static','public',
      'internal','staging','preview','dev','localhost'
    )
  );

-- UNIQUE constraint above auto-creates a supporting index; no explicit CREATE INDEX needed.

CREATE OR REPLACE FUNCTION public.tenant_id_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.tenants WHERE slug = p_slug;
$$;
```

- [ ] **Step 2: Apply migration locally**

```bash
# Whichever is configured for this repo's Supabase dev:
npx supabase db reset
# or
npx supabase migration up
```

Expected: migration applies cleanly. If it fails on existing RLS policies referencing the old 2-arg RPC signature, note the policy names from the error — Task 7 handles that.

- [ ] **Step 3: Verify schema**

```bash
npx supabase db diff --schema public | head -40
```

Expected: no diff (schema matches migration).

- [ ] **Step 4: Commit**

```bash
git add -- supabase/migrations/20260420300000_tenants_global_slug.sql
git commit -m "db: global-unique tenant slugs with format CHECK"
```

---

### Task 4: Add `generateTenantSlug` helper

**Files:**
- Modify: `packages/backend/src/db/queries/slugQueries.ts`
- Create: `packages/backend/src/db/queries/slugQueries.test.ts` (if absent; otherwise append)

- [ ] **Step 1: Write failing test**

Append to or create `packages/backend/src/db/queries/slugQueries.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { generateTenantSlug } from './slugQueries.js';

describe('generateTenantSlug', () => {
  it('strips non-alphanumerics and lowercases', () => {
    expect(generateTenantSlug('Acme Corp!')).toBe('acmecorp');
    expect(generateTenantSlug('Hello, World 2026')).toBe('helloworld2026');
  });
  it('caps at 37 chars to reserve headroom for numeric suffixes', () => {
    // The DB CHECK allows up to 40; the generator stops at 37 so the
    // findUniqueTenantSlug collision suffix (up to 3 digits) fits.
    expect(generateTenantSlug('a'.repeat(60))).toBe('a'.repeat(37));
  });
  it('returns empty string when nothing valid remains', () => {
    expect(generateTenantSlug('!!!')).toBe('');
    expect(generateTenantSlug('')).toBe('');
  });
  it('handles unicode by stripping non-ASCII', () => {
    // 'Café Olé' → strip é, space → 'cafol' (all surviving ASCII alnum)
    expect(generateTenantSlug('Café Olé')).toBe('cafol');
    expect(generateTenantSlug('東京支店')).toBe(''); // fully non-ASCII → empty
  });
});
```

- [ ] **Step 2: Run test — expect failure (function not exported)**

```bash
npm test -w packages/backend -- --testPathPattern=slugQueries
```

Expected: fails because `generateTenantSlug` is not exported.

- [ ] **Step 3: Implement in `slugQueries.ts`**

Append:
```ts
// The DB CHECK allows up to 40 characters; we stop at 37 so the suffix
// logic in findUniqueTenantSlug (up to 3 numeric digits) always fits.
const TENANT_SLUG_BASE_MAX_LENGTH = 37;

export function generateTenantSlug(name: string): string {
  const lower = name.toLowerCase();
  let out = '';
  for (const char of lower) {
    if (isAlphanumeric(char)) out += char;
    if (out.length >= TENANT_SLUG_BASE_MAX_LENGTH) break;
  }
  return out;
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -w packages/backend -- --testPathPattern=slugQueries
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add -- packages/backend/src/db/queries/slugQueries.ts packages/backend/src/db/queries/slugQueries.test.ts
git commit -m "backend: generateTenantSlug strips non-alphanumerics"
```

---

### Task 5: Refactor `findUniqueTenantSlug` to global scope

**Files:**
- Modify: `packages/backend/src/db/queries/tenantQueries.ts`

- [ ] **Step 1: Read current `findUniqueTenantSlug`**

```bash
grep -n "findUniqueTenantSlug" packages/backend/src/db/queries/tenantQueries.ts
```

Note the current signature and callers.

- [ ] **Step 2: Change signature to drop `orgId`**

Change the function to look up by `slug` only (no `org_id` filter), using a bounded lookup
pattern so `acme` doesn't pull unrelated rows like `acmebank`:

```ts
export async function findUniqueTenantSlug(
  supabase: SupabaseClient,
  baseSlug: string
): Promise<string> {
  if (baseSlug === '') throw new Error('baseSlug cannot be empty');
  // Bounded: exact match, OR slug.like "<base>0*..<base>9*". PostgREST treats
  // `[0-9]` as literal characters inside `ilike`, so we issue two queries
  // (exact + bounded prefix) rather than an unbounded `<base>%`.
  const exactPromise = supabase.from('tenants').select('slug').eq('slug', baseSlug);
  // Limit: up to 999 possible suffixes; if more exist we'll fail loudly below.
  const suffixedPromise = supabase
    .from('tenants')
    .select('slug')
    .ilike('slug', `${baseSlug}[0-9]%`)
    .limit(1024);

  const [exact, suffixed] = await Promise.all([exactPromise, suffixedPromise]);
  const rows = [...(exact.data ?? []), ...(suffixed.data ?? [])].filter(
    (r): r is { slug: string } => typeof r === 'object' && r !== null && 'slug' in r
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(baseSlug)) return baseSlug;

  // Tenant slugs can't contain hyphens — append digits directly.
  // Generator reserves 3 chars of headroom so suffixes 1..999 always fit.
  for (let i = 1; i < 1000; i++) {
    const candidate = `${baseSlug}${i}`;
    if (candidate.length > 40) throw new Error('baseSlug too long for suffix');
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Unable to find unique tenant slug');
}
```

If `ilike('slug', '<base>[0-9]%')` doesn't behave as expected with the installed Supabase JS
client (PostgREST syntax for bracket classes in LIKE is server-specific), fall back to:
`ilike('slug', '${baseSlug}_%')` **and** filter results client-side where the char after
`baseSlug` is a digit. Document the choice in an inline comment.

- [ ] **Step 3: Run typecheck — expect failures at callers**

```bash
npm run typecheck -w packages/backend
```

Expected: type errors at `handleCreateTenant` and anywhere else that passed `orgId`.

- [ ] **Step 4: Commit the query change**

```bash
git add -- packages/backend/src/db/queries/tenantQueries.ts
git commit -m "backend: findUniqueTenantSlug becomes global"
```

---

### Task 6: Rewire `handleCreateTenant`

**Files:**
- Modify: `packages/backend/src/routes/tenants/createTenant.ts`

- [ ] **Step 1: Replace slug generation and validation**

Replace the body of `handleCreateTenant` so it:
1. Reads an optional `slug` field from the body (integrator-provided); if present, validates via `isValidTenantSlug`; rejects 400 on invalid; **checks global availability via `findUniqueTenantSlug` — on collision (the returned slug differs from the requested one), rejects 409 `slug_taken`**.
2. If not provided, derives with `generateTenantSlug(name)`; falls back to the new hyphen-free `fallbackSlug()` when empty; then finds a globally unique suffix via the new `findUniqueTenantSlug(supabase, baseSlug)`.
3. Re-validates the final slug against `isValidTenantSlug` (covers the `tenant<hex>` fallback hitting a reserved word).

Note: the existing `fallbackSlug()` in the current file emits `tenant-<hex>` with a hyphen. Must be changed to `tenant<hex>` (no hyphen) — the hyphen would fail the new CHECK constraint.

Final file:

```ts
import type { Request } from 'express';
import { isValidTenantSlug } from '@openflow/shared-validation';

import { generateTenantSlug } from '../../db/queries/slugQueries.js';
import { createTenant, findUniqueTenantSlug } from '../../db/queries/tenantQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './tenantHelpers.js';

const HTTP_CONFLICT = 409;
const SLUG_RADIX = 36;
const SLUG_START = 2;
const SLUG_END = 10;

function fallbackSlug(): string {
  // No hyphens allowed in tenant slugs; emit a bare alphanumeric id.
  return `tenant${Math.random().toString(SLUG_RADIX).slice(SLUG_START, SLUG_END)}`;
}

type SlugOutcome =
  | { ok: true; slug: string }
  | { ok: false; status: number; error: string };

async function resolveSlug(
  supabase: AuthenticatedLocals['supabase'],
  name: string,
  explicit: string | undefined
): Promise<SlugOutcome> {
  if (explicit !== undefined) {
    if (!isValidTenantSlug(explicit)) {
      return { ok: false, status: HTTP_BAD_REQUEST, error: 'Invalid slug' };
    }
    const resolved = await findUniqueTenantSlug(supabase, explicit);
    if (resolved !== explicit) {
      return { ok: false, status: HTTP_CONFLICT, error: 'slug_taken' };
    }
    return { ok: true, slug: explicit };
  }
  const generated = generateTenantSlug(name);
  const base = generated === '' ? fallbackSlug() : generated;
  const unique = await findUniqueTenantSlug(supabase, base);
  if (!isValidTenantSlug(unique)) {
    return { ok: false, status: HTTP_INTERNAL_ERROR, error: 'Generated slug is invalid' };
  }
  return { ok: true, slug: unique };
}

export async function handleCreateTenant(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  const explicitSlug = parseStringField(req.body, 'slug');

  if (orgId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }

  try {
    const slugResult = await resolveSlug(supabase, name, explicitSlug);
    if (!slugResult.ok) {
      res.status(slugResult.status).json({ error: slugResult.error });
      return;
    }

    const { result, error } = await createTenant(supabase, orgId, name, slugResult.slug);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create tenant' });
      return;
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2: Add `@openflow/shared-validation` to `packages/backend/package.json`**

Add to `dependencies`:
```json
"@openflow/shared-validation": "*"
```

Then:
```bash
npm install
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck -w packages/backend
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -- packages/backend/src/routes/tenants/createTenant.ts packages/backend/package.json package-lock.json
git commit -m "backend: tenant create uses global-unique + validated slug"
```

---

### Task 7: Verify RPC and `getTenantBySlug` caller scope

**Files:**
- Grep-only verification (no new file expected unless callers surface)
- Confirm: `packages/backend/src/db/queries/tenantQueries.ts` (`getTenantBySlug`) stays two-arg
- Confirm: `packages/backend/src/routes/tenants/getTenantBySlug.ts` (`/tenants/by-slug/:orgId/:slug`) stays two-arg
- Confirm: `packages/web/app/lib/tenants.ts` dashboard callers stay two-arg
- Create (only if the grep surfaces callers): `supabase/migrations/20260420300100_fix_tenant_id_by_slug_callers.sql`

- [ ] **Step 1: Find RPC callers**

```bash
grep -rn "tenant_id_by_slug" supabase/ packages/ --include="*.sql" --include="*.ts"
```

Expected: only the defining migration files. If any `.rpc('tenant_id_by_slug'...)` or SQL
policy references it outside the migration, proceed to Step 2; otherwise jump to Step 3.

- [ ] **Step 2: Update callers**

For each SQL caller (RLS policy or function), drop it in a new migration and recreate with the
single-arg call. For each TS caller, update the `.rpc('tenant_id_by_slug', { p_org_id, p_slug })`
call to `.rpc('tenant_id_by_slug', { p_slug })`.

- [ ] **Step 3: Pin the dashboard `getTenantBySlug` contract**

Per spec decision (b): the dashboard's `getTenantBySlug(orgId, slug)` path remains two-arg to
minimize dashboard churn. Confirm with a test that documents the decision:

```ts
// packages/backend/src/routes/tenants/getTenantBySlug.contract.test.ts
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('getTenantBySlug route contract', () => {
  it('stays two-arg (:orgId/:slug) for the dashboard', () => {
    const router = readFileSync(
      resolve(__dirname, '../../../src/routes/tenants/tenantRouter.ts'),
      'utf8'
    );
    expect(router).toMatch(/by-slug\/:orgId\/:slug/);
  });
});
```

- [ ] **Step 4: Apply migrations and run tests**

```bash
npx supabase db reset
npm test -w packages/backend
```

Expected: all migrations apply; contract test passes.

- [ ] **Step 5: Commit**

```bash
git add -- supabase/migrations/ packages/backend/src/
git commit -m "backend: pin getTenantBySlug two-arg contract; confirm no RPC callers"
```

---

### Task 8: Unit test — reserved-slug parity between TS and migration SQL

**Files:**
- Create: `packages/shared-validation/src/sqlParity.test.ts`

- [ ] **Step 1: Write failing test**

The test scans **all** migration files for any `tenants_slug_format` CHECK literal rather than
hardcoding today's filename — that way, when a future migration supersedes the current one, the
parity assertion stays correct automatically.

```ts
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESERVED_TENANT_SLUGS, sortedReservedTenantSlugs } from './index.js';

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations');

function extractLatestReservedList(): string[] | null {
  // Scan newest-first; the last migration that defines tenants_slug_format wins.
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort().reverse();
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    if (!sql.includes('tenants_slug_format')) continue;
    const m = sql.match(/slug NOT IN \(\s*([\s\S]*?)\)/);
    if (!m) continue;
    return (m[1].match(/'([a-z0-9]+)'/g) ?? []).map((s) => s.slice(1, -1)).sort();
  }
  return null;
}

describe('reserved tenant slug parity', () => {
  it('TS list matches the Postgres CHECK literal in the latest tenants-slug migration', () => {
    const found = extractLatestReservedList();
    expect(found).not.toBeNull();
    expect(found).toEqual(sortedReservedTenantSlugs());
    expect(found!.length).toBe(RESERVED_TENANT_SLUGS.size);
  });
});
```

- [ ] **Step 2: Run test — expect pass**

```bash
npm test -w packages/shared-validation
```

Expected: the parity test passes (we wrote both lists to match).

- [ ] **Step 3: Sanity: break it on purpose to prove it catches drift**

Temporarily remove `'localhost'` from the migration's `NOT IN`. Run the test — expect fail. Restore the migration.

- [ ] **Step 4: Commit**

```bash
git add -- packages/shared-validation/src/sqlParity.test.ts
git commit -m "shared-validation: assert TS/SQL reserved-slug parity"
```

---

# Group 3 — Agent slug CHECK + Zod

### Task 9: Migration — agents slug CHECK constraint

**Files:**
- Create: `supabase/migrations/20260420400000_agents_slug_format.sql`

- [ ] **Step 1: Create the migration**

```sql
ALTER TABLE public.agents
  ADD CONSTRAINT agents_slug_format
  CHECK (length(slug) <= 40 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
```

- [ ] **Step 2: Apply and verify**

```bash
npx supabase db reset
```

Expected: all migrations apply. If existing rows violate (likely not — slug generation already produces compliant values), the migration aborts and we fix offending rows by hand.

- [ ] **Step 3: Commit**

```bash
git add -- supabase/migrations/20260420400000_agents_slug_format.sql
git commit -m "db: agent slug format CHECK constraint"
```

---

### Task 10: Wire `handleCreateAgent` to use `isValidAgentSlug`

**Files:**
- Modify: `packages/backend/src/routes/agents/createAgent.ts`

- [ ] **Step 1: Read current handler**

```bash
cat packages/backend/src/routes/agents/createAgent.ts
```

Note how the slug is computed today (likely via `generateSlug(name)` + `findUniqueSlug(... 'agents')`).

- [ ] **Step 2: Add validation at the same point the slug is finalized**

Before returning the final slug, call `isValidAgentSlug(finalSlug)` and reject with 400 if invalid. The generation logic already produces compliant slugs, so this is a defensive guard that catches hand-written slugs if any path accepts them.

Import:
```ts
import { isValidAgentSlug } from '@openflow/shared-validation';
```

Insert right after the slug is chosen and before `createAgent(...)`:
```ts
if (!isValidAgentSlug(finalSlug)) {
  res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid agent slug' });
  return;
}
```

(Exact variable name may differ — read the file and match it.)

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck -w packages/backend
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -- packages/backend/src/routes/agents/createAgent.ts
git commit -m "backend: validate agent slug via shared-validation"
```

---

# Group 4 — Express mock routes

### Task 11: Port `copilotMocks.ts` to a backend mock catalog

**Files:**
- Create: `packages/backend/src/routes/mockExecute/mockCatalog.ts`
- Create: `packages/backend/src/routes/mockExecute/mockCatalog.test.ts`

- [ ] **Step 1: Read the original mocks**

```bash
cat packages/web/app/components/copilot/copilotMocks.ts
cat packages/web/app/components/copilot/copilotTypes.ts
```

Note the 4 entries, each an array of `CopilotMessageBlock` (`text` or `action`).

- [ ] **Step 2: Write the failing test**

```ts
// packages/backend/src/routes/mockExecute/mockCatalog.test.ts
import { describe, it, expect } from '@jest/globals';
import { mockCatalog, pickMockResponse } from './mockCatalog.js';

describe('mockCatalog', () => {
  it('has 4 responses with at least one block each', () => {
    expect(mockCatalog).toHaveLength(4);
    for (const entry of mockCatalog) expect(entry.blocks.length).toBeGreaterThan(0);
  });
  it('pickMockResponse is deterministic per sessionId', () => {
    const a = pickMockResponse('sess-1');
    const b = pickMockResponse('sess-1');
    expect(a).toBe(b);
  });
  it('distributes across entries', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => pickMockResponse(`sess-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 3: Run — expect fail (module missing)**

```bash
npm test -w packages/backend -- --testPathPattern=mockCatalog
```

- [ ] **Step 4: Implement**

```ts
// packages/backend/src/routes/mockExecute/mockCatalog.ts

export interface MockTextBlock { type: 'text'; content: string; }
export interface MockActionBlock { type: 'action'; icon: string; title: string; description: string; }
export type MockBlock = MockTextBlock | MockActionBlock;
export interface MockEntry { blocks: MockBlock[]; }

// Ported verbatim from packages/web/app/components/copilot/copilotMocks.ts.
// Keep content identical so the widget sees the same strings.
export const mockCatalog: MockEntry[] = [
  {
    blocks: [
      { type: 'text', content: 'You could add a refund handler node that checks the order age before allowing a refund.' },
      { type: 'action', icon: 'plus-circle', title: 'Add refund handler', description: 'Node with age-based branching' },
    ],
  },
  {
    blocks: [
      { type: 'text', content: 'I suggest adding an error-handling path after the tool call so failures are surfaced gracefully.' },
      { type: 'action', icon: 'git-branch', title: 'Add error path', description: 'Catch tool errors and route to fallback' },
    ],
  },
  {
    blocks: [
      { type: 'text', content: 'For an external API integration, place the HTTP tool node before the decision node so the agent can reason over the response.' },
    ],
  },
  {
    blocks: [
      { type: 'action', icon: 'plus-circle', title: 'Add intent classifier', description: 'Route by user intent' },
      { type: 'action', icon: 'git-branch', title: 'Add FAQ responder', description: 'Answer from knowledge base' },
      { type: 'text', content: 'Start with a classifier + FAQ pair; wire the classifier output to the FAQ node or a fallback.' },
    ],
  },
];

// sessionId → index, so retries stay on the same reply until a new session starts.
function hashToIndex(sessionId: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) | 0;
  return ((h % mod) + mod) % mod;
}

export function pickMockResponse(sessionId: string): number {
  return hashToIndex(sessionId, mockCatalog.length);
}
```

Verify the string content matches the current `copilotMocks.ts` (update if it diverges — the source of truth for content is the web copy; ported verbatim). Do not guess; copy-paste.

- [ ] **Step 5: Run — expect pass**

```bash
npm test -w packages/backend -- --testPathPattern=mockCatalog
```

- [ ] **Step 6: Commit**

```bash
git add -- packages/backend/src/routes/mockExecute/
git commit -m "backend: port copilotMocks content into mock catalog"
```

---

### Task 12: SSE event emitter for the mock stream

**Files:**
- Create: `packages/backend/src/routes/mockExecute/mockEventStream.ts`
- Create: `packages/backend/src/routes/mockExecute/mockEventStream.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { toEventSequence } from './mockEventStream.js';
import { mockCatalog } from './mockCatalog.js';

describe('toEventSequence', () => {
  it('emits word-by-word text events then a done event', () => {
    const events = [...toEventSequence(mockCatalog[2]!)];
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('text');
    expect(types.at(-1)).toBe('done');
  });
  it('maps action blocks to toolCall events', () => {
    const events = [...toEventSequence(mockCatalog[0]!)];
    const tool = events.find((e) => e.type === 'toolCall');
    expect(tool).toBeDefined();
  });
  it('done event carries AgentAppResponse shape', () => {
    const events = [...toEventSequence(mockCatalog[0]!)];
    const done = events.at(-1)!;
    expect(done).toMatchObject({
      type: 'done',
      response: { appType: 'agent', text: expect.any(String), durationMs: expect.any(Number) },
    });
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -w packages/backend -- --testPathPattern=mockEventStream
```

- [ ] **Step 3: Implement**

```ts
// packages/backend/src/routes/mockExecute/mockEventStream.ts
import type { PublicExecutionEvent } from '../execute/executeTypes.js';
import type { MockEntry } from './mockCatalog.js';

const MOCK_NODE_ID = 'mock';

function* textEvents(content: string): Generator<PublicExecutionEvent> {
  const words = content.split(/(\s+)/);
  for (const chunk of words) {
    if (chunk === '') continue;
    yield { type: 'text', text: chunk, nodeId: MOCK_NODE_ID };
  }
}

function* actionEvent(title: string, description: string): Generator<PublicExecutionEvent> {
  yield {
    type: 'toolCall',
    nodeId: MOCK_NODE_ID,
    name: title.toLowerCase().replace(/\s+/g, '_'),
    args: { title, description },
    result: { ok: true },
  };
}

export function* toEventSequence(entry: MockEntry): Generator<PublicExecutionEvent> {
  const started = Date.now();
  const combinedText: string[] = [];

  for (const block of entry.blocks) {
    if (block.type === 'text') {
      combinedText.push(block.content);
      yield* textEvents(block.content);
    } else {
      yield* actionEvent(block.title, block.description);
    }
  }

  yield {
    type: 'done',
    response: {
      appType: 'agent',
      text: combinedText.join('\n\n'),
      toolCalls: [],
      tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalCost: 0 },
      durationMs: Date.now() - started,
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -w packages/backend -- --testPathPattern=mockEventStream
```

- [ ] **Step 5: Commit**

```bash
git add -- packages/backend/src/routes/mockExecute/mockEventStream.ts packages/backend/src/routes/mockExecute/mockEventStream.test.ts
git commit -m "backend: mock catalog → PublicExecutionEvent generator"
```

---

### Task 13: Mock execute HTTP handler with word-cadence

**Files:**
- Create: `packages/backend/src/routes/mockExecute/mockExecuteHandler.ts`

- [ ] **Step 1: Read existing SSE helpers**

```bash
cat packages/backend/src/routes/execute/executeHelpers.ts | head -60
```

Note `setSseHeaders`, `writePublicSSE`, or similar. Reuse them.

- [ ] **Step 2: Create the handler**

```ts
// packages/backend/src/routes/mockExecute/mockExecuteHandler.ts
import type { Request, Response } from 'express';

import { setSseHeaders, writePublicSSE } from '../execute/executeHelpers.js';
import { AgentExecutionInputSchema } from '../execute/executeTypes.js';
import { mockCatalog, pickMockResponse } from './mockCatalog.js';
import { toEventSequence } from './mockEventStream.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const WORD_CADENCE_MS = 40;

const MOCK_AGENT_SLUG = 'agent-example';
const MOCK_VERSION = '5';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleMockExecute(
  req: Request<{ agentSlug: string; version: string }>,
  res: Response
): Promise<void> {
  if (req.params.agentSlug !== MOCK_AGENT_SLUG || req.params.version !== MOCK_VERSION) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Mock agent not found' });
    return;
  }

  const parsed = AgentExecutionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.stream !== true) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Widget requires stream=true' });
    return;
  }

  const entry = mockCatalog[pickMockResponse(parsed.data.sessionId)]!;
  setSseHeaders(res);

  for (const event of toEventSequence(entry)) {
    writePublicSSE(res, event);
    if (event.type === 'text') await sleep(WORD_CADENCE_MS);
  }

  res.end();
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck -w packages/backend
```

Expected: green. If `setSseHeaders` or `writePublicSSE` aren't exported, adjust imports to match what IS exported in `executeHelpers.ts` (they must exist — they're referenced from `executeHandler.ts` in §Data pipeline of the spec).

- [ ] **Step 4: Commit**

```bash
git add -- packages/backend/src/routes/mockExecute/mockExecuteHandler.ts
git commit -m "backend: mock execute SSE handler"
```

---

### Task 14: Mock latest-version handler

**Files:**
- Create: `packages/backend/src/routes/mockExecute/mockLatestVersionHandler.ts`

- [ ] **Step 1: Create**

```ts
// packages/backend/src/routes/mockExecute/mockLatestVersionHandler.ts
import type { Request, Response } from 'express';

const MOCK_AGENT_SLUG = 'agent-example';
const HTTP_NOT_FOUND = 404;

export function handleMockLatestVersion(
  req: Request<{ agentSlug: string }>,
  res: Response
): void {
  if (req.params.agentSlug !== MOCK_AGENT_SLUG) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Mock agent not found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ version: 5 });
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck -w packages/backend
git add -- packages/backend/src/routes/mockExecute/mockLatestVersionHandler.ts
git commit -m "backend: mock latest-version handler"
```

---

### Task 15: Mount mock routes on Express with a feature flag

**Files:**
- Create: `packages/backend/src/routes/mockExecute/mockExecuteRouter.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Create the router**

```ts
// packages/backend/src/routes/mockExecute/mockExecuteRouter.ts
import { Router } from 'express';

import { handleMockExecute } from './mockExecuteHandler.js';
import { handleMockLatestVersion } from './mockLatestVersionHandler.js';

export const mockExecuteRouter = Router();

mockExecuteRouter.get('/:agentSlug/latest', handleMockLatestVersion);
mockExecuteRouter.post('/:agentSlug/:version', handleMockExecute);
```

- [ ] **Step 2: Mount conditionally in `server.ts`**

Find where `app.use('/api/agents', executeRouter)` is and add:

```ts
import { mockExecuteRouter } from './routes/mockExecute/mockExecuteRouter.js';

if (process.env.ENABLE_MOCK_EXECUTE === 'true') {
  app.use('/api/mock-execute', mockExecuteRouter);
}
```

Add the environment variable to the backend `.env.example` (create if missing):
```
ENABLE_MOCK_EXECUTE=true
```

- [ ] **Step 3: Smoke test locally**

```bash
ENABLE_MOCK_EXECUTE=true npm run dev -w packages/backend &
BACKEND_PID=$!
sleep 2
curl -sv http://localhost:4000/api/mock-execute/agent-example/latest
# Expect: 200 { "version": 5 }
curl -N -X POST http://localhost:4000/api/mock-execute/agent-example/5 \
  -H 'content-type: application/json' \
  -d '{"tenantId":"acme","userId":"u1","sessionId":"s1","message":{"text":"hi"},"channel":"web","stream":true}'
# Expect: stream of `data: {...}` lines ending with a `done` event
kill $BACKEND_PID
```

- [ ] **Step 4: Commit**

```bash
git add -- packages/backend/src/routes/mockExecute/mockExecuteRouter.ts packages/backend/src/server.ts packages/backend/.env.example
git commit -m "backend: mount mock-execute router behind flag"
```

---

# Group 5 — Next.js proxy routes

### Task 16: CORS helper derived from shared validators

**Files:**
- Create: `packages/web/app/api/chat/_helpers/cors.ts`
- Create: `packages/web/app/api/chat/_helpers/cors.test.ts`

- [ ] **Step 1: Write failing test**

The origin allowlist must be built from the same `TENANT_SLUG_REGEX` and `AGENT_SLUG_REGEX`
exported by `@openflow/shared-validation` — not from a locally-inlined pattern — to prevent
drift.

```ts
// packages/web/app/api/chat/_helpers/cors.test.ts
import { describe, it, expect } from '@jest/globals';
import { corsHeadersFor } from './cors.js';

describe('corsHeadersFor', () => {
  it('accepts valid tenant-agent origins', () => {
    const h = corsHeadersFor('https://acme-customer-care.live.openflow.build');
    expect(h['Access-Control-Allow-Origin']).toBe('https://acme-customer-care.live.openflow.build');
    expect(h['Access-Control-Allow-Headers']).toContain('Authorization');
    expect(h['Access-Control-Max-Age']).toBe('600');
  });
  it('rejects hyphen-having tenants', () => {
    expect(corsHeadersFor('https://acme-corp-customer.live.openflow.build')).toEqual({});
  });
  it('rejects a tenant slug over 40 chars', () => {
    const long = 'a'.repeat(41);
    expect(corsHeadersFor(`https://${long}-x.live.openflow.build`)).toEqual({});
  });
  it('rejects unknown hosts', () => {
    expect(corsHeadersFor('https://evil.example.com')).toEqual({});
  });
});
```

- [ ] **Step 2: Implement with derived regex**

```ts
// packages/web/app/api/chat/_helpers/cors.ts
import { AGENT_SLUG_REGEX, TENANT_SLUG_REGEX } from '@openflow/shared-validation';

// Strip anchors from the shared sources so we can compose them into a URL-shape regex.
const T_BODY = TENANT_SLUG_REGEX.source.replace(/^\^|\$$/g, '');
const A_BODY = AGENT_SLUG_REGEX.source.replace(/^\^|\$$/g, '');
const WIDGET_ORIGIN_REGEX = new RegExp(
  `^https://(?:${T_BODY})-(?:${A_BODY})\\.live\\.openflow\\.build$`
);
const DEV_ORIGIN = 'http://localhost:5173';

function isAllowed(origin: string): boolean {
  if (WIDGET_ORIGIN_REGEX.test(origin)) return true;
  return process.env.NODE_ENV !== 'production' && origin === DEV_ORIGIN;
}

export function corsHeadersFor(origin: string | null): Record<string, string> {
  if (origin === null || !isAllowed(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
  };
}

export function preflightResponse(request: Request): Response {
  const origin = request.headers.get('origin');
  return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
}
```

- [ ] **Step 3: Run tests, typecheck, commit**

```bash
npm test -w packages/web -- --testPathPattern=cors
npm run typecheck -w packages/web
git add -- packages/web/app/api/chat/_helpers/cors.ts packages/web/app/api/chat/_helpers/cors.test.ts
git commit -m "web: widget CORS helper derived from shared slug regexes"
```

---

### Task 17: `latest-version` proxy route

**Files:**
- Create: `packages/web/app/api/chat/latest-version/[tenant]/[agent]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// packages/web/app/api/chat/latest-version/[tenant]/[agent]/route.ts
import { isValidAgentSlug, isValidTenantSlug } from '@openflow/shared-validation';
import { NextResponse } from 'next/server';

import { corsHeadersFor, preflightResponse } from '../../../_helpers/cors.js';

export const runtime = 'nodejs';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';
const MOCK_LATEST = process.env.MOCK_LATEST_PATH ?? '/api/mock-execute';

export function OPTIONS(request: Request): Response {
  return preflightResponse(request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tenant: string; agent: string }> }
): Promise<Response> {
  const origin = request.headers.get('origin');
  const { tenant, agent } = await context.params;

  if (!isValidTenantSlug(tenant) || !isValidAgentSlug(agent)) {
    return NextResponse.json(
      { error: 'Invalid tenant or agent slug' },
      { status: 400, headers: corsHeadersFor(origin) }
    );
  }

  const upstream = await fetch(`${BACKEND_URL}${MOCK_LATEST}/${agent}/latest`, { cache: 'no-store' });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      ...corsHeadersFor(origin),
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 2: Add `@openflow/shared-validation` dependency**

Add to `packages/web/package.json` dependencies:
```json
"@openflow/shared-validation": "*"
```

```bash
npm install
npm run typecheck -w packages/web
```

- [ ] **Step 3: Smoke-test**

Start backend with the flag on, then start Next.js:
```bash
ENABLE_MOCK_EXECUTE=true npm run dev -w packages/backend &
sleep 2
npm run dev -w packages/web &
sleep 5
curl -sv http://localhost:3101/api/chat/latest-version/acme/agent-example \
  -H 'origin: https://acme-customer-care.live.openflow.build'
# Expect: 200 { "version": 5 } plus CORS headers
```

Clean up both processes.

- [ ] **Step 4: Commit**

```bash
git add -- packages/web/app/api/chat/latest-version/ packages/web/package.json package-lock.json
git commit -m "web: /api/chat/latest-version proxy route"
```

---

### Task 18: `execute` proxy route (SSE passthrough)

**Files:**
- Create: `packages/web/app/api/chat/execute/[tenant]/[agent]/[version]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// packages/web/app/api/chat/execute/[tenant]/[agent]/[version]/route.ts
import { isValidAgentSlug, isValidTenantSlug } from '@openflow/shared-validation';
import { NextResponse } from 'next/server';

import { corsHeadersFor, preflightResponse } from '../../../../_helpers/cors.js';

export const runtime = 'nodejs';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';
const MOCK_EXECUTE = process.env.MOCK_EXECUTE_PATH ?? '/api/mock-execute';
const VERSION_REGEX = /^\d{1,6}$/;

export function OPTIONS(request: Request): Response {
  return preflightResponse(request);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tenant: string; agent: string; version: string }> }
): Promise<Response> {
  const origin = request.headers.get('origin');
  const cors = corsHeadersFor(origin);
  const { tenant, agent, version } = await context.params;

  if (!isValidTenantSlug(tenant) || !isValidAgentSlug(agent) || !VERSION_REGEX.test(version)) {
    return NextResponse.json({ error: 'Invalid path params' }, { status: 400, headers: cors });
  }

  const bodyText = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400, headers: cors });
  }
  if (typeof body !== 'object' || body === null || !('tenantId' in body) || (body as Record<string, unknown>).tenantId !== tenant) {
    return NextResponse.json(
      { error: 'tenantId in body must match tenant in URL' },
      { status: 400, headers: cors }
    );
  }

  const upstream = await fetch(`${BACKEND_URL}${MOCK_EXECUTE}/${agent}/${version}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyText,
  });

  if (upstream.body === null) {
    return new Response('upstream returned no body', { status: 502, headers: cors });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...cors,
      'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 3: Smoke test SSE passthrough**

```bash
ENABLE_MOCK_EXECUTE=true npm run dev -w packages/backend &
sleep 2
npm run dev -w packages/web &
sleep 5
curl -N -X POST http://localhost:3101/api/chat/execute/acme/agent-example/5 \
  -H 'content-type: application/json' \
  -H 'origin: https://acme-customer-care.live.openflow.build' \
  -d '{"tenantId":"acme","userId":"u1","sessionId":"s1","message":{"text":"hi"},"channel":"web","stream":true}'
# Expect: stream of SSE lines ending with a `done` event
```

Clean up both processes.

- [ ] **Step 4: Commit**

```bash
git add -- packages/web/app/api/chat/execute/
git commit -m "web: /api/chat/execute SSE passthrough proxy"
```

---

# Group 6 — Widget scaffolding

### Task 19: Scaffold `packages/widget`

**Files:**
- Create: `packages/widget/package.json`
- Create: `packages/widget/tsconfig.json`
- Create: `packages/widget/tsconfig.node.json`
- Create: `packages/widget/index.html`
- Create: `packages/widget/.gitignore`
- Create: `packages/widget/src/main.tsx` (stub)
- Create: `packages/widget/src/app/ChatApp.tsx` (stub)

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@openflow/widget",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run build:loader && npm run build:app",
    "build:app": "vite build",
    "build:loader": "vite build --mode loader",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@openflow/shared-validation": "*",
    "idb": "^8.0.0",
    "lucide-react": "^0.460.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.3",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals"],
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src", "index.html"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>OpenFlow</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Stub source files**

`src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { ChatApp } from './app/ChatApp.js';

const el = document.getElementById('root');
if (el) createRoot(el).render(<ChatApp />);
```

`src/app/ChatApp.tsx`:
```tsx
export function ChatApp(): JSX.Element {
  return <div>OpenFlow widget — scaffold</div>;
}
```

`.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 5: Install**

```bash
npm install
npm run typecheck -w packages/widget
```

Expected: typecheck passes (Vite config not yet written — skip app-specific errors by limiting the check).

- [ ] **Step 6: Commit**

```bash
git add -- packages/widget/ package.json package-lock.json
git commit -m "widget: scaffold Vite + React workspace"
```

---

### Task 20: Vite config (SPA + loader dual build)

**Files:**
- Create: `packages/widget/vite.config.ts`

- [ ] **Step 1: Create the config**

```ts
// packages/widget/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  if (mode === 'loader') {
    return {
      build: {
        lib: {
          entry: 'src/loader/script.ts',
          formats: ['iife'],
          name: 'OpenFlowWidget',
          fileName: () => 'script.js',
        },
        emptyOutDir: false,
      },
    };
  }

  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173 },
    build: {
      rollupOptions: { input: 'index.html' },
    },
  };
});
```

- [ ] **Step 2: Tailwind CSS stub with reduced-motion override**

`src/styles/tailwind.css`:
```css
@import "tailwindcss";

/* Kill all transitions/animations on widget elements when the user prefers reduced motion. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

Wire into `main.tsx`:
```tsx
import './styles/tailwind.css';
```

- [ ] **Step 3: Loader stub so build:loader succeeds**

`src/loader/script.ts`:
```ts
// Placeholder — implemented in Group 13.
console.info('OpenFlow widget loader placeholder');
```

- [ ] **Step 4: Build both targets**

```bash
npm run build -w packages/widget
ls packages/widget/dist/
```

Expected: `dist/script.js`, `dist/index.html`, `dist/assets/*.{js,css}`.

- [ ] **Step 5: Commit**

```bash
git add -- packages/widget/vite.config.ts packages/widget/src/styles/tailwind.css packages/widget/src/loader/ packages/widget/src/main.tsx
git commit -m "widget: Vite config — dual loader+SPA build"
```

---

### Task 21: Port shadcn primitives (button, dropdown-menu, textarea)

**Files:**
- Create: `packages/widget/src/ui/primitives/button.tsx`
- Create: `packages/widget/src/ui/primitives/dropdown-menu.tsx`
- Create: `packages/widget/src/ui/primitives/textarea.tsx`
- Create: `packages/widget/src/ui/primitives/utils.ts`

- [ ] **Step 1: Copy from `packages/web/components/ui/`**

For each primitive, read the current file in `packages/web/components/ui/` and copy it into `packages/widget/src/ui/primitives/`. Paths inside each copy that reference `@/lib/utils` → change to `./utils.js`. Any `@radix-ui/...` imports stay — add those to `packages/widget/package.json` dependencies as you hit them and re-run `npm install`.

Verify each file has no Next.js-specific imports (e.g., `next/link`).

`utils.ts`:
```ts
// packages/widget/src/ui/primitives/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Add `clsx`, `tailwind-merge`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-slot` (if used) to `packages/widget/package.json` deps.

- [ ] **Step 2: `npm install` and typecheck**

```bash
npm install
npm run typecheck -w packages/widget
```

- [ ] **Step 3: Commit**

```bash
git add -- packages/widget/src/ui/primitives/ packages/widget/package.json package-lock.json
git commit -m "widget: port shadcn primitives (button, dropdown-menu, textarea)"
```

---

# Group 7 — Widget routing + hostname + UUID + i18n

### Task 22: Hostname parser with normalization

**Files:**
- Create: `packages/widget/src/routing/parseHostname.ts`
- Create: `packages/widget/src/routing/parseHostname.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseAgentHost } from './parseHostname.js';

describe('parseAgentHost', () => {
  it('parses canonical form', () => {
    expect(parseAgentHost('acme-customer-care.live.openflow.build')).toEqual({
      tenant: 'acme', agentSlug: 'customer-care',
    });
  });
  it('lowercases input', () => {
    expect(parseAgentHost('ACME-Customer-Care.live.openflow.build')).toEqual({
      tenant: 'acme', agentSlug: 'customer-care',
    });
  });
  it('strips port and trailing dot', () => {
    expect(parseAgentHost('acme-x.live.openflow.build:443')).toEqual({ tenant: 'acme', agentSlug: 'x' });
    expect(parseAgentHost('acme-x.live.openflow.build.')).toEqual({ tenant: 'acme', agentSlug: 'x' });
  });
  it('rejects non-ASCII', () => {
    expect(parseAgentHost('cafés-bot.live.openflow.build')).toBeNull();
  });
  it('rejects malformed', () => {
    expect(parseAgentHost('justatenant.live.openflow.build')).toBeNull();
    expect(parseAgentHost('-bad.live.openflow.build')).toBeNull();
    expect(parseAgentHost('bad-.live.openflow.build')).toBeNull();
    expect(parseAgentHost('some.other.host')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -w packages/widget
```

- [ ] **Step 3: Implement**

```ts
// packages/widget/src/routing/parseHostname.ts
const HOST_REGEX =
  /^([a-z0-9]{1,40})-([a-z0-9]+(?:-[a-z0-9]+)*)\.live\.openflow\.build$/;

export function parseAgentHost(raw: string): { tenant: string; agentSlug: string } | null {
  const host = raw.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!/^[\x00-\x7f]+$/.test(host)) return null;
  const m = host.match(HOST_REGEX);
  return m ? { tenant: m[1]!, agentSlug: m[2]! } : null;
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/routing/
git commit -m "widget: hostname parser with normalization"
```

---

### Task 23: UUID helper with fallbacks

**Files:**
- Create: `packages/widget/src/lib/uuid.ts`
- Create: `packages/widget/src/lib/uuid.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from './uuid.js';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
  it('delegates to crypto.randomUUID when available', () => {
    expect(randomUUID()).toMatch(UUID_SHAPE);
  });
  it('falls back to getRandomValues when randomUUID missing', () => {
    const orig = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: orig.getRandomValues.bind(orig) },
      configurable: true,
    });
    expect(randomUUID()).toMatch(UUID_SHAPE);
    Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true });
  });
  it('falls back to Math.random when no crypto at all', () => {
    const orig = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    expect(randomUUID()).toMatch(/^fallback-/);
    Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true });
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// packages/widget/src/lib/uuid.ts
export function randomUUID(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
    b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/lib/
git commit -m "widget: randomUUID with getRandomValues and Math.random fallbacks"
```

---

### Task 24: i18n module with en + es bundles

**Files:**
- Create: `packages/widget/src/i18n/en.json`
- Create: `packages/widget/src/i18n/es.json`
- Create: `packages/widget/src/i18n/index.ts`
- Create: `packages/widget/src/i18n/index.test.ts`

- [ ] **Step 1: Create language bundles**

`en.json`:
```json
{
  "title": "Copilot",
  "newChat": "New chat",
  "placeholder": "Ask me anything...",
  "send": "Send",
  "stop": "Stop",
  "close": "Close",
  "emptyState": "How can I help?",
  "selectChat": "Select a chat",
  "sessionOnly": "• session-only",
  "unavailable": "Unavailable",
  "openChat": "Open chat",
  "assistantUnavailable": "This assistant is no longer available."
}
```

`es.json`:
```json
{
  "title": "Copiloto",
  "newChat": "Nuevo chat",
  "placeholder": "Pregúntame lo que sea...",
  "send": "Enviar",
  "stop": "Detener",
  "close": "Cerrar",
  "emptyState": "¿En qué puedo ayudarte?",
  "selectChat": "Selecciona un chat",
  "sessionOnly": "• solo sesión",
  "unavailable": "No disponible",
  "openChat": "Abrir chat",
  "assistantUnavailable": "Este asistente ya no está disponible."
}
```

- [ ] **Step 2: Write failing test**

```ts
// packages/widget/src/i18n/index.test.ts
import { describe, it, expect } from 'vitest';
import { createT, pickLocale } from './index.js';
import en from './en.json';
import es from './es.json';

describe('i18n', () => {
  it('en and es have identical keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
  it('pickLocale respects query-param then navigator', () => {
    expect(pickLocale('es', 'en-US')).toBe('es');
    expect(pickLocale(null, 'es-AR')).toBe('es');
    expect(pickLocale(null, 'fr-FR')).toBe('en');
    expect(pickLocale(null, undefined)).toBe('en');
  });
  it('createT returns the key when missing', () => {
    const t = createT('en');
    expect(t('title')).toBe('Copilot');
  });
});
```

- [ ] **Step 3: Run — expect fail**

- [ ] **Step 4: Implement**

```ts
// packages/widget/src/i18n/index.ts
import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };

export type Locale = 'en' | 'es';
export type TKey = keyof typeof en;

const BUNDLES: Record<Locale, Record<TKey, string>> = {
  en: en as Record<TKey, string>,
  es: es as Record<TKey, string>,
};

export function pickLocale(queryParam: string | null, navigatorLang: string | undefined): Locale {
  const explicit = queryParam?.slice(0, 2).toLowerCase();
  if (explicit === 'es' || explicit === 'en') return explicit;
  const nav = navigatorLang?.slice(0, 2).toLowerCase();
  if (nav === 'es') return 'es';
  return 'en';
}

export function createT(locale: Locale) {
  const bundle = BUNDLES[locale];
  return (key: TKey): string => bundle[key] ?? key;
}
```

If `with { type: 'json' }` is not supported by your TS version, use `import ... from './en.json'` and enable `resolveJsonModule` (already in `tsconfig.json`).

- [ ] **Step 5: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/i18n/
git commit -m "widget: minimal i18n with en+es bundles"
```

---

# Group 8 — Widget UI port

### Task 25: Port `copilotTypes.ts`

**Files:**
- Create: `packages/widget/src/ui/copilotTypes.ts`

- [ ] **Step 1: Copy + adapt**

Read `packages/web/app/components/copilot/copilotTypes.ts` and copy to `packages/widget/src/ui/copilotTypes.ts`. No external references to detangle in the current types — copy verbatim, confirm with a diff check.

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/ui/copilotTypes.ts
git commit -m "widget: port copilotTypes"
```

---

### Task 26: Port `CopilotHeader`, `CopilotMessages`, `CopilotInput`, `CopilotPanel`

**Files:**
- Create: `packages/widget/src/ui/CopilotHeader.tsx`
- Create: `packages/widget/src/ui/CopilotMessages.tsx`
- Create: `packages/widget/src/ui/CopilotInput.tsx`
- Create: `packages/widget/src/ui/CopilotPanel.tsx`

- [ ] **Step 1: Port header**

Read `packages/web/app/components/copilot/CopilotPanel.tsx` and note: the current file is a single panel with embedded header JSX. Extract the header into `CopilotHeader.tsx` in the widget. Replace `useTranslations` with:

```tsx
import { useT } from '../app/i18nContext.js';
```

(We'll create the `i18nContext` in Task 29.)

Every string literal from the original that was `t('key')` becomes `useT()('key')` via the new hook. Every `<Link>` or `next/...` import is removed. Every `@/components/ui/*` import becomes `../ui/primitives/*`.

Paste the full ported file with any contextual adjustments. Do the same mechanical translation for `CopilotMessages.tsx` (content from `CopilotMessages.tsx`) and `CopilotInput.tsx` (content from `CopilotInput.tsx`). For `CopilotPanel.tsx`, the new version composes `<CopilotHeader />`, `<CopilotMessages />`, `<CopilotInput />` rather than inlining them.

Because the ported files are long, do this **one file per commit**: port `CopilotHeader.tsx` → commit; port `CopilotMessages.tsx` → commit; port `CopilotInput.tsx` → commit; port `CopilotPanel.tsx` → commit. Between each, run:

```bash
npm run typecheck -w packages/widget
```

Some errors are expected until Task 29 (i18n hook) and Task 32 (useSessions) are done — note them and move on only if the errors are *just* "cannot find i18nContext" or "cannot find useSessions". Any other error means the port diverged.

- [ ] **Step 2: Sequence of commits**

```bash
git add -- packages/widget/src/ui/CopilotHeader.tsx
git commit -m "widget: port CopilotHeader"
git add -- packages/widget/src/ui/CopilotMessages.tsx
git commit -m "widget: port CopilotMessages"
git add -- packages/widget/src/ui/CopilotInput.tsx
git commit -m "widget: port CopilotInput"
git add -- packages/widget/src/ui/CopilotPanel.tsx
git commit -m "widget: port CopilotPanel (composes H/M/I)"
```

---

# Group 9 — Widget storage

### Task 27: IndexedDB wrapper

**Files:**
- Create: `packages/widget/src/storage/indexeddb.ts`
- Create: `packages/widget/src/storage/indexeddb.test.ts`

- [ ] **Step 1: Write failing test (uses `jsdom` with `fake-indexeddb`)**

Add `fake-indexeddb` to dev deps:
```bash
npm install -D fake-indexeddb -w packages/widget
```

Add to `packages/widget/vitest.config.ts` (create if absent):
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

`packages/widget/vitest.setup.ts`:
```ts
import 'fake-indexeddb/auto';
```

Test:
```ts
// packages/widget/src/storage/indexeddb.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openSessionsDB, putSession, listSessions, getSession } from './indexeddb.js';

describe('indexeddb', () => {
  beforeEach(async () => {
    const db = await openSessionsDB();
    await db.clear('sessions');
  });

  it('puts and lists sessions ordered by updatedAt desc', async () => {
    await putSession({
      sessionId: 's1', tenant: 'acme', agentSlug: 'x',
      title: 'First', createdAt: 100, updatedAt: 100, messages: [],
    });
    await putSession({
      sessionId: 's2', tenant: 'acme', agentSlug: 'x',
      title: 'Second', createdAt: 200, updatedAt: 200, messages: [],
    });
    const list = await listSessions();
    expect(list.map((s) => s.sessionId)).toEqual(['s2', 's1']);
  });

  it('getSession returns stored entry', async () => {
    await putSession({
      sessionId: 'sx', tenant: 'acme', agentSlug: 'x',
      title: 'T', createdAt: 1, updatedAt: 1, messages: [],
    });
    expect((await getSession('sx'))?.title).toBe('T');
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// packages/widget/src/storage/indexeddb.ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CopilotMessage } from '../ui/copilotTypes.js';

export interface StoredSession {
  sessionId: string;
  tenant: string;
  agentSlug: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: CopilotMessage[];
}

interface WidgetDB extends DBSchema {
  sessions: {
    key: string;
    value: StoredSession;
    indexes: { 'by-updatedAt': number };
  };
}

const DB_NAME = 'openflow-widget';
const DB_VERSION = 1;

export async function openSessionsDB(): Promise<IDBPDatabase<WidgetDB>> {
  return openDB<WidgetDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('sessions', { keyPath: 'sessionId' });
      store.createIndex('by-updatedAt', 'updatedAt');
    },
  });
}

export async function putSession(s: StoredSession): Promise<void> {
  const db = await openSessionsDB();
  await db.put('sessions', s);
}

export async function getSession(id: string): Promise<StoredSession | undefined> {
  const db = await openSessionsDB();
  return db.get('sessions', id);
}

export async function listSessions(): Promise<StoredSession[]> {
  const db = await openSessionsDB();
  const all = await db.getAllFromIndex('sessions', 'by-updatedAt');
  return all.reverse(); // newest first
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/storage/ packages/widget/vitest.config.ts packages/widget/vitest.setup.ts packages/widget/package.json package-lock.json
git commit -m "widget: IndexedDB sessions wrapper"
```

---

### Task 28: In-memory fallback + storage probe

**Files:**
- Create: `packages/widget/src/storage/inMemory.ts`
- Create: `packages/widget/src/storage/sessionsBackend.ts`
- Create: `packages/widget/src/storage/sessionsBackend.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/widget/src/storage/sessionsBackend.test.ts
import { describe, it, expect } from 'vitest';
import { createSessionsBackend } from './sessionsBackend.js';

describe('sessionsBackend', () => {
  it('returns indexeddb backend when available and writable', async () => {
    const b = await createSessionsBackend();
    expect(b.kind).toBe('indexeddb');
  });
  it('returns in-memory backend when IndexedDB throws', async () => {
    const origIndexedDB = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined, configurable: true,
    });
    const b = await createSessionsBackend();
    expect(b.kind).toBe('memory');
    Object.defineProperty(globalThis, 'indexedDB', {
      value: origIndexedDB, configurable: true,
    });
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `inMemory.ts` and `sessionsBackend.ts`**

`inMemory.ts`:
```ts
import type { StoredSession } from './indexeddb.js';

export function createInMemoryBackend(): {
  kind: 'memory';
  put: (s: StoredSession) => Promise<void>;
  get: (id: string) => Promise<StoredSession | undefined>;
  list: () => Promise<StoredSession[]>;
} {
  const map = new Map<string, StoredSession>();
  return {
    kind: 'memory',
    put: async (s) => { map.set(s.sessionId, s); },
    get: async (id) => map.get(id),
    list: async () => [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt),
  };
}
```

`sessionsBackend.ts`:
```ts
import type { StoredSession } from './indexeddb.js';
import { getSession, listSessions, openSessionsDB, putSession } from './indexeddb.js';
import { createInMemoryBackend } from './inMemory.js';

export type SessionsBackend = {
  kind: 'indexeddb' | 'memory';
  put: (s: StoredSession) => Promise<void>;
  get: (id: string) => Promise<StoredSession | undefined>;
  list: () => Promise<StoredSession[]>;
};

export async function createSessionsBackend(): Promise<SessionsBackend> {
  try {
    if (typeof globalThis.indexedDB === 'undefined') return createInMemoryBackend();
    // Probe — opens the DB and immediately closes.
    const db = await openSessionsDB();
    db.close();
    return {
      kind: 'indexeddb',
      put: putSession,
      get: getSession,
      list: listSessions,
    };
  } catch {
    return createInMemoryBackend();
  }
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/storage/inMemory.ts packages/widget/src/storage/sessionsBackend.ts packages/widget/src/storage/sessionsBackend.test.ts
git commit -m "widget: sessions backend with in-memory fallback"
```

---

### Task 29: `useSessions` hook replacing `useCopilotSessions`

**Files:**
- Create: `packages/widget/src/ui/useSessions.ts`
- Create: `packages/widget/src/ui/useSessions.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/widget/src/ui/useSessions.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessions } from './useSessions.js';

describe('useSessions', () => {
  it('creates a session on first send and persists the user message', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => { await result.current.createSession(); });
    await act(async () => { await result.current.appendUserMessage('hello'); });
    expect(result.current.messages.length).toBe(1);
    expect(result.current.messages[0]!.role).toBe('user');
  });
  it('finalizeAssistantMessage persists to backend', async () => {
    const { result } = renderHook(() => useSessions({ tenant: 'acme', agentSlug: 'x' }));
    await act(async () => { await result.current.createSession(); });
    await act(async () => {
      await result.current.finalizeAssistantMessage([
        { type: 'text', content: 'hi back' },
      ]);
    });
    expect(result.current.messages.at(-1)?.role).toBe('assistant');
  });
});
```

Add `@testing-library/react` to widget dev deps:
```bash
npm install -D @testing-library/react -w packages/widget
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// packages/widget/src/ui/useSessions.ts
import { useCallback, useEffect, useState } from 'react';

import { randomUUID } from '../lib/uuid.js';
import type { StoredSession } from '../storage/indexeddb.js';
import { type SessionsBackend, createSessionsBackend } from '../storage/sessionsBackend.js';
import type { CopilotMessage, CopilotMessageBlock } from './copilotTypes.js';

interface Args { tenant: string; agentSlug: string; }

interface UseSessionsResult {
  sessions: StoredSession[];
  currentSessionId: string | null;
  messages: CopilotMessage[];
  backendKind: 'indexeddb' | 'memory' | 'loading';
  createSession: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  appendUserMessage: (text: string) => Promise<void>;
  finalizeAssistantMessage: (blocks: CopilotMessageBlock[]) => Promise<void>;
}

function buildTitle(first: string): string {
  return first.length <= 40 ? first : `${first.slice(0, 37)}...`;
}

export function useSessions({ tenant, agentSlug }: Args): UseSessionsResult {
  const [backend, setBackend] = useState<SessionsBackend | null>(null);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const b = await createSessionsBackend();
      if (cancelled) return;
      setBackend(b);
      setSessions(await b.list());
    })();
    return () => { cancelled = true; };
  }, []);

  const reload = useCallback(async (b: SessionsBackend) => {
    setSessions(await b.list());
  }, []);

  const createSession = useCallback(async () => {
    if (!backend) return;
    const now = Date.now();
    const session: StoredSession = {
      sessionId: randomUUID(), tenant, agentSlug,
      title: 'New chat', createdAt: now, updatedAt: now, messages: [],
    };
    await backend.put(session);
    setCurrentSessionId(session.sessionId);
    await reload(backend);
  }, [backend, tenant, agentSlug, reload]);

  const switchSession = useCallback(async (id: string) => {
    if (!backend) return;
    const s = await backend.get(id);
    if (s) setCurrentSessionId(s.sessionId);
  }, [backend]);

  const appendUserMessage = useCallback(async (text: string) => {
    if (!backend || !currentSessionId) return;
    const existing = await backend.get(currentSessionId);
    if (!existing) return;
    const msg: CopilotMessage = {
      id: randomUUID(), role: 'user',
      blocks: [{ type: 'text', content: text }],
      timestamp: Date.now(),
    };
    const updated: StoredSession = {
      ...existing,
      title: existing.messages.length === 0 ? buildTitle(text) : existing.title,
      messages: [...existing.messages, msg],
      updatedAt: Date.now(),
    };
    await backend.put(updated);
    await reload(backend);
  }, [backend, currentSessionId, reload]);

  const finalizeAssistantMessage = useCallback(async (blocks: CopilotMessageBlock[]) => {
    if (!backend || !currentSessionId) return;
    const existing = await backend.get(currentSessionId);
    if (!existing) return;
    const msg: CopilotMessage = {
      id: randomUUID(), role: 'assistant', blocks, timestamp: Date.now(),
    };
    const updated: StoredSession = {
      ...existing,
      messages: [...existing.messages, msg],
      updatedAt: Date.now(),
    };
    await backend.put(updated);
    await reload(backend);
  }, [backend, currentSessionId, reload]);

  const current = sessions.find((s) => s.sessionId === currentSessionId);
  const messages = current?.messages ?? [];
  const backendKind: UseSessionsResult['backendKind'] = backend ? backend.kind : 'loading';

  return {
    sessions, currentSessionId, messages, backendKind,
    createSession, switchSession, appendUserMessage, finalizeAssistantMessage,
  };
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/ui/useSessions.ts packages/widget/src/ui/useSessions.test.tsx packages/widget/package.json package-lock.json
git commit -m "widget: useSessions hook (IDB + memory fallback)"
```

---

### Task 30: i18n React context + `useT` hook

**Files:**
- Create: `packages/widget/src/app/i18nContext.tsx`

- [ ] **Step 1: Create context**

```tsx
// packages/widget/src/app/i18nContext.tsx
import { createContext, useContext, type ReactNode } from 'react';
import { type Locale, type TKey, createT } from '../i18n/index.js';

type T = (key: TKey) => string;

const I18nContext = createContext<T>(() => '');

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={createT(locale)}>{children}</I18nContext.Provider>;
}

export function useT(): T {
  return useContext(I18nContext);
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/app/i18nContext.tsx
git commit -m "widget: i18n React context"
```

---

# Group 10 — Widget API client

### Task 31: Public event type mirror

**Files:**
- Create: `packages/widget/src/types/publicEvents.ts`

- [ ] **Step 1: Mirror `PublicExecutionEvent` from backend**

```ts
// packages/widget/src/types/publicEvents.ts
export interface PublicNodeVisitedEvent { type: 'node_visited'; nodeId: string; }
export interface PublicTextEvent { type: 'text'; text: string; nodeId: string; }
export interface PublicToolCallEvent {
  type: 'toolCall'; nodeId: string; name: string; args: unknown; result: unknown;
}
export interface PublicTokenUsageEvent {
  type: 'tokenUsage'; nodeId: string;
  inputTokens: number; outputTokens: number; cachedTokens: number; cost: number; durationMs: number;
}
export interface PublicStructuredOutputEvent {
  type: 'structuredOutput'; nodeId: string; data: unknown;
}
export interface PublicNodeErrorEvent { type: 'nodeError'; nodeId: string; message: string; }
export interface PublicErrorEvent { type: 'error'; message: string; }

export interface TokenUsage {
  inputTokens: number; outputTokens: number; cachedTokens: number; totalCost: number;
}
export interface AgentAppResponse {
  appType: 'agent';
  text: string;
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>;
  tokenUsage: TokenUsage;
  durationMs: number;
}
export interface PublicDoneEvent { type: 'done'; response: AgentAppResponse; }

export type PublicExecutionEvent =
  | PublicNodeVisitedEvent
  | PublicTextEvent
  | PublicToolCallEvent
  | PublicTokenUsageEvent
  | PublicStructuredOutputEvent
  | PublicNodeErrorEvent
  | PublicErrorEvent
  | PublicDoneEvent;
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/types/publicEvents.ts
git commit -m "widget: mirror PublicExecutionEvent types"
```

---

### Task 32: SSE line reader

**Files:**
- Create: `packages/widget/src/api/sseReader.ts`
- Create: `packages/widget/src/api/sseReader.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/widget/src/api/sseReader.test.ts
import { describe, it, expect } from 'vitest';
import { readSseStream } from './sseReader.js';
import type { PublicExecutionEvent } from '../types/publicEvents.js';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
  });
}

describe('readSseStream', () => {
  it('parses multiple events across chunk boundaries', async () => {
    const events: PublicExecutionEvent[] = [];
    const stream = streamOf([
      'data: {"type":"text","text":"hello","nodeId":"n1"}\n',
      'data: {"type":"done","response":{"appType":"agent","text":"x",',
      '"toolCalls":[],"tokenUsage":{"inputTokens":0,"outputTokens":0,"cachedTokens":0,"totalCost":0},"durationMs":1}}\n',
    ]);
    for await (const ev of readSseStream(stream)) events.push(ev);
    expect(events.map((e) => e.type)).toEqual(['text', 'done']);
  });
  it('ignores non-data lines', async () => {
    const events: PublicExecutionEvent[] = [];
    const stream = streamOf([
      ': comment\n',
      'event: ping\n',
      'data: {"type":"error","message":"x"}\n',
    ]);
    for await (const ev of readSseStream(stream)) events.push(ev);
    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// packages/widget/src/api/sseReader.ts
import type { PublicExecutionEvent } from '../types/publicEvents.js';

function isEvent(value: unknown): value is PublicExecutionEvent {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

export async function* readSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<PublicExecutionEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n');
    while (idx !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.startsWith('data:')) {
        const json = line.slice(5).trim();
        if (json.length > 0) {
          try {
            const parsed: unknown = JSON.parse(json);
            if (isEvent(parsed)) yield parsed;
          } catch { /* ignore malformed */ }
        }
      }
      idx = buffer.indexOf('\n');
    }
  }
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/api/sseReader.ts packages/widget/src/api/sseReader.test.ts
git commit -m "widget: SSE stream reader"
```

---

### Task 33: Execute + latest-version HTTP clients

**Files:**
- Create: `packages/widget/src/api/executeClient.ts`
- Create: `packages/widget/src/api/latestVersionClient.ts`

- [ ] **Step 1: Create both clients**

```ts
// packages/widget/src/api/latestVersionClient.ts
const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://app.openflow.build';

export async function fetchLatestVersion(tenant: string, agent: string): Promise<number> {
  const res = await fetch(`${APP_ORIGIN}/api/chat/latest-version/${tenant}/${agent}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`latest-version failed: ${res.status}`);
  const data = (await res.json()) as { version: number };
  if (typeof data.version !== 'number') throw new Error('latest-version invalid shape');
  return data.version;
}
```

```ts
// packages/widget/src/api/executeClient.ts
import { readSseStream } from './sseReader.js';
import type { PublicExecutionEvent } from '../types/publicEvents.js';

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://app.openflow.build';

export interface ExecuteRequest {
  tenant: string; agent: string; version: number;
  tenantId: string; userId: string; sessionId: string;
  text: string;
}

export async function* execute(req: ExecuteRequest): AsyncGenerator<PublicExecutionEvent> {
  const url = `${APP_ORIGIN}/api/chat/execute/${req.tenant}/${req.agent}/${req.version}`;
  const body = JSON.stringify({
    tenantId: req.tenantId, userId: req.userId, sessionId: req.sessionId,
    message: { text: req.text }, channel: 'web', stream: true,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`execute failed: ${res.status}`);
  if (res.body === null) throw new Error('execute returned no body');
  yield* readSseStream(res.body);
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/api/
git commit -m "widget: execute + latest-version HTTP clients"
```

---

### Task 34: Event → block mapper with coalescing rule

**Files:**
- Create: `packages/widget/src/api/eventToBlock.ts`
- Create: `packages/widget/src/api/eventToBlock.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/widget/src/api/eventToBlock.test.ts
import { describe, it, expect } from 'vitest';
import { BlockCoalescer } from './eventToBlock.js';

describe('BlockCoalescer', () => {
  it('coalesces consecutive text events with same nodeId', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'text', text: 'Hello ', nodeId: 'n1' });
    c.push({ type: 'text', text: 'world', nodeId: 'n1' });
    expect(c.snapshot()).toEqual([{ type: 'text', content: 'Hello world' }]);
  });
  it('finalizes text on different nodeId', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'text', text: 'A', nodeId: 'n1' });
    c.push({ type: 'text', text: 'B', nodeId: 'n2' });
    expect(c.snapshot()).toEqual([
      { type: 'text', content: 'A' },
      { type: 'text', content: 'B' },
    ]);
  });
  it('maps toolCall to action block', () => {
    const c = new BlockCoalescer();
    c.push({
      type: 'toolCall', nodeId: 'n1',
      name: 'add_refund_handler',
      args: { title: 'Add refund handler', description: 'x' },
      result: { ok: true },
    });
    expect(c.snapshot()[0]).toMatchObject({
      type: 'action', title: 'Add refund handler',
    });
  });
  it('maps nodeError to warning action block', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'nodeError', nodeId: 'n1', message: 'boom' });
    expect(c.snapshot()[0]).toMatchObject({ type: 'action', title: 'Step failed' });
  });
  it('ignores tokenUsage, structuredOutput; node_visited updates context', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'text', text: 'A', nodeId: 'n1' });
    c.push({ type: 'node_visited', nodeId: 'n1' });
    c.push({ type: 'text', text: 'B', nodeId: 'n1' });
    expect(c.snapshot()).toEqual([{ type: 'text', content: 'AB' }]);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// packages/widget/src/api/eventToBlock.ts
import type { CopilotMessageBlock } from '../ui/copilotTypes.js';
import type { PublicExecutionEvent } from '../types/publicEvents.js';

function humanize(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function describeArgsResult(_args: unknown, result: unknown): string {
  if (typeof result === 'object' && result !== null && 'description' in result) {
    const d = (result as { description?: unknown }).description;
    if (typeof d === 'string') return d;
  }
  return '';
}

function extractActionFromArgs(args: unknown): { title?: string; description?: string } {
  if (typeof args === 'object' && args !== null) {
    const obj = args as Record<string, unknown>;
    return {
      title: typeof obj.title === 'string' ? obj.title : undefined,
      description: typeof obj.description === 'string' ? obj.description : undefined,
    };
  }
  return {};
}

export class BlockCoalescer {
  private blocks: CopilotMessageBlock[] = [];
  private openText: { nodeId: string; content: string } | null = null;

  snapshot(): CopilotMessageBlock[] {
    return this.openText
      ? [...this.blocks, { type: 'text', content: this.openText.content }]
      : [...this.blocks];
  }

  finalize(): CopilotMessageBlock[] {
    if (this.openText) {
      this.blocks.push({ type: 'text', content: this.openText.content });
      this.openText = null;
    }
    return [...this.blocks];
  }

  push(ev: PublicExecutionEvent): void {
    switch (ev.type) {
      case 'text':
        if (this.openText && this.openText.nodeId === ev.nodeId) {
          this.openText.content += ev.text;
        } else {
          if (this.openText) this.blocks.push({ type: 'text', content: this.openText.content });
          this.openText = { nodeId: ev.nodeId, content: ev.text };
        }
        break;
      case 'toolCall': {
        this.flushText();
        const fromArgs = extractActionFromArgs(ev.args);
        this.blocks.push({
          type: 'action',
          icon: 'plus-circle',
          title: fromArgs.title ?? humanize(ev.name),
          description: fromArgs.description ?? describeArgsResult(ev.args, ev.result),
        });
        break;
      }
      case 'nodeError':
        this.flushText();
        this.blocks.push({
          type: 'action', icon: 'alert-triangle',
          title: 'Step failed', description: ev.message,
        });
        break;
      case 'node_visited':
      case 'tokenUsage':
      case 'structuredOutput':
      case 'error':
      case 'done':
        // not represented as blocks — caller handles lifecycle
        break;
    }
  }

  private flushText(): void {
    if (this.openText) {
      this.blocks.push({ type: 'text', content: this.openText.content });
      this.openText = null;
    }
  }
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/api/eventToBlock.ts packages/widget/src/api/eventToBlock.test.ts
git commit -m "widget: event-to-block coalescer"
```

---

# Group 11 — Widget accessibility

### Task 35: Focus trap

**Files:**
- Create: `packages/widget/src/a11y/focusTrap.ts`
- Create: `packages/widget/src/a11y/focusTrap.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// packages/widget/src/a11y/focusTrap.test.tsx
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from './focusTrap.js';

function Trap() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return (
    <div ref={ref}>
      <button data-testid="a">a</button>
      <button data-testid="b">b</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('wraps focus from last → first on Tab', () => {
    const { getByTestId } = render(<Trap />);
    (getByTestId('b') as HTMLElement).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(getByTestId('a'));
  });
  it('wraps focus from first → last on Shift+Tab', () => {
    const { getByTestId } = render(<Trap />);
    (getByTestId('a') as HTMLElement).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByTestId('b'));
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// packages/widget/src/a11y/focusTrap.ts
import { type RefObject, useEffect } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const container = ref.current;
    if (!container) return undefined;

    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ref, active]);
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
npm test -w packages/widget
git add -- packages/widget/src/a11y/
git commit -m "widget: focus trap hook"
```

---

### Task 36: ARIA live-region announcer

**Files:**
- Create: `packages/widget/src/a11y/LiveRegion.tsx`

- [ ] **Step 1: Create**

```tsx
// packages/widget/src/a11y/LiveRegion.tsx
import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 400;

export function LiveRegion({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');
  const pending = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pending.current = text;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDisplayed(pending.current);
    }, DEBOUNCE_MS);
    return () => { if (timer.current !== null) clearTimeout(timer.current); };
  }, [text]);

  return (
    <div aria-live="polite" className="sr-only">{displayed}</div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/a11y/LiveRegion.tsx
git commit -m "widget: debounced live region"
```

---

# Group 12 — Widget modes

### Task 37: Embedded detection hook

**Files:**
- Create: `packages/widget/src/app/useEmbedded.ts`

- [ ] **Step 1: Create**

```ts
// packages/widget/src/app/useEmbedded.ts
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -- packages/widget/src/app/useEmbedded.ts
git commit -m "widget: embedded-mode detection"
```

---

### Task 38: Standalone mode component with history.pushState

**Files:**
- Create: `packages/widget/src/app/modes/StandaloneMode.tsx`
- Create: `packages/widget/src/app/useSessionUrlSync.ts`

- [ ] **Step 1: Create the URL-sync hook**

```ts
// packages/widget/src/app/useSessionUrlSync.ts
import { useEffect } from 'react';

export function useSessionUrlSync(
  currentSessionId: string | null,
  onPopState: (sessionId: string | null) => void
): void {
  useEffect(() => {
    function onPop(e: PopStateEvent): void {
      const state = e.state as { sessionId?: string } | null;
      onPopState(state?.sessionId ?? null);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onPopState]);

  useEffect(() => {
    if (currentSessionId === null) return;
    const current = new URLSearchParams(window.location.search).get('s');
    if (current === currentSessionId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('s', currentSessionId);
    window.history.pushState({ sessionId: currentSessionId }, '', url.toString());
  }, [currentSessionId]);
}
```

- [ ] **Step 2: Create the standalone wrapper**

```tsx
// packages/widget/src/app/modes/StandaloneMode.tsx
import { CopilotPanel } from '../../ui/CopilotPanel.js';

export function StandaloneMode() {
  return (
    <div className="w-full h-dvh flex justify-center bg-background">
      <div
        role="main"
        aria-labelledby="openflow-panel-title"
        className="w-full max-w-3xl h-full flex flex-col"
      >
        <CopilotPanel standalone />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Call the URL-sync hook from inside `CopilotPanel`**

Inside the live-streaming section of `CopilotPanel` (added in Task 42), invoke
`useSessionUrlSync(currentSessionId, onPopSwitch)` where `onPopSwitch` calls `sessions.switchSession(sessionId)` when the URL changes.

If `CopilotPanel` doesn't yet accept `standalone`, extend its props in a small edit:

```tsx
export interface CopilotPanelProps { standalone?: boolean; }
export function CopilotPanel({ standalone = false }: CopilotPanelProps = {}) { /* ... */ }
```

Pass `standalone` to `CopilotHeader` which hides the `×` close button when true.

- [ ] **Step 4: Typecheck and commit**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/app/modes/StandaloneMode.tsx packages/widget/src/app/useSessionUrlSync.ts packages/widget/src/ui/CopilotPanel.tsx packages/widget/src/ui/CopilotHeader.tsx
git commit -m "widget: standalone mode with history.pushState URL sync"
```

---

### Task 39: Embedded mode component (bubble + panel + postMessage send)

**Files:**
- Create: `packages/widget/src/app/modes/EmbeddedMode.tsx`

- [ ] **Step 1: Create**

```tsx
// packages/widget/src/app/modes/EmbeddedMode.tsx
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';

import { CopilotPanel } from '../../ui/CopilotPanel.js';
import { useT } from '../i18nContext.js';
import { postResize } from '../postMessageClient.js';

const MOBILE_BREAKPOINT = 480;

export function EmbeddedMode({ hostViewportW }: { hostViewportW: number | null }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const isMobile = (hostViewportW ?? 1024) < MOBILE_BREAKPOINT;

  const openPanel = useCallback(() => {
    setOpen(true);
    postResize(isMobile ? 'fullscreen' : 'panel');
  }, [isMobile]);

  const closePanel = useCallback(() => {
    setOpen(false);
    postResize('bubble');
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closePanel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closePanel]);

  if (!open) {
    return (
      <button
        type="button"
        aria-label={t('openChat')}
        onClick={openPanel}
        className="w-full h-full rounded-full bg-primary text-primary-foreground flex items-center justify-center"
      >
        <MessageCircle className="size-6" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="openflow-panel-title"
      className="w-full h-full"
    >
      <CopilotPanel onClose={closePanel} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (expect `postResize` missing until next task); commit when green after next task**

Note: this compiles only after Task 40 adds `postMessageClient.ts`. Move on to Task 40 before committing; we commit both together if typecheck depends on both.

---

### Task 40: Widget-side postMessage client

**Files:**
- Create: `packages/widget/src/app/postMessageClient.ts`

- [ ] **Step 1: Create**

```ts
// packages/widget/src/app/postMessageClient.ts
export type WidgetOutbound =
  | { type: 'openflow:ready'; nonce: string }
  | { type: 'openflow:resize'; nonce: string; w: number | string; h: number | string; pos: 'bubble' | 'panel' | 'fullscreen' }
  | { type: 'openflow:telemetry'; nonce: string; event: string; data?: unknown };

export type HostInbound =
  | { type: 'openflow:init'; nonce: string; hostOrigin: string; path: string; viewportW: number }
  | { type: 'openflow:viewport'; nonce: string; viewportW: number };

let nonce: string | null = null;
let hostOrigin: string | null = null;
let viewportW: number | null = null;
let readyCallbacks: Array<(v: { viewportW: number }) => void> = [];

export function isHostMessage(data: unknown): data is HostInbound {
  return typeof data === 'object' && data !== null
    && typeof (data as Record<string, unknown>).type === 'string'
    && typeof (data as Record<string, unknown>).nonce === 'string';
}

export function initMessageBridge(onViewportChange: (w: number) => void): void {
  window.addEventListener('message', (e) => {
    if (!isHostMessage(e.data)) return;
    // Accept the first init regardless of current state, then lock origin+nonce.
    if (e.data.type === 'openflow:init') {
      if (nonce === null) {
        nonce = e.data.nonce;
        hostOrigin = e.origin;
        viewportW = e.data.viewportW;
        for (const cb of readyCallbacks) cb({ viewportW: e.data.viewportW });
        readyCallbacks = [];
        postReady();
      }
      return;
    }
    if (e.origin !== hostOrigin || e.data.nonce !== nonce) return;
    if (e.data.type === 'openflow:viewport') {
      viewportW = e.data.viewportW;
      onViewportChange(e.data.viewportW);
    }
  });
}

export function awaitInit(): Promise<{ viewportW: number }> {
  if (nonce !== null && viewportW !== null) return Promise.resolve({ viewportW });
  return new Promise((r) => readyCallbacks.push(r));
}

function postReady(): void {
  if (!nonce || !hostOrigin) return;
  window.parent.postMessage({ type: 'openflow:ready', nonce }, hostOrigin);
}

export function postResize(pos: 'bubble' | 'panel' | 'fullscreen'): void {
  if (!nonce || !hostOrigin) return;
  const dims =
    pos === 'bubble' ? { w: 56, h: 56 }
      : pos === 'fullscreen' ? { w: '100vw', h: '100vh' }
      : { w: 400, h: '100vh' };
  window.parent.postMessage(
    { type: 'openflow:resize', nonce, pos, ...dims },
    hostOrigin
  );
}

export function postTelemetry(event: string, data?: unknown): void {
  if (!nonce || !hostOrigin) return;
  window.parent.postMessage({ type: 'openflow:telemetry', nonce, event, data }, hostOrigin);
}
```

- [ ] **Step 2: Typecheck, then commit both EmbeddedMode and this file**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/app/postMessageClient.ts packages/widget/src/app/modes/EmbeddedMode.tsx
git commit -m "widget: embedded mode + postMessage client"
```

---

### Task 41: `ChatApp` root — mode detect, version resolve, history

**Files:**
- Create: `packages/widget/src/app/ChatApp.tsx` (replace stub)

- [ ] **Step 1: Replace the stub**

```tsx
// packages/widget/src/app/ChatApp.tsx
import { useEffect, useState } from 'react';

import { fetchLatestVersion } from '../api/latestVersionClient.js';
import { parseAgentHost } from '../routing/parseHostname.js';
import { pickLocale, type Locale } from '../i18n/index.js';
import { EmbeddedMode } from './modes/EmbeddedMode.js';
import { StandaloneMode } from './modes/StandaloneMode.js';
import { I18nProvider } from './i18nContext.js';
import { awaitInit, initMessageBridge } from './postMessageClient.js';
import { isEmbedded } from './useEmbedded.js';

interface Resolved {
  tenant: string; agentSlug: string; version: number;
}

function parseDevOverride(): { tenant: string; agentSlug: string } | null {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('tenant');
  const a = params.get('agent');
  if (t && a) return { tenant: t, agentSlug: a };
  return null;
}

function parseVersionPath(): number | 'latest' {
  const m = window.location.pathname.match(/^\/v\/(\d{1,6})$/);
  if (m) return Number(m[1]);
  return 'latest';
}

export function ChatApp() {
  const embedded = isEmbedded();
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [viewportW, setViewportW] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryLang = new URLSearchParams(window.location.search).get('lang');
  const locale: Locale = pickLocale(queryLang, navigator.language);

  useEffect(() => {
    if (embedded) {
      initMessageBridge((w) => setViewportW(w));
      void awaitInit().then(({ viewportW: w }) => setViewportW(w));
    }
  }, [embedded]);

  useEffect(() => {
    void (async () => {
      try {
        const host = parseDevOverride() ?? parseAgentHost(window.location.hostname);
        if (!host) { setError('not_found'); return; }
        const versionOrLatest = parseVersionPath();
        const version = versionOrLatest === 'latest'
          ? await fetchLatestVersion(host.tenant, host.agentSlug)
          : versionOrLatest;
        setResolved({ ...host, version });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'init_failed');
      }
    })();
  }, []);

  if (error === 'not_found') {
    return <div className="p-8 text-center">Agent not found</div>;
  }
  if (!resolved) {
    return <div className="p-8 text-center">Initializing…</div>;
  }

  return (
    <I18nProvider locale={locale}>
      {embedded
        ? <EmbeddedMode hostViewportW={viewportW} />
        : <StandaloneMode />}
    </I18nProvider>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/app/ChatApp.tsx
git commit -m "widget: ChatApp wires hostname, version, mode, i18n"
```

---

### Task 42: Wire `CopilotPanel` to live chat (sessions + streaming)

**Files:**
- Modify: `packages/widget/src/ui/CopilotPanel.tsx`

- [ ] **Step 1: Extend `CopilotPanel` to drive execute/SSE/IDB**

The ported panel currently has no live chat wiring. Add:
- Reads `tenant`, `agentSlug`, `version` from a context (create `AgentContext` in `app/agentContext.tsx`).
- Uses `useSessions({ tenant, agentSlug })` for history + persistence.
- On user send: `appendUserMessage(text)`, then calls `execute(...)`, feeds each event into a `BlockCoalescer`, re-renders the partial assistant message. On `done`, `finalizeAssistantMessage(coalescer.finalize())`. On `error`, show inline banner.
- Shows `sessionOnly` label in the history dropdown when `backendKind === 'memory'`.
- Shows `assistantUnavailable` terminal state on 404/410 from the execute call.

Because the original `CopilotPanel` used `useCopilotStreaming`, replace that with a small inline controller — don't port `useCopilotStreaming` since the SSE flow is its replacement.

Key inline structure (pseudocode to guide the concrete rewrite — show full file in the commit):
```tsx
function useLiveStreaming({ tenant, agent, version }: AgentCtx) {
  const sessions = useSessions({ tenant, agentSlug: agent });
  const [streaming, setStreaming] = useState<CopilotMessageBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<'unavailable' | null>(null);

  const send = useCallback(async (text: string) => {
    if (!sessions.currentSessionId) await sessions.createSession();
    await sessions.appendUserMessage(text);
    const coalescer = new BlockCoalescer();
    setStreaming([]);
    try {
      for await (const ev of execute({
        tenant, agent, version,
        tenantId: tenant, userId: sessions.currentSessionId!, sessionId: sessions.currentSessionId!,
        text,
      })) {
        if (ev.type === 'error') { setError(ev.message); break; }
        if (ev.type === 'done') {
          await sessions.finalizeAssistantMessage(coalescer.finalize());
          break;
        }
        coalescer.push(ev);
        setStreaming(coalescer.snapshot());
      }
    } catch (e) {
      if (e instanceof Error && /404|410/.test(e.message)) setTerminal('unavailable');
      else setError(e instanceof Error ? e.message : String(e));
    } finally { setStreaming(null); }
  }, [sessions, tenant, agent, version]);

  return { ...sessions, streaming, error, terminal, send };
}
```

Build the panel on top. Long file; show the whole file in the commit's diff, no `// ...` elisions.

- [ ] **Step 2: Add `AgentContext`**

```tsx
// packages/widget/src/app/agentContext.tsx
import { createContext, useContext, type ReactNode } from 'react';

export interface AgentCtx { tenant: string; agentSlug: string; version: number; }

const AgentContext = createContext<AgentCtx | null>(null);

export function AgentProvider({ value, children }: { value: AgentCtx; children: ReactNode }) {
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentCtx {
  const v = useContext(AgentContext);
  if (!v) throw new Error('useAgent must be inside AgentProvider');
  return v;
}
```

Wrap `EmbeddedMode`/`StandaloneMode` with `<AgentProvider value={resolved}>` in `ChatApp`.

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck -w packages/widget
git add -- packages/widget/src/ui/CopilotPanel.tsx packages/widget/src/app/agentContext.tsx packages/widget/src/app/ChatApp.tsx
git commit -m "widget: live streaming wired into CopilotPanel"
```

---

### Task 43: Wire `main.tsx` to mount `ChatApp`

**Files:**
- Modify: `packages/widget/src/main.tsx`

- [ ] **Step 1: Ensure it mounts ChatApp and imports Tailwind**

```tsx
// packages/widget/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tailwind.css';
import { ChatApp } from './app/ChatApp.js';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode><ChatApp /></StrictMode>
  );
}
```

- [ ] **Step 2: Build and smoke test**

```bash
npm run build -w packages/widget
ls packages/widget/dist/
```

Expected: `dist/index.html` + hashed assets + `script.js`.

- [ ] **Step 3: Commit**

```bash
git add -- packages/widget/src/main.tsx
git commit -m "widget: wire main.tsx to ChatApp"
```

---

# Group 13 — Widget loader

### Task 44: Loader — parse, data-version, data-autoload stubs

**Files:**
- Modify: `packages/widget/src/loader/script.ts`

- [ ] **Step 1: Replace the placeholder**

```ts
// packages/widget/src/loader/script.ts
import { randomUUID } from '../lib/uuid.js';

interface GlobalAPI {
  boot: () => void;
  debug: () => Record<string, unknown>;
  version: string;
}
declare global { interface Window { OpenFlowWidget?: GlobalAPI; } }

const LOADER_VERSION = '0.1.0';
const APP_ORIGIN_DEFAULT = 'https://app.openflow.build';
const CSP_TIMEOUT_MS = 8000;
const HANDSHAKE_INTERVAL_MS = 200;
const VIEWPORT_DEBOUNCE_MS = 100;
const IFRAME_Z = 2147483647;

function resolveScriptElement(): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current) return current;
  const scripts = Array.from(document.getElementsByTagName('script'));
  return scripts.reverse().find((s) => /live\.openflow\.build\/script\.js/.test(s.src)) ?? null;
}

function parseSubdomain(host: string): { tenant: string; agent: string } | null {
  const sub = host.split('.')[0] ?? '';
  const firstDash = sub.indexOf('-');
  if (firstDash <= 0) return null;
  return { tenant: sub.slice(0, firstDash), agent: sub.slice(firstDash + 1) };
}

const debugState: Record<string, unknown> = {
  version: LOADER_VERSION, bootCalled: false,
};

function init(): void {
  const scriptEl = resolveScriptElement();
  if (!scriptEl) {
    console.warn('OpenFlowWidget: could not resolve its own <script> tag');
    return;
  }
  const url = new URL(scriptEl.src);
  const sub = parseSubdomain(url.host);
  if (!sub) {
    console.warn('OpenFlowWidget: invalid script host', url.host);
    return;
  }

  const explicitVersion = scriptEl.dataset.version;
  const autoload = scriptEl.dataset.autoload !== 'false';

  Object.assign(debugState, {
    host: url.host, tenant: sub.tenant, agent: sub.agent,
    autoload, explicitVersion: explicitVersion ?? null,
  });

  window.OpenFlowWidget = {
    boot: () => boot(scriptEl, url.host, sub, explicitVersion),
    debug: () => ({ ...debugState }),
    version: LOADER_VERSION,
  };

  console.info(`OpenFlowWidget v${LOADER_VERSION} loaded for ${url.host}`);

  if (autoload) boot(scriptEl, url.host, sub, explicitVersion);
}

// Stubs to be filled in Tasks 45–48.
function boot(_el: HTMLScriptElement, _host: string, _sub: { tenant: string; agent: string }, _v: string | undefined): void {
  debugState.bootCalled = true;
  // implemented in Task 45+
}

init();
```

- [ ] **Step 2: Build loader**

```bash
npm run build:loader -w packages/widget
```

Expected: `dist/script.js` present.

- [ ] **Step 3: Commit**

```bash
git add -- packages/widget/src/loader/script.ts
git commit -m "widget-loader: parse script tag, expose OpenFlowWidget, boot stub"
```

---

### Task 45: Loader — version resolve + iframe injection

**Files:**
- Modify: `packages/widget/src/loader/script.ts`

- [ ] **Step 1: Flesh out `boot()`**

Replace the stub `boot()` with:

```ts
function boot(
  _el: HTMLScriptElement,
  host: string,
  sub: { tenant: string; agent: string },
  explicitVersion: string | undefined
): void {
  debugState.bootCalled = true;
  const appOrigin = (window as { OPENFLOW_APP_ORIGIN?: string }).OPENFLOW_APP_ORIGIN ?? APP_ORIGIN_DEFAULT;

  void (async () => {
    let version: string;
    if (explicitVersion && /^\d{1,6}$/.test(explicitVersion)) {
      version = explicitVersion;
    } else {
      try {
        const res = await fetch(
          `${appOrigin}/api/chat/latest-version/${sub.tenant}/${sub.agent}`,
          { cache: 'no-store' }
        );
        const data = (await res.json()) as { version: number };
        version = String(data.version);
      } catch (e) {
        console.warn('OpenFlowWidget: failed to resolve latest version', e);
        return;
      }
    }
    debugState.version = version;

    const iframe = document.createElement('iframe');
    iframe.src = `https://${host}/v/${version}`;
    iframe.title = 'OpenFlow chat widget';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.loading = 'eager';
    iframe.style.cssText = [
      'border:0',
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'width:56px',
      'height:56px',
      `z-index:${IFRAME_Z}`,
      'color-scheme:normal',
    ].join(';');
    document.body.appendChild(iframe);
    debugState.iframeUrl = iframe.src;

    startHandshake(iframe);
  })();
}

// To be implemented in Task 46.
function startHandshake(_iframe: HTMLIFrameElement): void {
  // ...
}
```

- [ ] **Step 2: Build**

```bash
npm run build:loader -w packages/widget
```

- [ ] **Step 3: Commit**

```bash
git add -- packages/widget/src/loader/script.ts
git commit -m "widget-loader: version resolution + iframe injection"
```

---

### Task 46: Loader — postMessage handshake with bounded retry

**Files:**
- Modify: `packages/widget/src/loader/script.ts`

- [ ] **Step 1: Replace `startHandshake` stub**

```ts
function startHandshake(iframe: HTMLIFrameElement): void {
  const nonce = randomUUID();
  const iframeOrigin = new URL(iframe.src).origin;
  let readyReceived = false;

  function onMessage(e: MessageEvent): void {
    if (e.origin !== iframeOrigin) return;
    const data = e.data as { type?: unknown; nonce?: unknown };
    if (typeof data?.type !== 'string' || data.nonce !== nonce) return;
    if (data.type === 'openflow:ready') {
      readyReceived = true;
      debugState.ready = true;
    } else if (data.type === 'openflow:resize') {
      applyResize(iframe, data as unknown as { pos: string; w: number | string; h: number | string });
    } else if (data.type === 'openflow:telemetry') {
      debugState.lastTelemetry = data;
    }
  }
  window.addEventListener('message', onMessage);

  function postInit(): void {
    // contentWindow is null if the iframe was removed from the DOM between
    // insertion and this tick; skip rather than throwing and keep the retry
    // loop quiet until the CSP timeout decides to bail.
    if (iframe.contentWindow === null) return;
    const msg = {
      type: 'openflow:init',
      nonce,
      hostOrigin: window.location.origin,
      path: window.location.pathname,
      viewportW: window.innerWidth,
    };
    iframe.contentWindow.postMessage(msg, iframeOrigin);
  }

  const retryTimer = setInterval(() => {
    if (readyReceived) { clearInterval(retryTimer); return; }
    if (!iframe.isConnected) { clearInterval(retryTimer); return; }
    postInit();
  }, HANDSHAKE_INTERVAL_MS);

  setTimeout(() => {
    if (readyReceived) return;
    clearInterval(retryTimer);
    console.warn(
      `OpenFlowWidget: iframe did not respond within ${CSP_TIMEOUT_MS}ms. ` +
      'Check Content-Security-Policy: frame-src ' + iframeOrigin + '; ' +
      'script-src ' + iframeOrigin + '; ' +
      'connect-src https://app.openflow.build'
    );
  }, CSP_TIMEOUT_MS);

  // Forward viewport changes (Task 47).
  wireViewportForwarding(iframe, nonce, iframeOrigin);

  // Teardown (Task 47).
  wireTeardown(iframe, onMessage);
}

function applyResize(iframe: HTMLIFrameElement, msg: { pos: string; w: number | string; h: number | string }): void {
  if (msg.pos === 'bubble') {
    iframe.style.cssText = `border:0;position:fixed;bottom:16px;right:16px;width:56px;height:56px;z-index:${IFRAME_Z};color-scheme:normal`;
  } else if (msg.pos === 'fullscreen') {
    iframe.style.cssText = `border:0;position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:${IFRAME_Z};color-scheme:normal`;
  } else {
    iframe.style.cssText = `border:0;position:fixed;top:24px;right:14px;bottom:24px;width:${typeof msg.w === 'number' ? msg.w + 'px' : msg.w};z-index:${IFRAME_Z};color-scheme:normal`;
  }
}

function wireViewportForwarding(_iframe: HTMLIFrameElement, _nonce: string, _iframeOrigin: string): void {
  // Task 47.
}
function wireTeardown(_iframe: HTMLIFrameElement, _onMessage: (e: MessageEvent) => void): void {
  // Task 47.
}
```

- [ ] **Step 2: Build and commit**

```bash
npm run build:loader -w packages/widget
git add -- packages/widget/src/loader/script.ts
git commit -m "widget-loader: postMessage handshake (nonce, retry, CSP warning)"
```

---

### Task 47: Loader — viewport forwarding + pagehide teardown

**Files:**
- Modify: `packages/widget/src/loader/script.ts`

- [ ] **Step 1: Replace the two stub helpers**

```ts
function wireViewportForwarding(
  iframe: HTMLIFrameElement,
  nonce: string,
  iframeOrigin: string
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  function post(): void {
    iframe.contentWindow?.postMessage(
      { type: 'openflow:viewport', nonce, viewportW: window.innerWidth },
      iframeOrigin
    );
  }
  function onResize(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(post, VIEWPORT_DEBOUNCE_MS);
  }
  window.addEventListener('resize', onResize);
}

function wireTeardown(
  iframe: HTMLIFrameElement,
  onMessage: (e: MessageEvent) => void
): void {
  function teardown(): void {
    window.removeEventListener('message', onMessage);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }
  window.addEventListener('pagehide', teardown);
  window.addEventListener('beforeunload', teardown);
}
```

- [ ] **Step 2: Build and commit**

```bash
npm run build:loader -w packages/widget
git add -- packages/widget/src/loader/script.ts
git commit -m "widget-loader: viewport forwarding + pagehide teardown"
```

---

# Group 14 — Widget debug + telemetry

### Task 48: Debug query-param trigger

**Files:**
- Modify: `packages/widget/src/loader/script.ts`

- [ ] **Step 1: Call `debug()` when `?openflow_debug=1` is in the URL**

At the end of `init()`:

```ts
if (new URLSearchParams(window.location.search).get('openflow_debug') === '1') {
  console.info('OpenFlowWidget debug', window.OpenFlowWidget?.debug());
}
```

- [ ] **Step 2: Build and commit**

```bash
npm run build:loader -w packages/widget
git add -- packages/widget/src/loader/script.ts
git commit -m "widget-loader: ?openflow_debug=1 auto-prints debug state"
```

---

# Group 15 — Local dev integration

### Task 49: Dev host page

**Files:**
- Create: `packages/web/public/widget-dev-host.html`

- [ ] **Step 1: Create**

```html
<!-- packages/web/public/widget-dev-host.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>OpenFlow widget dev host</title>
  </head>
  <body style="margin:0;padding:40px;font:14px system-ui">
    <h1>Widget dev host</h1>
    <p>This page embeds the local widget via the loader script.</p>
    <script>
      // Point the loader (built for production subdomains) at the local Vite SPA.
      window.OPENFLOW_APP_ORIGIN = 'http://localhost:3101';
    </script>
    <script
      src="http://localhost:5173/src/loader/script.ts"
      data-dev="1"
      async></script>
  </body>
</html>
```

Note: during dev the loader runs from the Vite dev server (TS served as JS via Vite transform). `OPENFLOW_APP_ORIGIN` is read by the loader's fetch call.

- [ ] **Step 2: Commit**

```bash
git add -- packages/web/public/widget-dev-host.html
git commit -m "web: widget dev host page"
```

---

### Task 50: Widget dev-mode host override (already implemented in ChatApp)

This is already covered by `parseDevOverride()` in Task 41 — `?tenant=…&agent=…` short-circuits the hostname parser. Confirm with a manual smoke:

- [ ] **Step 1: Run the three services together**

```bash
ENABLE_MOCK_EXECUTE=true npm run dev -w packages/backend &
npm run dev -w packages/web &
npm run dev -w packages/widget &
sleep 6
open 'http://localhost:5173/?tenant=acme&agent=agent-example'
```

Expected: standalone chat renders; sending a message triggers a streaming response from the mock catalog.

- [ ] **Step 2: Commit (only if anything changed)**

No changes expected — this is a verification step only.

---

### Task 51: Root-level `npm run dev` concurrent script

**Files:**
- Modify: `package.json` (repo root)

- [ ] **Step 1: Add `concurrently` as a dev dep**

```bash
npm install -D concurrently -w .
```

- [ ] **Step 2: Add `dev` script**

In root `package.json`, add:

```json
{
  "scripts": {
    "dev": "concurrently -n backend,web,widget \"ENABLE_MOCK_EXECUTE=true npm run dev -w packages/backend\" \"npm run dev -w packages/web\" \"npm run dev -w packages/widget\""
  }
}
```

- [ ] **Step 3: Verify**

```bash
npm run dev
# Ctrl+C after confirming all three servers started
```

- [ ] **Step 4: Commit**

```bash
git add -- package.json package-lock.json
git commit -m "repo: one-command dev across backend, web, widget"
```

---

# Group 16 — Manual QA run-through

### Task 52: Run the spec's manual test checklist

**Files:** none (manual verification)

- [ ] **Step 1: Format + lint + typecheck the whole repo**

```bash
npm run check
```

Expected: green. Fix anything that fails before proceeding.

- [ ] **Step 2: Unit + integration tests everywhere**

```bash
npm test -w packages/shared-validation
npm test -w packages/backend -- --testPathPattern=mock
npm test -w packages/widget
```

Expected: all green.

- [ ] **Step 3: Start full dev stack**

```bash
npm run dev
```

- [ ] **Step 4: Embedded mode manual checks**

Open `http://localhost:3101/widget-dev-host.html` in Chrome:
- Bubble appears bottom-right
- Click bubble → panel expands (400 × viewport height)
- Send a message → streaming response appears
- Reload → history dropdown shows prior session
- × closes panel back to bubble
- Escape closes panel
- Tab cycles focus within panel
- Shrink browser to < 480px width, reopen panel → goes fullscreen

- [ ] **Step 5: Standalone mode**

Open `http://localhost:5173/?tenant=acme&agent=agent-example`:
- Fullscreen chat layout centered
- Send + stream works
- `history.pushState` visible in the URL after sending
- Browser back → returns to previous session (or empty state)

- [ ] **Step 6: Fallback paths**

- DevTools → Application → Disable IndexedDB (or use a private window). Send a message.
  Expected: chat still works; history dropdown shows "session-only" label.
- DevTools → Network → Block `app.openflow.build/api/chat/latest-version/…`.
  Expected: "Initializing…" label, retry, eventually a "Retry" button.

- [ ] **Step 7: CSP failure path**

Inject a strict CSP in `widget-dev-host.html` (`<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`). Reload.
Expected: after 8s, console warning with CSP checklist.

- [ ] **Step 8: Browser matrix**

Repeat Step 4's checks in Firefox, Safari, Edge (latest stable). Note any divergence as follow-up tickets — do not block on them unless critical.

- [ ] **Step 9: Accessibility sweep with axe**

```bash
# From devtools in each mode, run:
# axe.run()  (axe browser extension)
```

Expected: 0 violations in embedded and standalone layouts.

- [ ] **Step 10: Commit a QA-pass marker only if something changed**

Typically nothing to commit here; if tweaks were needed, stage those specific files with `git add -- <path>` and commit with `chore: QA fixes`.

---

### Task 53: Integrator embed guide

**Files:**
- Create: `packages/widget/README.md`

- [ ] **Step 1: Write the guide**

```md
# OpenFlow Chat Widget

Embed an OpenFlow agent on any website with one script tag.

## Quick start

Place this in the `<head>` or end of `<body>` of any page:

```html
<script src="https://<tenant>-<agent>.live.openflow.build/script.js" async></script>
```

The `<tenant>` and `<agent>` segments are provided when you publish an agent.

## Options

- `data-version="N"` pins the iframe to agent version `N`. Omit to always use the latest
  published version.
- `data-autoload="false"` defers iframe creation; call `window.OpenFlowWidget.boot()` after
  your consent banner is accepted.

## Content-Security-Policy

If your site sets CSP, include:

```
script-src  https://<tenant>-<agent>.live.openflow.build;
frame-src   https://<tenant>-<agent>.live.openflow.build;
connect-src https://app.openflow.build;
```

Wildcard forms (`*.live.openflow.build`) also work. If the widget bubble never appears, open
the browser console — we log a CSP checklist warning if the iframe fails to initialize within
eight seconds.

## Debugging

- Add `?openflow_debug=1` to your page URL to have the loader log its resolved state on load.
- Call `window.OpenFlowWidget.debug()` in the browser console at any time.
- The loader logs its version on script load as a single `console.info` line.

## Privacy

- No cookies are set by the widget.
- Conversation history is stored locally in IndexedDB scoped to the chat subdomain. Some
  browsers (Safari ITP, Firefox strict mode) partition or block storage for cross-site
  iframes; the widget transparently falls back to in-memory and chat still works, though
  prior sessions won't persist for those users.
- Message content is sent to `app.openflow.build`. Disclose the widget in your privacy policy.

## Direct-visit URL

`https://<tenant>-<agent>.live.openflow.build` is also a standalone chat page. You can share
this URL directly — it renders a full-viewport ChatGPT-style chat rather than the bubble.
```

- [ ] **Step 2: Commit**

```bash
git add -- packages/widget/README.md
git commit -m "widget: integrator embed guide"
```

---

## Done criteria

- [ ] All 53 tasks completed, each committed separately
- [ ] `npm run check` green at the root
- [ ] Manual QA checklist in Task 52 all pass
- [ ] Integrator README exists and mirrors the spec's CSP + debug + privacy guidance
- [ ] Linear OF-2 ready for review with the ~80 KB scope-delta note attached
