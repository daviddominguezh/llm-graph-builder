# Auth: Phone verification, onboarding, and account linking

**Date:** 2026-04-21
**Status:** Approved for implementation (revised after second security review)
**Scope:** Sign-in/sign-up flow changes, phone OTP verification, onboarding survey, gated navigation, and explicit-opt-in account linking initiated from an authenticated settings page.

## Context

Supabase auth is already set up in `packages/web` (email/password + Google OAuth). Email confirmations are disabled in prod. We're adding:

1. A post-signup **phone verification** step the user cannot bypass.
2. A post-verify **onboarding survey** the user cannot bypass.
3. Detection of pre-existing accounts by email on both signup and login paths, with friendly error messages.
4. **Explicit, authenticated linking** — users who want both Google and email/password must first sign in with their password, then connect Google from `/account`. OAuth against an email that already has an email/password account is a hard error; the orphan Google row is deleted server-side.
5. Strict, defense-in-depth gating — Next.js middleware AND a default-deny backend middleware both enforce phone/onboarding completion.

## Architecture constraints (non-negotiable)

- **No anon-readable Supabase access from the client or from Next.js server-side.** All sensitive reads/writes live in `packages/backend` (Express) and are exposed via HTTP endpoints. Next.js route handlers proxy through `packages/web/app/lib/backendProxy.ts`, forwarding the user's Supabase JWT as Bearer.
- The only `supabase.auth.*` calls allowed on the browser remain the pure auth-session ones already in use (`signInWithPassword`, `signInWithOAuth`, `signUp`, `linkIdentity`, `unlinkIdentity`, session cookie management).
- Backend creates a JWT-scoped Supabase client by default so RLS enforces per-user access. A new `serviceSupabase()` helper uses `SUPABASE_SERVICE_ROLE_KEY` and is gated by an ESLint `no-restricted-imports` rule: only files under `packages/backend/src/routes/auth/` and `packages/backend/src/middleware/` may import it.
- Strict failure mode: on backend status-endpoint failure, gated navigation is blocked (503 for HTML / 403 JSON for API), never fails-open.

## Data model

Five migrations.

### `supabase/migrations/20260421000000_onboarding_completed.sql`

```sql
alter table public.users
  add column onboarding_completed_at timestamptz;
```

### `supabase/migrations/20260421000001_user_onboarding.sql`

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

### `supabase/migrations/20260421000002_backfill_existing_users.sql`

```sql
alter table public.users
  add column grandfathered_at timestamptz;

update public.users u
  set grandfathered_at = now(),
      onboarding_completed_at = now()
  where u.created_at < '2026-04-21T00:00:00Z'
    and not exists (select 1 from public.user_onboarding o where o.user_id = u.id);
```

`/auth/status` computes:
- `phone_verified = (auth.users.phone_confirmed_at is not null) OR (public.users.grandfathered_at is not null)`
- `onboarding_completed = public.users.onboarding_completed_at is not null`

### `supabase/migrations/20260421000003_auth_helpers.sql`

```sql
-- Provider lookup (used by public /auth/lookup-email via service role)
create or replace function public.list_user_providers(p_email citext)
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
  where lower(u.email) = lower(p_email);
  return v_providers;
end;
$$;

revoke execute on function public.list_user_providers(citext) from public, anon, authenticated;
grant  execute on function public.list_user_providers(citext) to service_role;

-- Phone uniqueness index on ALL phone rows (not just confirmed) to close the
-- send-otp / verify-otp race. Paired with an abandonment sweep (see send-otp
-- endpoint) to prevent phone squatting.
create unique index if not exists auth_users_phone_any_unique
  on auth.users (phone)
  where phone is not null;

-- OTP attempt accounting (survives backend restart, works across instances)
create table public.otp_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  fails smallint not null default 0,
  locked_until timestamptz,
  resends_24h smallint not null default 0,
  resends_window_start timestamptz,
  primary key (user_id, phone)
);

alter table public.otp_attempts enable row level security;
revoke all on public.otp_attempts from anon, authenticated;
grant  select, insert, update, delete on public.otp_attempts to service_role;

-- Send-otp cooldown (same rationale: persists across restart)
create table public.otp_cooldowns (
  user_id uuid primary key references auth.users(id) on delete cascade,
  next_allowed_at timestamptz not null
);

alter table public.otp_cooldowns enable row level security;
revoke all on public.otp_cooldowns from anon, authenticated;
grant  select, insert, update, delete on public.otp_cooldowns to service_role;
```

