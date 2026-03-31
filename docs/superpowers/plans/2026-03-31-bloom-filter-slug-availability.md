# Bloom Filter Slug Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real-time name availability checking for org and agent creation using bloom filters stored in PostgreSQL.

**Architecture:** A `slug_bloom_filters` table stores two `bit(9600)` bitmaps (one for orgs, one for agents). The backend exposes `POST /slugs/check-availability` which computes hash positions using double-hashing FNV-1a, builds a bitmask, and runs a bitwise check query. The frontend uses a shared `useSlugAvailability` hook with 1200ms debounce to call the check via a server action, disabling the create button with a spinner while checking.

**Tech Stack:** PostgreSQL `bit(9600)`, Express.js, Next.js server actions, React hooks

**Spec:** `docs/superpowers/specs/2026-03-31-bloom-filter-slug-availability-design.md`

---

### Task 1: Bloom filter utility — hashing and bitmask generation

**Files:**
- Create: `packages/backend/src/utils/bloomFilter.ts`
- Create: `packages/backend/src/utils/__tests__/bloomFilter.test.ts`

This is a pure utility with no DB or HTTP dependencies. It provides two functions: `computeBloomPositions(slug)` returns 7 bit positions, and `buildBitmask(slug)` returns a `bit(9600)` string.

- [ ] **Step 1: Write the failing test for `computeBloomPositions`**

In `packages/backend/src/utils/__tests__/bloomFilter.test.ts`:

```typescript
import { computeBloomPositions } from '../bloomFilter.js';

describe('computeBloomPositions', () => {
  it('returns exactly 7 positions', () => {
    const positions = computeBloomPositions('my-org');
    expect(positions).toHaveLength(7);
  });

  it('all positions are within [0, 9600)', () => {
    const positions = computeBloomPositions('my-org');
    for (const pos of positions) {
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(9600);
    }
  });

  it('returns the same positions for the same input', () => {
    const a = computeBloomPositions('hello-world');
    const b = computeBloomPositions('hello-world');
    expect(a).toEqual(b);
  });

  it('returns different positions for different inputs', () => {
    const a = computeBloomPositions('org-alpha');
    const b = computeBloomPositions('org-beta');
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=bloomFilter`
Expected: FAIL — `computeBloomPositions` not found

- [ ] **Step 3: Implement `computeBloomPositions`**

In `packages/backend/src/utils/bloomFilter.ts`:

```typescript
const BLOOM_SIZE = 9600;
const NUM_HASHES = 7;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const UINT32_MASK = 0xffffffff;

function fnv1a(input: string, seed: number): number {
  let hash = (FNV_OFFSET_BASIS ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export function computeBloomPositions(slug: string): number[] {
  const h1 = fnv1a(slug, 0);
  const h2 = fnv1a(slug, h1 || 1);
  const positions: number[] = [];
  for (let i = 0; i < NUM_HASHES; i++) {
    const combined = ((h1 + Math.imul(i, h2)) & UINT32_MASK) >>> 0;
    positions.push(combined % BLOOM_SIZE);
  }
  return positions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w packages/backend -- --testPathPattern=bloomFilter`
Expected: PASS

- [ ] **Step 5: Write the failing test for `buildBitmask`**

Add to `packages/backend/src/utils/__tests__/bloomFilter.test.ts`:

```typescript
import { buildBitmask, computeBloomPositions } from '../bloomFilter.js';

describe('buildBitmask', () => {
  it('returns a string of exactly 9600 characters', () => {
    const mask = buildBitmask('my-org');
    expect(mask).toHaveLength(9600);
  });

  it('contains only 0s and 1s', () => {
    const mask = buildBitmask('my-org');
    expect(mask).toMatch(/^[01]+$/);
  });

  it('has exactly 7 bits set (one per hash)', () => {
    const mask = buildBitmask('my-org');
    const ones = [...mask].filter((c) => c === '1').length;
    // Could be fewer than 7 if hash positions collide, but at least 1
    expect(ones).toBeGreaterThanOrEqual(1);
    expect(ones).toBeLessThanOrEqual(7);
  });

  it('has 1s at exactly the computed positions', () => {
    const slug = 'test-slug';
    const positions = computeBloomPositions(slug);
    const mask = buildBitmask(slug);
    for (const pos of positions) {
      expect(mask[pos]).toBe('1');
    }
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -w packages/backend -- --testPathPattern=bloomFilter`
Expected: FAIL — `buildBitmask` not found

