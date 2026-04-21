# Auth: Phone verification, onboarding, and account linking

**Date:** 2026-04-21
**Status:** Approved for implementation (revised after three security reviews)
**Scope:** Sign-in/sign-up flow changes, phone OTP verification, onboarding survey, gated navigation, and explicit-opt-in account linking initiated from an authenticated settings page.

## Context

Supabase auth is already set up in `packages/web` (email/password + Google OAuth). Email confirmations are disabled in prod. We're adding:

1. A post-signup **phone verification** step the user cannot bypass.
2. A post-verify **onboarding survey** the user cannot bypass.
3. Detection of pre-existing accounts by email on both signup and login paths, with friendly error messages.
4. **Explicit, authenticated linking** — OAuth against an email that already has an email/password account is a hard error; the orphan Google row is deleted server-side. The only path to having both identities is to sign in with password, go to `/account`, click "Connect Google".
5. Strict, defense-in-depth gating — Next.js middleware AND a default-deny backend middleware (with a startup walker) both enforce phone/onboarding completion.

## Architecture constraints (non-negotiable)

- **No anon-readable Supabase access from the client or from Next.js server-side.** All sensitive reads/writes live in `packages/backend` (Express) and are exposed via HTTP endpoints. Next.js route handlers proxy via `packages/web/app/lib/backendProxy.ts`, forwarding the user's Supabase JWT as Bearer.
- The only `supabase.auth.*` calls allowed on the browser remain the pure auth-session ones already in use (`signInWithPassword`, `signInWithOAuth`, `signUp`, `linkIdentity`, `unlinkIdentity`, session cookie management).
- Backend creates a JWT-scoped Supabase client by default so RLS enforces per-user access. `serviceSupabase()` uses `SUPABASE_SERVICE_ROLE_KEY` and is restricted by ESLint `no-restricted-imports` to `packages/backend/src/routes/auth/` and `packages/backend/src/middleware/`.
- Strict failure mode: on backend status-endpoint failure, gated navigation is blocked (503 HTML / 403 JSON for API), never fails-open.

## Data model

Five migrations.

### `20260421000000_onboarding_completed.sql`

```sql
alter table public.users
  add column onboarding_completed_at timestamptz;
```

### `20260421000001_user_onboarding.sql`

```sql
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

### `20260421000002_backfill_existing_users.sql`

```sql
alter table public.users
  add column grandfathered_at timestamptz;

update public.users u
  set grandfathered_at = now(),
      onboarding_completed_at = now()
  where u.created_at < '2026-04-21T00:00:00Z'
    and not exists (select 1 from public.user_onboarding o where o.user_id = u.id);
```

### `20260421000003_auth_helpers.sql`

```sql
-- Provider lookup (called by service-role from /auth/public/lookup-email)
create or replace function public.list_user_providers(p_email text)
returns text[]
language plpgsql
security definer set search_path = ''
as $$
declare
  v_providers text[];
begin
  -- Supabase gotrue lowercases email on save; compare to lowercased param so
  -- the index on auth.users.email is usable.
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

-- Unique phone across confirmed + unconfirmed. Paired with pg_cron sweep
-- (see migration 0004) to prevent indefinite squatting.
create unique index if not exists auth_users_phone_any_unique
  on auth.users (phone)
  where phone is not null;

-- Accelerate the sweep predicate.
create index if not exists auth_users_phone_change_sent_idx
  on auth.users (phone_change_sent_at)
  where phone_confirmed_at is null and phone is not null;

-- OTP accounting (persists across restart, works across instances)
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

### `20260421000004_audit_log_and_retention.sql`

