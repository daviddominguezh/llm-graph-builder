# Auth Phone Verification + Onboarding + Account Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship strict, defense-in-depth phone verification + onboarding survey + explicit Google-account-linking flow, per the spec at `docs/superpowers/specs/2026-04-21-auth-phone-onboarding-design.md`.

**Architecture:** All sensitive reads/writes live in `packages/backend` (Express). Next.js proxies via `packages/web/app/lib/backendProxy.ts`. JWT-scoped Supabase for RLS-safe reads; service-role (tightly scoped) for cross-user operations. Next.js middleware gates every authenticated request; backend enforces a second default-deny gate via a startup walker over the Express router tree. Three gate middlewares (`requireGateComplete`, `requirePhoneUnverified`, `requireOnboardingIncomplete`). `_auth_status` cache cookie signed by Next.js only, bound to `sha256(access_token)`.

**Tech Stack:** Postgres (Supabase), Express, Next.js 16 (App Router), Jest (backend), `@supabase/supabase-js`, `@supabase/ssr`, `libphonenumber-js`, `react-phone-number-input`, `zod`, shadcn/ui (input-otp).

---

## Phase 1: Migrations

### Task 1: Apply all five migrations

**Files:**
- Create: `supabase/migrations/20260421000000_onboarding_completed.sql`
- Create: `supabase/migrations/20260421000001_user_onboarding.sql`
- Create: `supabase/migrations/20260421000002_backfill_existing_users.sql`
- Create: `supabase/migrations/20260421000003_auth_helpers.sql`
- Create: `supabase/migrations/20260421000004_audit_log_and_retention.sql`

- [ ] **Step 1: Create migration 0 (onboarding_completed column)**

```sql
-- supabase/migrations/20260421000000_onboarding_completed.sql
alter table public.users
  add column onboarding_completed_at timestamptz;
```

- [ ] **Step 2: Create migration 1 (user_onboarding table)**

```sql
-- supabase/migrations/20260421000001_user_onboarding.sql
create table public.user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  industry text not null,
  company_size text not null,
  role text not null,
  referral_sources text[] not null
    check (array_length(referral_sources, 1) between 1 and 20),
  build_goals text[] not null
    check (array_length(build_goals, 1) between 1 and 20),
  created_at timestamptz not null default now()
);

alter table public.user_onboarding enable row level security;

create policy "Users read own onboarding"
  on public.user_onboarding for select using (auth.uid() = user_id);

create policy "Users insert own onboarding"
  on public.user_onboarding for insert with check (auth.uid() = user_id);
```

- [ ] **Step 3: Create migration 2 (backfill existing users)**

```sql
-- supabase/migrations/20260421000002_backfill_existing_users.sql
alter table public.users
  add column grandfathered_at timestamptz;

update public.users u
  set grandfathered_at = now(),
      onboarding_completed_at = now()
  where u.created_at < now()
    and not exists (select 1 from public.user_onboarding o where o.user_id = u.id);
```

- [ ] **Step 4: Create migration 3 (auth helper functions + OTP tables)**

```sql
-- supabase/migrations/20260421000003_auth_helpers.sql

create or replace function public.list_user_providers(p_email text)
returns text[]
language plpgsql
security definer set search_path = ''
as $$
declare
  v_providers text[];
begin
  select coalesce(array_agg(distinct i.provider), '{}')::text[]
    into v_providers
  from auth.users u
  join auth.identities i on i.user_id = u.id
  where u.email = lower(p_email);
  return v_providers;
end;
$$;

revoke execute on function public.list_user_providers(text) from public, anon, authenticated;
grant  execute on function public.list_user_providers(text) to service_role;

create or replace function public.reject_oauth_duplicate(p_uid uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_email text;
  v_survivor_id uuid;
begin
  select u.email into v_email from auth.users u where u.id = p_uid;
  if v_email is null then
    return jsonb_build_object('duplicate', false);
  end if;

  select u.id into v_survivor_id
  from auth.users u
  where u.email = v_email
    and u.id <> p_uid
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')
  limit 1
  for update;

  if v_survivor_id is null then
    return jsonb_build_object('duplicate', false);
  end if;

  delete from auth.users where id = p_uid;
  return jsonb_build_object('duplicate', true, 'email', v_email);
end;
$$;

revoke execute on function public.reject_oauth_duplicate(uuid) from public, anon, authenticated;
grant  execute on function public.reject_oauth_duplicate(uuid) to service_role;

create or replace function public.get_safe_identities(p_user_id uuid)
returns table (provider text, email text, created_at timestamptz)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
    select i.provider, i.identity_data ->> 'email', i.created_at
    from auth.identities i
    where i.user_id = p_user_id;
end;
$$;

revoke execute on function public.get_safe_identities(uuid) from public, anon, authenticated;
grant  execute on function public.get_safe_identities(uuid) to service_role;

create unique index if not exists auth_users_phone_any_unique
  on auth.users (phone)
  where phone is not null;

create index if not exists auth_users_phone_change_sent_idx
  on auth.users (phone_change_sent_at)
  where phone_confirmed_at is null and phone is not null;

create table public.otp_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  fails smallint not null default 0,
  locked_until timestamptz,
  resends_24h smallint not null default 0,
  resends_window_start timestamptz,
  distinct_phones_today smallint not null default 0,
  distinct_phones_window_start timestamptz,
  primary key (user_id, phone)
);

alter table public.otp_attempts enable row level security;
revoke all on public.otp_attempts from anon, authenticated;
grant  select, insert, update, delete on public.otp_attempts to service_role;

create table public.otp_cooldowns (
  user_id uuid primary key references auth.users(id) on delete cascade,
  next_allowed_at timestamptz not null
);

alter table public.otp_cooldowns enable row level security;
revoke all on public.otp_cooldowns from anon, authenticated;
grant  select, insert, update, delete on public.otp_cooldowns to service_role;
```

- [ ] **Step 5: Create migration 4 (audit log + retention + pg_cron jobs)**

```sql
-- supabase/migrations/20260421000004_audit_log_and_retention.sql

create table public.auth_audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  email text,
  phone text,
  ip_truncated text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.auth_audit_log enable row level security;
revoke all on public.auth_audit_log from anon, authenticated;
grant  select, insert on public.auth_audit_log to service_role;

create index auth_audit_log_user_id_idx on public.auth_audit_log (user_id, created_at desc);
create index auth_audit_log_event_idx   on public.auth_audit_log (event, created_at desc);

create or replace function public.scrub_audit_log_on_user_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.auth_audit_log
     set email = null,
         phone = null,
         user_agent = null,
         metadata = null
   where user_id = old.id;
  return old;
end;
$$;

create trigger scrub_audit_log_after_user_delete
  after delete on auth.users
  for each row execute function public.scrub_audit_log_on_user_delete();

select cron.schedule(
  'sweep_abandoned_phones',
  '* * * * *',
  $$update auth.users set phone = null
    where phone is not null
      and phone_confirmed_at is null
      and phone_change_sent_at < now() - interval '30 minutes'$$
);

select cron.schedule(
  'retain_auth_audit_log',
  '15 3 * * *',
  $$delete from public.auth_audit_log
    where (event not in ('oauth_duplicate_rejected', 'otp_lockout')
           and created_at < now() - interval '90 days')
       or (event in ('oauth_duplicate_rejected', 'otp_lockout')
           and created_at < now() - interval '1 year')$$
);
```

- [ ] **Step 6: Apply migrations locally**