- [ ] **Step 7: Implement `buildBitmask`**

Add to `packages/backend/src/utils/bloomFilter.ts`:

```typescript
export function buildBitmask(slug: string): string {
  const bits = new Uint8Array(BLOOM_SIZE);
  const positions = computeBloomPositions(slug);
  for (const pos of positions) {
    bits[pos] = 1;
  }
  return Array.from(bits).join('');
}
```

- [ ] **Step 8: Run all bloom filter tests**

Run: `npm run test -w packages/backend -- --testPathPattern=bloomFilter`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/utils/bloomFilter.ts packages/backend/src/utils/__tests__/bloomFilter.test.ts
git commit -m "feat: add bloom filter hashing and bitmask utility"
```

---

### Task 2: Database migration — `slug_bloom_filters` table

**Files:**
- Create: `supabase/migrations/20260331200000_slug_bloom_filters.sql`

- [ ] **Step 1: Write the migration**

In `supabase/migrations/20260331200000_slug_bloom_filters.sql`:

```sql
-- Bloom filter storage for slug availability checking.
-- Each row holds a bit(9600) bitmap representing all slugs in the target table.
-- Check: (bitmap & bitmask) = bitmask  -> slug MIGHT exist
-- Update: bitmap = bitmap | bitmask    -> add slug to filter

CREATE TABLE slug_bloom_filters (
  table_name TEXT PRIMARY KEY,
  bitmap     BIT(9600) NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with empty (all-zero) bitmaps for the two tables we track.
INSERT INTO slug_bloom_filters (table_name, bitmap, item_count)
VALUES
  ('organizations', repeat('0', 9600)::bit(9600), 0),
  ('agents', repeat('0', 9600)::bit(9600), 0);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260331200000_slug_bloom_filters.sql
git commit -m "feat: add slug_bloom_filters migration"
```

---

### Task 3: Backend DB queries — check and update bloom filter

**Files:**
- Create: `packages/backend/src/db/queries/bloomFilterQueries.ts`

- [ ] **Step 1: Implement the query functions**

In `packages/backend/src/db/queries/bloomFilterQueries.ts`:

```typescript
import type { SupabaseClient } from './operationHelpers.js';

type SlugTable = 'agents' | 'organizations';

interface BloomCheckRow {
  might_exist: boolean;
}

function isBloomCheckRow(value: unknown): value is BloomCheckRow {
  return typeof value === 'object' && value !== null && 'might_exist' in value;
}

export async function checkBloomFilter(
  supabase: SupabaseClient,
  bitmask: string,
  table: SlugTable
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_slug_bloom', {
    p_bitmask: bitmask,
    p_table_name: table,
  });

  if (error !== null) throw new Error(error.message);
  if (!isBloomCheckRow(data)) return true;
  return data.might_exist;
}

export async function updateBloomFilter(
  supabase: SupabaseClient,
  bitmask: string,
  table: SlugTable
): Promise<void> {
  const { error } = await supabase.rpc('update_slug_bloom', {
    p_bitmask: bitmask,
    p_table_name: table,
  });

  if (error !== null) throw new Error(error.message);
}
```

Wait — Supabase JS client doesn't support raw SQL with `bit` type operations easily. We should use `.rpc()` with Postgres functions, or use the Supabase client's `.from()` with raw filters. Let me reconsider.

The simplest approach: use Supabase's `.rpc()` calling two small Postgres functions defined in the migration. This avoids raw SQL in the application layer.

- [ ] **Step 2: Update the migration to add Postgres functions**

Append to `supabase/migrations/20260331200000_slug_bloom_filters.sql`:

```sql
-- RPC function: check if a slug might exist in the bloom filter.
-- Returns a single row with { might_exist: boolean }.
CREATE OR REPLACE FUNCTION check_slug_bloom(p_bitmask BIT(9600), p_table_name TEXT)
RETURNS TABLE(might_exist BOOLEAN) AS $$
  SELECT (bitmap & p_bitmask) = p_bitmask AS might_exist
  FROM slug_bloom_filters
  WHERE table_name = p_table_name;
$$ LANGUAGE sql STABLE;

-- RPC function: add a slug to the bloom filter by OR-ing its bitmask.
CREATE OR REPLACE FUNCTION update_slug_bloom(p_bitmask BIT(9600), p_table_name TEXT)
RETURNS VOID AS $$
  UPDATE slug_bloom_filters
  SET bitmap = bitmap | p_bitmask,
      item_count = item_count + 1,
      updated_at = now()
  WHERE table_name = p_table_name;