### `supabase/migrations/20260421000004_audit_log.sql`

```sql
create table public.auth_audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
    -- 'phone_verified' | 'phone_send_otp' | 'phone_check' | 'otp_verify_failed'
    -- | 'otp_lockout' | 'onboarding_completed' | 'oauth_duplicate_rejected'
    -- | 'google_linked' | 'google_unlinked' | 'lookup_email' | 'lookup_rate_limited'
  email citext,          -- raw email (behind deny-all RLS), null when not applicable
  phone text,            -- raw phone (behind deny-all RLS), null when not applicable
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
```

**PII note:** raw email/phone are stored behind deny-all RLS — service role only. Hashing was considered and rejected as security theater (10-digit phone numbers are trivially reversed).

Phone itself is **not** mirrored to `public.users`. Source of truth stays `auth.users.phone` / `auth.users.phone_confirmed_at`.

## Backend: `packages/backend/src/routes/auth/`

New `authRouter` mounted at `app.use('/auth', authRouter)` in `server.ts`. A new helper `serviceSupabase()` lives in `packages/backend/src/db/client.ts`.

### Gate middleware (default-deny)

A new `requireGateComplete` middleware reads the caller's phone/onboarding status (same logic as `/auth/status`) and returns 403 when either is incomplete. **Applied globally via `app.use(requireAuth, requireGateComplete)` with an explicit allowlist.** Routes that should bypass the gate register under an allowlisted prefix:

- `/auth/*` — all auth endpoints
- `/webhooks/*` — inbound webhooks

At server startup, a helper walks Express's router stack and **throws if any `POST/PATCH/PUT/DELETE` endpoint lacks `requireAuth + requireGateComplete`** unless it's under an allowlisted prefix. Test: `routes/auth/gateCoverage.test.ts` boots the app with a deliberately-misconfigured route and asserts startup throws.

### Endpoints

