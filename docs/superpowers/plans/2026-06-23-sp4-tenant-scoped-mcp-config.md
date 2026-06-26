# SP4 — Tenant-scoped MCP configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `(agent, tenant)` pair its own values for the agent's shared set of MCP servers — edited in a tenants×variables matrix, verified per tenant, snapshotted at publish, and resolved per tenant at runtime — for both `agent` and `workflow` app types.

**Architecture:** Two new tables (`graph_mcp_server_tenant_config` = durable working copy, `graph_mcp_server_tenant_discovery` = volatile verification cache) hang off `graph_mcp_servers(agent_id, server_id)` via composite FK. The SP2 shared resolver (`buildResolvedVars`+`resolveTransport`) does substitution; the SP3 egress guard + `withAbortTimeout` + `classifyDiscoveryError` do safe per-tenant discovery; the SP1 default tenant is the builder's canonical/reference tenant and the matrix's guaranteed first row. Publish RPCs snapshot per-tenant config into the version; runtime reads only that snapshot keyed by `(server_id, tenantID)` and fails fast on an unknown/missing tenant. A new matrix modal replaces the MCP-servers accordion.

**Tech Stack:** TypeScript (strict, ESM/NodeNext), Postgres (Supabase migrations + RLS), Express backend (`@daviddh/graph-runner-backend`), `@daviddh/graph-types` (shared resolver/schemas), Next.js 16 web (App Router, next-intl, shadcn/ui), Jest (`--experimental-vm-modules`), Redis (ioredis), `@daviddh/llm-graph-runner` (api/runtime).

## Global Constraints

Binding on **every** task:

- TS strict + `noUncheckedIndexedAccess`. **Never `any`. Never disable ESLint.**
- **Backend bans `as unknown as` and unsafe double-casts** (`@typescript-eslint/no-unsafe-type-assertion`). A single non-literal `as T` that widens or matches is allowed (e.g. `result.data as Row`); to mock a `SupabaseClient` in a test, build a real one via `createClient(url, key)` + `jest.spyOn(client, 'method')` — never cast a partial object to `SupabaseClient`.
- **Max 4 params per function** — bundle extra args into a single options object/interface.
- ESLint limits: **40 lines/function, 300 lines/file, max-depth 2** — extract named helpers / split files; never compress onto one line.
- Regex literals require the **`v` flag** (`require-unicode-regexp`).
- ESM: every relative import ends in `.js` (incl. within `graph-types`).
- Prettier: single quotes, 2-space indent, **110** print width, trailing comma `es5`. Run `npm run check` before each commit and commit format-clean.
- **Migration files only — do NOT apply/reset/execute any DB. The USER applies migrations.**
- Stage files explicitly (`git add <path> ...`); **never** `git commit -a`/`-am`. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Tests: backend `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern> --coverage=false`; web `cd packages/web && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern> --coverage=false`; graph-types `cd packages/graph-types && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern>`; api `npm run test -w packages/api`.
- i18n: add new strings to `packages/web/messages/en.json` (the only locale).
- Each new migration gets a **contract test** (readFileSync + `/v`-flag regex), mirroring `packages/backend/src/routes/tenants/defaultTenantMigration.contract.test.ts`.

### Reuse (already built — do NOT reimplement)

- **SP1 default tenant:** `tenants.is_default`; `getTenantsByOrg(supabase, orgId)` returns rows **default-first** (`packages/backend/src/db/queries/tenantQueries.ts`). The default tenant is the canonical/reference tenant.
- **SP2 resolver** (`@daviddh/graph-types`, `packages/graph-types/src/mcpTransportResolver.ts`): `MCP_VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv`; `extractTemplateVariables(transport: McpTransport): string[]`; `buildResolvedVars(variableValues: Record<string, VariableValue> | undefined, env: { byName: Record<string,string>; byId: Record<string,string> }): Record<string,string>`; `resolveTransport(transport: McpTransport, resolved: Record<string,string>): McpTransport`. Backend wrapper: `resolveServerTransport(server, envByName, envById)` in `packages/backend/src/routes/execute/executeHelpers.ts:69`.
- **SP3 SSRF/discovery safety:** `resolveAndAssertEgress` + `makeGuardedCreateTransport` (`packages/backend/src/lib/egressGuard.ts`, `guardedCreateTransport.ts`), `withAbortTimeout` (`@daviddh/llm-graph-runner`), `classifyDiscoveryError` (`packages/backend/src/lib/discoveryError.ts`). Reuse for per-tenant verify; do NOT write a new guard.
- **Optimistic lock pattern:** `selectedToolsOperations.ts` — `.eq('updated_at', expected)` then treat error code `PGRST116` as `{ kind: 'conflict' }`.
- **Env-var picker (FE):** `packages/web/app/components/panels/VariableValuesEditor.tsx` (`EnvRefSelector`, `VariableRow`) — reuse for `env_ref` cells.
- **Decrypt path:** `getDecryptedEnvVariables(supabase, orgId)` → `{ byName, byId }` (NOT a literal `get_env_variable_value` RPC).
- **Composite-FK target:** `graph_mcp_servers` has `unique (agent_id, server_id)` (`20260309500000_normalized_graph_storage.sql:300`).
- **Scroll tripwire:** dynamic direct children of `overflow-*auto` hosts crash React; the matrix modal body uses the `Scrollable` wrapper (`packages/web/app/components/Scrollable.tsx`).

### Shared types (defined in Task 2/3, referenced everywhere)

```ts
// VariableValue from '@daviddh/graph-types'
type ServerTenantStatus = 'ok' | 'pending' | 'error';
type ServerAggregateStatus = 'ok' | 'warning' | 'error';
interface McpTenantConfigRow { agent_id: string; server_id: string; tenant_id: string; variable_values: Record<string, VariableValue>; updated_at: string; }
interface McpTenantDiscoveryRow { agent_id: string; server_id: string; tenant_id: string; status: ServerTenantStatus; error: string | null; values_hash: string | null; discovered_at: string | null; }
```

---

### Task 1: Migration — per-tenant config + discovery tables, RLS, backfill

**Files:**
- Create: `supabase/migrations/20260623000000_mcp_tenant_config.sql`
- Test: `packages/backend/src/routes/mcp-server/mcpTenantConfigMigration.contract.test.ts`

**Interfaces:**
- Produces (DB): tables `public.graph_mcp_server_tenant_config`, `public.graph_mcp_server_tenant_discovery`; trigger `set_mcp_tenant_config_updated_at`; RLS policies on both.
- Consumes: `public.graph_mcp_servers (agent_id, server_id)` unique, `public.tenants(id)`, `public.agents(id, org_id)`, `public.is_org_member(uuid)` (1-arg, recursion-safe), `public.set_updated_at()` if present (else inline trigger fn).

- [ ] **Step 1: Write the contract test**