$$ LANGUAGE sql VOLATILE;
```

- [ ] **Step 3: Implement the query functions**

In `packages/backend/src/db/queries/bloomFilterQueries.ts`:

```typescript
import type { SupabaseClient } from './operationHelpers.js';

type SlugTable = 'agents' | 'organizations';

interface BloomCheckResult {
  might_exist: boolean;
}

function isBloomCheckResult(value: unknown): value is BloomCheckResult {
  return typeof value === 'object' && value !== null && 'might_exist' in value;
}

export async function checkBloomFilter(
  supabase: SupabaseClient,
  bitmask: string,
  table: SlugTable
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_slug_bloom', {
    p_bitmask: bitmask,
    p_table_name: table,
  });

  if (error !== null) throw new Error(error.message);

  // rpc returns an array for TABLE-returning functions
  const row = Array.isArray(data) ? data[0] : data;
  if (!isBloomCheckResult(row)) return true;
  return row.might_exist;
}

export async function updateBloomFilter(
  supabase: SupabaseClient,
  bitmask: string,
  table: SlugTable
): Promise<void> {
  const { error } = await supabase.rpc('update_slug_bloom', {
    p_bitmask: bitmask,
    p_table_name: table,
  });

  if (error !== null) throw new Error(error.message);
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260331200000_slug_bloom_filters.sql packages/backend/src/db/queries/bloomFilterQueries.ts
git commit -m "feat: add bloom filter DB queries and Postgres functions"
```

---

### Task 4: Backend endpoint — `POST /slugs/check-availability`

**Files:**
- Create: `packages/backend/src/routes/slugs/checkAvailability.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Create the handler**

In `packages/backend/src/routes/slugs/checkAvailability.ts`:

```typescript
import type { Request } from 'express';

import { checkBloomFilter } from '../../db/queries/bloomFilterQueries.js';
import { generateSlug } from '../../db/queries/slugQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';

type SlugTable = 'agents' | 'organizations';

const VALID_TABLES: ReadonlySet<string> = new Set(['agents', 'organizations']);

function isSlugTable(val: string): val is SlugTable {
  return VALID_TABLES.has(val);
}

function parseStringField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const value = record[key];
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

export async function handleCheckAvailability(
  req: Request,
  res: AuthenticatedResponse
): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const name = parseStringField(req.body, 'name');
  const table = parseStringField(req.body, 'table');

  if (name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'name is required' });
    return;
  }

  if (table === undefined || !isSlugTable(table)) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'table must be "agents" or "organizations"' });
    return;
  }

  const slug = generateSlug(name);
  if (slug === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid name' });
    return;
  }

  try {
    const { buildBitmask } = await import('../../utils/bloomFilter.js');
    const bitmask = buildBitmask(slug);
    const mightExist = await checkBloomFilter(supabase, bitmask, table);
    res.status(HTTP_OK).json({ slug, available: !mightExist });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

Note: use a static import instead of the dynamic import above. Replace `const { buildBitmask } = await import(...)` with a top-level import:

```typescript
import { buildBitmask } from '../../utils/bloomFilter.js';
```

Then the try block becomes:

```typescript
  try {
    const bitmask = buildBitmask(slug);
    const mightExist = await checkBloomFilter(supabase, bitmask, table);
    res.status(HTTP_OK).json({ slug, available: !mightExist });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
```

- [ ] **Step 2: Mount the route in `server.ts`**

In `packages/backend/src/server.ts`, add the import at the top alongside the other imports:

```typescript
import { handleCheckAvailability } from './routes/slugs/checkAvailability.js';
```

Add a new `buildSlugRouter` function after `buildOrgRouter`:

```typescript
function buildSlugRouter(): express.Router {
  const router = express.Router();
  router.use(requireAuth);
  router.post('/check-availability', handleCheckAvailability);
  return router;
}
```

In the `createApp()` function, after the `/orgs` line, add:

```typescript
  app.use('/slugs', buildSlugRouter());
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/slugs/checkAvailability.ts packages/backend/src/server.ts
git commit -m "feat: add POST /slugs/check-availability endpoint"
```

---

### Task 5: Update create handlers to write to bloom filter

**Files:**
- Modify: `packages/backend/src/routes/orgs/createOrg.ts`
- Modify: `packages/backend/src/routes/agents/createAgent.ts`

- [ ] **Step 1: Update `createOrg.ts`**

In `packages/backend/src/routes/orgs/createOrg.ts`, add imports at the top:

```typescript
import { updateBloomFilter } from '../../db/queries/bloomFilterQueries.js';
import { buildBitmask } from '../../utils/bloomFilter.js';
```

After the successful `insertOrg` call (after the error check, before `res.status(HTTP_OK).json(result)`), add the bloom filter update. The updated try block should be:

```typescript
  try {
    const slug = await findUniqueSlug(supabase, baseSlug, 'organizations');
    const { result, error } = await insertOrg(supabase, name, slug);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create organization' });
      return;
    }

    await updateBloomFilter(supabase, buildBitmask(slug), 'organizations');
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
```

- [ ] **Step 2: Update `createAgent.ts`**

In `packages/backend/src/routes/agents/createAgent.ts`, add imports at the top:

```typescript
import { updateBloomFilter } from '../../db/queries/bloomFilterQueries.js';
import { buildBitmask } from '../../utils/bloomFilter.js';
```

In the `handleCreateAgent` function, after the successful `insertAgent` call and error check, before the template cloning block, add the bloom filter update. The relevant section becomes:

```typescript
    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create agent' });
      return;
    }

    await updateBloomFilter(supabase, buildBitmask(slug), 'agents');

    if (input.templateAgentId !== undefined && input.templateVersion !== undefined) {
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/orgs/createOrg.ts packages/backend/src/routes/agents/createAgent.ts
git commit -m "feat: update bloom filter on org and agent creation"
```

---

### Task 6: Frontend — server action and lib for slug checking

**Files:**
- Create: `packages/web/app/lib/slugs.ts`
- Create: `packages/web/app/actions/slugs.ts`

- [ ] **Step 1: Create the backend proxy function**

In `packages/web/app/lib/slugs.ts`:

```typescript
import { fetchFromBackend } from './backendProxy';

type SlugTable = 'agents' | 'organizations';

interface SlugCheckResult {
  slug: string;
  available: boolean;
}

function isSlugCheckResult(value: unknown): value is SlugCheckResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'slug' in value &&
    'available' in value
  );
}