| Endpoint | Auth | Client | Purpose |
|---|---|---|---|
| `POST /auth/lookup-email` | public; rate-limited per trusted IP (20/min) AND per normalized email (5/hour, salted bucket key). Rate-limited calls return **429** with `{error: 'rate_limited'}` and an audit log entry. | service-role via `public.list_user_providers` | Returns `{ exists, providers: ('email'\|'google')[] }`. Called by signup/login forms. Accepted enumeration tradeoff per product. |
| `POST /auth/handle-oauth-duplicate` | JWT (the just-created Google user) | service-role | Called at OAuth callback. Pulls current user's email from the JWT record (never from body). If another `auth.users` row exists with the same email AND has an `email` identity, **deletes the current (fresh Google) user via `auth.admin.deleteUser()`**, writes an `oauth_duplicate_rejected` audit entry, and returns `{ duplicate: true, email }`. Next.js uses that signal to sign out and redirect to `/login` with an error flag. No identity merging, no pending-link cookie, no reassign function. |
| `POST /auth/phone/check` | JWT + `requireGateIncomplete` (caller's own `phone_verified` must be false) | service-role | Returns `{ available }` for an E.164 phone. Per-user rate limit: 5/min, 30/day. Per-IP secondary limit: 60/min. Audit-logged. |
| `POST /auth/phone/send-otp` | JWT + `requireGateIncomplete` | JWT-scoped + service-role sweep | Sweep first: `update auth.users set phone = null where phone_confirmed_at is null and phone_change_sent_at < now() - interval '30 minutes'` (scoped to abandoned reservations). Then transactional: `select ... for update` on the uniqueness check, then `supabase.auth.updateUser({ phone })`. Server-side cooldown via `public.otp_cooldowns` (2min/user) + per-IP cap (3/hour). Returns `{ ok: true, cooldownUntil }`. Server-side E.164 validation via `libphonenumber`. |
| `POST /auth/phone/verify-otp` | JWT + `requireGateIncomplete` | JWT-scoped | Consults `public.otp_attempts`. If `locked_until > now()`, returns 429 with `otp_locked`. Calls `verifyOtp({phone, token, type:'phone_change'})`. On success: verify returned token's `sub === auth.uid()` (reject+audit-log `otp_verify_failed` with metadata if not), set `public.otp_attempts.fails = 0`, return `{access_token, refresh_token}`. On failure: `fails += 1`; if `fails >= 5` set `locked_until = now() + 15min` and audit `otp_lockout`. |
| `POST /auth/complete-onboarding` | JWT + `requireGateIncomplete` for onboarding only (phone can be verified) | JWT-scoped | Zod-validates payload using canonical enums + `min(1).max(20)` arrays + max string 64. Inserts into `public.user_onboarding` and stamps `public.users.onboarding_completed_at`. Returns 409 if already completed. |
| `GET /auth/status` | JWT | JWT-scoped | Returns `{phone_verified, onboarding_completed}`. Also sets the `_auth_status` signed cookie (see web section). |
| `GET /auth/identities` | JWT | service-role | Returns the caller's `auth.identities` rows (providers + email per identity). Used by `/account` to render the connection state. |
| `POST /auth/unlink-google` | JWT | service-role | Guards: the caller must have `email` identity AND Google identity. Calls `auth.admin.updateUserById(..., { identities: [...] })` to remove the Google identity. Audit-logs `google_unlinked`. Refuses if Google is the *only* identity. |

Rate limiters use an in-process `Map<key, {count, windowStart}>` for short-window limits; the OTP cooldown + attempt counters go through Postgres. A startup log warns if multiple backend instances are detected.

### IP trust

The Next.js proxy strips any client-supplied `x-forwarded-for` and sets a single trusted IP from the platform header (`x-real-ip` / `x-vercel-forwarded-for` / equivalent). Backend runs with `app.set('trust proxy', 1)` — **confirm the number matches the production deployment topology** (Vercel-behind-CDN may need a higher value).

### Options taxonomy (single source of truth)

New module `packages/shared-validation/src/onboarding.ts` exports canonical enum constants used by both backend zod validator and the frontend pill UI. (Confirm the `@openflow/shared-validation` workspace exists; the backend already depends on it.)

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

## Next.js: `packages/web/app/api/auth/`

Thin route handlers forwarding to backend via `proxyToBackend` / `fetchFromBackend`. One route per backend endpoint.

**Special cases:**
- `verify-otp`: on backend success, unpacks `{access_token, refresh_token}` and calls `supabase.auth.setSession(...)` server-side to rewrite the session cookie. Verifies the new token's `sub === current auth.uid()` before writing (defense in depth).
- `lookup-email`: session-less, forwards trusted IP.

### Cookie scoping

All Supabase/auth cookies use a single `AUTH_COOKIE_OPTIONS` constant in `packages/web/app/lib/supabase/cookies.ts`:

```ts
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
```

Imported by `middleware.ts`, `server.ts`, and `client.ts`. Integration test asserts `Set-Cookie` flags on `/api/auth/verify-otp` response.

### `_auth_status` signed cookie

Middleware reads this cookie first to avoid hitting `/auth/status` on every request. Payload: `{user_id, jti, phone_verified, onboarding_completed, exp}`, HMAC-SHA256 over a canonical JSON form. **Signed & verified by the backend only; Next.js treats it as opaque bytes.** 30-second TTL. The payload's `jti` is Supabase's session JWT `jti` — so when the user's session rotates or is revoked, stale `_auth_status` cookies no longer match and middleware refetches status. The backend sets this cookie via a `Set-Cookie` header on `/auth/status` responses; Next.js forwards that header to the browser untouched.

Any mutation endpoint (`verify-otp`, `complete-onboarding`, `unlink-google`, `handle-oauth-duplicate`) sets an **expired** `_auth_status` cookie on its response to invalidate the cache, forcing the next request to refetch.

### Secret management

- `AUTH_COOKIE_SIGNING_SECRET` lives **only** in `packages/backend`.
- `AUTH_COOKIE_SIGNING_SECRET_PREVIOUS` (optional, new) supports dual-secret rotation: backend signs with current, verifies with current-or-previous. Swap current → previous during rotation, then drop previous after a full session-TTL window.

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
2. Read `_auth_status` cookie. Valid HMAC + unexpired + `jti` matches session's `jti` → use cached flags. Else fetch `GET {BACKEND}/auth/status` (3s timeout, `cache: 'no-store'`). Forward the `Set-Cookie` header from the response.
3. On fetch error or non-2xx:
   - Request accepts JSON (`accept: application/json`) or path starts with `/api/` → **403 JSON** `{error: 'auth_status_unavailable'}`.
   - Else → 503 HTML redirect to `/error`.
4. `phone_verified === false`:
   - `/verify-phone` or `/api/auth/phone/*` → pass.
   - JSON/API → **403** `{error: 'phone_verification_required'}`.
   - Else → redirect to `/verify-phone`.
5. `onboarding_completed === false`:
   - `/onboarding` or `/api/auth/complete-onboarding` → pass.
   - JSON/API → **403** `{error: 'onboarding_required'}`.
   - Else → redirect to `/onboarding`.
6. Fully onboarded:
   - `/verify-phone`, `/onboarding`, or `GUEST_ONLY_ROUTE` → redirect to `/`.
   - Else → pass.

Per-request memo prevents fetching status twice.

**Incognito edge (requirement 7):** new sessions cold-fetch status and get redirected to the appropriate gate. No client-side work needed.

## Screens

### `packages/web/app/verify-phone/page.tsx`

Client component wrapped in `AuthCard`. Two internal states.

**State 1 — enter phone**
- `<PhoneInput>` from `components/ui/phone-input.tsx`, required, international format.
- Continue button → `POST /api/auth/phone/check`. If `available === false`, inline "This phone is already registered with another account." If available → `POST /api/auth/phone/send-otp` → State 2.

**State 2 — enter OTP**
- 6-digit boxed input via shadcn `input-otp` (install: `npx shadcn@latest add input-otp`).
- Phone display with "Wrong number? [Edit]" → back to State 1.
- Auto-submits on 6th digit → `POST /api/auth/phone/verify-otp`.
- Success: session cookie rewritten; `router.refresh()` → middleware redirects to `/onboarding`.
- Failure: "Invalid code, try again". Input cleared. After 5 failures, UI shows "Too many attempts. Request a new code." and disables input until resend.
- Resend: disabled until 2-minute `cooldownUntil` expires. Live countdown `Resend code (1:47)`.

### `packages/web/app/onboarding/page.tsx`

Client component in a wider `AuthCard`-shaped shell. Single scrolling form, 5 sections (industry, company size, role, referral sources, build goals). Sticky submit button disabled until all sections valid. On submit → `POST /api/auth/complete-onboarding` → `router.refresh()` → middleware redirects to `/`.

Pill component: new `components/ui/option-pill.tsx` (compact, h-8, rounded-md, with checked state).

### `packages/web/app/account/page.tsx` (new)

User-level account page, sits outside the org-scoped `/orgs/[slug]/*` tree. Route-guarded like any other authenticated page (middleware enforces phone/onboarding first).

Sections:
1. **Profile**: email (read-only), full name (editable via existing `public.users.full_name`).
2. **Security**: phone number (from `auth.users.phone`, read-only), "Change password" link to existing flow.
3. **Connected accounts**:
   - Row for **Email/password** — always present for non-OAuth-only users. Shows email.
   - Row for **Google** — if present in `GET /api/auth/identities`, shows the Google account email + "Disconnect" button (calls `POST /api/auth/unlink-google`; confirms with an `AlertDialog`; refuses if it would leave the account with no identity). If absent, shows "Connect Google" button → browser calls `supabase.auth.linkIdentity({ provider: 'google' })` (auth-flow exception), which triggers OAuth round-trip; on return, Supabase attaches the identity to the current session.

Linking via `linkIdentity()` is safe because:
- The user is already authenticated (JWT in cookie).
- Supabase binds the new identity's `sub` to the current user row server-side.
- If the Google email differs from the current user's email, Supabase still links (we don't enforce email match; the user chose to connect *this* Google account).
- No service-role merge, no duplicate rows, no cookie-forwarded IDs.