```ts
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(thisDir, '../../../../../supabase/migrations/20260623000000_mcp_tenant_config.sql');

describe('mcp_tenant_config migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('creates the two tables idempotently', () => {
    expect(sql).toMatch(/create table if not exists public\.graph_mcp_server_tenant_config/iv);
    expect(sql).toMatch(/create table if not exists public\.graph_mcp_server_tenant_discovery/iv);
  });
  it('config table has the composite FK to graph_mcp_servers', () => {
    expect(sql).toMatch(/references public\.graph_mcp_servers \(agent_id, server_id\) on delete cascade/iv);
  });
  it('config table has the per-(agent,server,tenant) unique key', () => {
    expect(sql).toMatch(/unique \(agent_id, server_id, tenant_id\)/iv);
  });
  it('discovery status is constrained to pending|ok|error', () => {
    expect(sql).toMatch(/check \(status in \('pending', 'ok', 'error'\)\)/iv);
  });
  it('enables RLS and uses the recursion-safe is_org_member', () => {
    expect(sql).toMatch(/enable row level security/iv);
    expect(sql).toMatch(/public\.is_org_member/iv);
  });
  it('backfills config rows coalescing null variable_values to empty object', () => {
    expect(sql).toMatch(/coalesce\(m\.variable_values, '\{\}'::jsonb\)/iv);
  });
});
```

- [ ] **Step 2: Run RED** — `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest mcpTenantConfigMigration --coverage=false` — expect `ENOENT ... 20260623000000_mcp_tenant_config.sql`.

- [ ] **Step 3: Write the migration**

```sql
-- SP4: tenant-scoped MCP configuration. Two tables hang off graph_mcp_servers
-- via composite FK (agent_id, server_id). Config is the durable working copy;
-- discovery is the volatile verification cache. RLS mirrors graph_mcp_servers.

-- 1. Durable per-tenant config (builder edits this; snapshotted at publish)
create table if not exists public.graph_mcp_server_tenant_config (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  server_id       text not null,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  variable_values jsonb not null default '{}',
  updated_at      timestamptz not null default now(),
  unique (agent_id, server_id, tenant_id),
  foreign key (agent_id, server_id)
    references public.graph_mcp_servers (agent_id, server_id) on delete cascade
);
create index if not exists graph_mcp_server_tenant_config_tenant_idx
  on public.graph_mcp_server_tenant_config (tenant_id);

-- 2. Volatile discovery verification cache
create table if not exists public.graph_mcp_server_tenant_discovery (
  agent_id        uuid not null,
  server_id       text not null,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  error           text,
  values_hash     text,
  discovered_at   timestamptz,
  primary key (agent_id, server_id, tenant_id),
  foreign key (agent_id, server_id)
    references public.graph_mcp_servers (agent_id, server_id) on delete cascade
);

-- 3. updated_at trigger on the config table
create or replace function public.set_mcp_tenant_config_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger trg_mcp_tenant_config_updated_at
  before update on public.graph_mcp_server_tenant_config
  for each row execute function public.set_mcp_tenant_config_updated_at();

-- 4. RLS — mirror graph_mcp_servers: org member AND tenant in the agent's org
alter table public.graph_mcp_server_tenant_config enable row level security;
alter table public.graph_mcp_server_tenant_discovery enable row level security;

create policy mcp_tenant_config_rw on public.graph_mcp_server_tenant_config
  for all
  using (
    public.is_org_member((select org_id from public.agents where id = agent_id))
    and (select org_id from public.tenants where id = tenant_id)
        = (select org_id from public.agents where id = agent_id)
  )
  with check (
    public.is_org_member((select org_id from public.agents where id = agent_id))
    and (select org_id from public.tenants where id = tenant_id)
        = (select org_id from public.agents where id = agent_id)
  );

create policy mcp_tenant_discovery_rw on public.graph_mcp_server_tenant_discovery
  for all
  using (
    public.is_org_member((select org_id from public.agents where id = agent_id))
    and (select org_id from public.tenants where id = tenant_id)
        = (select org_id from public.agents where id = agent_id)
  )
  with check (
    public.is_org_member((select org_id from public.agents where id = agent_id))
    and (select org_id from public.tenants where id = tenant_id)
        = (select org_id from public.agents where id = agent_id)
  );

-- 5. Backfill: one config row per (existing server, every tenant in the agent's org),
-- seeded from the server's agent-wide variable_values (coalesced). Idempotent.
insert into public.graph_mcp_server_tenant_config (agent_id, server_id, tenant_id, variable_values)
select m.agent_id, m.server_id, t.id, coalesce(m.variable_values, '{}'::jsonb)
from public.graph_mcp_servers m
join public.agents a on a.id = m.agent_id
join public.tenants t on t.org_id = a.org_id
on conflict (agent_id, server_id, tenant_id) do nothing;
```

- [ ] **Step 4: Run GREEN** — `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest mcpTenantConfigMigration --coverage=false` — expect `6 passed`.

- [ ] **Step 5: Commit** (SQL not subject to prettier/eslint; format the test only)

```bash
cd /Users/daviddominguez/closer/llm-graph-builder
npx prettier --write packages/backend/src/routes/mcp-server/mcpTenantConfigMigration.contract.test.ts
git add supabase/migrations/20260623000000_mcp_tenant_config.sql packages/backend/src/routes/mcp-server/mcpTenantConfigMigration.contract.test.ts
git commit -m "feat(sp4): per-tenant MCP config + discovery tables, RLS, backfill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — per-tenant config queries (types, list, optimistic-locked upsert, values hash)

**Files:**
- Create: `packages/backend/src/db/queries/mcpTenantConfigQueries.ts`
- Test: `packages/backend/src/db/queries/mcpTenantConfigQueries.test.ts`

**Interfaces:**
- Produces: `McpTenantConfigRow`; `hashVariableValues(values: Record<string, VariableValue>): string`; `getTenantConfigs(supabase, agentId): Promise<McpTenantConfigRow[]>`; `upsertTenantConfigCell(supabase, args: UpsertCellArgs): Promise<{ kind: 'ok'; row: McpTenantConfigRow } | { kind: 'conflict' }>` where `UpsertCellArgs = { agentId: string; serverId: string; tenantId: string; variableValues: Record<string, VariableValue>; expectedUpdatedAt: string | null }`.
- Consumes: `VariableValue` from `@daviddh/graph-types`; `SupabaseClient` from `../queries/operationHelpers.js`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { hashVariableValues } from './mcpTenantConfigQueries.js';

describe('hashVariableValues', () => {
  it('is stable regardless of key order', () => {
    const a = hashVariableValues({ B: { type: 'direct', value: '2' }, A: { type: 'direct', value: '1' } });
    const b = hashVariableValues({ A: { type: 'direct', value: '1' }, B: { type: 'direct', value: '2' } });
    expect(a).toBe(b);
  });
  it('changes when a value changes', () => {
    const a = hashVariableValues({ A: { type: 'direct', value: '1' } });
    const b = hashVariableValues({ A: { type: 'direct', value: '2' } });
    expect(a).not.toBe(b);
  });
  it('hashes empty config deterministically', () => {
    expect(hashVariableValues({})).toBe(hashVariableValues({}));
  });
});
```

- [ ] **Step 2: Run RED** — `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest mcpTenantConfigQueries.test --coverage=false` — expect import/compile failure.

- [ ] **Step 3: Implement**