export async function checkSlugAvailability(
  name: string,
  table: SlugTable
): Promise<{ slug: string; available: boolean } | null> {
  try {
    const data = await fetchFromBackend('POST', '/slugs/check-availability', { name, table });
    if (!isSlugCheckResult(data)) return null;
    return data;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create the server action**

In `packages/web/app/actions/slugs.ts`:

```typescript
'use server';

import { checkSlugAvailability as checkSlugLib } from '@/app/lib/slugs';

type SlugTable = 'agents' | 'organizations';

interface SlugCheckResponse {
  slug: string;
  available: boolean;
}

export async function checkSlugAvailabilityAction(
  name: string,
  table: SlugTable
): Promise<SlugCheckResponse | null> {
  return await checkSlugLib(name, table);
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/slugs.ts packages/web/app/actions/slugs.ts
git commit -m "feat: add slug availability server action and lib"
```

---

### Task 7: Frontend — `useSlugAvailability` hook

**Files:**
- Create: `packages/web/app/hooks/useSlugAvailability.ts`

- [ ] **Step 1: Create the hook**

In `packages/web/app/hooks/useSlugAvailability.ts`:

```typescript
import { checkSlugAvailabilityAction } from '@/app/actions/slugs';
import { useEffect, useRef, useState } from 'react';

type SlugTable = 'agents' | 'organizations';

interface SlugAvailability {
  checking: boolean;
  available: boolean | null;
  slug: string | null;
}

const DEBOUNCE_MS = 1200;

export function useSlugAvailability(name: string, table: SlugTable): SlugAvailability {
  const [state, setState] = useState<SlugAvailability>({
    checking: false,
    available: null,
    slug: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = name.trim();

    if (trimmed === '') {
      setState({ checking: false, available: null, slug: null });
      return;
    }

    setState((prev) => ({ ...prev, checking: true, available: null }));

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      void checkSlugAvailabilityAction(trimmed, table).then((result) => {
        if (result === null) {
          setState({ checking: false, available: null, slug: null });
        } else {
          setState({ checking: false, available: result.available, slug: result.slug });
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [name, table]);

  return state;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/useSlugAvailability.ts
git commit -m "feat: add useSlugAvailability hook with 1200ms debounce"
```

---

### Task 8: Translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add slug-related translation keys**

In `packages/web/messages/en.json`, add a new `"slugs"` section. Place it alphabetically among the top-level keys (after `"settings"` or wherever it fits):

```json
  "slugs": {
    "checking": "Checking availability...",
    "nameTaken": "This name is already taken"
  },
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add slug availability translations"
```

---

### Task 9: Wire up `CreateOrgDialog` with availability check

**Files:**
- Modify: `packages/web/app/components/orgs/CreateOrgDialog.tsx`

The key changes:
1. Import and use `useSlugAvailability` in `CreateOrgForm`
2. Pass `checking` and `available` state to `CreateOrgFields` and the button
3. Show error message when `available === false`
4. Show spinner in button when `checking` is true

- [ ] **Step 1: Update `CreateOrgFields` to accept availability props**

In `packages/web/app/components/orgs/CreateOrgDialog.tsx`, update the `CreateOrgFieldsProps` interface:

```typescript
interface CreateOrgFieldsProps {
  nameError: string;
  name: string;
  onNameChange: (name: string) => void;
  previewUrl: string | null;
  onFileSelect: (file: File | null) => void;
  onRemove: () => void;
  nameTaken: boolean;
}
```

Update the `CreateOrgFields` component to show the "name taken" message. Add the `useTranslations('slugs')` hook and display the message when `nameTaken` is true (and `nameError` is empty, to avoid showing both):

```typescript
function CreateOrgFields(props: CreateOrgFieldsProps) {
  const { nameError, name, onNameChange, previewUrl, onFileSelect, onRemove, nameTaken } = props;
  const t = useTranslations('orgs');
  const tSlugs = useTranslations('slugs');

  return (
    <div className="flex items-center gap-4">
      <AvatarUpload
        currentUrl={null}
        previewUrl={previewUrl}
        name={name}
        onFileSelect={onFileSelect}
        onRemove={previewUrl !== null ? onRemove : undefined}
      />
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="org-name">{t('name')}</Label>
        <Input
          id="org-name"
          name="name"
          placeholder={t('namePlaceholder')}
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
        {nameError === '' && nameTaken && (
          <p className="text-destructive text-xs">{tSlugs('nameTaken')}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `CreateOrgForm` to use the hook**

Add imports at the top of the file:

```typescript
import { useSlugAvailability } from '@/app/hooks/useSlugAvailability';
import { Loader2 } from 'lucide-react';
```

Update `CreateOrgForm` to wire in the hook and change the button:

```typescript
function CreateOrgForm({ onOpenChange }: CreateOrgDialogProps) {
  const t = useTranslations('orgs');
  const { loading, nameError, handleSubmit, setFile } = useCreateOrgSubmit(onOpenChange);
  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { checking, available } = useSlugAvailability(name, 'organizations');

  function handleFileSelect(file: File | null) {
    setFile(file);
    setPreviewUrl(file !== null ? URL.createObjectURL(file) : null);
  }

  function handleRemove() {
    setFile(null);
    setPreviewUrl(null);
  }

  const disabled = loading || checking || available === false || name.trim() === '';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CreateOrgFields
        nameError={nameError}
        name={name}
        onNameChange={setName}
        previewUrl={previewUrl}
        onFileSelect={handleFileSelect}
        onRemove={handleRemove}
        nameTaken={available === false}
      />
      <DialogFooter>
        <Button type="submit" disabled={disabled}>
          {checking ? <Loader2 className="size-4 animate-spin" /> : t('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run typecheck -w packages/web && npm run lint -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/orgs/CreateOrgDialog.tsx
git commit -m "feat: wire slug availability check into CreateOrgDialog"
```

---

### Task 10: Wire up `DetailsStep` (agent wizard) with availability check

**Files:**
- Modify: `packages/web/app/components/agents/DetailsStep.tsx`

- [ ] **Step 1: Update `NameField` to show availability status**

Add imports at the top of `DetailsStep.tsx`:

```typescript
import { useSlugAvailability } from '@/app/hooks/useSlugAvailability';
```

Update the `NameField` component to accept and display availability state:

```typescript
function NameField({
  value,
  onChange,
  nameTaken,
}: {
  value: string;
  onChange: (v: string) => void;
  nameTaken: boolean;
}) {
  const t = useTranslations('agents');
  const tSlugs = useTranslations('slugs');

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="wizard-name">{t('name')}</Label>
      <Input
        id="wizard-name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('namePlaceholder')}
        required
      />
      {nameTaken && <p className="text-destructive text-xs">{tSlugs('nameTaken')}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update `DetailsFields` to pass availability to `NameField`**

Update the `DetailsFieldsProps` interface:

```typescript
interface DetailsFieldsProps {
  state: DetailsFormState;
  onChange: (next: DetailsFormState) => void;
  nameTaken: boolean;
}
```

Update the `DetailsFields` component:

```typescript
function DetailsFields({ state, onChange, nameTaken }: DetailsFieldsProps) {
  return (
    <div className="flex flex-col gap-5 flex-1">
      <NameField
        value={state.name}
        onChange={(name) => onChange({ ...state, name })}
        nameTaken={nameTaken}
      />
      <DescriptionField
        value={state.description}
        onChange={(description) => onChange({ ...state, description })}
      />
      <CategoryField value={state.category} onChange={(category) => onChange({ ...state, category })} />
      <VisibilityCards isPublic={state.isPublic} onChange={(isPublic) => onChange({ ...state, isPublic })} />
    </div>
  );
}
```

- [ ] **Step 3: Update `DetailsStepProps` and `DetailsStep` exports**

Update the `DetailsStepProps` interface to include availability state:

```typescript
interface DetailsStepProps {
  state: DetailsFormState;
  onChange: (next: DetailsFormState) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  checking: boolean;
  available: boolean | null;
}
```

Update `DetailsStep`:

```typescript
export function DetailsStep({ state, onChange, onBack, onSubmit, loading, checking, available }: DetailsStepProps) {
  const canSubmit =
    state.name.trim() !== '' &&
    state.description.trim() !== '' &&
    state.category !== '' &&
    !loading &&
    !checking &&
    available !== false;

  return (
    <>
      <DetailsFields state={state} onChange={onChange} nameTaken={available === false} />
      <DetailsFooter onBack={onBack} onSubmit={onSubmit} loading={loading || checking} disabled={!canSubmit} />
    </>
  );
}
```

- [ ] **Step 4: Update `CreateAgentWizard.tsx` to pass availability props**

In `packages/web/app/components/agents/CreateAgentWizard.tsx`, add the import:

```typescript
import { useSlugAvailability } from '@/app/hooks/useSlugAvailability';
```

In the `WizardBody` component, add the hook call and pass props to `DetailsStep`. Add after the existing hooks:

```typescript
  const { checking, available } = useSlugAvailability(state.details.name, 'agents');
```

Update the `DetailsStep` usage to pass the new props:

```typescript
          <DetailsStep
            state={state.details}
            onChange={state.setDetails}
            onBack={() => state.setStep('template')}
            onSubmit={handleSubmit}
            loading={state.loading}
            checking={checking}
            available={available}
          />
```

- [ ] **Step 5: Update `DetailsFooter` to show spinner**

Add import at the top of `DetailsStep.tsx`:

```typescript
import { Loader2 } from 'lucide-react';
```

Update the `DetailsFooter` component — when `loading` is true (which now includes the `checking` state), show a spinner instead of the "Creating" text:

```typescript
function DetailsFooter({
  onBack,
  onSubmit,
  loading,
  disabled,
}: {
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  const t = useTranslations('marketplace');
  const tAgents = useTranslations('agents');

  return (
    <DialogFooter className="mt-4.5 shrink-0">
      <Button variant="outline" onClick={onBack} disabled={loading}>
        {t('back')}
      </Button>
      <Button onClick={onSubmit} disabled={disabled}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : tAgents('create')}
      </Button>
    </DialogFooter>
  );
}
```

- [ ] **Step 6: Run typecheck and lint**

Run: `npm run typecheck -w packages/web && npm run lint -w packages/web`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/components/agents/DetailsStep.tsx packages/web/app/components/agents/CreateAgentWizard.tsx
git commit -m "feat: wire slug availability check into agent creation wizard"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full check**

Run: `npm run check`
Expected: format, lint, and typecheck all PASS

- [ ] **Step 2: Run backend tests**

Run: `npm run test -w packages/backend -- --testPathPattern=bloomFilter`
Expected: All PASS

- [ ] **Step 3: Commit any formatting fixes if needed**

```bash
git add -A && git commit -m "chore: formatting fixes"
```