Run: `npx supabase db reset` (from repo root if that's the convention; otherwise `npx supabase migration up`).
Expected: all five migrations apply without errors; `pg_cron` extension resolves (enable in `config.toml` if not already).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260421*.sql
git commit -m "feat(db): add onboarding, OTP accounting, audit log, auth helper functions"
```

---

## Phase 2: Shared validation

### Task 2: Add onboarding enum constants to shared-validation

**Files:**
- Create: `packages/shared-validation/src/onboarding.ts`
- Modify: `packages/shared-validation/src/index.ts`

- [ ] **Step 1: Write onboarding enum module**

```ts
// packages/shared-validation/src/onboarding.ts
export const INDUSTRY_OPTIONS = [
  'it_software', 'legal', 'health', 'finance', 'education',
  'ecommerce', 'media', 'manufacturing', 'real_estate', 'other',
] as const;

export const COMPANY_SIZE_OPTIONS = [
  '1', '2-10', '10-50', '50-100', '100-500',
  '500-1000', '1000-5000', '5000+',
] as const;

export const ROLE_OPTIONS = [
  'developer', 'founder', 'c_level', 'product',
  'marketing', 'sales', 'legal', 'operations', 'other',
] as const;

export const REFERRAL_OPTIONS = [
  'linkedin', 'youtube', 'friend_referral', 'reddit', 'discord',
  'tldr', 'google_search', 'twitter_x', 'blog_post', 'other',
] as const;

export const BUILD_GOAL_OPTIONS = [
  'ai_agents', 'ai_agency', 'workflows',
  'browser_automation', 'chatbot', 'not_sure',
] as const;

export type Industry = (typeof INDUSTRY_OPTIONS)[number];
export type CompanySize = (typeof COMPANY_SIZE_OPTIONS)[number];
export type Role = (typeof ROLE_OPTIONS)[number];
export type Referral = (typeof REFERRAL_OPTIONS)[number];
export type BuildGoal = (typeof BUILD_GOAL_OPTIONS)[number];
```

- [ ] **Step 2: Export from index**

Append to `packages/shared-validation/src/index.ts`:

```ts
export * from './onboarding.js';
```

- [ ] **Step 3: Build and typecheck**

Run: `npm run typecheck -w packages/shared-validation && npm run build -w packages/shared-validation`
Expected: no errors; `dist/onboarding.js` and `.d.ts` emitted.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-validation/src/onboarding.ts packages/shared-validation/src/index.ts
git commit -m "feat(shared-validation): add onboarding enum constants"
```

---

## Phase 3: Backend infrastructure

### Task 3: Add `serviceSupabase()` helper

**Files:**
- Modify: `packages/backend/src/db/client.ts`
- Create: `packages/backend/src/db/client.test.ts`
- Create: `packages/backend/.eslintrc.cjs` (or extend existing ESLint config — scan `packages/backend` for existing lint config first)

- [ ] **Step 1: Write failing test for serviceSupabase**

```ts
// packages/backend/src/db/client.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { serviceSupabase } from './client.js';

describe('serviceSupabase', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    expect(() => serviceSupabase()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('returns a client when env is set', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    const client = serviceSupabase();
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm run test -w packages/backend -- --testPathPattern=db/client`
Expected: FAIL (`serviceSupabase is not a function`).

- [ ] **Step 3: Add serviceSupabase to client.ts**

Append to `packages/backend/src/db/client.ts`:

```ts
export function serviceSupabase(): ReturnType<typeof createClient> {
  const url = getRequiredEnv('SUPABASE_URL');
  const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm run test -w packages/backend -- --testPathPattern=db/client`
Expected: PASS.

- [ ] **Step 5: Restrict imports via ESLint**

In the backend's ESLint config (check `packages/backend/eslint.config.*` for the existing format), add a `no-restricted-imports` rule (in whichever style the existing config uses) restricting `serviceSupabase` to `packages/backend/src/routes/auth/**` and `packages/backend/src/middleware/**`:

```js
// example pattern — adapt to the existing config style (flat or legacy)
{
  files: ['packages/backend/src/**/*.ts'],
  ignores: [
    'packages/backend/src/routes/auth/**',
    'packages/backend/src/middleware/**',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/db/client.js', '**/db/client'],
        importNames: ['serviceSupabase'],
        message: 'serviceSupabase() is restricted to routes/auth/* and middleware/*',
      }],
    }],
  },
},
```

- [ ] **Step 6: Run lint**

Run: `npm run lint -w packages/backend`
Expected: PASS; any pre-existing `serviceSupabase` import outside allowed paths flagged (should be none since this is new).

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/db/client.ts packages/backend/src/db/client.test.ts packages/backend/eslint.config.*
git commit -m "feat(backend): add service-role Supabase client with ESLint scope restriction"
```

### Task 4: Rate limiter utility

**Files:**
- Create: `packages/backend/src/lib/rateLimiter.ts`
- Create: `packages/backend/src/lib/rateLimiter.test.ts`

- [ ] **Step 1: Write tests**

```ts
// packages/backend/src/lib/rateLimiter.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createRateLimiter } from './rateLimiter.js';

describe('rateLimiter', () => {
  beforeEach(() => { jest.useFakeTimers(); });

  it('allows up to N within the window', () => {
    const rl = createRateLimiter({ max: 3, windowMs: 60_000 });
    expect(rl.consume('k')).toBe(true);
    expect(rl.consume('k')).toBe(true);
    expect(rl.consume('k')).toBe(true);
    expect(rl.consume('k')).toBe(false);
  });

  it('resets after the window', () => {
    const rl = createRateLimiter({ max: 2, windowMs: 1000 });
    rl.consume('k'); rl.consume('k');
    expect(rl.consume('k')).toBe(false);
    jest.advanceTimersByTime(1001);
    expect(rl.consume('k')).toBe(true);
  });

  it('tracks keys independently', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.consume('a')).toBe(true);
    expect(rl.consume('b')).toBe(true);
    expect(rl.consume('a')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test -w packages/backend -- --testPathPattern=rateLimiter`
Expected: FAIL.

- [ ] **Step 3: Implement rate limiter**

```ts
// packages/backend/src/lib/rateLimiter.ts
interface Bucket { count: number; windowStart: number; }

export interface RateLimiter {
  consume(key: string): boolean;
}

export function createRateLimiter(opts: { max: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    consume(key: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (bucket === undefined || now - bucket.windowStart >= opts.windowMs) {
        buckets.set(key, { count: 1, windowStart: now });
        return true;
      }
      if (bucket.count >= opts.max) return false;
      bucket.count += 1;
      return true;
    },
  };
}
```

- [ ] **Step 4: Run, verify pass. Commit.**

```bash
git add packages/backend/src/lib/rateLimiter.ts packages/backend/src/lib/rateLimiter.test.ts
git commit -m "feat(backend): add in-memory token-bucket rate limiter"
```

### Task 5: Phone validation (libphonenumber + country allowlist + premium denylist)

**Files:**
- Create: `packages/backend/src/lib/phoneValidation.ts`
- Create: `packages/backend/src/lib/phoneValidation.test.ts`
- Modify: `packages/backend/package.json` (add `libphonenumber-js`)

- [ ] **Step 1: Install dependency**

Run: `npm install libphonenumber-js -w packages/backend`
Expected: dependency added to `packages/backend/package.json`.

- [ ] **Step 2: Write tests**

```ts
// packages/backend/src/lib/phoneValidation.test.ts
import { describe, it, expect } from '@jest/globals';
import { validatePhone } from './phoneValidation.js';

describe('validatePhone', () => {
  it('accepts a valid US mobile', () => {
    expect(validatePhone('+14155550199')).toEqual({ ok: true, e164: '+14155550199' });
  });
  it('accepts a valid UK mobile', () => {
    expect(validatePhone('+447911123456')).toEqual({ ok: true, e164: '+447911123456' });
  });
  it('rejects unsupported country', () => {
    expect(validatePhone('+33123456789')).toEqual({ ok: false, error: 'country_not_supported' });
  });
  it('rejects premium NANP 900', () => {
    expect(validatePhone('+19005551234')).toEqual({ ok: false, error: 'premium_number' });
  });
  it('rejects premium UK 09', () => {
    expect(validatePhone('+4409001234567')).toMatchObject({ ok: false });
  });
  it('rejects malformed', () => {
    expect(validatePhone('not-a-number')).toEqual({ ok: false, error: 'invalid_format' });
  });
});
```

- [ ] **Step 3: Run, verify fail. Implement.**

```ts
// packages/backend/src/lib/phoneValidation.ts
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const ALLOWED_COUNTRIES = new Set(['US', 'CA', 'GB']);

const PREMIUM_PATTERNS: RegExp[] = [
  /^\+1[2-9]\d{2}9\d{6}$/,  // NANP ambiguous — conservative: reject any NPA starting with 9 exactly (900, 976, etc.)
  /^\+1900\d{7}$/,
  /^\+1976\d{7}$/,
  /^\+44(?:9|87|871|872|873|90)\d+$/, // UK premium: 09xx, 087x, 09xx
];

export type PhoneValidation =
  | { ok: true; e164: string }
  | { ok: false; error: 'invalid_format' | 'country_not_supported' | 'premium_number' };

export function validatePhone(raw: string): PhoneValidation {
  const parsed = parsePhoneNumberFromString(raw);
  if (parsed === undefined || !parsed.isValid()) return { ok: false, error: 'invalid_format' };
  if (parsed.country === undefined || !ALLOWED_COUNTRIES.has(parsed.country)) {
    return { ok: false, error: 'country_not_supported' };
  }
  const e164 = parsed.number;
  if (PREMIUM_PATTERNS.some((re) => re.test(e164))) return { ok: false, error: 'premium_number' };
  return { ok: true, e164 };
}
```

- [ ] **Step 4: Run, verify pass. Commit.**

```bash
git add packages/backend/src/lib/phoneValidation.ts packages/backend/src/lib/phoneValidation.test.ts packages/backend/package.json packages/backend/package-lock.json
git commit -m "feat(backend): add E.164 + country-allowlist + premium-denylist phone validator"
```

### Task 6: Audit log helper

**Files:**
- Create: `packages/backend/src/lib/auditLog.ts`
- Create: `packages/backend/src/lib/auditLog.test.ts`

- [ ] **Step 1: Write tests**

```ts
// packages/backend/src/lib/auditLog.test.ts
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
    })),
  })),
}));

import { auditLog } from './auditLog.js';
import { serviceSupabase } from '../db/client.js';