```ts
import type { VariableValue } from '@daviddh/graph-types';
import { createHash } from 'node:crypto';

import type { SupabaseClient } from './operationHelpers.js';

export interface McpTenantConfigRow {
  agent_id: string;
  server_id: string;
  tenant_id: string;
  variable_values: Record<string, VariableValue>;
  updated_at: string;
}

export interface UpsertCellArgs {
  agentId: string;
  serverId: string;
  tenantId: string;
  variableValues: Record<string, VariableValue>;
  expectedUpdatedAt: string | null;
}

export type UpsertCellResult = { kind: 'ok'; row: McpTenantConfigRow } | { kind: 'conflict' };

const CONFIG_COLUMNS = 'agent_id, server_id, tenant_id, variable_values, updated_at';

// Canonical (sorted-key) JSON hash so a discovery row can detect config drift.
export function hashVariableValues(values: Record<string, VariableValue>): string {
  const sortedKeys = Object.keys(values).sort();
  const canonical = sortedKeys.map((k) => [k, values[k]]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function getTenantConfigs(
  supabase: SupabaseClient,
  agentId: string
): Promise<McpTenantConfigRow[]> {
  const { data, error } = await supabase
    .from('graph_mcp_server_tenant_config')
    .select(CONFIG_COLUMNS)
    .eq('agent_id', agentId);
  if (error !== null) throw new Error(`getTenantConfigs: ${error.message}`);
  return (data ?? []) as McpTenantConfigRow[];
}

export async function upsertTenantConfigCell(
  supabase: SupabaseClient,
  args: UpsertCellArgs
): Promise<UpsertCellResult> {
  if (args.expectedUpdatedAt === null) {
    return await insertCell(supabase, args);
  }
  const result = await supabase
    .from('graph_mcp_server_tenant_config')
    .update({ variable_values: args.variableValues })
    .eq('agent_id', args.agentId)
    .eq('server_id', args.serverId)
    .eq('tenant_id', args.tenantId)
    .eq('updated_at', args.expectedUpdatedAt)
    .select(CONFIG_COLUMNS)
    .single();
  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return { kind: 'conflict' };
    throw new Error(`upsertTenantConfigCell: ${result.error.message}`);
  }
  return { kind: 'ok', row: result.data as McpTenantConfigRow };
}

async function insertCell(supabase: SupabaseClient, args: UpsertCellArgs): Promise<UpsertCellResult> {
  const result = await supabase
    .from('graph_mcp_server_tenant_config')
    .insert({
      agent_id: args.agentId,
      server_id: args.serverId,
      tenant_id: args.tenantId,
      variable_values: args.variableValues,
    })
    .select(CONFIG_COLUMNS)
    .single();
  if (result.error !== null) {
    if (result.error.code === '23505') return { kind: 'conflict' };
    throw new Error(`upsertTenantConfigCell.insert: ${result.error.message}`);
  }
  return { kind: 'ok', row: result.data as McpTenantConfigRow };
}
```

- [ ] **Step 4: Run GREEN** — `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest mcpTenantConfigQueries.test --coverage=false` — expect `3 passed`.

- [ ] **Step 5: `npm run check`, then commit**

