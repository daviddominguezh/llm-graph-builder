# Bloom Filter Slug Availability Check

## Summary

Replace the current "submit to discover errors" UX for name uniqueness validation with a debounced, real-time availability check powered by bloom filters stored in PostgreSQL. The check is informational — the backend still auto-suffixes slugs on collision at creation time.

## Context

When creating orgs or agents, users currently only learn about name collisions after clicking "Create." This design adds a `POST /slugs/check-availability` endpoint backed by a bloom filter stored as a `bit(9600)` column in PostgreSQL. The frontend debounces the name input (1200ms), disables the create button with a spinner while checking, and shows an error if the name is likely taken.

## Design decisions

- **Bloom filter in PostgreSQL** — The filter's bit array lives in a `slug_bloom_filters` table as a `bit(9600)` column. Checks are single-row PK lookups with bitwise operations. No in-memory cache layer.
- **Global filters** — One filter for `organizations`, one for `agents`. Agent slugs are not scoped per-org in the filter. Cross-org collisions contribute to the expected false positive rate.
- **Informational only** — A "taken" result does not block submission. The backend's existing `findUniqueSlug` auto-suffixes on collision. A "available" result is definitive (no false negatives).
- **No deletion support** — Deleted slugs remain in the filter. Deletions are rare; false positives are acceptable. Manual rebuild if needed.
- **No initial seeding** — No existing data to seed from. Migration inserts empty (all-zero) bitmaps.

## Bloom filter parameters

- **n** = 1000 (target capacity)
- **p** = 0.01 (1% false positive rate)
- **m** = 9600 bits (1.2KB) — derived from `m = -n * ln(p) / (ln 2)^2 = 9586`, rounded up
- **k** = 7 hash functions — derived from `k = (m/n) * ln 2 = 6.65`, rounded up
- **Hashing** — Double-hashing: two base hashes (FNV-1a with different seeds), 7 derived positions via `h(i) = (h1 + i * h2) % 9600`

## Database

### New table

```sql
CREATE TABLE slug_bloom_filters (
  table_name TEXT PRIMARY KEY,  -- 'organizations' | 'agents'
  bitmap     BIT(9600),
  item_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO slug_bloom_filters (table_name, bitmap, item_count)
VALUES
  ('organizations', repeat('0', 9600)::bit(9600), 0),
  ('agents', repeat('0', 9600)::bit(9600), 0);
```

### Check query

```sql
SELECT (bitmap & $1::bit(9600)) = $1::bit(9600) AS might_exist
FROM slug_bloom_filters
WHERE table_name = $2;
```

### Update query (on create)

```sql
UPDATE slug_bloom_filters
SET bitmap = bitmap | $1::bit(9600),
    item_count = item_count + 1,
    updated_at = now()
WHERE table_name = $2;
```

## Backend

### New endpoint: `POST /slugs/check-availability`

**Request:** `{ "name": "My Cool Org", "table": "organizations" }`

**Response:** `{ "slug": "my-cool-org", "available": true | false }`

**Flow:**
1. Generate slug from name using existing `generateSlug()`
2. Compute 7 hash positions using double-hashing
3. Build bitmask as `bit(9600)` string
4. Run check query
5. Return slug and availability

### New files

- `packages/backend/src/utils/bloomFilter.ts` — hashing + bitmask generation
- `packages/backend/src/db/queries/bloomFilterQueries.ts` — check + update queries
- `packages/backend/src/routes/slugs/checkAvailability.ts` — endpoint handler
- `packages/backend/src/routes/slugs/slugRouter.ts` — router mounting

### Modified files

- `packages/backend/src/routes/orgs/createOrg.ts` — after successful insert, OR new slug bits into bloom filter
- `packages/backend/src/routes/agents/createAgent.ts` — same
- `packages/backend/src/server.ts` — mount `/slugs` router

## Frontend

### New hook: `useSlugAvailability`

**File:** `packages/web/app/hooks/useSlugAvailability.ts`

**Signature:** `useSlugAvailability(name: string, table: 'organizations' | 'agents')`

**Returns:** `{ checking: boolean, available: boolean | null, slug: string | null }`

**Behavior:**
1. On name change, sets `checking = true`, `available = null`
2. Debounces 1200ms
3. Calls `checkSlugAvailabilityAction(name, table)` server action
4. Sets `checking = false`, `available` to result

### New files

- `packages/web/app/hooks/useSlugAvailability.ts` — shared hook
- `packages/web/app/actions/slugs.ts` — server action
- `packages/web/app/lib/slugs.ts` — backend proxy call

### Modified: CreateOrgDialog

- Wire `useSlugAvailability(name, 'organizations')` into the form
- Create button disabled when `checking || available === false || name.trim() === ''`
- Button shows spinner when `checking` is true
- Error message below input when `available === false`: translated "This name is already taken"

### Modified: DetailsStep (agent wizard)

- Wire `useSlugAvailability(state.name, 'agents')` into the form
- `canSubmit` adds `&& !checking && available !== false`
- Same spinner-in-button and error message pattern

## Translations

New keys in `packages/web/messages/en.json`:

- `slugs.checking` — "Checking availability..."
- `slugs.nameTaken` — "This name is already taken"