```sql
create table public.auth_audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
    -- phone_verified | phone_send_otp | phone_check | otp_verify_failed | otp_lockout
    -- | onboarding_completed | oauth_duplicate_rejected | google_linked | google_unlinked
    -- | lookup_email | lookup_rate_limited
  email text,            -- raw email, deny-all RLS
  phone text,            -- raw phone, deny-all RLS
  ip inet,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.auth_audit_log enable row level security;
revoke all on public.auth_audit_log from anon, authenticated;
grant  select, insert on public.auth_audit_log to service_role;

create index auth_audit_log_user_id_idx on public.auth_audit_log (user_id, created_at desc);
create index auth_audit_log_event_idx   on public.auth_audit_log (event, created_at desc);

-- GDPR: on user delete, null out identifiers in any surviving audit rows.
create or replace function public.scrub_audit_log_on_user_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.auth_audit_log
     set email = null, phone = null
   where user_id = old.id;
  return old;
end;
$$;

create trigger scrub_audit_log_after_user_delete
  after delete on auth.users
  for each row execute function public.scrub_audit_log_on_user_delete();

-- Abandoned-phone sweep. Runs every minute via pg_cron. Clears any
-- auth.users.phone reservation older than 30 minutes that was never confirmed.
select cron.schedule(
  'sweep_abandoned_phones',
  '* * * * *',
  $$update auth.users set phone = null
    where phone is not null
      and phone_confirmed_at is null
      and phone_change_sent_at < now() - interval '30 minutes'$$
);

-- Audit log retention. Non-security events 90 days, security events 1 year.
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

Phone itself is **not** mirrored to `public.users`. Source of truth stays `auth.users.phone` / `auth.users.phone_confirmed_at`.

**Deploy checklist (runs once before web deploy):** query `information_schema.referential_constraints` to confirm every FK to `auth.users(id)` uses `on delete cascade` or `on delete set null`. Block deploy if anything else. This ensures `admin.deleteUser()` in `handle-oauth-duplicate` doesn't leave orphans or break on FK violation.

## Backend: `packages/backend/src/routes/auth/`

Two routers:
- `authPublicRouter` mounted at `/auth/public` — no auth, no gate.
- `authRouter` mounted at `/auth` — JWT required; per-route custom gate middleware (see below).

`serviceSupabase()` lives in `packages/backend/src/db/client.ts`.

### Gate middleware family

Three middlewares, spelled out explicitly:

- **`requireGateComplete`** — caller's phone verified AND onboarding completed. Default for all mutating routes outside `/auth/*`, `/webhooks/*`, `/auth/public/*`.
- **`requirePhoneUnverified`** — caller's phone not verified. Applied to `/auth/phone/check`, `/auth/phone/send-otp`, `/auth/phone/verify-otp`.
- **`requireOnboardingIncomplete`** — caller's onboarding not completed (phone may or may not be verified). Applied to `/auth/complete-onboarding`.

### Default-deny startup walker

At server startup, a helper walks the Express router tree recursively (including nested routers like `agentRouter`, `buildOrgRouter`, etc. mounted via `app.use(...)`). For every `POST/PATCH/PUT/DELETE` endpoint:

1. If the path is under `/auth/public/*` or `/webhooks/*` → OK (exempt).
2. Else if the path is under `/auth/*` → must attach `requireAuth` AND at least one of `{requireGateComplete, requirePhoneUnverified, requireOnboardingIncomplete}` in its middleware chain. Otherwise **throw at startup**.
3. Else (normal app routes) → must attach `requireAuth` AND `requireGateComplete`. Otherwise **throw at startup**.

The walker considers middleware applied at the router level (`router.use(...)`) as well as per-route (`router.post(path, mw, handler)`). Throws during `createApp()`, so a misconfigured route fails deploy in CI / container boot, not at first request.

Test: `routes/auth/gateCoverage.test.ts` boots the app with a deliberately-misconfigured route (e.g., a new `POST /test/widget` with no middleware) and asserts startup throws with a message identifying the path.

### Endpoints

**Public (no auth, no gate):**

| Endpoint | Purpose |
|---|---|
| `POST /auth/public/lookup-email` | Service-role → `public.list_user_providers`. Returns `{ exists, providers }`. Rate-limited per trusted IP (20/min) + per normalized email (5/hour, bucket key HMACed with per-deployment salt). On limit: **429** `{error:'rate_limited'}` + audit `lookup_rate_limited`. Accepted enumeration tradeoff per product. |
| `POST /auth/public/handle-oauth-duplicate` | Called at OAuth callback with the fresh Google user's JWT as Bearer (the "public" classification is because it lives outside the normal gate walker; it still requires a valid JWT via `requireAuth` attached manually). Rate-limited per trusted IP (20/hour) + per target-email-HMAC (5/day). Logic: pull email from `auth.users.email` for `auth.uid()`, begin transaction with `select ... for update` on the surviving email-identity row, if duplicate exists call `auth.admin.deleteUser(auth.uid())`, commit, audit `oauth_duplicate_rejected`. Returns `{duplicate:true|false, email?}`. |

**Authenticated (JWT required, per-route gate):**

| Endpoint | Gate middleware | Purpose |
|---|---|---|
| `POST /auth/phone/check` | `requirePhoneUnverified` | Service-role → `{ available }` for E.164 phone. Per-user 5/min, 30/day. Per-user distinct-phones cap 3/day (via `otp_attempts.distinct_phones_today`). Per-IP secondary 60/min. Audit-logged. Server-side E.164 validation via `libphonenumber`; denylist NANP 900 / UK 09 premium ranges. |
| `POST /auth/phone/send-otp` | `requirePhoneUnverified` | Server-side E.164 validation + premium denylist. Transactional: `select for update` on uniqueness, then `supabase.auth.updateUser({phone})`. Cooldown via `public.otp_cooldowns` (2min/user), per-IP cap 3/hr, per-account distinct-phones cap 3/day. Returns `{ok:true, cooldownUntil}`. |
| `POST /auth/phone/verify-otp` | `requirePhoneUnverified` | Consults `public.otp_attempts`. If `locked_until > now()` → 429 `otp_locked`. Calls `verifyOtp({phone, token, type:'phone_change'})`. On success: assert returned token's `sub === auth.uid()`, set `fails=0`, return `{access_token, refresh_token}`. On failure: `fails += 1`; if `fails >= 5` → `locked_until = now() + 15min`, audit `otp_lockout`. When `locked_until` first passes, a lazy read-repair sets `fails = 0` so the user isn't immediately re-locked by one wrong attempt after unlock. |
| `POST /auth/complete-onboarding` | `requireOnboardingIncomplete` | Zod: enum whitelists + `min(1).max(20)` arrays + max string 64. Inserts `public.user_onboarding`, stamps `public.users.onboarding_completed_at`. 409 if already completed. |
| `GET /auth/status` | none (available to any authenticated user, any gate state) | Returns `{phone_verified, onboarding_completed, jti}`. `jti` is copied from the caller's JWT — used by Next.js to bind the cached cookie. |
| `GET /auth/identities` | `requireGateComplete` | Returns caller's identities filtered to `{provider, email, created_at}` ONLY. Never `identity_data` (contains Google refresh tokens). |
| `POST /auth/unlink-google` | `requireGateComplete` | Guards: caller must have BOTH email identity and Google identity. Calls `auth.admin.updateUserById(uid, {identities: [...]})` to remove the Google identity. Audit `google_unlinked`. Refuses if Google is only identity. |

**OTP state machine (explicit):**
- `resends_24h` increments on every send-otp success.
- `resends_window_start` set to `now()` on first send in a window. If `now() - resends_window_start > 24h` when send-otp runs, reset both to a fresh window.
- If `resends_24h > 10` → 429 `otp_rate_limited_24h`.
- `fails` increments on each bad verify-otp. Set to 0 on successful verify AND via lazy read-repair when `locked_until` has passed.
- `distinct_phones_today` / `distinct_phones_window_start` same rolling-24h pattern, incremented when the phone differs from the most-recent phone the user sent OTP to.

### IP trust

Next.js proxy strips client-supplied `x-forwarded-for` and sets a single trusted IP from the platform header (`x-real-ip` / `x-vercel-forwarded-for`). Backend runs `app.set('trust proxy', N)` where `N` matches prod topology. **Startup assertion:** on boot, the backend constructs a synthetic `Request` with `x-forwarded-for: 1.2.3.4, 5.6.7.8` and confirms `req.ip` returns the expected value for the configured hop count; throws if wrong.

### Options taxonomy

New module `packages/shared-validation/src/onboarding.ts` exports canonical enum constants used by both backend zod validator and frontend pill UI.

```ts
export const INDUSTRY_OPTIONS = ['it_software','legal','health','finance',
  'education','ecommerce','media','manufacturing','real_estate','other'] as const;
export const COMPANY_SIZE_OPTIONS = ['1','2-10','10-50','50-100','100-500',
  '500-1000','1000-5000','5000+'] as const;
export const ROLE_OPTIONS = ['developer','founder','c_level','product',
  'marketing','sales','legal','operations','other'] as const;
export const REFERRAL_OPTIONS = ['linkedin','youtube','friend_referral',
  'reddit','discord','tldr','google_search','twitter_x','blog_post','other'] as const;
export const BUILD_GOAL_OPTIONS = ['ai_agents','ai_agency','workflows',
  'browser_automation','chatbot','not_sure'] as const;
```

### Startup table existence check

On boot, backend runs `select 1 from public.otp_attempts, public.otp_cooldowns, public.auth_audit_log, public.user_onboarding limit 1` (in a way that tolerates empty tables but fails on missing table). Fails fast in a pre-migrated environment.

## Next.js: `packages/web/app/api/auth/`

Thin route handlers forwarding to backend via `proxyToBackend` / `fetchFromBackend`. One route per backend endpoint. `verify-otp`'s handler additionally:
1. Unpacks `{access_token, refresh_token}` on success.
2. Asserts decoded `access_token.sub === current session auth.uid()` (defense in depth).
3. Calls `supabase.auth.setSession(...)` server-side to rewrite the Supabase session cookie.

### Cookie scoping (explicit)

Single constant `AUTH_COOKIE_OPTIONS` in `packages/web/app/lib/supabase/cookies.ts`:

```ts
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
```

Imported by middleware, `server.ts`, `client.ts`, and the `_auth_status` cookie helpers. Integration test asserts `Set-Cookie` flags on `/api/auth/verify-otp` response.

### `_auth_status` cookie (Next.js owns it)

Next.js middleware mints and verifies this cookie using its own secret. Backend never sets it.

**Env (`packages/web` only):** `AUTH_STATUS_COOKIE_SECRET` — ≥32 bytes, enforced at Next.js startup. Optional `AUTH_STATUS_COOKIE_SECRET_PREVIOUS` for dual-secret rotation.

**Payload:** `{uid, jti, phone_verified, onboarding_completed}`. No `exp` — the cookie's lifetime is the Supabase session's lifetime, enforced by `jti` binding. `jti` is the access token's `jti` claim. When the access token refreshes, `jti` changes, cached cookie no longer matches, middleware refetches.

**Canonical form:** RFC 8785 JCS (deterministic JSON). Cookie value: `base64url(payload_bytes) + '.' + base64url(hmac_sha256(payload_bytes))`. Verification order: split on `.`, constant-time HMAC compare via `crypto.timingSafeEqual` (using current secret, then previous if configured), then parse JSON, then check `jti` matches session JWT.

**Invalidation:**
- Session rotation: `jti` mismatch → refetch.
- Mutation: any route handler that changes phone/onboarding state appends `Set-Cookie: _auth_status=; Max-Age=0; Path=/` to its response.

No time-based TTL. Cache is as fresh as the underlying session.

### Secret rotation

`AUTH_STATUS_COOKIE_SECRET_PREVIOUS` supports zero-downtime rotation. During rotation: middleware signs with CURRENT, verifies with CURRENT-or-PREVIOUS. After full session-TTL window (Supabase refresh token lifetime, default 30 days — use 30+ days), drop PREVIOUS.

## Middleware: `packages/web/app/lib/supabase/middleware.ts`

```
Route categories:
- PUBLIC_ROUTES:      /auth/callback, /reset-password, /error
- GUEST_ONLY_ROUTES:  /login, /signup, /forgot-password
- GATED_EXEMPT:       /verify-phone, /onboarding, /api/auth/*, /logout
- everything else:    fully gated
```

**Decision tree (authenticated only):**

1. If path is `PUBLIC_ROUTE` → pass.
2. Get session (`supabase.auth.getSession()`) to obtain JWT + `jti`. Read `_auth_status` cookie.
3. If cookie present + HMAC valid + `jti` matches session `jti` → use cached flags.
4. Else → fetch `GET {BACKEND}/auth/status` with the access token (3s timeout, `cache: 'no-store'`). On success, mint a new `_auth_status` cookie on the response using Next.js's secret.
5. On fetch error or non-2xx:
   - Request accepts JSON or path starts with `/api/` → **403 JSON**.
   - Else → 503 redirect to `/error`.
6. `phone_verified === false`:
   - `/verify-phone` or `/api/auth/phone/*` → pass.
   - JSON/API → **403** `{error:'phone_verification_required'}`.
   - Else → redirect to `/verify-phone`.
7. `onboarding_completed === false`:
   - `/onboarding` or `/api/auth/complete-onboarding` → pass.
   - JSON/API → **403** `{error:'onboarding_required'}`.
   - Else → redirect to `/onboarding`.
8. Else → pass (or redirect guest-only paths to `/`).

Per-request memo prevents fetching status twice.

## Screens

### `packages/web/app/verify-phone/page.tsx`

Client component, `AuthCard` wrapper. Two internal states.

**State 1 — enter phone**
- `<PhoneInput>` from `components/ui/phone-input.tsx`, required, international format.
- Continue → `POST /api/auth/phone/check`. If unavailable → inline error. Else → `POST /api/auth/phone/send-otp` → State 2.

**State 2 — enter OTP**
- 6-digit boxed input via shadcn `input-otp` (`npx shadcn@latest add input-otp`).
- Phone display + "Wrong number? [Edit]" link → State 1.
- Auto-submits on 6th digit → `POST /api/auth/phone/verify-otp`. Success → `router.refresh()` → middleware sends to `/onboarding`.
- Failure → "Invalid code". Cooldown not reset. After 5 failures → "Too many attempts. Request a new code." + disabled input.
- Resend: disabled until 2min cooldown elapses. Live countdown.

### `packages/web/app/onboarding/page.tsx`

Client component, wider `AuthCard`-shaped shell. One form with 5 sections (industry, company size, role, referral sources, build goals). Sticky submit button disabled until valid. Submit → `POST /api/auth/complete-onboarding` → `router.refresh()` → redirect to `/`.

New `components/ui/option-pill.tsx` (compact, h-8, rounded-md, checked state).

### `packages/web/app/account/page.tsx` (new)

Sections:
1. **Profile** — email (read-only), full name (editable).
2. **Security** — phone (read-only from `auth.users.phone`), "Change password" link to existing flow.
3. **Connected accounts** — uses `GET /api/auth/identities`:
   - Email/password row (always present).
   - Google row: if linked, shows Google email + "Disconnect" button (`POST /api/auth/unlink-google` with confirm dialog; refuses if only identity). If absent, "Connect Google" button → browser `supabase.auth.linkIdentity({provider:'google'})` (auth-flow exception).

Linking edge cases to surface in UI (not silently fail):
- Google account already linked to *another* user → Supabase returns `AuthApiError "Identity is already linked to another user"` → show "That Google account is already connected to a different account here."

### `packages/web/app/error/page.tsx`

Minimal. Polls `/api/auth/status` with exponential backoff (5s → 30s). On success → redirect to `/`.

## Sign-in / sign-up / OAuth callback changes

### `app/signup/page.tsx`

Before `supabase.auth.signUp`:
1. `POST /api/auth/public/lookup-email`.
2. If `exists`:
   - providers includes `google` → "An account already exists with this email via Google. [Sign in with Google]." Block.
   - providers is `['email']` → "An account already exists with this email. [Sign in]." Block.
3. Else → `signUp` → `router.push('/verify-phone')`.

Remove the dead `data.session === null` "check your email" branch.

### `app/login/page.tsx`

Before `signInWithPassword`:
1. `POST /api/auth/public/lookup-email`.
2. If `exists` and providers is `['google']` → "This account uses Google. [Sign in with Google]." Block.
3. Else → `signInWithPassword`.

Page also reads `?error=oauth_duplicate&email=<e>` and renders a banner: "An account already exists for `<e>`. Sign in with your password, then connect Google from Account settings. [Forgot password?](/forgot-password?email=…)"

**Users who signed up via an OAuth provider in the past but never set a password** can still recover via `/forgot-password`: Supabase's `resetPasswordForEmail` works regardless of password-hash presence — it emails a reset link that sets the password. Documented in the spec + tested.

### `app/auth/callback/route.ts`

After `exchangeCodeForSession` succeeds (browser now has Google user's session):
1. `POST /auth/public/handle-oauth-duplicate` on backend with the new access token as Bearer.
2. If `duplicate === true`:
   - Backend has already deleted the fresh Google user (transaction with row lock) and written the audit entry.
   - Try `supabase.auth.signOut()` against the SSR client. Regardless of outcome, build the redirect response with explicit `Set-Cookie: <each-supabase-cookie>=; Max-Age=0; Path=/` headers for all known Supabase cookie names (robust against `signOut()` failure).
   - Redirect to `/login?error=oauth_duplicate&email=<urlencoded>`.
3. Else → redirect to `next` (or `/`). Middleware routes to `/verify-phone` / `/onboarding` as needed.

## Internationalization

New keys in `packages/web/messages/en.json` (sync across locales present in `messages/`):

- `auth.signup.errors.emailExistsGoogle`, `.emailExists`
- `auth.login.errors.emailUsesGoogle`, `.oauthDuplicate` (`{email}`), `.oauthDuplicateForgotPassword`
- `auth.verifyPhone.title`, `.description`, `.phoneLabel`, `.continue`, `.otpTitle`, `.otpDescription`, `.resend`, `.resendIn` (`{time}`), `.editPhone`
- `auth.verifyPhone.errors.invalidOtp`, `.tooManyAttempts`, `.phoneTaken`, `.sendFailed`, `.otpLocked`
- `onboarding.title`, `.description`, `.submit`, `.sections.*`, `.options.*`
- `account.title`, `.profile.*`, `.security.*`, `.connections.title`
- `account.connections.email.label`, `.google.label`, `.google.connect`, `.google.disconnect`, `.google.connected` (`{email}`)
- `account.connections.google.confirmDisconnect.{title,body,confirm,cancel}`
- `account.connections.errors.cannotUnlinkOnlyIdentity`, `.linkFailed`, `.unlinkFailed`, `.googleAlreadyLinked`
- `error.title`, `.description`, `.retrying`, `.retry`

## Environment variables

**Backend (`packages/backend`):**
- `SUPABASE_SERVICE_ROLE_KEY` — required.

**Web (`packages/web`):**
- `AUTH_STATUS_COOKIE_SECRET` — required, ≥32 bytes.
- `AUTH_STATUS_COOKIE_SECRET_PREVIOUS` — optional, dual-secret rotation.

**Supabase (local `supabase/config.toml`):** enable `[auth.sms]` for local parity with prod. Enable `pg_cron` extension.

## Tests

- `routes/auth/public/lookupEmail.test.ts` — exists/false; all provider combos; 20/min IP + 5/hour email limits → 429; audit entries.
- `routes/auth/public/handleOauthDuplicate.test.ts` — deletes fresh Google row when duplicate; no-op when other row is also Google; no-op when no duplicate; transaction holds row lock; per-IP 20/hour + per-email 5/day rate limits → 429; audit on delete.
- `routes/auth/phoneCheck.test.ts` — available/unavailable; rejects verified callers via middleware; 5/min, 30/day, 60/min/IP; premium numbers rejected.
- `routes/auth/phoneSendOtp.test.ts` — cooldown persists across restart; uniqueness re-check in same transaction; per-IP 3/hr; distinct-phones-today cap 3/day; E.164 validation.
- `routes/auth/phoneVerifyOtp.test.ts` — success returns matching-`sub` tokens; bad code increments `fails`; 5th failure locks 15min; lazy read-repair resets `fails` when `locked_until` passes; audit `otp_lockout`.
- `routes/auth/completeOnboarding.test.ts` — zod rejects empty/oversized arrays, strings >64, unknown enums; 409 on re-submit; user B can't write for user A.
- `routes/auth/status.test.ts` — flags + `jti` returned; missing `user_onboarding` → false; grandfathered → both true.
- `routes/auth/identities.test.ts` — returns only `{provider, email, created_at}`; no `identity_data` leakage.
- `routes/auth/unlinkGoogle.test.ts` — happy path; refuses when only identity; audit entry.
- `routes/auth/gateCoverage.test.ts` — walker throws startup on missing middleware (test both `/auth/*` without `requirePhoneUnverified`/`requireOnboardingIncomplete`/`requireGateComplete` AND app-level routes without `requireGateComplete`); recurses into nested routers; credits router-level middleware.
- `routes/auth/gateMiddlewares.test.ts` — each of the three middlewares rejects the expected states with 403.
- `lib/signedCookies.test.ts` (packages/web) — JCS canonical form; HMAC-SHA256; base64url encoding; constant-time compare; bad HMAC rejected; tampered field rejected; `jti` mismatch rejected; dual-secret rotation; startup refuses <32-byte secret.
- `routes/auth/trustProxy.test.ts` — synthetic `x-forwarded-for` yields correct `req.ip` for configured hop count.
- `db/functions/list_user_providers.test.sql` — correct providers; REVOKE in place; anon/authenticated denied.
- `db/triggers/scrub_audit_log.test.sql` — deleting auth.users row nulls email/phone in audit log.
- `app/auth/callback.test.ts` — dangling-session failure path: `signOut` failure still clears Supabase cookies via explicit `Set-Cookie` headers.

## Rollout

1. Apply migrations 0–4 (including `pg_cron` jobs).
2. Run FK audit query; confirm all FKs to `auth.users(id)` are cascade or set null; block deploy if not.
3. Deploy backend: new endpoints, `SUPABASE_SERVICE_ROLE_KEY`, global `requireGateComplete` with walker, startup assertions.
4. Deploy web: new screens, middleware updates, route handlers, `AUTH_STATUS_COOKIE_SECRET`.
5. Grandfathered users skip gates; new users go through verify-phone → onboarding.
6. Post-deploy audit query: flag rows with `grandfathered_at is not null AND created_at > deploy_time` (should be zero).

## Out of scope

- Changing phone after verification.
- Editing onboarding answers after completion.
- Admin UI for audit log / onboarding data.
- Email confirmations.
- VOIP / virtual number detection beyond premium denylist.
- Horizontal scaling of in-memory rate limiters (short-window only; load-bearing cooldowns/attempts are Postgres-backed). Swap to Redis when scaling backend.
- GDPR data export of audit log (internal security logs per Art. 30 legitimate interest; revisit if DPO requires).