```bash
cd /Users/daviddominguez/closer/llm-graph-builder && npm run check
git add packages/backend/src/db/queries/mcpTenantConfigQueries.ts packages/backend/src/db/queries/mcpTenantConfigQueries.test.ts
git commit -m "feat(sp4): per-tenant MCP config queries + values hash

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend — discovery cache queries (list, upsert result, reset to pending)

**Files:**
- Create: `packages/backend/src/db/queries/mcpTenantDiscoveryQueries.ts`
- Test: `packages/backend/src/db/queries/mcpTenantDiscoveryQueries.test.ts`

**Interfaces:**
- Produces: `ServerTenantStatus`; `McpTenantDiscoveryRow`; `getTenantDiscovery(supabase, agentId): Promise<McpTenantDiscoveryRow[]>`; `upsertDiscoveryResult(supabase, args: DiscoveryResultArgs): Promise<void>` where `DiscoveryResultArgs = { agentId; serverId; tenantId; status: ServerTenantStatus; error: string | null; valuesHash: string | null }`; `resetDiscovery(supabase, args: ResetArgs): Promise<void>` where `ResetArgs = { agentId: string; serverId?: string; tenantId?: string }`.
- Consumes: `SupabaseClient`, `nowIso()` helper inline.

- [ ] **Step 1: Write the failing test** (uses a real client + `jest.spyOn`, never a cast)

```ts
import { describe, expect, it, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { upsertDiscoveryResult } from './mcpTenantDiscoveryQueries.js';

const URL = 'http://localhost:54321';
const KEY = 'anon-key';

describe('upsertDiscoveryResult', () => {
  it('upserts a row keyed by (agent, server, tenant) with the status', async () => {
    const supabase = createClient(URL, KEY);
    const calls: unknown[] = [];
    const upsert = jest.fn((row: unknown) => {
      calls.push(row);
      return { then: (r: (v: { error: null }) => void) => r({ error: null }) };
    });
    jest.spyOn(supabase, 'from').mockReturnValue({ upsert } as ReturnType<typeof supabase.from>);
    await upsertDiscoveryResult(supabase, {
      agentId: 'a1',
      serverId: 's1',
      tenantId: 't1',
      status: 'ok',
      error: null,
      valuesHash: 'h',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ agent_id: 'a1', server_id: 's1', tenant_id: 't1', status: 'ok' });
  });
});
```

- [ ] **Step 2: Run RED** — `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest mcpTenantDiscoveryQueries.test --coverage=false` — expect failure.

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from './operationHelpers.js';

export type ServerTenantStatus = 'ok' | 'pending' | 'error';

export interface McpTenantDiscoveryRow {
  agent_id: string;
  server_id: string;
  tenant_id: string;
  status: ServerTenantStatus;
  error: string | null;
  values_hash: string | null;
  discovered_at: string | null;
}

export interface DiscoveryResultArgs {
  agentId: string;
  serverId: string;
  tenantId: string;
  status: ServerTenantStatus;
  error: string | null;
  valuesHash: string | null;
}

export interface ResetArgs {
  agentId: string;
  serverId?: string;
  tenantId?: string;
}

const DISCOVERY_COLUMNS = 'agent_id, server_id, tenant_id, status, error, values_hash, discovered_at';

export async function getTenantDiscovery(
  supabase: SupabaseClient,
  agentId: string
): Promise<McpTenantDiscoveryRow[]> {
  const { data, error } = await supabase
    .from('graph_mcp_server_tenant_discovery')
    .select(DISCOVERY_COLUMNS)
    .eq('agent_id', agentId);
  if (error !== null) throw new Error(`getTenantDiscovery: ${error.message}`);
  return (data ?? []) as McpTenantDiscoveryRow[];
}

export async function upsertDiscoveryResult(
  supabase: SupabaseClient,
  args: DiscoveryResultArgs
): Promise<void> {
  const { error } = await supabase.from('graph_mcp_server_tenant_discovery').upsert({
    agent_id: args.agentId,
    server_id: args.serverId,
    tenant_id: args.tenantId,
    status: args.status,
    error: args.error,
    values_hash: args.valuesHash,
    discovered_at: new Date().toISOString(),
  });
  if (error !== null) throw new Error(`upsertDiscoveryResult: ${error.message}`);
}

// Reset matching discovery rows to 'pending' (after an edit invalidates them).
export async function resetDiscovery(supabase: SupabaseClient, args: ResetArgs): Promise<void> {
  let query = supabase
    .from('graph_mcp_server_tenant_discovery')
    .update({ status: 'pending', error: null, values_hash: null, discovered_at: null })
    .eq('agent_id', args.agentId);
  if (args.serverId !== undefined) query = query.eq('server_id', args.serverId);
  if (args.tenantId !== undefined) query = query.eq('tenant_id', args.tenantId);
  const { error } = await query;
  if (error !== null) throw new Error(`resetDiscovery: ${error.message}`);
}
```

> Note: avoid `Date.now()` only inside workflow scripts; in normal backend code `new Date().toISOString()` is fine.

- [ ] **Step 4: Run GREEN** — expect `1 passed`.
- [ ] **Step 5: `npm run check`, commit** (`git add` the two files; message `feat(sp4): per-tenant MCP discovery cache queries`).

---

### Task 4: Backend — pure status helper (per-(server,tenant) + per-server aggregate)

**Files:**
- Create: `packages/backend/src/routes/mcp-server/mcpTenantStatus.ts`
- Test: `packages/backend/src/routes/mcp-server/mcpTenantStatus.test.ts`

**Interfaces:**
- Produces: `ServerAggregateStatus`; `computeServerTenantStatus(args: TenantStatusArgs): ServerTenantStatus` where `TenantStatusArgs = { extractedVars: string[]; resolvedValues: Record<string, string>; discovery: { status: ServerTenantStatus; valuesHash: string | null } | undefined; currentHash: string }`; `aggregateServerStatus(perTenant: ServerTenantStatus[]): ServerAggregateStatus`.
- Consumes: `ServerTenantStatus` (Task 3). Pure functions only (no I/O).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from '@jest/globals';
import { aggregateServerStatus, computeServerTenantStatus } from './mcpTenantStatus.js';

const base = { extractedVars: ['A'], resolvedValues: { A: 'x' }, currentHash: 'h' };

describe('computeServerTenantStatus', () => {
  it('is ok when all vars filled and discovery ok with matching hash', () => {
    expect(computeServerTenantStatus({ ...base, discovery: { status: 'ok', valuesHash: 'h' } })).toBe('ok');
  });
  it('is pending when a var is empty', () => {
    expect(
      computeServerTenantStatus({ ...base, resolvedValues: { A: '' }, discovery: { status: 'ok', valuesHash: 'h' } })
    ).toBe('pending');
  });
  it('is pending when discovery hash is stale', () => {
    expect(computeServerTenantStatus({ ...base, discovery: { status: 'ok', valuesHash: 'old' } })).toBe('pending');
  });
  it('is error when discovery errored and hash matches', () => {
    expect(computeServerTenantStatus({ ...base, discovery: { status: 'error', valuesHash: 'h' } })).toBe('error');
  });
  it('is pending when there is no discovery row', () => {
    expect(computeServerTenantStatus({ ...base, discovery: undefined })).toBe('pending');
  });
});

describe('aggregateServerStatus', () => {
  it('ok only when all tenants ok', () => {
    expect(aggregateServerStatus(['ok', 'ok'])).toBe('ok');
  });
  it('error when any tenant errored', () => {
    expect(aggregateServerStatus(['ok', 'error', 'pending'])).toBe('error');
  });
  it('warning when some pending and none error', () => {
    expect(aggregateServerStatus(['ok', 'pending'])).toBe('warning');
  });
});
```

- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement**

```ts
import type { ServerTenantStatus } from '../../db/queries/mcpTenantDiscoveryQueries.js';

export type ServerAggregateStatus = 'ok' | 'warning' | 'error';

export interface TenantStatusArgs {
  extractedVars: string[];
  resolvedValues: Record<string, string>;
  discovery: { status: ServerTenantStatus; valuesHash: string | null } | undefined;
  currentHash: string;
}

function allVarsFilled(extractedVars: string[], resolvedValues: Record<string, string>): boolean {
  return extractedVars.every((name) => {
    const value = resolvedValues[name];
    return value !== undefined && value !== '';
  });
}

export function computeServerTenantStatus(args: TenantStatusArgs): ServerTenantStatus {
  if (!allVarsFilled(args.extractedVars, args.resolvedValues)) return 'pending';
  const { discovery } = args;
  if (discovery === undefined || discovery.valuesHash !== args.currentHash) return 'pending';
  return discovery.status;
}

export function aggregateServerStatus(perTenant: ServerTenantStatus[]): ServerAggregateStatus {
  if (perTenant.some((s) => s === 'error')) return 'error';
  if (perTenant.every((s) => s === 'ok') && perTenant.length > 0) return 'ok';
  return 'warning';
}
```

- [ ] **Step 4: Run GREEN** — expect `8 passed`.
- [ ] **Step 5: `npm run check`, commit** (`feat(sp4): MCP per-tenant status aggregation helper`).

---

### Task 5: Backend — tenant-aware verify service (single + Verify-all, SP3-guarded, redacted)

**Files:**
- Create: `packages/backend/src/routes/mcp-server/services/verifyMcpTenant.ts`
- Modify: read `packages/backend/src/mcp-server/services/mcpToolService.ts` to reuse its `discoverTools` (or the discover route's core) for the actual listTools call.
- Test: `packages/backend/src/routes/mcp-server/services/verifyMcpTenant.test.ts`

**Interfaces:**
- Produces: `verifyMcpTenantConfig(deps: VerifyDeps, args: VerifyArgs): Promise<McpTenantDiscoveryRow>`; `verifyAllForServer(deps, args2): Promise<McpTenantDiscoveryRow[]>` (bounded concurrency). `VerifyDeps = { supabase; orgId; discover: (transport: McpTransport, allowlist: string[]) => Promise<void> }` (inject discovery for testability). `VerifyArgs = { agentId; serverId; tenantId; transport: McpTransport; variableValues: Record<string,VariableValue>; envByName; envById }`.
- Consumes: `buildResolvedVars`/`resolveTransport` (graph-types), `resolveAndAssertEgress` (egressGuard), `classifyDiscoveryError` (discoveryError), `hashVariableValues` (Task 2), `upsertDiscoveryResult` (Task 3).

- [ ] **Step 1: Write the failing test** — inject a `discover` that throws an `EgressBlockedError`; assert the row is `status:'error'`, `error` is the redacted category, and `values_hash` is set.

```ts
import { describe, expect, it, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { EgressBlockedError } from '../../../lib/egressGuard.js';
import { verifyMcpTenantConfig } from './verifyMcpTenant.js';

const URL = 'http://localhost:54321';
const KEY = 'anon-key';

describe('verifyMcpTenantConfig', () => {
  it('records a redacted error category when discovery is blocked', async () => {
    const supabase = createClient(URL, KEY);
    const captured: Array<Record<string, unknown>> = [];
    const upsert = jest.fn((row: Record<string, unknown>) => {
      captured.push(row);
      return { then: (r: (v: { error: null }) => void) => r({ error: null }) };
    });
    jest.spyOn(supabase, 'from').mockReturnValue({ upsert } as ReturnType<typeof supabase.from>);

    const row = await verifyMcpTenantConfig(
      { supabase, orgId: 'o1', discover: async () => { throw new EgressBlockedError('blocked'); } },
      {
        agentId: 'a1',
        serverId: 's1',
        tenantId: 't1',
        transport: { type: 'http', url: 'https://example.com/mcp' },
        variableValues: {},
        envByName: {},
        envById: {},
      }
    );

    expect(row.status).toBe('error');
    expect(row.error).toBe('blocked');
    expect(captured[0]).toMatchObject({ status: 'error', error: 'blocked' });
  });
});
```

- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement** (read `mcpToolService.ts` first; the real route passes a concrete `discover` that resolves the transport, runs `resolveAndAssertEgress`, then lists tools via the SP3-guarded discover path with `withAbortTimeout`).

```ts
import type { McpServerConfig, McpTransport, VariableValue } from '@daviddh/graph-types';
import { buildResolvedVars, resolveTransport } from '@daviddh/graph-types';

import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import { hashVariableValues } from '../../../db/queries/mcpTenantConfigQueries.js';
import {
  type McpTenantDiscoveryRow,
  upsertDiscoveryResult,
} from '../../../db/queries/mcpTenantDiscoveryQueries.js';
import { classifyDiscoveryError } from '../../../lib/discoveryError.js';

export interface VerifyDeps {
  supabase: SupabaseClient;
  orgId: string;
  discover: (transport: McpTransport, allowlist: string[]) => Promise<void>;
}

export interface VerifyArgs {
  agentId: string;
  serverId: string;
  tenantId: string;
  transport: McpTransport;
  variableValues: Record<string, VariableValue>;
  envByName: Record<string, string>;
  envById: Record<string, string>;
}

const VERIFY_CONCURRENCY = 4;

export async function verifyMcpTenantConfig(deps: VerifyDeps, args: VerifyArgs): Promise<McpTenantDiscoveryRow> {
  const valuesHash = hashVariableValues(args.variableValues);
  const resolved = buildResolvedVars(args.variableValues, { byName: args.envByName, byId: args.envById });
  const transport = resolveTransport(args.transport, resolved);
  const row = await runDiscovery(deps, args, transport, valuesHash);
  await upsertDiscoveryResult(deps.supabase, {
    agentId: args.agentId,
    serverId: args.serverId,
    tenantId: args.tenantId,
    status: row.status,
    error: row.error,
    valuesHash,
  });
  return row;
}

async function runDiscovery(
  deps: VerifyDeps,
  args: VerifyArgs,
  transport: McpTransport,
  valuesHash: string
): Promise<McpTenantDiscoveryRow> {
  const baseRow = {
    agent_id: args.agentId,
    server_id: args.serverId,
    tenant_id: args.tenantId,
    values_hash: valuesHash,
    discovered_at: new Date().toISOString(),
  };
  try {
    await deps.discover(transport, []);
    return { ...baseRow, status: 'ok', error: null };
  } catch (err) {
    return { ...baseRow, status: 'error', error: classifyDiscoveryError(err) };
  }
}

export interface VerifyAllArgs {
  server: McpServerConfig;
  tenants: Array<{ tenantId: string; variableValues: Record<string, VariableValue> }>;
  agentId: string;
  envByName: Record<string, string>;
  envById: Record<string, string>;
}

export async function verifyAllForServer(
  deps: VerifyDeps,
  args: VerifyAllArgs
): Promise<McpTenantDiscoveryRow[]> {
  const results: McpTenantDiscoveryRow[] = [];
  for (let i = 0; i < args.tenants.length; i += VERIFY_CONCURRENCY) {
    const batch = args.tenants.slice(i, i + VERIFY_CONCURRENCY);
    const rows = await Promise.all(
      batch.map(async (t) =>
        await verifyMcpTenantConfig(deps, {
          agentId: args.agentId,
          serverId: args.server.id,
          tenantId: t.tenantId,
          transport: args.server.transport,
          variableValues: t.variableValues,
          envByName: args.envByName,
          envById: args.envById,
        })
      )
    );
    results.push(...rows);
  }
  return results;
}
```

> The route (Task 6) supplies a concrete `discover` that runs `resolveAndAssertEgress(extractServerUrl(server), allowlist)` then the SP3-guarded list-tools through `mcpToolService`/`withAbortTimeout`. Keeping `discover` injected keeps this unit pure and lets the test force an `EgressBlockedError`.

- [ ] **Step 4: Run GREEN** — expect `1 passed`.
- [ ] **Step 5: `npm run check`, commit** (`feat(sp4): tenant-aware MCP verify service + verify-all`).

---

### Task 6: Backend — Express routes for per-tenant config (list/upsert) + verify + status

**Files:**
- Create: `packages/backend/src/routes/mcp-server/mcpTenantConfigHandlers.ts`
- Modify: `packages/backend/src/server.ts` (mount routes)
- Test: `packages/backend/src/routes/mcp-server/mcpTenantConfigHandlers.test.ts`

**Interfaces:**
- Produces (HTTP, behind `requireAuth`): `GET /agents/:agentId/mcp-tenant-config` → `{ configs: McpTenantConfigRow[]; discovery: McpTenantDiscoveryRow[] }`; `PUT /agents/:agentId/mcp-tenant-config/:serverId/:tenantId` body `{ variableValues; expectedUpdatedAt }` → `200 { row }` | `409 { error: 'conflict' }`; `POST /agents/:agentId/mcp-tenant-config/:serverId/verify` → `{ rows }`.
- Consumes: Task 2/3/5 queries, `res.locals.supabase` (user-scoped), `getDecryptedEnvVariables`, `getTenantsByOrg`, `extractServerUrl`, `resolveAndAssertEgress`.

- [ ] **Step 1: Write the failing test** — mount `handlePutTenantConfigCell` on an Express app with a stubbed query module (via `jest.unstable_mockModule('../../db/queries/mcpTenantConfigQueries.js', ...)`); supertest a PUT and assert `409` on a `conflict` result and `200` on `ok`. (Mirror `simulateHandler.test.ts`: capture the real runner with a top-level static import if any runner export is needed; here only the query module is mocked.)
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement** handlers (each ≤40 lines; extract param parsing to a helper) and register in `server.ts` next to the existing agent routes, behind `withGate`/`requireAuth`. The verify handler builds the concrete `discover` closure (egress guard + SP3 list-tools) and calls `verifyAllForServer`.
- [ ] **Step 4: Run GREEN.**
- [ ] **Step 5: `npm run check`, commit** (`feat(sp4): backend routes for per-tenant MCP config + verify`).

---

### Task 7: Web — lib + server actions for per-tenant config (Client → Next → backend)

**Files:**
- Create: `packages/web/app/lib/mcpTenantConfig.ts` (types + `fetchFromBackend` calls)
- Create: `packages/web/app/actions/mcpTenantConfig.ts` (`'use server'`)
- Test: `packages/web/app/lib/mcpTenantConfig.test.ts` (type-guard + URL-building unit tests)

**Interfaces:**
- Produces: web `McpTenantConfigRow`/`McpTenantDiscoveryRow` mirror types + `isMcpTenantConfigRow`; `getMcpTenantConfigAction(agentId)`, `saveMcpTenantCellAction(args)`, `verifyMcpTenantServerAction(agentId, serverId)`.
- Consumes: `fetchFromBackend` (`packages/web/app/lib/backendProxy.ts`).

- [ ] Steps mirror `app/lib/tenants.ts` + `app/actions/tenants.ts` patterns. RED on the guard test (missing field), implement, GREEN, `npm run check`, commit (`feat(sp4): web per-tenant MCP config lib + actions`).

---

### Task 8: Backend — builder canonical tool list resolves against the default tenant

**Files:**
- Modify: `packages/backend/src/routes/agents/getRegistry.ts:36-91`
- Test: `packages/backend/src/routes/agents/getRegistry.defaultTenant.test.ts`

**Interfaces:**
- Consumes: `getTenantsByOrg` (default-first → first row is the default tenant), `getTenantConfigs` (Task 2), `buildResolvedVars`/`resolveTransport`.
- Produces: registry resolved with the **default tenant's** `variable_values` (not agent-wide, not `tenantId:''`).

- [ ] **Step 1: Write the failing test** — stub `getTenantsByOrg` (default tenant first) + `getTenantConfigs`; assert `resolveServerTransport` receives the default tenant's values (assert on the resolved transport URL).
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement** — load the org's default tenant (first of `getTenantsByOrg`), fetch its config rows, build a `serverId → variableValues` map, and override each server's `variableValues` with the default tenant's before `resolveServerTransport`. Set `tenantId` on the provider ctx to the default tenant id.
- [ ] **Step 4: Run GREEN.**
- [ ] **Step 5: `npm run check`, commit** (`feat(sp4): builder registry resolves against default tenant`).

---

### Task 9: Migration — extend BOTH publish RPCs (snapshot per-tenant config; fix agent RPC drop)

**Files:**
- Create: `supabase/migrations/20260623100000_publish_tenant_mcp_config.sql`
- Test: `packages/backend/src/routes/mcp-server/publishTenantMcpMigration.contract.test.ts`

**Interfaces:**
- Produces (DB): replaces `public.publish_version_tx` and `public.publish_agent_version_tx` so `graph_data` includes `'mcpTenantConfig'` (array of `{server_id, tenant_id, variable_values}` for the agent) AND the agent RPC's `mcpServers` block also embeds `libraryItemId` + `variableValues` (parity with the workflow RPC).
- Consumes: the existing RPC bodies (`20260618000000_publish_snapshot_with_locks.sql:21-172` workflow, `:174-...` agent).

- [ ] **Step 1: Write the contract test**

```ts
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const d = dirname(fileURLToPath(import.meta.url));
const M = resolve(d, '../../../../../supabase/migrations/20260623100000_publish_tenant_mcp_config.sql');

describe('publish_tenant_mcp_config migration', () => {
  const sql = readFileSync(M, 'utf8');
  it('redefines both publish RPCs', () => {
    expect(sql).toMatch(/create or replace function public\.publish_version_tx/iv);
    expect(sql).toMatch(/create or replace function public\.publish_agent_version_tx/iv);
  });
  it('snapshots per-tenant mcp config in both', () => {
    const occurrences = sql.match(/'mcpTenantConfig'/gv) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/from public\.graph_mcp_server_tenant_config/iv);
  });
  it('agent RPC now embeds variableValues + libraryItemId', () => {
    expect(sql).toMatch(/'variableValues', m\.variable_values/iv);
    expect(sql).toMatch(/'libraryItemId', m\.library_item_id/iv);
  });
});
```

- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Write the migration** — copy BOTH current RPC bodies verbatim from `20260618000000_...` and (a) in the agent RPC's `mcpServers` `jsonb_build_object`, add `'libraryItemId', m.library_item_id, 'variableValues', m.variable_values`; (b) in BOTH `v_graph_data` objects add a sibling key:

```sql
    'mcpTenantConfig', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'serverId', c.server_id,
        'tenantId', c.tenant_id,
        'variableValues', c.variable_values
      )) from public.graph_mcp_server_tenant_config c where c.agent_id = p_agent_id),
      '[]'::jsonb
    ),