### `packages/web/app/error/page.tsx`

Minimal. Polls `/api/auth/status` with exponential backoff (5s → 30s cap); on success, client-redirects to `/`. Copy: "Something's not right on our end. Retrying…" with a manual Retry button.

## Sign-in / sign-up / OAuth callback changes

### `app/signup/page.tsx`

Before `supabase.auth.signUp`:
1. `POST /api/auth/lookup-email`.
2. If `exists`:
   - providers includes `google` → "An account already exists with this email via Google. [Sign in with Google]." Block.
   - providers is `['email']` → "An account already exists with this email. [Sign in]." Block.
3. Else → `signUp`. On success → `router.push('/verify-phone')`.

Remove the `data.session === null` "check your email" branch.

### `app/login/page.tsx`

Before `signInWithPassword`:
1. `POST /api/auth/lookup-email`.
2. If `exists` and providers is `['google']` → "This account uses Google. [Sign in with Google]." Block.
3. Else → `signInWithPassword`.

Page also reads a `?error=oauth_duplicate&email=<e>` query param (set by the callback — see below) and renders an inline banner: "An account already exists for `<e>`. Sign in with your password, then connect Google from Account settings."

### `app/auth/callback/route.ts`

After `exchangeCodeForSession` succeeds (new Google user signed in):
1. `POST /auth/handle-oauth-duplicate` on the backend with the new access token.
2. If `duplicate === true`:
   - Backend has already deleted the fresh Google user via `admin.deleteUser()` and written the audit entry.
   - Route handler calls `supabase.auth.signOut()` against the SSR client so the browser's session cookies are explicitly cleared on the response.
   - Redirect to `/login?error=oauth_duplicate&email=<urlencoded>`.