describe('auditLog', () => {
  it('writes a row with the given fields', async () => {
    await auditLog({
      event: 'phone_verified',
      userId: '11111111-1111-1111-1111-111111111111',
      phone: '+14155550199',
      ip: '1.2.3.4',
      userAgent: 'test',
    });
    const client = (serviceSupabase as jest.Mock).mock.results[0]?.value;
    const from = client.from as jest.Mock;
    const insertArg = (from.mock.results[0]?.value.insert as jest.Mock).mock.calls[0][0];
    expect(insertArg).toMatchObject({
      event: 'phone_verified',
      user_id: '11111111-1111-1111-1111-111111111111',
      phone: '+14155550199',
      ip_truncated: '1.2.3.0',
    });
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/lib/auditLog.ts
import { serviceSupabase } from '../db/client.js';

export type AuditEvent =
  | 'phone_verified' | 'phone_send_otp' | 'phone_check' | 'otp_verify_failed' | 'otp_lockout'
  | 'onboarding_completed' | 'oauth_duplicate_rejected' | 'google_linked' | 'google_unlinked'
  | 'lookup_email' | 'lookup_rate_limited';

interface AuditEntry {
  event: AuditEvent;
  userId?: string;
  email?: string;
  phone?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

function truncateIp(ip?: string): string | undefined {
  if (ip === undefined) return undefined;
  if (ip.includes(':')) return ip.replace(/(:[^:]*){5}$/, ':::::');  // naive IPv6 /48
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  const client = serviceSupabase();
  await client.from('auth_audit_log').insert({
    event: entry.event,
    user_id: entry.userId ?? null,
    email: entry.email ?? null,
    phone: entry.phone ?? null,
    ip_truncated: truncateIp(entry.ip) ?? null,
    user_agent: entry.userAgent ?? null,
    metadata: entry.metadata ?? null,
  });
}
```

- [ ] **Step 3: Run tests, verify pass. Commit.**

```bash
git add packages/backend/src/lib/auditLog.ts packages/backend/src/lib/auditLog.test.ts
git commit -m "feat(backend): add audit log helper with IP truncation"
```

### Task 7: Trust-proxy startup assertion

**Files:**
- Create: `packages/backend/src/lib/trustProxyAssertion.ts`
- Create: `packages/backend/src/lib/trustProxyAssertion.test.ts`

- [ ] **Step 1: Install proxy-addr if missing**

Run: `npm ls proxy-addr -w packages/backend`
If not present: `npm install proxy-addr -w packages/backend` (Express depends on it transitively, may already be resolvable).

- [ ] **Step 2: Write test**

```ts
// packages/backend/src/lib/trustProxyAssertion.test.ts
import { describe, it, expect } from '@jest/globals';
import express from 'express';
import { assertTrustProxy } from './trustProxyAssertion.js';

describe('assertTrustProxy', () => {
  it('passes when trust proxy = 1 resolves first XFF hop', () => {
    const app = express();
    app.set('trust proxy', 1);
    expect(() => assertTrustProxy(app, { xff: '1.2.3.4, 5.6.7.8', expectedIp: '1.2.3.4' })).not.toThrow();
  });
  it('throws when configuration is wrong', () => {
    const app = express();
    app.set('trust proxy', 0);
    expect(() => assertTrustProxy(app, { xff: '1.2.3.4, 5.6.7.8', expectedIp: '1.2.3.4' })).toThrow();
  });
});
```

- [ ] **Step 3: Implement**

```ts
// packages/backend/src/lib/trustProxyAssertion.ts
import type { Express } from 'express';
import proxyaddr from 'proxy-addr';

interface AssertionInput { xff: string; expectedIp: string; remoteAddr?: string; }

export function assertTrustProxy(app: Express, input: AssertionInput): void {
  const req = {
    connection: { remoteAddress: input.remoteAddr ?? '127.0.0.1' },
    headers: { 'x-forwarded-for': input.xff },
  };
  const trustFn = app.get('trust proxy fn') as (addr: string, i: number) => boolean;
  const actual = proxyaddr(req as never, trustFn);
  if (actual !== input.expectedIp) {
    throw new Error(`Trust-proxy misconfigured: expected ${input.expectedIp}, got ${actual}`);
  }
}
```

- [ ] **Step 4: Run, verify pass. Commit.**

```bash
git add packages/backend/src/lib/trustProxyAssertion.ts packages/backend/src/lib/trustProxyAssertion.test.ts
git commit -m "feat(backend): add trust-proxy startup assertion"
```

---

## Phase 4: Backend gate middlewares

### Task 8: `requireGateComplete`, `requirePhoneUnverified`, `requireOnboardingIncomplete`

**Files:**
- Create: `packages/backend/src/middleware/gates.ts`
- Create: `packages/backend/src/middleware/gates.test.ts`

- [ ] **Step 1: Write tests**

```ts
// packages/backend/src/middleware/gates.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { requireGateComplete, requirePhoneUnverified, requireOnboardingIncomplete } from './gates.js';

type MockSupabase = {
  from: jest.Mock;
};

function buildReqRes(supabase: MockSupabase, userId = 'u1') {
  const req = {} as never;
  const res = { locals: { supabase, userId }, status: jest.fn().mockReturnThis(), json: jest.fn() } as never;
  const next = jest.fn();
  return { req, res, next };
}

function mockSupabaseReturning(row: unknown) {
  const single = jest.fn().mockResolvedValue({ data: row, error: null });
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));
  return { from: jest.fn(() => ({ select })) };
}

describe('requireGateComplete', () => {
  it('calls next when both flags true', async () => {
    const supabase = mockSupabaseReturning({ onboarding_completed_at: 'x', grandfathered_at: null, phone_confirmed_at: 'x' });
    const { req, res, next } = buildReqRes(supabase);
    await requireGateComplete(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
  it('403 when phone not verified', async () => {
    const supabase = mockSupabaseReturning({ onboarding_completed_at: 'x', grandfathered_at: null, phone_confirmed_at: null });
    const { req, res, next } = buildReqRes(supabase);
    await requireGateComplete(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/middleware/gates.ts
import type { NextFunction, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

interface GateRow {
  onboarding_completed_at: string | null;
  grandfathered_at: string | null;
  phone_confirmed_at: string | null;
}

async function loadGateFlags(
  supabase: SupabaseClient,
  userId: string
): Promise<{ phoneVerified: boolean; onboardingCompleted: boolean } | null> {
  const { data: userRow, error: uErr } = await supabase
    .from('users')
    .select('onboarding_completed_at, grandfathered_at')
    .eq('id', userId)
    .single();
  if (uErr !== null || userRow === null) return null;
  const { data: authRow } = await supabase.auth.getUser();
  const phoneConfirmedAt = authRow?.user?.phone_confirmed_at ?? null;
  const phoneVerified = phoneConfirmedAt !== null || userRow.grandfathered_at !== null;
  const onboardingCompleted = userRow.onboarding_completed_at !== null;
  return { phoneVerified, onboardingCompleted };
}

function send403(res: Response, error: string): void {
  res.status(403).json({ error });
}

export async function requireGateComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
  const supabase = res.locals.supabase as SupabaseClient;
  const userId = res.locals.userId as string;
  const flags = await loadGateFlags(supabase, userId);
  if (flags === null) { send403(res, 'gate_lookup_failed'); return; }
  if (!flags.phoneVerified) { send403(res, 'phone_verification_required'); return; }
  if (!flags.onboardingCompleted) { send403(res, 'onboarding_required'); return; }
  next();
}

export async function requirePhoneUnverified(req: Request, res: Response, next: NextFunction): Promise<void> {
  const supabase = res.locals.supabase as SupabaseClient;
  const userId = res.locals.userId as string;
  const flags = await loadGateFlags(supabase, userId);
  if (flags === null) { send403(res, 'gate_lookup_failed'); return; }
  if (flags.phoneVerified) { send403(res, 'phone_already_verified'); return; }
  next();
}

export async function requireOnboardingIncomplete(req: Request, res: Response, next: NextFunction): Promise<void> {
  const supabase = res.locals.supabase as SupabaseClient;
  const userId = res.locals.userId as string;
  const flags = await loadGateFlags(supabase, userId);
  if (flags === null) { send403(res, 'gate_lookup_failed'); return; }
  if (flags.onboardingCompleted) { send403(res, 'onboarding_already_completed'); return; }
  next();
}
```

- [ ] **Step 3: Run, verify pass. Commit.**

```bash
git add packages/backend/src/middleware/gates.ts packages/backend/src/middleware/gates.test.ts
git commit -m "feat(backend): add requireGateComplete/requirePhoneUnverified/requireOnboardingIncomplete middlewares"
```

### Task 9: Gate coverage walker

**Files:**
- Create: `packages/backend/src/middleware/gateWalker.ts`
- Create: `packages/backend/src/middleware/gateWalker.test.ts`

- [ ] **Step 1: Write tests**

```ts
// packages/backend/src/middleware/gateWalker.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import { assertGateCoverage } from './gateWalker.js';

const requireAuth = jest.fn();
const requireGateComplete = jest.fn();
const requirePhoneUnverified = jest.fn();

describe('assertGateCoverage', () => {
  it('passes when mutating app route has requireAuth then requireGateComplete', () => {
    const app = express();
    app.post('/widget', requireAuth, requireGateComplete, (_req, res) => res.end());
    expect(() => assertGateCoverage(app, { requireAuth, gates: [requireGateComplete, requirePhoneUnverified] }))
      .not.toThrow();
  });
  it('throws when gate middleware is missing', () => {
    const app = express();
    app.post('/widget', requireAuth, (_req, res) => res.end());
    expect(() => assertGateCoverage(app, { requireAuth, gates: [requireGateComplete] })).toThrow(/widget/);
  });
  it('throws when middleware order is wrong', () => {
    const app = express();
    app.post('/widget', requireGateComplete, requireAuth, (_req, res) => res.end());
    expect(() => assertGateCoverage(app, { requireAuth, gates: [requireGateComplete] })).toThrow(/order/);
  });
  it('allowlists /auth/public/lookup-email (no auth, no gate)', () => {
    const app = express();
    app.post('/auth/public/lookup-email', (_req, res) => res.end());
    expect(() => assertGateCoverage(app, {
      requireAuth, gates: [requireGateComplete],
      publicUnauthed: ['/auth/public/lookup-email'],
    })).not.toThrow();
  });
  it('requires requireAuth on /auth/public/handle-oauth-duplicate', () => {
    const app = express();
    app.post('/auth/public/handle-oauth-duplicate', (_req, res) => res.end());
    expect(() => assertGateCoverage(app, {
      requireAuth, gates: [requireGateComplete],
      publicAuthed: ['/auth/public/handle-oauth-duplicate'],
    })).toThrow(/requireAuth/);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/middleware/gateWalker.ts
import type { Express, RequestHandler } from 'express';

interface Options {
  requireAuth: RequestHandler;
  gates: RequestHandler[];
  publicUnauthed?: string[];   // exempt from both requireAuth and gate
  publicAuthed?: string[];     // exempt from gate only
  webhookPrefix?: string;      // default '/webhooks'
}

const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

interface Route { method: string; path: string; chain: RequestHandler[]; }

function walkRouter(stack: unknown[], basePath: string, parentMiddleware: RequestHandler[]): Route[] {
  const out: Route[] = [];
  for (const layerUnknown of stack) {
    const layer = layerUnknown as { route?: { path: string; stack: { method: string; handle: RequestHandler }[] };
                                     name?: string; handle?: unknown; regexp?: RegExp };
    if (layer.route !== undefined) {
      const routePath = basePath + layer.route.path;
      const methods = layer.route.stack;
      for (const m of methods) {
        if (!MUTATING.has(m.method)) continue;
        const leafMiddleware = layer.route.stack.filter((s) => typeof s.handle === 'function').map((s) => s.handle);
        out.push({ method: m.method, path: routePath, chain: [...parentMiddleware, ...leafMiddleware] });
      }
    } else if (layer.name === 'router' && typeof layer.handle === 'object' && layer.handle !== null) {
      const subStack = (layer.handle as { stack: unknown[] }).stack;
      const mountBase = extractMount(layer.regexp);
      const layerMiddleware = collectRouterLevelMiddleware(subStack);
      out.push(...walkRouter(subStack, basePath + mountBase, [...parentMiddleware, ...layerMiddleware]));
    }
  }
  return out;
}

function extractMount(regexp: RegExp | undefined): string {
  if (regexp === undefined) return '';
  const src = regexp.source;
  // Express regexp like: ^\/auth\/?(?=\/|$)  — extract '/auth'
  const m = src.match(/^\^\\?\/?(.*?)\\\/\?/);
  return m?.[1] !== undefined ? '/' + m[1].replace(/\\\//g, '/') : '';
}

function collectRouterLevelMiddleware(stack: unknown[]): RequestHandler[] {
  const mws: RequestHandler[] = [];
  for (const layerUnknown of stack) {
    const layer = layerUnknown as { route?: unknown; name?: string; handle?: RequestHandler };
    if (layer.route === undefined && layer.name !== 'router' && typeof layer.handle === 'function') {
      mws.push(layer.handle);
    } else {
      break;  // router-level middleware is registered before routes in Express convention
    }
  }
  return mws;
}

export function assertGateCoverage(app: Express, opts: Options): void {
  const webhookPrefix = opts.webhookPrefix ?? '/webhooks';
  const publicUnauthed = new Set(opts.publicUnauthed ?? []);
  const publicAuthed = new Set(opts.publicAuthed ?? []);
  const stack = ((app as unknown) as { _router: { stack: unknown[] } })._router.stack;
  const routes = walkRouter(stack, '', []);
  for (const r of routes) {
    if (publicUnauthed.has(r.path)) continue;
    if (r.path.startsWith(webhookPrefix)) continue;
    const authIdx = r.chain.indexOf(opts.requireAuth);
    if (authIdx === -1) throw new Error(`Route ${r.method.toUpperCase()} ${r.path} missing requireAuth`);
    if (publicAuthed.has(r.path)) continue;
    const gateIdx = r.chain.findIndex((mw, i) => i > authIdx && opts.gates.includes(mw));
    if (gateIdx === -1) throw new Error(`Route ${r.method.toUpperCase()} ${r.path} missing gate middleware (or wrong order)`);
  }
}
```

- [ ] **Step 3: Run tests. Iterate until pass (Express router stack introspection is finicky; tests will expose gaps).**

Run: `npm run test -w packages/backend -- --testPathPattern=gateWalker`

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/middleware/gateWalker.ts packages/backend/src/middleware/gateWalker.test.ts
git commit -m "feat(backend): add default-deny gate coverage walker"
```

---

## Phase 5: Backend — public auth endpoints

### Task 10: `POST /auth/public/lookup-email`

**Files:**
- Create: `packages/backend/src/routes/auth/public/lookupEmail.ts`
- Create: `packages/backend/src/routes/auth/public/lookupEmail.test.ts`

- [ ] **Step 1: Write tests**

```ts
// packages/backend/src/routes/auth/public/lookupEmail.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { lookupEmailRouter } from './lookupEmail.js';

jest.mock('../../../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({ data: ['email', 'google'], error: null }),
  })),
}));

describe('POST /auth/public/lookup-email', () => {
  it('returns providers for existing email', async () => {
    const app = express().use(express.json()).use('/auth/public', lookupEmailRouter());
    const res = await request(app).post('/auth/public/lookup-email').send({ email: 'a@b.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true, providers: ['email', 'google'] });
  });
  it('rejects malformed email with 400', async () => {
    const app = express().use(express.json()).use('/auth/public', lookupEmailRouter());
    const res = await request(app).post('/auth/public/lookup-email').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/public/lookupEmail.ts
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { serviceSupabase } from '../../../db/client.js';
import { createRateLimiter } from '../../../lib/rateLimiter.js';
import { auditLog } from '../../../lib/auditLog.js';
import { createHmac } from 'node:crypto';

const BodySchema = z.object({ email: z.string().email() });

const ipLimiter = createRateLimiter({ max: 20, windowMs: 60_000 });
const emailLimiter = createRateLimiter({ max: 5, windowMs: 60 * 60_000 });

function hashEmail(email: string): string {
  const secret = process.env.RATE_LIMIT_BUCKET_SECRET ?? '';
  return createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
}

async function handleLookupEmail(req: Request, res: Response): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_email' }); return; }
  const email = parsed.data.email;
  const ip = req.ip ?? 'unknown';
  const emailKey = hashEmail(email);
  if (!ipLimiter.consume(ip) || !emailLimiter.consume(emailKey)) {
    await auditLog({ event: 'lookup_rate_limited', email, ip, userAgent: req.get('user-agent') ?? undefined });
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  const supabase = serviceSupabase();
  const { data, error } = await supabase.rpc('list_user_providers', { p_email: email });
  if (error !== null) { res.status(500).json({ error: 'lookup_failed' }); return; }
  const providers = (data ?? []) as string[];
  await auditLog({ event: 'lookup_email', email, ip });
  res.json({ exists: providers.length > 0, providers });
}

export function lookupEmailRouter(): express.Router {
  const router = express.Router();
  router.post('/lookup-email', handleLookupEmail);
  return router;
}
```

- [ ] **Step 3: Run, verify pass. Commit.**

```bash
git add packages/backend/src/routes/auth/public/lookupEmail.ts packages/backend/src/routes/auth/public/lookupEmail.test.ts
git commit -m "feat(backend): add POST /auth/public/lookup-email"
```

### Task 11: `POST /auth/public/handle-oauth-duplicate`

**Files:**
- Create: `packages/backend/src/routes/auth/public/handleOauthDuplicate.ts`
- Create: `packages/backend/src/routes/auth/public/handleOauthDuplicate.test.ts`

- [ ] **Step 1: Write tests**

```ts
// packages/backend/src/routes/auth/public/handleOauthDuplicate.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { handleOauthDuplicateRouter } from './handleOauthDuplicate.js';

jest.mock('../../../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({ data: { duplicate: true, email: 'a@b.com' }, error: null }),
  })),
}));

describe('POST /auth/public/handle-oauth-duplicate', () => {
  it('calls reject_oauth_duplicate RPC and returns payload', async () => {
    const app = express().use(express.json());
    app.use((req, res, next) => { res.locals.userId = 'u1'; next(); });
    app.use('/auth/public', handleOauthDuplicateRouter());
    const res = await request(app).post('/auth/public/handle-oauth-duplicate');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ duplicate: true, email: 'a@b.com' });
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/public/handleOauthDuplicate.ts
import express, { type Request, type Response } from 'express';
import { serviceSupabase } from '../../../db/client.js';
import { createRateLimiter } from '../../../lib/rateLimiter.js';
import { auditLog } from '../../../lib/auditLog.js';
import { createHmac } from 'node:crypto';

const ipLimiter = createRateLimiter({ max: 20, windowMs: 60 * 60_000 });
const emailLimiter = createRateLimiter({ max: 5, windowMs: 24 * 60 * 60_000 });

function hashEmail(email: string): string {
  const secret = process.env.RATE_LIMIT_BUCKET_SECRET ?? '';
  return createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
}

async function handleOauthDuplicate(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const ip = req.ip ?? 'unknown';
  if (!ipLimiter.consume(ip)) { res.status(429).json({ error: 'rate_limited' }); return; }
  const supabase = serviceSupabase();
  const { data, error } = await supabase.rpc('reject_oauth_duplicate', { p_uid: userId });
  if (error !== null) { res.status(500).json({ error: 'duplicate_check_failed' }); return; }
  const result = data as { duplicate: boolean; email?: string };
  if (result.duplicate) {
    if (result.email !== undefined && !emailLimiter.consume(hashEmail(result.email))) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    await auditLog({ event: 'oauth_duplicate_rejected', userId, email: result.email, ip });
  }
  res.json(result);
}

export function handleOauthDuplicateRouter(): express.Router {
  const router = express.Router();
  router.post('/handle-oauth-duplicate', handleOauthDuplicate);
  return router;
}
```

- [ ] **Step 3: Run, verify pass. Commit.**

```bash
git add packages/backend/src/routes/auth/public/handleOauthDuplicate.ts packages/backend/src/routes/auth/public/handleOauthDuplicate.test.ts
git commit -m "feat(backend): add POST /auth/public/handle-oauth-duplicate"
```

---

## Phase 6: Backend — authenticated auth endpoints

### Task 12: `POST /auth/phone/check`

**Files:**
- Create: `packages/backend/src/routes/auth/phoneCheck.ts`
- Create: `packages/backend/src/routes/auth/phoneCheck.test.ts`

- [ ] **Step 1: Tests** (cover: invalid phone → 400, unsupported country → 400, available → {available:true}, taken → {available:false}, per-user rate limit, distinct-phones cap).

```ts
// packages/backend/src/routes/auth/phoneCheck.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { phoneCheckRouter } from './phoneCheck.js';

const mockSelect = jest.fn();
jest.mock('../../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({ from: jest.fn(() => ({ select: mockSelect })) })),
}));
jest.mock('../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));

describe('POST /auth/phone/check', () => {
  it('rejects invalid E.164', async () => {
    const app = express().use(express.json());
    app.use((req, res, next) => { res.locals.userId = 'u1'; next(); });
    app.use('/auth/phone', phoneCheckRouter());
    const res = await request(app).post('/auth/phone/check').send({ phone: 'not-a-phone' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_format');
  });
  it('returns available:true when no duplicate', async () => {
    mockSelect.mockImplementationOnce(() => ({
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    }));
    const app = express().use(express.json());
    app.use((req, res, next) => { res.locals.userId = 'u1'; next(); });
    app.use('/auth/phone', phoneCheckRouter());
    const res = await request(app).post('/auth/phone/check').send({ phone: '+14155550199' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/phoneCheck.ts
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { serviceSupabase } from '../../db/client.js';
import { validatePhone } from '../../lib/phoneValidation.js';
import { createRateLimiter } from '../../lib/rateLimiter.js';
import { auditLog } from '../../lib/auditLog.js';

const BodySchema = z.object({ phone: z.string() });

const userLimiter = createRateLimiter({ max: 5, windowMs: 60_000 });
const userDailyLimiter = createRateLimiter({ max: 30, windowMs: 24 * 60 * 60_000 });
const ipLimiter = createRateLimiter({ max: 60, windowMs: 60_000 });

async function handlePhoneCheck(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_body' }); return; }
  const v = validatePhone(parsed.data.phone);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  const ip = req.ip ?? 'unknown';
  if (!userLimiter.consume(userId) || !userDailyLimiter.consume(userId) || !ipLimiter.consume(ip)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  const supabase = serviceSupabase();
  const { data, error } = await supabase
    .from('auth.users')
    .select('id')
    .eq('phone', v.e164)
    .not('phone_confirmed_at', 'is', null);
  if (error !== null) { res.status(500).json({ error: 'check_failed' }); return; }
  const available = Array.isArray(data) && data.length === 0;
  await auditLog({ event: 'phone_check', userId, phone: v.e164, ip });
  res.json({ available });
}

export function phoneCheckRouter(): express.Router {
  const router = express.Router();
  router.post('/check', handlePhoneCheck);
  return router;
}
```

- [ ] **Step 3: Run, verify. Commit.**

```bash
git add packages/backend/src/routes/auth/phoneCheck.ts packages/backend/src/routes/auth/phoneCheck.test.ts
git commit -m "feat(backend): add POST /auth/phone/check"
```

### Task 13: `POST /auth/phone/send-otp`

**Files:**
- Create: `packages/backend/src/routes/auth/phoneSendOtp.ts`
- Create: `packages/backend/src/routes/auth/phoneSendOtp.test.ts`

- [ ] **Step 1: Tests** — cover: cooldown enforced and persisted to `otp_cooldowns`; `resends_24h` window increments; calls `supabase.auth.updateUser({phone})`; returns `cooldownUntil`; per-IP cap; validation.

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/phoneSendOtp.ts
import express, { type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { serviceSupabase } from '../../db/client.js';
import { validatePhone } from '../../lib/phoneValidation.js';
import { createRateLimiter } from '../../lib/rateLimiter.js';
import { auditLog } from '../../lib/auditLog.js';

const BodySchema = z.object({ phone: z.string() });
const ipLimiter = createRateLimiter({ max: 3, windowMs: 60 * 60_000 });

async function checkAndUpdateCooldown(userId: string): Promise<{ allowed: boolean; nextAllowedAt: Date }> {
  const service = serviceSupabase();
  const now = new Date();
  const { data } = await service.from('otp_cooldowns').select('next_allowed_at').eq('user_id', userId).single();
  if (data !== null && new Date(data.next_allowed_at) > now) {
    return { allowed: false, nextAllowedAt: new Date(data.next_allowed_at) };
  }
  const next = new Date(now.getTime() + 2 * 60_000);
  await service.from('otp_cooldowns').upsert({ user_id: userId, next_allowed_at: next.toISOString() });
  return { allowed: true, nextAllowedAt: next };
}

async function incrementResendWindow(userId: string, phone: string): Promise<boolean> {
  const service = serviceSupabase();
  const now = new Date();
  const { data } = await service
    .from('otp_attempts')
    .select('resends_24h, resends_window_start, distinct_phones_today, distinct_phones_window_start')
    .eq('user_id', userId)
    .eq('phone', phone)
    .maybeSingle();
  const windowStart = data?.resends_window_start !== undefined && data.resends_window_start !== null
    ? new Date(data.resends_window_start) : null;
  const inWindow = windowStart !== null && now.getTime() - windowStart.getTime() < 24 * 60 * 60_000;
  const newResends = inWindow ? (data?.resends_24h ?? 0) + 1 : 1;
  if (newResends > 10) return false;
  await service.from('otp_attempts').upsert({
    user_id: userId,
    phone,
    fails: 0,
    resends_24h: newResends,
    resends_window_start: inWindow ? windowStart?.toISOString() : now.toISOString(),
  });
  return true;
}

async function handleSendOtp(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const supabase = res.locals.supabase as SupabaseClient;
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_body' }); return; }
  const v = validatePhone(parsed.data.phone);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  const ip = req.ip ?? 'unknown';
  if (!ipLimiter.consume(ip)) { res.status(429).json({ error: 'rate_limited' }); return; }
  const cd = await checkAndUpdateCooldown(userId);
  if (!cd.allowed) {
    res.status(429).json({ error: 'cooldown', cooldownUntil: cd.nextAllowedAt.toISOString() });
    return;
  }
  if (!(await incrementResendWindow(userId, v.e164))) {
    res.status(429).json({ error: 'otp_rate_limited_24h' });
    return;
  }
  const { error: updErr } = await supabase.auth.updateUser({ phone: v.e164 });
  if (updErr !== null) { res.status(500).json({ error: 'send_failed' }); return; }
  await auditLog({ event: 'phone_send_otp', userId, phone: v.e164, ip });
  res.json({ ok: true, cooldownUntil: cd.nextAllowedAt.toISOString() });
}

export function phoneSendOtpRouter(): express.Router {
  const router = express.Router();
  router.post('/send-otp', handleSendOtp);
  return router;
}
```

- [ ] **Step 3: Run tests. Commit.**

```bash
git add packages/backend/src/routes/auth/phoneSendOtp.ts packages/backend/src/routes/auth/phoneSendOtp.test.ts
git commit -m "feat(backend): add POST /auth/phone/send-otp"
```

### Task 14: `POST /auth/phone/verify-otp`

**Files:**
- Create: `packages/backend/src/routes/auth/phoneVerifyOtp.ts`
- Create: `packages/backend/src/routes/auth/phoneVerifyOtp.test.ts`

- [ ] **Step 1: Tests** (lockout state machine: 5 fails → lock; lock expires + bad attempt → fails=1; good attempt → fails=0; sub mismatch rejected).

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/phoneVerifyOtp.ts
import express, { type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { serviceSupabase } from '../../db/client.js';
import { validatePhone } from '../../lib/phoneValidation.js';
import { auditLog } from '../../lib/auditLog.js';

const BodySchema = z.object({ phone: z.string(), token: z.string().length(6) });

async function recordFail(userId: string, phone: string): Promise<number> {
  const service = serviceSupabase();
  const { data } = await service.rpc('otp_record_fail', { p_user: userId, p_phone: phone });
  return (data as number) ?? 0;
}

async function recordSuccess(userId: string, phone: string): Promise<void> {
  const service = serviceSupabase();
  await service.from('otp_attempts')
    .update({ fails: 0, locked_until: null })
    .eq('user_id', userId).eq('phone', phone);
}

async function handleVerifyOtp(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const supabase = res.locals.supabase as SupabaseClient;
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_body' }); return; }
  const v = validatePhone(parsed.data.phone);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }

  const service = serviceSupabase();
  const { data: row } = await service.from('otp_attempts')
    .select('locked_until').eq('user_id', userId).eq('phone', v.e164).maybeSingle();
  if (row?.locked_until !== undefined && row.locked_until !== null && new Date(row.locked_until) > new Date()) {
    res.status(429).json({ error: 'otp_locked' });
    return;
  }

  const { data, error } = await supabase.auth.verifyOtp({ phone: v.e164, token: parsed.data.token, type: 'phone_change' });
  if (error !== null || data.session === null) {
    const fails = await recordFail(userId, v.e164);
    const ip = req.ip ?? 'unknown';
    await auditLog({ event: 'otp_verify_failed', userId, phone: v.e164, ip, metadata: { fails } });
    if (fails >= 5) await auditLog({ event: 'otp_lockout', userId, phone: v.e164, ip });
    res.status(400).json({ error: 'invalid_otp' });
    return;
  }

  if (data.session.user.id !== userId) {
    res.status(400).json({ error: 'sub_mismatch' });
    return;
  }

  await recordSuccess(userId, v.e164);
  await auditLog({ event: 'phone_verified', userId, phone: v.e164, ip: req.ip });
  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}

export function phoneVerifyOtpRouter(): express.Router {
  const router = express.Router();
  router.post('/verify-otp', handleVerifyOtp);
  return router;
}
```

Also add a new Postgres function to a follow-on migration (migration `20260421000005_otp_record_fail.sql`) implementing the atomic fails-update-with-case-expression:

```sql
create or replace function public.otp_record_fail(p_user uuid, p_phone text)
returns smallint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_fails smallint;
begin
  insert into public.otp_attempts (user_id, phone, fails, locked_until)
  values (p_user, p_phone, 1, null)
  on conflict (user_id, phone) do update
    set fails = case when public.otp_attempts.locked_until < now() then 1 else public.otp_attempts.fails + 1 end,
        locked_until = case
          when (case when public.otp_attempts.locked_until < now() then 1 else public.otp_attempts.fails + 1 end) >= 5
            then now() + interval '15 minutes'
          else null
        end
  returning fails into v_fails;
  return v_fails;
end;
$$;

revoke execute on function public.otp_record_fail(uuid, text) from public, anon, authenticated;
grant  execute on function public.otp_record_fail(uuid, text) to service_role;
```

- [ ] **Step 3: Apply migration, run tests, commit.**

```bash
git add supabase/migrations/20260421000005_otp_record_fail.sql \
        packages/backend/src/routes/auth/phoneVerifyOtp.ts \
        packages/backend/src/routes/auth/phoneVerifyOtp.test.ts
git commit -m "feat(backend): add POST /auth/phone/verify-otp with atomic fail counter"
```

### Task 15: `POST /auth/complete-onboarding`

**Files:**
- Create: `packages/backend/src/routes/auth/completeOnboarding.ts`
- Create: `packages/backend/src/routes/auth/completeOnboarding.test.ts`

- [ ] **Step 1: Tests** — zod validation (enum whitelist, ≥1 and ≤20 array, text ≤64), idempotency (409 on re-submit), RLS prevents cross-user write.

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/completeOnboarding.ts
import express, { type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  INDUSTRY_OPTIONS, COMPANY_SIZE_OPTIONS, ROLE_OPTIONS, REFERRAL_OPTIONS, BUILD_GOAL_OPTIONS,
} from '@openflow/shared-validation';
import { auditLog } from '../../lib/auditLog.js';

const Body = z.object({
  industry: z.enum(INDUSTRY_OPTIONS),
  company_size: z.enum(COMPANY_SIZE_OPTIONS),
  role: z.enum(ROLE_OPTIONS),
  referral_sources: z.array(z.enum(REFERRAL_OPTIONS)).min(1).max(20),
  build_goals: z.array(z.enum(BUILD_GOAL_OPTIONS)).min(1).max(20),
});

async function handle(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const supabase = res.locals.supabase as SupabaseClient;
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues }); return; }

  const { error: insErr } = await supabase.from('user_onboarding').insert({
    user_id: userId,
    industry: parsed.data.industry,
    company_size: parsed.data.company_size,
    role: parsed.data.role,
    referral_sources: parsed.data.referral_sources,
    build_goals: parsed.data.build_goals,
  });
  if (insErr !== null) {
    if (insErr.code === '23505') { res.status(409).json({ error: 'already_completed' }); return; }
    res.status(500).json({ error: 'insert_failed' }); return;
  }
  const { error: updErr } = await supabase
    .from('users').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', userId);
  if (updErr !== null) { res.status(500).json({ error: 'update_failed' }); return; }
  await auditLog({ event: 'onboarding_completed', userId, ip: req.ip });
  res.json({ ok: true });
}

export function completeOnboardingRouter(): express.Router {
  const router = express.Router();
  router.post('/complete-onboarding', handle);
  return router;
}
```

- [ ] **Step 3: Run. Commit.**

```bash
git add packages/backend/src/routes/auth/completeOnboarding.ts packages/backend/src/routes/auth/completeOnboarding.test.ts
git commit -m "feat(backend): add POST /auth/complete-onboarding"
```

### Task 16: `GET /auth/status`

**Files:**
- Create: `packages/backend/src/routes/auth/status.ts`
- Create: `packages/backend/src/routes/auth/status.test.ts`

- [ ] **Step 1: Tests** (returns correct flags; missing onboarding → false; grandfathered → both true).

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/status.ts
import express, { type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

async function handle(_req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const supabase = res.locals.supabase as SupabaseClient;
  const [{ data: userRow }, { data: authData }] = await Promise.all([
    supabase.from('users').select('onboarding_completed_at, grandfathered_at').eq('id', userId).single(),
    supabase.auth.getUser(),
  ]);
  if (userRow === null || authData.user === null) { res.status(500).json({ error: 'status_failed' }); return; }
  const phoneConfirmedAt = authData.user.phone_confirmed_at ?? null;
  const phone_verified = phoneConfirmedAt !== null || userRow.grandfathered_at !== null;
  const onboarding_completed = userRow.onboarding_completed_at !== null;
  // jti is not present in Supabase access tokens; the caller (middleware)
  // recomputes binding via sha256(access_token). We pass the raw flags.
  res.json({ phone_verified, onboarding_completed });
}

export function statusRouter(): express.Router {
  const router = express.Router();
  router.get('/status', handle);
  return router;
}
```

- [ ] **Step 3: Run, commit.**

```bash
git add packages/backend/src/routes/auth/status.ts packages/backend/src/routes/auth/status.test.ts
git commit -m "feat(backend): add GET /auth/status"
```

### Task 17: `GET /auth/identities` via `get_safe_identities` RPC

**Files:**
- Create: `packages/backend/src/routes/auth/identities.ts`
- Create: `packages/backend/src/routes/auth/identities.test.ts`

- [ ] **Step 1: Tests** (returns only provider/email/created_at; no identity_data leaks).

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/identities.ts
import express, { type Request, type Response } from 'express';
import { serviceSupabase } from '../../db/client.js';

async function handle(_req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const supabase = serviceSupabase();
  const { data, error } = await supabase.rpc('get_safe_identities', { p_user_id: userId });
  if (error !== null) { res.status(500).json({ error: 'identities_failed' }); return; }
  res.json({ identities: data ?? [] });
}

export function identitiesRouter(): express.Router {
  const router = express.Router();
  router.get('/identities', handle);
  return router;
}
```

- [ ] **Step 3: Commit.**

```bash
git add packages/backend/src/routes/auth/identities.ts packages/backend/src/routes/auth/identities.test.ts
git commit -m "feat(backend): add GET /auth/identities via SECURITY DEFINER projection"
```

### Task 18: `POST /auth/unlink-google`

**Files:**
- Create: `packages/backend/src/routes/auth/unlinkGoogle.ts`
- Create: `packages/backend/src/routes/auth/unlinkGoogle.test.ts`

- [ ] **Step 1: Tests** (refuses when Google is only identity; audits; happy path).

- [ ] **Step 2: Implement**

```ts
// packages/backend/src/routes/auth/unlinkGoogle.ts
import express, { type Request, type Response } from 'express';
import { serviceSupabase } from '../../db/client.js';
import { auditLog } from '../../lib/auditLog.js';

async function handle(req: Request, res: Response): Promise<void> {
  const userId = res.locals.userId as string;
  const service = serviceSupabase();
  const { data: user } = await service.auth.admin.getUserById(userId);
  if (user?.user === null || user === null) { res.status(500).json({ error: 'user_not_found' }); return; }
  const identities = user.user.identities ?? [];
  if (!identities.some((i) => i.provider === 'email')) {
    res.status(400).json({ error: 'cannot_unlink_only_identity' });
    return;
  }
  const google = identities.find((i) => i.provider === 'google');
  if (google === undefined) { res.status(400).json({ error: 'no_google_identity' }); return; }
  const { error } = await service.auth.admin.updateUserById(userId, {
    identities: identities.filter((i) => i.provider !== 'google'),
  } as never);
  if (error !== null) { res.status(500).json({ error: 'unlink_failed' }); return; }
  await auditLog({ event: 'google_unlinked', userId, ip: req.ip });
  res.json({ ok: true });
}

export function unlinkGoogleRouter(): express.Router {
  const router = express.Router();
  router.post('/unlink-google', handle);
  return router;
}
```

- [ ] **Step 3: Commit.**

```bash
git add packages/backend/src/routes/auth/unlinkGoogle.ts packages/backend/src/routes/auth/unlinkGoogle.test.ts
git commit -m "feat(backend): add POST /auth/unlink-google"
```

---

## Phase 7: Wire backend + startup checks

### Task 19: Assemble `authRouter` + `authPublicRouter`; mount; run walker + startup assertions

**Files:**
- Create: `packages/backend/src/routes/auth/authRouter.ts`
- Create: `packages/backend/src/routes/auth/authPublicRouter.ts`
- Modify: `packages/backend/src/server.ts`
- Create: `packages/backend/src/lib/startupChecks.ts`

- [ ] **Step 1: Create the two routers**

```ts
// packages/backend/src/routes/auth/authPublicRouter.ts
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { lookupEmailRouter } from './public/lookupEmail.js';
import { handleOauthDuplicateRouter } from './public/handleOauthDuplicate.js';

export const AUTH_PUBLIC_UNAUTHED = ['/auth/public/lookup-email'];
export const AUTH_PUBLIC_AUTHED   = ['/auth/public/handle-oauth-duplicate'];

export function buildAuthPublicRouter(): express.Router {
  const router = express.Router();
  router.use('/', lookupEmailRouter());   // POST /lookup-email (no auth)
  const authed = express.Router();
  authed.use(requireAuth);
  authed.use('/', handleOauthDuplicateRouter()); // POST /handle-oauth-duplicate
  router.use('/', authed);
  return router;
}
```

```ts
// packages/backend/src/routes/auth/authRouter.ts
import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  requireGateComplete, requirePhoneUnverified, requireOnboardingIncomplete,
} from '../../middleware/gates.js';
import { phoneCheckRouter } from './phoneCheck.js';
import { phoneSendOtpRouter } from './phoneSendOtp.js';
import { phoneVerifyOtpRouter } from './phoneVerifyOtp.js';
import { completeOnboardingRouter } from './completeOnboarding.js';
import { statusRouter } from './status.js';
import { identitiesRouter } from './identities.js';
import { unlinkGoogleRouter } from './unlinkGoogle.js';

export function buildAuthRouter(): express.Router {
  const router = express.Router();
  router.use(requireAuth);

  const phoneGate = express.Router();
  phoneGate.use(requirePhoneUnverified);
  phoneGate.use('/', phoneCheckRouter());
  phoneGate.use('/', phoneSendOtpRouter());
  phoneGate.use('/', phoneVerifyOtpRouter());
  router.use('/phone', phoneGate);

  const onboardingGate = express.Router();
  onboardingGate.use(requireOnboardingIncomplete);
  onboardingGate.use('/', completeOnboardingRouter());
  router.use('/', onboardingGate);

  router.use('/', statusRouter());  // no extra gate — allowed in any state

  const postGate = express.Router();
  postGate.use(requireGateComplete);
  postGate.use('/', identitiesRouter());
  postGate.use('/', unlinkGoogleRouter());
  router.use('/', postGate);

  return router;
}
```

- [ ] **Step 2: Apply `requireGateComplete` to every existing app-level router at mount time**

Modify `packages/backend/src/server.ts` — wrap every existing `app.use('/...', router)` call for mutating routers in `requireGateComplete`. Add imports. Example transform:

Before:
```ts
app.use('/orgs', buildOrgRouter());
```
After:
```ts
app.use('/orgs', requireAuth, requireGateComplete, buildOrgRouter());
```

Do this for: `/orgs`, `/slugs`, `/agents`, `/secrets`, `/dashboard`, `/mcp-library`, `/tenants`, `/templates`, `/tenants/:tenantId/whatsapp-templates`, `/github`, `/api/agents`, `/api/mock-execute`, messaging router, `/mcp/*`, `/simulate`, `/simulate-agent`, `/mcp/discover`, `/mcp/tools/call`, `/mcp/oauth/callback`, and the MCP handlers. Exempt: `/webhooks/*`, `/auth/public/*`, `/auth/*` (these are handled by their own routers).

Some existing routers already apply `requireAuth` internally via `router.use(requireAuth)`; verify via the walker assertions — if a router applies `requireAuth` internally, the outer `requireAuth` at mount is redundant but harmless, and the walker credits either as long as order is preserved.

- [ ] **Step 3: Add `createStartupAssertions` helper**

```ts
// packages/backend/src/lib/startupChecks.ts
import type { Express } from 'express';
import { serviceSupabase } from '../db/client.js';
import { assertTrustProxy } from './trustProxyAssertion.js';

const REQUIRED_SECRETS = ['SUPABASE_SERVICE_ROLE_KEY', 'RATE_LIMIT_BUCKET_SECRET'];
const MIN_SECRET_BYTES = 32;

export async function runStartupChecks(app: Express): Promise<void> {
  for (const key of REQUIRED_SECRETS) {
    const v = process.env[key];
    if (v === undefined || v === '') throw new Error(`${key} is required`);
    if (Buffer.from(v).length < MIN_SECRET_BYTES) throw new Error(`${key} must be >= ${MIN_SECRET_BYTES} bytes`);
  }
  assertTrustProxy(app, { xff: '1.2.3.4, 5.6.7.8', expectedIp: '1.2.3.4' });
  const service = serviceSupabase();
  const tables = ['otp_attempts', 'otp_cooldowns', 'auth_audit_log', 'user_onboarding'];
  for (const t of tables) {
    const { error } = await service.from(t).select('*').limit(0);
    if (error !== null) throw new Error(`Startup check: table public.${t} not reachable: ${error.message}`);
  }
}
```

- [ ] **Step 4: Wire walker + startup checks in `createApp`**

Modify `packages/backend/src/server.ts` near the end of `createApp()`:

```ts
import { requireAuth } from './middleware/auth.js';
import { requireGateComplete, requirePhoneUnverified, requireOnboardingIncomplete } from './middleware/gates.js';
import { assertGateCoverage } from './middleware/gateWalker.js';
import { buildAuthRouter } from './routes/auth/authRouter.js';
import { buildAuthPublicRouter, AUTH_PUBLIC_UNAUTHED, AUTH_PUBLIC_AUTHED } from './routes/auth/authPublicRouter.js';
import { runStartupChecks } from './lib/startupChecks.js';

// ... inside createApp(), after all app.use(...) registrations:
app.use('/auth/public', buildAuthPublicRouter());
app.use('/auth', buildAuthRouter());

app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? '1'));

assertGateCoverage(app, {
  requireAuth,
  gates: [requireGateComplete, requirePhoneUnverified, requireOnboardingIncomplete],
  publicUnauthed: AUTH_PUBLIC_UNAUTHED,
  publicAuthed: AUTH_PUBLIC_AUTHED,
  webhookPrefix: '/webhooks',
});
```

In `index.ts` (or the file that boots the server), await `runStartupChecks(app)` before `app.listen`.

- [ ] **Step 5: Run full backend typecheck + lint + test**

Run: `npm run check -w packages/backend && npm run test -w packages/backend`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/auth/authRouter.ts packages/backend/src/routes/auth/authPublicRouter.ts \
        packages/backend/src/server.ts packages/backend/src/index.ts \
        packages/backend/src/lib/startupChecks.ts
git commit -m "feat(backend): mount auth routers and enforce default-deny gate walker"
```

---

## Phase 8: Web infrastructure (cookies + signing)

### Task 20: `AUTH_COOKIE_OPTIONS` constant

**Files:**
- Create: `packages/web/app/lib/supabase/cookies.ts`

- [ ] **Step 1: Write constant**

```ts
// packages/web/app/lib/supabase/cookies.ts
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/lib/supabase/cookies.ts
git commit -m "feat(web): add shared AUTH_COOKIE_OPTIONS"
```

### Task 21: `tokenBinding` helper

**Files:**
- Create: `packages/web/app/lib/auth/tokenBinding.ts`

- [ ] **Step 1: Implement**

```ts
// packages/web/app/lib/auth/tokenBinding.ts
import { createHash } from 'node:crypto';

export function computeTokenBinding(accessToken: string): string {
  const digest = createHash('sha256').update(accessToken).digest();
  return digest.subarray(0, 16).toString('base64url');
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/lib/auth/tokenBinding.ts
git commit -m "feat(web): add tokenBinding helper for _auth_status cookie"
```

### Task 22: Signed `_auth_status` cookie (sign + verify + dual-secret rotation)

**Files:**
- Create: `packages/web/app/lib/auth/statusCookie.ts`
- Create: `packages/web/app/lib/auth/statusCookie.test.ts`

- [ ] **Step 1: Tests**

```ts
// packages/web/app/lib/auth/statusCookie.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { signStatusCookie, verifyStatusCookie } from './statusCookie.js';

const SECRET = 'a'.repeat(32);

beforeEach(() => { process.env.AUTH_STATUS_COOKIE_SECRET = SECRET; delete process.env.AUTH_STATUS_COOKIE_SECRET_PREVIOUS; });

describe('statusCookie', () => {
  const payload = { uid: 'u1', tokenBinding: 'tb', phone_verified: true, onboarding_completed: false };
  it('signs and verifies', () => {
    const cookie = signStatusCookie(payload);
    expect(verifyStatusCookie(cookie)).toEqual(payload);
  });
  it('rejects tampered HMAC', () => {
    const cookie = signStatusCookie(payload);
    const [body, mac] = cookie.split('.');
    const bad = body + '.' + mac.slice(0, -1) + (mac.slice(-1) === 'A' ? 'B' : 'A');
    expect(verifyStatusCookie(bad)).toBeNull();
  });
  it('rejects malformed', () => {
    expect(verifyStatusCookie('nodot')).toBeNull();
  });
  it('accepts previous secret during rotation', () => {
    const cookie = signStatusCookie(payload);
    process.env.AUTH_STATUS_COOKIE_SECRET_PREVIOUS = SECRET;
    process.env.AUTH_STATUS_COOKIE_SECRET = 'b'.repeat(32);
    expect(verifyStatusCookie(cookie)).toEqual(payload);
  });
});
```

- [ ] **Step 2: Implement (RFC 8785 JCS canonical JSON; HMAC-SHA256; base64url; timing-safe compare)**

```ts
// packages/web/app/lib/auth/statusCookie.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StatusPayload {
  uid: string;
  tokenBinding: string;
  phone_verified: boolean;
  onboarding_completed: boolean;
}

function canonicalize(obj: StatusPayload): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = (obj as unknown as Record<string, unknown>)[k];
  return JSON.stringify(sorted);
}

function b64url(buf: Buffer): string { return buf.toString('base64url'); }
function b64urlDecode(s: string): Buffer { return Buffer.from(s, 'base64url'); }

function requireSecret(name: string): Buffer {
  const v = process.env[name];
  if (v === undefined || Buffer.from(v).length < 32) throw new Error(`${name} missing or < 32 bytes`);
  return Buffer.from(v);
}

export function signStatusCookie(payload: StatusPayload): string {
  const secret = requireSecret('AUTH_STATUS_COOKIE_SECRET');
  const payloadBytes = Buffer.from(canonicalize(payload));
  const mac = createHmac('sha256', secret).update(payloadBytes).digest();
  return `${b64url(payloadBytes)}.${b64url(mac)}`;
}

function verifyWithSecret(payloadBytes: Buffer, macGiven: Buffer, secret: Buffer): boolean {
  const macExpected = createHmac('sha256', secret).update(payloadBytes).digest();
  if (macExpected.length !== macGiven.length) return false;
  return timingSafeEqual(macExpected, macGiven);
}

export function verifyStatusCookie(cookie: string): StatusPayload | null {
  const dot = cookie.indexOf('.');
  if (dot < 0 || dot === cookie.length - 1) return null;
  const payloadBytes = b64urlDecode(cookie.slice(0, dot));
  const macGiven = b64urlDecode(cookie.slice(dot + 1));
  const current = requireSecret('AUTH_STATUS_COOKIE_SECRET');
  let ok = verifyWithSecret(payloadBytes, macGiven, current);
  if (!ok && process.env.AUTH_STATUS_COOKIE_SECRET_PREVIOUS !== undefined) {
    const prev = Buffer.from(process.env.AUTH_STATUS_COOKIE_SECRET_PREVIOUS);
    if (Buffer.from(prev).length >= 32) ok = verifyWithSecret(payloadBytes, macGiven, prev);
  }
  if (!ok) return null;
  try {
    const parsed = JSON.parse(payloadBytes.toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.uid !== 'string' || typeof p.tokenBinding !== 'string'
        || typeof p.phone_verified !== 'boolean' || typeof p.onboarding_completed !== 'boolean') return null;
    return p as unknown as StatusPayload;
  } catch { return null; }
}
```

- [ ] **Step 3: Run, pass, commit.**

```bash
git add packages/web/app/lib/auth/statusCookie.ts packages/web/app/lib/auth/statusCookie.test.ts
git commit -m "feat(web): add _auth_status signed cookie helpers"
```

---

## Phase 9: Next.js middleware update

### Task 23: Gate + status-cache in middleware

**Files:**
- Modify: `packages/web/app/lib/supabase/middleware.ts`
- Create: `packages/web/app/lib/auth/fetchStatus.ts`

- [ ] **Step 1: Extract status fetcher**

```ts
// packages/web/app/lib/auth/fetchStatus.ts
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface AuthFlags {
  phone_verified: boolean;
  onboarding_completed: boolean;
}

export async function fetchAuthStatus(accessToken: string): Promise<AuthFlags | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = await res.json() as unknown;
    if (typeof body !== 'object' || body === null) return null;
    const b = body as Record<string, unknown>;
    if (typeof b.phone_verified !== 'boolean' || typeof b.onboarding_completed !== 'boolean') return null;
    return { phone_verified: b.phone_verified, onboarding_completed: b.onboarding_completed };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Rewrite `middleware.ts` decision tree**

Replace the current `updateSession` with gate logic. Add exempt route lists and JSON-vs-HTML response branches. Use `signStatusCookie` / `verifyStatusCookie` for cache.

```ts
// packages/web/app/lib/supabase/middleware.ts (full rewrite)
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_OPTIONS } from './cookies.js';
import { computeTokenBinding } from '@/app/lib/auth/tokenBinding';
import { signStatusCookie, verifyStatusCookie } from '@/app/lib/auth/statusCookie';
import { fetchAuthStatus, type AuthFlags } from '@/app/lib/auth/fetchStatus';

const PUBLIC_ROUTES       = ['/auth/callback', '/reset-password', '/error'];
const GUEST_ONLY_ROUTES   = ['/login', '/signup', '/forgot-password'];
const GATED_EXEMPT_ROUTES = ['/verify-phone', '/onboarding', '/api/auth', '/logout', '/account'];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function startsWithAny(path: string, routes: string[]): boolean {
  return routes.some((r) => path === r || path.startsWith(r + '/'));
}

function wantsJson(req: NextRequest): boolean {
  return req.headers.get('accept')?.includes('application/json') === true
      || req.nextUrl.pathname.startsWith('/api/');
}

function buildJsonResponse(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status });
}

function redirectTo(req: NextRequest, path: string, res: NextResponse): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = path;
  const next = NextResponse.redirect(url);
  res.cookies.getAll().forEach((c) => next.cookies.set(c.name, c.value));
  return next;
}

async function loadFlags(accessToken: string, uid: string, res: NextResponse): Promise<AuthFlags | null> {
  const binding = computeTokenBinding(accessToken);
  const cached = res.cookies.get('_auth_status')?.value;
  if (cached !== undefined) {
    const parsed = verifyStatusCookie(cached);
    if (parsed !== null && parsed.uid === uid && parsed.tokenBinding === binding) {
      return { phone_verified: parsed.phone_verified, onboarding_completed: parsed.onboarding_completed };
    }
  }
  const flags = await fetchAuthStatus(accessToken);
  if (flags !== null) {
    const cookie = signStatusCookie({ uid, tokenBinding: binding, ...flags });
    res.cookies.set('_auth_status', cookie, AUTH_COOKIE_OPTIONS);
  }
  return flags;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { pathname } = request.nextUrl;
  if (startsWithAny(pathname, PUBLIC_ROUTES)) return response;

  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) {
    if (startsWithAny(pathname, GUEST_ONLY_ROUTES)) return response;
    return redirectTo(request, '/login', response);
  }
  if (startsWithAny(pathname, GUEST_ONLY_ROUTES)) return redirectTo(request, '/', response);

  const { data: { session } } = await supabase.auth.getSession();
  if (session === null) return redirectTo(request, '/login', response);

  const flags = await loadFlags(session.access_token, user.id, response);
  if (flags === null) {
    if (wantsJson(request)) return buildJsonResponse(403, { error: 'auth_status_unavailable' });
    return redirectTo(request, '/error', response);
  }

  if (!flags.phone_verified) {
    if (pathname === '/verify-phone' || pathname.startsWith('/api/auth/phone')) return response;
    if (wantsJson(request)) return buildJsonResponse(403, { error: 'phone_verification_required' });
    return redirectTo(request, '/verify-phone', response);
  }
  if (!flags.onboarding_completed) {
    if (pathname === '/onboarding' || pathname === '/api/auth/complete-onboarding') return response;
    if (wantsJson(request)) return buildJsonResponse(403, { error: 'onboarding_required' });
    return redirectTo(request, '/onboarding', response);
  }
  if (startsWithAny(pathname, ['/verify-phone', '/onboarding'])) return redirectTo(request, '/', response);
  return response;
}
```

- [ ] **Step 3: Typecheck + run dev server + click through login → /**

Run: `npm run typecheck -w packages/web`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/supabase/middleware.ts packages/web/app/lib/auth/fetchStatus.ts
git commit -m "feat(web): gate middleware with status cache via signed cookie"
```

---

## Phase 10: Next.js route handlers

### Task 24: `/api/auth/public/lookup-email`

**Files:**
- Create: `packages/web/app/api/auth/public/lookup-email/route.ts`

- [ ] **Step 1: Implement**

```ts
// packages/web/app/api/auth/public/lookup-email/route.ts
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  const xff = req.headers.get('x-vercel-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const upstream = await fetch(`${BACKEND_URL}/auth/public/lookup-email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': xff,     // single trusted IP
    },
    body,
  });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/api/auth/public/lookup-email/route.ts
git commit -m "feat(web): add /api/auth/public/lookup-email proxy"
```

### Task 25: `/api/auth/public/handle-oauth-duplicate`

- [ ] **Step 1: Implement (authenticated proxy via `proxyToBackend`)**

```ts
// packages/web/app/api/auth/public/handle-oauth-duplicate/route.ts
import { proxyToBackend } from '@/app/lib/backendProxy';

export async function POST(): Promise<Response> {
  return proxyToBackend('POST', '/auth/public/handle-oauth-duplicate');
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/api/auth/public/handle-oauth-duplicate/route.ts
git commit -m "feat(web): add /api/auth/public/handle-oauth-duplicate proxy"
```

### Task 26: `/api/auth/phone/check`, `/api/auth/phone/send-otp`

**Files:**
- Create: `packages/web/app/api/auth/phone/check/route.ts`
- Create: `packages/web/app/api/auth/phone/send-otp/route.ts`

- [ ] **Step 1: Implement both as thin proxies**

```ts
// check/route.ts
import { proxyToBackend } from '@/app/lib/backendProxy';
export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  return proxyToBackend('POST', '/auth/phone/check', body);
}
```

```ts
// send-otp/route.ts
import { proxyToBackend } from '@/app/lib/backendProxy';
export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  return proxyToBackend('POST', '/auth/phone/send-otp', body);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/api/auth/phone/check/route.ts packages/web/app/api/auth/phone/send-otp/route.ts
git commit -m "feat(web): add /api/auth/phone/check + /send-otp proxies"
```

### Task 27: `/api/auth/phone/verify-otp` (with session cookie rewrite + cache invalidation)

**Files:**
- Create: `packages/web/app/api/auth/phone/verify-otp/route.ts`

- [ ] **Step 1: Implement with setSession + cookie invalidation**

```ts
// packages/web/app/api/auth/phone/verify-otp/route.ts
import { createClient } from '@/app/lib/supabase/server';
import { fetchFromBackend } from '@/app/lib/backendProxy';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_OPTIONS } from '@/app/lib/supabase/cookies';

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  try {
    const result = await fetchFromBackend('POST', '/auth/phone/verify-otp', body) as {
      access_token: string; refresh_token: string;
    };
    const supabase = await createClient();
    const { data: before } = await supabase.auth.getUser();
    const { error: setErr } = await supabase.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    });
    if (setErr !== null) return NextResponse.json({ error: 'session_set_failed' }, { status: 500 });
    const { data: after } = await supabase.auth.getUser();
    if (before.user !== null && after.user !== null && before.user.id !== after.user.id) {
      return NextResponse.json({ error: 'sub_mismatch' }, { status: 400 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set('_auth_status', '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'verify_failed';
    const m = /\((\d{3})\):/.exec(msg);
    const status = m !== null ? Number(m[1]) : 500;
    return NextResponse.json({ error: 'verify_failed' }, { status });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/api/auth/phone/verify-otp/route.ts
git commit -m "feat(web): add /api/auth/phone/verify-otp proxy with session cookie rewrite"
```

### Task 28: `/api/auth/complete-onboarding`, `/api/auth/status`, `/api/auth/identities`, `/api/auth/unlink-google`

**Files:**
- Create `packages/web/app/api/auth/complete-onboarding/route.ts`
- Create `packages/web/app/api/auth/status/route.ts`
- Create `packages/web/app/api/auth/identities/route.ts`
- Create `packages/web/app/api/auth/unlink-google/route.ts`

- [ ] **Step 1: Implement** — all four are thin proxies; `complete-onboarding` and `unlink-google` also set `_auth_status=; Max-Age=0` on their responses (like verify-otp above).

```ts
// complete-onboarding/route.ts (example with cache invalidation)
import { fetchFromBackend } from '@/app/lib/backendProxy';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_OPTIONS } from '@/app/lib/supabase/cookies';

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  try {
    await fetchFromBackend('POST', '/auth/complete-onboarding', body);
    const res = NextResponse.json({ ok: true });
    res.cookies.set('_auth_status', '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

```ts
// status/route.ts — straight proxy (used by /error page polling)
import { proxyToBackend } from '@/app/lib/backendProxy';
export async function GET(): Promise<Response> { return proxyToBackend('GET', '/auth/status'); }
```

```ts
// identities/route.ts
import { proxyToBackend } from '@/app/lib/backendProxy';
export async function GET(): Promise<Response> { return proxyToBackend('GET', '/auth/identities'); }
```

```ts
// unlink-google/route.ts
import { fetchFromBackend } from '@/app/lib/backendProxy';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE_OPTIONS } from '@/app/lib/supabase/cookies';

export async function POST(): Promise<Response> {
  try {
    await fetchFromBackend('POST', '/auth/unlink-google');
    const res = NextResponse.json({ ok: true });
    res.cookies.set('_auth_status', '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/api/auth/complete-onboarding/route.ts packages/web/app/api/auth/status/route.ts \
        packages/web/app/api/auth/identities/route.ts packages/web/app/api/auth/unlink-google/route.ts
git commit -m "feat(web): add remaining auth API route handlers"
```

---

## Phase 11: Web screens

### Task 29: Install shadcn `input-otp`

- [ ] **Step 1: Run installer**

Run: `cd packages/web && npx shadcn@latest add input-otp`
Expected: creates `packages/web/components/ui/input-otp.tsx` + installs `input-otp` package.

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/ui/input-otp.tsx packages/web/package.json packages/web/package-lock.json
git commit -m "chore(web): add shadcn input-otp component"
```

### Task 30: `OptionPill` component

**Files:**
- Create: `packages/web/components/ui/option-pill.tsx`

- [ ] **Step 1: Implement**

```tsx
// packages/web/components/ui/option-pill.tsx
'use client';
import { cn } from '@/lib/utils';

interface OptionPillProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

export function OptionPill({ label, checked, onToggle }: OptionPillProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        'inline-flex h-8 items-center rounded-md border px-3 text-xs transition-colors',
        checked
          ? 'border-primary bg-primary/10 text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/30'
      )}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/components/ui/option-pill.tsx
git commit -m "feat(web): add OptionPill component"
```

### Task 31: `/verify-phone` page

**Files:**
- Create: `packages/web/app/verify-phone/page.tsx`
- Create: `packages/web/app/verify-phone/PhoneStep.tsx`
- Create: `packages/web/app/verify-phone/OtpStep.tsx`

- [ ] **Step 1: Implement page shell**

```tsx
// page.tsx
'use client';
import { AuthCard } from '@/app/components/auth/AuthCard';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PhoneStep } from './PhoneStep';
import { OtpStep } from './OtpStep';

export default function VerifyPhonePage() {
  const t = useTranslations('auth.verifyPhone');
  const [phone, setPhone] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  return (
    <AuthCard title={t('title')} description={t('description')}>
      {step === 'phone' ? (
        <PhoneStep
          phone={phone}
          onPhoneChange={setPhone}
          onAdvance={(cu) => { setCooldownUntil(cu); setStep('otp'); }}
        />
      ) : (
        <OtpStep phone={phone} cooldownUntil={cooldownUntil} onEdit={() => setStep('phone')} onNewCooldown={setCooldownUntil} />
      )}
    </AuthCard>
  );
}
```

- [ ] **Step 2: `PhoneStep.tsx` (calls /check then /send-otp)**

```tsx
// PhoneStep.tsx
'use client';
import { PhoneInput } from '@/components/ui/phone-input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface Props { phone: string; onPhoneChange: (v: string) => void; onAdvance: (cooldownUntil: string) => void; }

export function PhoneStep({ phone, onPhoneChange, onAdvance }: Props) {
  const t = useTranslations('auth.verifyPhone');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    setLoading(true); setError('');
    const check = await fetch('/api/auth/phone/check', { method: 'POST', body: JSON.stringify({ phone }), headers: { 'content-type': 'application/json' } });
    if (!check.ok) { setError(t('errors.sendFailed')); setLoading(false); return; }
    const { available } = await check.json();
    if (!available) { setError(t('errors.phoneTaken')); setLoading(false); return; }
    const send = await fetch('/api/auth/phone/send-otp', { method: 'POST', body: JSON.stringify({ phone }), headers: { 'content-type': 'application/json' } });
    if (!send.ok) { setError(t('errors.sendFailed')); setLoading(false); return; }
    const { cooldownUntil } = await send.json();
    onAdvance(cooldownUntil);
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs text-muted-foreground">{t('phoneLabel')}</label>
      <PhoneInput value={phone as never} onChange={(v) => onPhoneChange(v ?? '')} defaultCountry="US" />
      {error !== '' && <p className="text-destructive text-xs">{error}</p>}
      <Button onClick={handleContinue} disabled={phone.length === 0 || loading}>{t('continue')}</Button>
    </div>
  );
}
```

- [ ] **Step 3: `OtpStep.tsx` (OTP input + resend countdown + submit)**

```tsx
// OtpStep.tsx
'use client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Props { phone: string; cooldownUntil: string | null; onEdit: () => void; onNewCooldown: (cu: string) => void; }

export function OtpStep({ phone, cooldownUntil, onEdit, onNewCooldown }: Props) {
  const t = useTranslations('auth.verifyPhone');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (cooldownUntil === null) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  async function submit(c: string) {
    const res = await fetch('/api/auth/phone/verify-otp', {
      method: 'POST', body: JSON.stringify({ phone, token: c }), headers: { 'content-type': 'application/json' },
    });
    if (res.ok) { router.refresh(); return; }
    setError(res.status === 429 ? t('errors.tooManyAttempts') : t('errors.invalidOtp'));
    setCode('');
  }

  async function resend() {
    const r = await fetch('/api/auth/phone/send-otp', { method: 'POST', body: JSON.stringify({ phone }), headers: { 'content-type': 'application/json' } });
    if (r.ok) { const { cooldownUntil: cu } = await r.json(); onNewCooldown(cu); setError(''); }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t('otpDescription')} {phone}</p>
      <InputOTP maxLength={6} value={code} onChange={(v) => { setCode(v); if (v.length === 6) submit(v); }}>
        <InputOTPGroup>
          {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}
        </InputOTPGroup>
      </InputOTP>
      {error !== '' && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex justify-between text-xs">
        <button className="underline" onClick={onEdit}>{t('editPhone')}</button>
        {remaining > 0
          ? <span className="text-muted-foreground">{t('resendIn', { time: `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}` })}</span>
          : <button className="underline" onClick={resend}>{t('resend')}</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/verify-phone/page.tsx packages/web/app/verify-phone/PhoneStep.tsx packages/web/app/verify-phone/OtpStep.tsx
git commit -m "feat(web): add /verify-phone screen"
```

### Task 32: `/onboarding` page

**Files:**
- Create: `packages/web/app/onboarding/page.tsx`
- Create: `packages/web/app/onboarding/OnboardingForm.tsx`
- Create: `packages/web/app/onboarding/useOnboardingState.ts`

- [ ] **Step 1: Implement form with single-select + multi-select pill sections**

(Compose with `OptionPill`. Each section reads canonical enum options from `@openflow/shared-validation`. Submit calls `/api/auth/complete-onboarding` and `router.refresh()` on success.)

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/onboarding/*.tsx packages/web/app/onboarding/useOnboardingState.ts
git commit -m "feat(web): add /onboarding screen"
```

### Task 33: `/account` page

**Files:**
- Create: `packages/web/app/account/page.tsx`
- Create: `packages/web/app/account/ProfileSection.tsx`
- Create: `packages/web/app/account/SecuritySection.tsx`
- Create: `packages/web/app/account/ConnectionsSection.tsx`

- [ ] **Step 1: Implement sections**

Profile (email read-only, full_name editable via existing users update endpoint — reuse existing if any, else add minimal PATCH handler in backend org-agnostic users route — verify what exists via `rg 'full_name' packages/backend`). Security (phone read-only, "Change password" link to existing flow). Connections (calls `/api/auth/identities`; shows email + Google rows; Connect Google = `supabase.auth.linkIdentity({provider:'google'})`; Disconnect = `/api/auth/unlink-google` with AlertDialog confirm).

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/account/*.tsx
git commit -m "feat(web): add /account page with identity connections"
```

### Task 34: `/error` page (polling)

**Files:**
- Create: `packages/web/app/error/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function ErrorPage() {
  const t = useTranslations('error');
  const router = useRouter();
  const [delay, setDelay] = useState(5000);
  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch('/api/auth/status', { cache: 'no-store' });
        if (r.ok) router.push('/');
      } catch { /* ignore */ }
      setDelay((d) => Math.min(30_000, d + 5000));
    };
    const id = setTimeout(tick, delay);
    return () => clearTimeout(id);
  }, [delay, router]);
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="text-xs text-muted-foreground">{t('retrying')}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>{t('retry')}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/error/page.tsx
git commit -m "feat(web): add /error page with status polling"
```

---

## Phase 12: Signup / login / OAuth callback updates

### Task 35: Update `/signup` to pre-check email

**Files:**
- Modify: `packages/web/app/signup/page.tsx`

- [ ] **Step 1: Before `supabase.auth.signUp`, call `/api/auth/public/lookup-email`**

Modify `useSignupSubmit.handleSubmit`:

```ts
// add near the top of handleSubmit, before signUp call
const lookup = await fetch('/api/auth/public/lookup-email', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email }),
});
if (lookup.ok) {
  const { exists, providers } = await lookup.json() as { exists: boolean; providers: string[] };
  if (exists) {
    setError(providers.includes('google') ? t('signup.errors.emailExistsGoogle') : t('signup.errors.emailExists'));
    setLoading(false);
    return;
  }
}

// after signUp success:
router.push('/verify-phone');
```

Delete the `if (data.session === null)` "check your email" branch — it's unreachable now.

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/signup/page.tsx
git commit -m "feat(web): pre-check email on signup, redirect to /verify-phone on success"
```

### Task 36: Update `/login` for pre-check + `oauth_duplicate` banner

**Files:**
- Modify: `packages/web/app/login/page.tsx`

- [ ] **Step 1: Add banner on `?error=oauth_duplicate` query param + call lookup-email before signIn**

Modify `LoginForm` to read `useSearchParams` for `error` and `email`, render a banner with a `/forgot-password?email=…` link. In `useLoginSubmit.handleSubmit`, call `/api/auth/public/lookup-email` first; if `exists && providers = ['google']`, show `t('login.errors.emailUsesGoogle')` and return.

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/login/page.tsx
git commit -m "feat(web): pre-check email on login, show oauth_duplicate banner"
```

### Task 37: Update `/auth/callback` for duplicate detection

**Files:**
- Modify: `packages/web/app/auth/callback/route.ts`

- [ ] **Step 1: After `exchangeCodeForSession`, call `/auth/public/handle-oauth-duplicate` on backend**

```ts
// packages/web/app/auth/callback/route.ts
import { createClient } from '@/app/lib/supabase/server';
import { fetchFromBackend } from '@/app/lib/backendProxy';
import { AUTH_COOKIE_OPTIONS } from '@/app/lib/supabase/cookies';
import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const PROJECT_REF = new URL(SUPABASE_URL).host.split('.')[0];
const SUPABASE_COOKIE_NAMES = [
  `sb-${PROJECT_REF}-auth-token`,
  `sb-${PROJECT_REF}-auth-token.0`,
  `sb-${PROJECT_REF}-auth-token.1`,
];

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code !== null) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error === null) {
      const isRecovery = next === '/reset-password' || searchParams.get('type') === 'recovery';
      if (isRecovery) return NextResponse.redirect(`${origin}/reset-password`);

      try {
        const dup = await fetchFromBackend('POST', '/auth/public/handle-oauth-duplicate') as { duplicate: boolean; email?: string };
        if (dup.duplicate && dup.email !== undefined) {
          try { await supabase.auth.signOut(); } catch { /* ignore */ }
          const url = new URL(`${origin}/login?error=oauth_duplicate&email=${encodeURIComponent(dup.email)}`);
          const res = NextResponse.redirect(url);
          SUPABASE_COOKIE_NAMES.forEach((name) => {
            res.cookies.set(name, '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
          });
          res.cookies.set('_auth_status', '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
          return res;
        }
      } catch { /* treat as non-duplicate */ }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login`);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/auth/callback/route.ts
git commit -m "feat(web): handle OAuth duplicate in /auth/callback with cookie clearing"
```

---

## Phase 13: i18n

### Task 38: Add translation keys

**Files:**
- Modify: `packages/web/messages/en.json`
- Modify: any other `packages/web/messages/*.json` present

- [ ] **Step 1: List existing locales**

Run: `ls packages/web/messages/`

- [ ] **Step 2: For each locale file, add all keys listed in the spec's "Internationalization" section**

Keys:
- `auth.signup.errors.emailExistsGoogle`, `auth.signup.errors.emailExists`
- `auth.login.errors.emailUsesGoogle`, `auth.login.errors.oauthDuplicate`, `auth.login.errors.oauthDuplicateForgotPassword`
- `auth.verifyPhone.title`, `.description`, `.phoneLabel`, `.continue`, `.otpTitle`, `.otpDescription`, `.resend`, `.resendIn`, `.editPhone`
- `auth.verifyPhone.errors.invalidOtp`, `.tooManyAttempts`, `.phoneTaken`, `.sendFailed`, `.otpLocked`
- `onboarding.title`, `.description`, `.submit`
- `onboarding.sections.{industry,companySize,role,referral,buildGoals}`
- `onboarding.options.industry.*` (one per enum value in `INDUSTRY_OPTIONS`)
- `onboarding.options.companySize.*`, `.role.*`, `.referral.*`, `.buildGoals.*`
- `account.title`, `account.profile.title`, `.security.title`, `.security.phone`, `.security.changePassword`
- `account.connections.title`, `.email.label`, `.google.label`, `.google.connect`, `.google.disconnect`, `.google.connected`
- `account.connections.google.confirmDisconnect.{title,body,confirm,cancel}`
- `account.connections.errors.cannotUnlinkOnlyIdentity`, `.linkFailed`, `.unlinkFailed`, `.googleAlreadyLinked`
- `error.title`, `.description`, `.retrying`, `.retry`

Provide English values matching the spec's UX copy (e.g., `"An account already exists for {email}. Sign in with your password, then connect Google from Account settings."` for `auth.login.errors.oauthDuplicate`).

- [ ] **Step 3: Run typecheck to catch missing keys**

Run: `npm run typecheck -w packages/web`
Expected: passes (next-intl type-checks key references if strict mode is configured).

- [ ] **Step 4: Commit**

```bash
git add packages/web/messages/
git commit -m "feat(web): add i18n keys for auth/verify-phone/onboarding/account/error"
```

---

## Phase 14: Deploy checklist + final verification

### Task 39: Add deploy-checklist doc

**Files:**
- Create: `docs/superpowers/plans/2026-04-21-auth-phone-onboarding-deploy-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Auth / Phone / Onboarding Deploy Checklist

1. **FK cascade audit** (blocks deploy if anything isn't cascade/set-null):

   ```sql
   select
     tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name, rc.delete_rule
   from information_schema.referential_constraints rc
   join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
   join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
   join information_schema.constraint_column_usage ccu on ccu.constraint_name = rc.unique_constraint_name
   where ccu.table_schema = 'auth' and ccu.table_name = 'users' and ccu.column_name = 'id'
     and rc.delete_rule not in ('CASCADE', 'SET NULL');
   ```

   Expected: zero rows. Any non-cascade FK must be fixed before deploy.

2. **Env vars set in prod:**
   - Backend: `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_BUCKET_SECRET` (≥32 bytes), `TRUST_PROXY_HOPS`.
   - Web: `AUTH_STATUS_COOKIE_SECRET` (≥32 bytes). Optional: `AUTH_STATUS_COOKIE_SECRET_PREVIOUS`.

3. **Supabase dashboard:**
   - Auth → Providers → Phone: enabled with configured SMS provider.
   - `pg_cron` extension enabled.

4. **Migrations applied, then backend deployed before web.** (Backend's `requireGateComplete` would 403 existing users if web hasn't yet onboarded them, but grandfathering handles this.)

5. **Post-deploy audit:** run this once the web tier is up:

   ```sql
   select count(*) from public.users
   where grandfathered_at is not null and created_at > '<deploy-timestamp>';
   ```

   Expected: `0`. If anything shows up, investigate — a code path is creating already-grandfathered users.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-04-21-auth-phone-onboarding-deploy-checklist.md
git commit -m "docs: add deploy checklist for auth-phone-onboarding"
```

### Task 40: Full-repo `npm run check`

- [ ] **Step 1: Run**

Run: `npm run check`
Expected: PASS (format + lint + typecheck, all packages).

- [ ] **Step 2: Run all backend tests**

Run: `npm run test -w packages/backend`
Expected: PASS.

- [ ] **Step 3: Smoke test the happy path in dev**

- Start backend: `npm run dev -w packages/backend`.
- Start web: `npm run dev -w packages/web`.
- Sign up fresh → redirected to `/verify-phone`.
- Enter a valid US/UK number → OTP sent (Supabase dashboard shows OTP; use test number if configured).
- Enter OTP → redirected to `/onboarding`.
- Fill form → redirected to `/`.
- Sign out, sign in again → goes straight to `/`.
- Visit `/account` → Connections section lists the email identity; "Connect Google" triggers OAuth.

- [ ] **Step 4: Final commit if any lint/format fixups are needed**

```bash
git add .
git commit -m "chore: post-check fixups"
```

---

## Done

All 40 tasks complete. See `docs/superpowers/specs/2026-04-21-auth-phone-onboarding-design.md` for the full design; this plan is the executable form.