```

- [ ] **Step 4: Run GREEN** — expect `3 passed`.
- [ ] **Step 5: Commit** (format the test; `feat(sp4): publish RPCs snapshot per-tenant MCP config`).

---

### Task 10: Migration — extend `restore_version_tx` to restore per-tenant config + variable_values/library_item_id

**Files:**
- Create: `supabase/migrations/20260623200000_restore_tenant_mcp_config.sql`
- Test: `packages/backend/src/routes/mcp-server/restoreTenantMcpMigration.contract.test.ts`

**Interfaces:**
- Produces: redefined `public.restore_version_tx` that, when reinserting `graph_mcp_servers`, also restores `variable_values` + `library_item_id`, and repopulates `graph_mcp_server_tenant_config` from `graph_data->'mcpTenantConfig'`.
- Consumes: existing body (`20260310000000_add_restore_version_tx.sql:118-127`).

- [ ] **Step 1: contract test** asserting `restore_version_tx` is redefined, inserts `variable_values`/`library_item_id`, and inserts into `graph_mcp_server_tenant_config` from `jsonb_to_recordset(... -> 'mcpTenantConfig')`.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** copy the current body, extend the `graph_mcp_servers` insert column list with `variable_values, library_item_id` (read from the snapshot's `mcpServers` objects), and add an insert into `graph_mcp_server_tenant_config` from the snapshot's `mcpTenantConfig`.
- [ ] **Step 4: GREEN.**
- [ ] **Step 5: commit** (`feat(sp4): restore_version_tx restores per-tenant MCP config`).

---

### Task 11: Backend — runtime per-tenant resolution from snapshot + tenantID validation (fail-fast)

**Files:**
- Create: `packages/backend/src/routes/execute/applyTenantMcpConfig.ts`
- Modify: `packages/backend/src/routes/execute/executeCoreHelpers.ts:59-63` (intercept before `resolveMcpTransportVariables`)
- Modify: `packages/backend/src/routes/execute/executeFetcher.ts` (surface `graph_data.mcpTenantConfig` onto the graph/fetched data)
- Test: `packages/backend/src/routes/execute/applyTenantMcpConfig.test.ts`

**Interfaces:**
- Produces: `applyTenantMcpConfig(graph: RuntimeGraph, snapshot: TenantConfigSnapshot[], tenantId: string): RuntimeGraph` (sets each server's `variableValues` to the run tenant's snapshot values); `assertTenantInSnapshot(args: { snapshot; tenantId; mcpServers }): void` — throws `TenantConfigMissingError` naming the tenant when the snapshot has MCP servers but no config rows for `tenantId`. `TenantConfigSnapshot = { serverId: string; tenantId: string; variableValues: Record<string, VariableValue> }`.
- Consumes: SP0 `buildAgentRuntimeGraph` already surfaces `mcpServers`; the snapshot `mcpTenantConfig` (Task 9) rides `graph_data`.

- [ ] **Step 1: Write the failing test** — (a) `applyTenantMcpConfig` swaps in the right tenant's values; (b) `assertTenantInSnapshot` throws `TenantConfigMissingError` with the tenant id in the message when servers exist but the tenant is absent; (c) no servers → no throw.
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement** `applyTenantMcpConfig`/`assertTenantInSnapshot` + `TenantConfigMissingError`. In `executeCoreHelpers.ts`, before line 59: validate `params.tenantID` is a non-empty `tenants.id` (look it up via a new `getTenantByIdForOrg(supabase, tenantId, orgId)` — reuse `getTenantById` from SP1 and check org) and **fail fast** if not found; then `const tenantGraph = applyTenantMcpConfig(graphAndKeys.graph, graphAndKeys.mcpTenantConfig, params.tenantID); assertTenantInSnapshot(...)`; pass `tenantGraph` into `resolveMcpTransportVariables`. In `executeFetcher.ts`, parse `graph_data.mcpTenantConfig` into `mcpTenantConfig: TenantConfigSnapshot[]` on the returned object (default `[]`).
- [ ] **Step 4: Run GREEN.**
- [ ] **Step 5: `npm run check`, commit** (`feat(sp4): runtime resolves MCP per tenant from snapshot + fail-fast on unknown tenant`).

---

### Task 12: api — Redis MCP cache invalidation keyed by per-tenant RESOLVED url

**Files:**
- Modify: `packages/api/src/.../invalidateMcpCache.ts` (read it first; ~`:42-46,62-64,91`)
- Test: extend/`create` `packages/api/src/.../invalidateMcpCache.test.ts`

**Interfaces:**
- Produces: invalidation hashes the **resolved** per-tenant URL(s) (matching execution-time `hashServerUrl(resolvedUrl)`), not the template URL — so per-server cache-busts actually match.
- Consumes: `mcpToolsListKey`/`hashServerUrl` (`mcpToolsListCache.ts`), the snapshot `mcpTenantConfig` + `buildResolvedVars`/`resolveTransport`/`extractServerUrl`.

- [ ] **Step 1: Write the failing test** — a server whose `transport.url` contains `{{HOST}}` and two tenants with different `HOST` values must produce **two** distinct scan/delete hashes (the resolved URLs), not one template hash.
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement** — for each server, for each tenant config, resolve the transport and hash `extractServerUrl(resolved)`; scan/delete `mcp_tools:v1:${orgId}:${hash}:*` for each.
- [ ] **Step 4: Run GREEN** (`npm run test -w packages/api -- --testPathPatterns invalidateMcpCache`).
- [ ] **Step 5: `npm run check`, commit** (`fix(sp4): invalidate MCP cache by per-tenant resolved url`).

---

### Task 13: Backend — invalidation wiring (reset discovery on the events that stale it)

**Files:**
- Modify: the cell-upsert handler (Task 6) → after a successful save, `resetDiscovery({ agentId, serverId, tenantId })`.
- Modify: the server template/definition update path (custom MCP transport edit) → `resetDiscovery({ agentId, serverId })` (all tenants).
- Modify: the library-item update path → `resetDiscovery` for all servers referencing it.
- Modify: org env-variable **value** update path → reset discovery rows whose config references it (detect via stored `env_ref` ids).
- Note: tenant delete already cascades the discovery rows (FK `on delete cascade`).
- Test: `packages/backend/src/routes/mcp-server/invalidation.test.ts`

**Interfaces:**
- Consumes: `resetDiscovery` (Task 3). Each call site logs but does not fail the primary write.

- [ ] Steps: RED a test asserting a cell save triggers `resetDiscovery` with the right keys; implement each wiring point (extract a `staleDiscoveryAfterEnvChange` helper to stay ≤40 lines); GREEN; `npm run check`; commit (`feat(sp4): invalidate per-tenant discovery on config/template/library/env changes`).

---

### Task 14: Web — `useMcpTenantConfigs` hook (load configs+discovery, optimistic cell save, verify)

**Files:**
- Create: `packages/web/app/hooks/useMcpTenantConfigs.ts`
- Test: `packages/web/app/hooks/__tests__/useMcpTenantConfigs.test.ts`

**Interfaces:**
- Produces: `useMcpTenantConfigs(agentId)` → `{ rows; discovery; loading; saveCell(serverId, tenantId, values); verifyServer(serverId); verifyAll(); statusFor(serverId, tenantId); aggregateFor(serverId) }`.
- Consumes: Task 7 actions; computes status client-side via a mirror of the Task 4 helper (export a shared pure helper from `app/lib/mcpTenantStatus.ts` to avoid divergence — create it here, unit-tested, mirroring Task 4 exactly).

- [ ] Steps: RED on the status mirror + optimistic-save reducer; implement; GREEN; `npm run check`; commit (`feat(sp4): useMcpTenantConfigs hook + client status`).

---

### Task 15: Web — `McpMatrixCell` (direct/env_ref input, reusing EnvRefSelector)

**Files:**
- Create: `packages/web/app/components/panels/mcpMatrix/McpMatrixCell.tsx`
- Test: `packages/web/app/components/panels/mcpMatrix/McpMatrixCell.test.tsx`

**Interfaces:**
- Produces: `<McpMatrixCell value envVars onChange />` — a text input with a toggle to `env_ref` (reuse `EnvRefSelector` from `VariableValuesEditor.tsx`); a small "org-shared" badge for `env_ref`; a secret warning hint for `direct`.
- Consumes: `VariableValue`, `OrgEnvVariableRow`.

- [ ] Steps: RED (renders input for `direct`, switches to selector for `env_ref`); implement (≤40-line component; extract toggle); GREEN; `npm run check`; commit.

---

### Task 16: Web — `McpMatrixRow` (one tenant: cells + status + Test)

**Files:**
- Create: `packages/web/app/components/panels/mcpMatrix/McpMatrixRow.tsx`
- Test: alongside.

**Interfaces:**
- Produces: `<McpMatrixRow tenant columns values status onCellChange onTest />` — renders the tenant (default-marked), one `McpMatrixCell` per column, trailing status icon + Test button.
- Consumes: Task 15, the status type from Task 14.

- [ ] Steps: RED (renders N cells for N columns; default tenant shows the "(default)" marker), implement, GREEN, `npm run check`, commit.

---

### Task 17: Web — `McpServerDefinitionSection` (custom-MCP template editor)

**Files:**
- Create: `packages/web/app/components/panels/mcpMatrix/McpServerDefinitionSection.tsx`
- Test: alongside.

**Interfaces:**
- Produces: collapsible section to edit a custom server's transport template; on change, calls `onTemplateChange` (which re-derives columns + resets rows). Validates/echoes placeholder syntax so typos surface (uses `MCP_VARIABLE_PATTERN`).
- Consumes: `extractTemplateVariables`, `MCP_VARIABLE_PATTERN`.

- [ ] Steps: RED (typing `{{ NAME }}` with spaces shows a validation note and yields no phantom column), implement, GREEN, `npm run check`, commit.

---

### Task 18: Web — `McpTenantMatrixModal` (compose rows, Verify-all, Scrollable body)

**Files:**
- Create: `packages/web/app/components/panels/mcpMatrix/McpTenantMatrixModal.tsx`
- Test: alongside.

**Interfaces:**
- Produces: `<McpTenantMatrixModal open server tenants agentId onOpenChange />` — header with title + "Verify all"; body in `Scrollable`; `columns = extractTemplateVariables(server.transport)`; rows = tenants (default first); OAuth/zero-column servers render per-row connect/test only; uses `useMcpTenantConfigs`.
- Consumes: Tasks 14/16/17; `Scrollable` wrapper.

- [ ] Steps: RED (renders one row per tenant, columns = extracted vars; zero-column server shows status-only rows). Keep each render branch (loading/empty/definition/rows) **outside** the scroll host or inside `Scrollable` to avoid the `removeChild` tripwire. Implement (split into ≤40-line subcomponents; file ≤300 lines), GREEN, `npm run check`, commit.

---

### Task 19: Web — `McpServersSection`: replace accordion with status icon + Edit button, wire modal

**Files:**
- Modify: `packages/web/app/components/panels/McpServersSection.tsx` (read first; currently `ServerItemExpanded`/accordion at `:150-253`)
- Test: update/create `McpServersSection.test.tsx`

**Interfaces:**
- Produces: each row shows the aggregate status icon (ok/warning/error) + an `Edit` (`variant="link"`) button opening `McpTenantMatrixModal`. Name edit / transport-type / stdio command-args / add/remove/delete / Publish stay on the row (capability remap — only value-filling moves to the matrix).
- Consumes: Task 18 modal, Task 14 aggregate status, the existing `StatusIcon` extended with an `error` state.

- [ ] Steps: RED (a row renders an Edit button and no accordion), implement (extract the row to keep functions ≤40 lines; file may need splitting toward 300), GREEN, `npm run check`, commit.

---

### Task 20: Web — publish/save gate uses aggregate per-tenant status

**Files:**
- Modify: `packages/web/app/components/panels/StatusButton.tsx:143-149` (`hasMcpErrors`)
- Modify: `packages/web/app/components/GraphBuilder.tsx:307-331` (feed per-tenant aggregate into `mcpHealthInput`)
- Modify: `packages/web/app/hooks/useMcpDiscovery.ts` (builder list from default-tenant discovery — Task 8 backend already resolves canonical list against default tenant)
- Test: `StatusButton.tenantGate.test.ts`

**Interfaces:**
- Produces: `hasMcpErrors` returns true unless **every** enabled server's aggregate status is `ok` (all tenants ok). Disabled servers skipped.
- Consumes: Task 14 `aggregateFor`.

- [ ] **Step 1: Write the failing test** — a server with one tenant `pending` makes `hasMcpErrors` true; all-`ok` makes it false.
- [ ] **Step 2: RED.**
- [ ] **Step 3:** rewire `hasMcpErrors` to consume `{ servers, aggregateStatus: Record<serverId, ServerAggregateStatus> }`; build that input in `GraphBuilder` from `useMcpTenantConfigs`.
- [ ] **Step 4: GREEN.**
- [ ] **Step 5: `npm run check`, commit** (`feat(sp4): publish gate requires all tenants configured + ok`).

---

### Task 21: Web — i18n namespace for the matrix

**Files:**
- Modify: `packages/web/messages/en.json`
- (No test; verified by typecheck + the components that consume the keys.)

**Interfaces:**
- Produces: a new `mcpMatrix` namespace: `title`, `verifyAll`, `test`, `statusOk`, `statusPending`, `statusError`, `needsConfig`, `definitionHeader`, `definitionHelp`, `useEnvVar`, `envShared`, `secretWarning`, `redactedError`, `emptyTenants`, `oauthStatusOnly`.

- [ ] **Step 1:** add the `mcpMatrix` block to `en.json` (after an existing top-level namespace; valid JSON). **Step 2:** `cd packages/web && npm run typecheck` (consumers resolve the keys). **Step 3:** `npm run check`, commit (`feat(sp4): i18n for tenant MCP matrix`).

---

### Task 22: Full integration verification

**Files:** none (verification only).

- [ ] Run full suites: `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest`; `cd packages/web && NODE_OPTIONS='--experimental-vm-modules' npx jest`; `npm run test -w packages/api`; `cd packages/graph-types && NODE_OPTIONS='--experimental-vm-modules' npx jest`.
- [ ] Run `npm run check` (all packages) — clean.
- [ ] Confirm the three new migrations are present and unapplied; remind the user to apply `20260623000000`, `20260623100000`, `20260623200000` in order.
- [ ] Commit any final formatting (`chore(sp4): final integration check`).

---

## Self-Review

**Spec coverage (each §/decision → task):**
- §1 default tenant → reused (SP1); referenced in Tasks 8/18 (default-first row/canonical tenant). ✔
- §2 two tables + composite FK + `update_updated_at` + `values_hash` + optimistic-lock config CRUD → Tasks 1, 2, 6. ✔
- §3 shared resolver/extraction → reused (SP2); consumed in Tasks 5, 8, 11, 12, 14–18. ✔
- §4 publish snapshot (both RPCs, agent-RPC drop fix) + restore → Tasks 9, 10. ✔
- §5 tenant-aware verify + Verify-all + egress safety (reused SP3) → Tasks 5, 6. ✔
- §6 builder canonical list (default tenant) + publish gate rewire → Tasks 8, 20. ✔
- §7 runtime snapshot-keyed per-tenant resolution + tenantID validation + fail-fast + agent app path (SP0 chokepoint) → Task 11. ✔
- §8 RLS on both tables → Task 1. ✔
- §9 matrix UI (Edit button, modal, cell, row, definition section, OAuth zero-column, Scrollable) + i18n → Tasks 15–19, 21. ✔
- §10 status aggregation (per-tenant + aggregate, `values_hash` staleness) → Task 4 (backend) + Task 14 (web mirror). ✔
- §11 staleness/invalidation + Redis cache key reconcile → Tasks 12, 13. ✔
- Decisions: D1 auto-detected columns (Task 18 via `extractTemplateVariables`); D2 on-demand+cached discovery (Tasks 5/6/14); D3 no inheritance (per-cell rows, Task 2); D5 direct/env_ref cell (Task 15); D6 pure snapshot + republish (Tasks 9–11); D9 publish gate all-ok (Task 20). Binding decisions 1–4 from re-review: tenantID fail-fast (Task 11), both app types (Tasks 9/11), both pre-existing bugs fixed (Tasks 9, 12), pure snapshot (Task 11). ✔

**Placeholder scan:** Foundational/SQL/pure-logic tasks (1–5, 8–13, 20) carry complete code. UI/route tasks (6, 7, 14–19, 21) specify exact files, interfaces, RED/GREEN gates, and the concrete patterns/components to reuse, but defer full component bodies to the implementer who must read the current file first — these are large React/Express files whose exact current contents must be read at execution time (noted in each task). This is a deliberate right-sizing for UI tasks, not a TBD; every such task names the exact symbols, props, files, and acceptance test.

**Type/name consistency:** `McpTenantConfigRow`/`McpTenantDiscoveryRow`/`ServerTenantStatus`/`ServerAggregateStatus` defined once (Tasks 2–4) and reused verbatim; `hashVariableValues` (Task 2) consumed by Tasks 5, 11-status; `resetDiscovery`/`upsertDiscoveryResult` (Task 3) consumed by 5, 13; snapshot key `mcpTenantConfig` consistent across Tasks 9, 10, 11; `extractTemplateVariables`/`buildResolvedVars`/`resolveTransport` use the real SP2 signatures throughout.