3. Else → redirect to `next` (or `/`). Middleware routes to `/verify-phone`/`/onboarding` as needed.

**Why this is safe:** no silent linking, no orphan rows persisting beyond the callback, no cookie-forwarded foreign user IDs. The only path to having both Google and email on one account is explicit, authenticated linking from `/account`. A Workspace admin creating `ceo@victimcorp.com` in Google and signing into our site gets their fresh row deleted; they never touch the victim's account.

## Internationalization

New keys in `packages/web/messages/en.json` (sync across locales present in `messages/`):

- `auth.signup.errors.emailExistsGoogle`, `.emailExists`
- `auth.login.errors.emailUsesGoogle`, `.oauthDuplicate` (with `{email}`)
- `auth.verifyPhone.title`, `.description`, `.phoneLabel`, `.continue`, `.otpTitle`, `.otpDescription`, `.resend`, `.resendIn` (`{time}`), `.editPhone`
- `auth.verifyPhone.errors.invalidOtp`, `.errors.tooManyAttempts`, `.errors.phoneTaken`, `.errors.sendFailed`, `.errors.otpLocked`
- `onboarding.title`, `.description`, `.submit`
- `onboarding.sections.industry`, `.companySize`, `.role`, `.referral`, `.buildGoals`
- `onboarding.options.industry.*`, `.companySize.*`, `.role.*`, `.referral.*`, `.buildGoals.*`
- `account.title`, `.profile.title`, `.security.title`, `.security.phone`, `.security.changePassword`
- `account.connections.title`, `.connections.email.label`, `.connections.google.label`
- `account.connections.google.connect`, `.google.disconnect`, `.google.connected` (`{email}`)
- `account.connections.google.confirmDisconnect.title`, `.body`, `.confirm`, `.cancel`
- `account.connections.errors.cannotUnlinkOnlyIdentity`, `.linkFailed`, `.unlinkFailed`
- `error.title`, `.description`, `.retrying`, `.retry`

