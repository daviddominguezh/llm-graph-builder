# OpenRouter Key Auto-Provisioning on Org Creation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically create an OpenRouter API key (named "OPENFLOW-KEY", $1/month budget) for each new organization, stored in `org_api_keys` so it appears in the settings UI.

**Architecture:** New `managementKeys.ts` module calls OpenRouter's Management API via `fetch`. The `handleCreateOrg` route handler calls this after successful org insertion. Failure is non-blocking (logged, does not prevent org creation).

**Tech Stack:** OpenRouter Management API (REST), existing `createApiKey` RPC, existing Supabase client.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/backend/src/openrouter/managementKeys.ts` | Create | Call OpenRouter Management API to create a key with budget |
| `packages/backend/src/routes/orgs/createOrg.ts` | Modify | Call key provisioning after org creation (non-blocking) |

---

### Task 1: Create OpenRouter Management Key Module

**Files:**
- Create: `packages/backend/src/openrouter/managementKeys.ts`

- [ ] **Step 1: Create the management key module**

Create `packages/backend/src/openrouter/managementKeys.ts` with a function that calls the OpenRouter Management API to create a key:

```typescript
import { z } from 'zod';

const OPENROUTER_KEYS_URL = 'https://openrouter.ai/api/v1/keys';

const OPENFLOW_KEY_NAME = 'OPENFLOW-KEY';
const OPENFLOW_KEY_BUDGET = 1;
const OPENFLOW_KEY_BUDGET_RESET = 'monthly';

const CreateKeyResponseSchema = z.object({
  data: z.object({
    key: z.string(),
    hash: z.string(),
  }),
});

export interface OpenRouterKeyResult {
  key: string;
  hash: string;
}

export async function createOpenRouterKey(
  orgName: string
): Promise<OpenRouterKeyResult | null> {
  const managementKey = process.env['OPENROUTER_MANAGEMENT_KEY'];
  if (managementKey === undefined || managementKey === '') {
    process.stderr.write(
      '[openrouter] OPENROUTER_MANAGEMENT_KEY not set, skipping key creation\n'
    );
    return null;
  }

  const res = await fetch(OPENROUTER_KEYS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managementKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `${OPENFLOW_KEY_NAME}-${orgName}`,
      limit: OPENFLOW_KEY_BUDGET,
      limitReset: OPENFLOW_KEY_BUDGET_RESET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenRouter key creation failed (${String(res.status)}): ${text}`
    );
  }

  const json: unknown = await res.json();
  const parsed = CreateKeyResponseSchema.parse(json);
  return parsed.data;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck -w packages/backend`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/openrouter/managementKeys.ts
git commit -m "feat: add OpenRouter management key creation module"
```

---

### Task 2: Integrate Key Provisioning into Org Creation

**Files:**
- Modify: `packages/backend/src/routes/orgs/createOrg.ts`

- [ ] **Step 1: Add key provisioning after org creation**

Modify `packages/backend/src/routes/orgs/createOrg.ts` to import and call the new module. The key provisioning must be non-blocking — if it fails, log the error but still return the created org.

The `handleCreateOrg` function is currently at its max-lines-per-function limit (40 lines with logic), so extract the key provisioning into a helper function in the same file.

Updated file:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';

import { createApiKey } from '../../db/queries/apiKeyQueries.js';
import { updateBloomFilter } from '../../db/queries/bloomFilterQueries.js';
import { insertOrg } from '../../db/queries/orgQueries.js';
import { findUniqueSlug, generateSlug } from '../../db/queries/slugQueries.js';
import { createOpenRouterKey } from '../../openrouter/managementKeys.js';
import { buildBitmask } from '../../utils/bloomFilter.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './orgHelpers.js';

const OPENFLOW_KEY_NAME = 'OPENFLOW-KEY';

async function provisionOpenRouterKey(
  supabase: SupabaseClient,
  orgId: string,
  orgName: string
): Promise<void> {
  try {
    const orKey = await createOpenRouterKey(orgName);
    if (orKey === null) return;

    const { error } = await createApiKey(supabase, orgId, OPENFLOW_KEY_NAME, orKey.key);
    if (error !== null) {
      process.stderr.write(`[openrouter] Failed to store key for org ${orgId}: ${error}\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stderr.write(`[openrouter] Key provisioning failed for org ${orgId}: ${msg}\n`);
  }
}

export async function handleCreateOrg(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const name = parseStringField(req.body, 'name');

  if (name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Name is required' });
    return;
  }

  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid organization name' });
    return;
  }

  try {
    const slug = await findUniqueSlug(supabase, baseSlug, 'organizations');
    const { result, error } = await insertOrg(supabase, name, slug);

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create organization' });
      return;
    }

    await updateBloomFilter(supabase, buildBitmask(slug), 'organizations');
    await provisionOpenRouterKey(supabase, result.id, name);
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck -w packages/backend`
Expected: No errors

- [ ] **Step 3: Run full check**

Run: `npm run check` (from monorepo root)
Expected: Format, lint, and typecheck all pass

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/orgs/createOrg.ts
git commit -m "feat: provision OpenRouter key on org creation"
```