## Environment variables

**Backend (`packages/backend`):**
- `SUPABASE_SERVICE_ROLE_KEY` — required.
- `AUTH_COOKIE_SIGNING_SECRET` — required.
- `AUTH_COOKIE_SIGNING_SECRET_PREVIOUS` — optional, dual-secret rotation window.

**Web (`packages/web`):** none new (cookie signing lives in backend only).

**Supabase (local `supabase/config.toml`):** enable `[auth.sms]` provider for local parity with prod.

## Tests

All tests in `packages/backend`.

- `routes/auth/lookupEmail.test.ts` — exists/false; all three provider combos; 20/min per-IP limit; 5/hour per-email limit; 429 response; audit entry.
- `routes/auth/phoneCheck.test.ts` — available/unavailable; rejects verified callers; 5/min, 30/day, 60/min per-IP.
- `routes/auth/phoneSendOtp.test.ts` — cooldown enforced across restart (Postgres-backed); abandonment sweep clears stale reservations; uniqueness re-check in same transaction; E.164 validation; per-IP cap.
- `routes/auth/phoneVerifyOtp.test.ts` — success returns matching-`sub` tokens; bad code increments `fails`; 5th failure locks for 15min; lockout returns 429; audit entry.
- `routes/auth/completeOnboarding.test.ts` — zod rejects empty arrays, oversized arrays (>20), strings >64, unknown enums; idempotency 409; user B can't write for user A.
- `routes/auth/status.test.ts` — flags; missing `user_onboarding` → false; grandfathered → both true; sets signed cookie with `jti` binding.
- `routes/auth/handleOauthDuplicate.test.ts` — deletes fresh Google user when email matches an existing email-identity row; no-op when other row is also Google; no-op when no duplicate; audit entry on delete.
- `routes/auth/identities.test.ts` — returns caller's identities.
- `routes/auth/unlinkGoogle.test.ts` — happy path; refuses when Google is only identity; audit entry.
- `routes/auth/gateCoverage.test.ts` — startup assertion throws if a mutating route lacks `requireGateComplete`.
- `routes/auth/gateMiddleware.test.ts` — 403 on incomplete gate; passes when complete.
- `lib/signedCookies.test.ts` — HMAC canonical form; dual-secret rotation; bad HMAC rejected; expired rejected; tampered field rejected; canonical serialization doesn't vary with key order.
- `db/functions/list_user_providers.test.sql` (pgTAP or raw) — returns correct providers; REVOKE from anon/authenticated in place.

## Rollout

1. Ship migrations 0–4.
2. Deploy backend: new endpoints, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_COOKIE_SIGNING_SECRET`, `requireGateComplete` wired globally. Existing users are grandfathered — no immediate 403s.
3. Deploy web: new screens, middleware updates, route handlers.
4. New users go through verify-phone → onboarding on first session.
5. Post-deploy audit query: flag rows with `grandfathered_at is not null` whose `created_at > deploy_time` (should be zero).

## Out of scope

- Changing phone after verification (follow-up).
- Editing onboarding answers after completion (follow-up).
- Admin UI for audit log or onboarding data (follow-up).
- Email confirmations — remains disabled per current config.
- Horizontal scaling of in-memory rate limiters (short-window limits; the load-bearing cooldowns/attempts are Postgres-backed). Swap to Redis when we scale backend beyond one instance.
