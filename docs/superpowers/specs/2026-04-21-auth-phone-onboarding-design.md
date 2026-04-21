# Auth: Phone verification, onboarding, and account linking

**Date:** 2026-04-21
**Status:** Approved for implementation (revised post-security-review)
**Scope:** Sign-in/sign-up flow changes, phone OTP verification, onboarding survey, gated navigation, explicit account-linking flow for OAuth/email duplicates.

## Context

Supabase auth is already set up in `packages/web` (email/password + Google OAuth). Email confirmations are disabled in prod. We're adding:

1. A post-signup **phone verification** step the user cannot bypass.
2. A post-verify **onboarding survey** the user cannot bypass.
3. Detection of pre-existing accounts by email on both signup and login paths, with friendly error messages.
4. **Explicit account linking** — when a user signs in with Google using an email that already has an email/password account, they're routed to a link-confirmation screen where they prove ownership by entering their password, then Google is linked to their existing account.
5. Strict, middleware-enforced gating — on both Next.js and backend tiers — so incognito sessions and direct API calls both re-encounter the gates until completed.

## Architecture constraints (non-negotiable)

- **No anon-readable Supabase access from the client or from Next.js server-side.** All sensitive reads/writes live in `packages/backend` (Express) and are exposed via HTTP endpoints. Next.js route handlers proxy to the backend using the existing `packages/web/app/lib/backendProxy.ts` pattern, forwarding the user's Supabase JWT as `Bearer`.
- The only `supabase.auth.*` calls allowed on the browser remain the pure auth-session ones already in use (`signInWithPassword`, `signInWithOAuth`, `signUp`, `linkIdentity`, session cookie management). New auth operations (phone OTP send/verify, onboarding write, account linking cleanup, cross-user reads) go through the backend.
- Backend creates a JWT-scoped Supabase client by default so RLS still enforces per-user access. A new `serviceSupabase()` helper is added for the narrow set of endpoints that need cross-user visibility (phone uniqueness, email provider lookup, duplicate-identity cleanup).
- Strict failure mode: if the backend status endpoint fails, gated navigation is blocked (503 error page with a polling retry), never fails-open.
- **Defense in depth:** middleware enforces gating on the web tier, AND a parallel `requireGateComplete` middleware on the backend rejects mutating requests when phone/onboarding are incomplete. Neither tier trusts the other.

## Data model

Three migrations.

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

-- Backfill only rows that (a) predate this migration AND (b) have no onboarding
-- record. Belt-and-suspenders against any future code path that sets created_at
-- to a past value.
update public.users u
  set grandfathered_at = now(),
      onboarding_completed_at = now()
  where u.created_at < '2026-04-21T00:00:00Z'
    and not exists (select 1 from public.user_onboarding o where o.user_id = u.id);
```

Grandfathered users bypass both gates. `/auth/status` computes:
- `phone_verified = (auth.users.phone_confirmed_at is not null) OR (public.users.grandfathered_at is not null)`
- `onboarding_completed = public.users.onboarding_completed_at is not null`

### `supabase/migrations/20260421000003_auth_helpers.sql`

Two Postgres helpers plus explicit permission lockdown:

```sql
create or replace function public.list_user_providers(p_email text)
returns text[]
language plpgsql
security definer set search_path = ''
as $$
  -- Returns the distinct set of identity providers attached to any auth.users
  -- row with the given email. Returns empty array if no row matches.
$$;

revoke execute on function public.list_user_providers(text) from public, anon, authenticated;
grant  execute on function public.list_user_providers(text) to service_role;

create or replace function public.reassign_google_identity(
  from_user uuid,
  to_user   uuid
)
returns void
language plpgsql
security definer set search_path = ''
as $$
  -- Guards:
  --   * from_user != to_user
  --   * both rows must currently exist in auth.users
  --   * both rows must share a verified email
  --   * from_user must have a Google identity and no other non-google identities
  --   * from_user must have no public.* data (onboarding, phone_confirmed)
  --   * from_user must be < 24h old
  -- If all guards pass, transactionally:
  --   1. update auth.identities set user_id = to_user where user_id = from_user and provider = 'google'
  --   2. delete from auth.users where id = from_user (cascades public.users, user_onboarding)
  -- Otherwise raise an exception. Caller is the /auth/link-identity endpoint.
$$;

revoke execute on function public.reassign_google_identity(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.reassign_google_identity(uuid, uuid) to service_role;

-- Phone uniqueness at the DB level, not just on verified phones, closes the
-- race between send-otp and verify-otp for unverified duplicates.
create unique index if not exists auth_users_phone_any_unique
  on auth.users (phone)
  where phone is not null;
```

Phone is **not** mirrored to `public.users`. Source of truth stays `auth.users.phone` / `auth.users.phone_confirmed_at`.

## Backend: `packages/backend/src/routes/auth/`

New `authRouter` mounted at `app.use('/auth', authRouter)` in `server.ts`.

A new helper `serviceSupabase()` lives in `packages/backend/src/db/client.ts` — reads `SUPABASE_SERVICE_ROLE_KEY` and returns a service-role client. Called only from the endpoints explicitly marked "service-role" below.

A new backend middleware `requireGateComplete` is applied to **every mutating route in the existing server outside of `/auth/*`**. It reads `phone_verified` and `onboarding_completed` for the current JWT (same logic as `/auth/status`) and returns 403 when either is false. This is the second defense layer.

### Endpoints

| Endpoint | Auth | Client | Purpose |
|---|---|---|---|
| `POST /auth/lookup-email` | public, rate-limited per trusted IP (20/min) AND per email hash (5/hour) | service-role via `public.list_user_providers` | Returns `{ exists: boolean, providers: ('email' \| 'google')[] }`. Called by signup and login forms. **Known enumeration tradeoff:** the product requires revealing provider on signup ("account exists via social") — rate limits keep abuse slow; audit log samples all calls. |
| `POST /auth/phone/check` | JWT + `requireGateIncomplete` (must be an un-verified user) | service-role | Returns `{ available: boolean }` for an E.164 phone. Rejects callers whose own phone is already verified (they have no legitimate reason to probe). Per-user rate limit: 5/min, 30/day. Audit-logged. |
| `POST /auth/phone/send-otp` | JWT | JWT-scoped | Calls `supabase.auth.updateUser({ phone })`. Server-side token bucket: 1 request / 2min / user. Returns `{ ok: true, cooldownUntil: ISO string }`. Transactional with uniqueness: `BEGIN; lock auth.users phone index; re-check available; updateUser; COMMIT`. |
| `POST /auth/phone/verify-otp` | JWT | JWT-scoped | Calls `verifyOtp({ phone, token, type: 'phone_change' })`. Returns `{ access_token, refresh_token }` on success. **Attempt-level rate limit:** per-(user, phone) counter; 5 consecutive failures → lock current OTP and require resend; 10 resends in 24h → 24h hard lockout with admin alert. Response binds returned token's `sub` claim to the caller's `auth.uid()` as a sanity check before returning. |
| `POST /auth/complete-onboarding` | JWT | JWT-scoped | Zod-validates payload (enum whitelists + `min(1).max(20)` on arrays + max string length 64 on any text field). Inserts into `public.user_onboarding` and stamps `public.users.onboarding_completed_at`. Returns 409 if already completed. |
| `GET /auth/status` | JWT | JWT-scoped | Returns `{ phone_verified, onboarding_completed }`. Consumed by middleware and gating layouts. |
| `POST /auth/detect-link-needed` | JWT | service-role | Called at OAuth callback. Returns `{ needsLink: boolean, email?: string }`. Set when the current user is a freshly-created Google user AND another `auth.users` row exists with the same email AND that other row has an `email` identity AND the Google identity's `identity_data.email_verified === true`. If `email_verified` is false or the other row is also Google, returns `{ needsLink: false }`. |
| `POST /auth/link-identity` | JWT | service-role | Called by `/link-account` after the user re-authenticates with their password. Requires: caller's current session is the **old** user (the email-identity one). Endpoint calls `public.reassign_google_identity(from_user = duplicate-google-row, to_user = auth.uid())` which moves the Google identity to the current user and deletes the duplicate row. Returns `{ linked: true }`. All guards are in the Postgres function; endpoint just passes IDs. |

Rate-limiting uses an in-process `Map<key, {count, windowStart}>` for simplicity — acceptable for a single backend instance. If we horizontally scale, swap to Redis (the existing backend already depends on `@upstash/redis` and `ioredis`). The send-otp cooldown additionally writes to a Postgres table `public.otp_cooldowns (user_id pk, next_allowed_at)` so a backend restart doesn't reset cooldowns.

### IP trust for rate limiting

The Next.js proxy explicitly replaces `x-forwarded-for` with a single trusted IP value extracted from the platform header (`x-real-ip` / `x-vercel-forwarded-for` / equivalent). The backend runs with `app.set('trust proxy', 1)` and keys rate-limit buckets off `req.ip`. The backend never reads client-supplied `x-forwarded-for` directly.

### Audit logging

New table `public.auth_audit_log` (service-role writable, not readable by users):

```sql
create table public.auth_audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,    -- 'phone_verified' | 'identity_linked' | 'onboarding_completed' | 'phone_check' | 'lookup_email' | 'link_rejected'
  metadata jsonb,          -- { ip, user_agent, phone_hash, email_hash, ... }
  created_at timestamptz not null default now()
);
```

All auth-state-mutating endpoints write an entry. PII is hashed (SHA-256 of phone/email) rather than stored raw.

### Options taxonomy (single source of truth)

Shared between UI and backend validator. A new module `packages/shared-validation/src/onboarding.ts` exports:

```ts
export const INDUSTRY_OPTIONS = ['it_software', 'legal', 'health', 'finance',
  'education', 'ecommerce', 'media', 'manufacturing', 'real_estate', 'other'] as const;
export const COMPANY_SIZE_OPTIONS = ['1', '2-10', '10-50', '50-100', '100-500',
  '500-1000', '1000-5000', '5000+'] as const;
export const ROLE_OPTIONS = ['developer', 'founder', 'c_level', 'product',
  'marketing', 'sales', 'legal', 'operations', 'other'] as const;
export const REFERRAL_OPTIONS = ['linkedin', 'youtube', 'friend_referral',
  'reddit', 'discord', 'tldr', 'google_search', 'twitter_x', 'blog_post', 'other'] as const;
export const BUILD_GOAL_OPTIONS = ['ai_agents', 'ai_agency', 'workflows',
  'browser_automation', 'chatbot', 'not_sure'] as const;
```

UI labels live in `messages/<locale>.json`, keyed by canonical values. (Confirm `@openflow/shared-validation` workspace already exists before adding; the spec treats it as existing, matching the backend's current dependency.)

## Next.js: `packages/web/app/api/auth/`

Thin route handlers forwarding to the backend via `proxyToBackend` / `fetchFromBackend`. One route per backend endpoint. Public endpoints (`lookup-email`) use a session-less variant that still forwards the trusted client IP.

Two route handlers are special:
- `verify-otp`: on backend success, unpacks `{access_token, refresh_token}` and calls `supabase.auth.setSession(...)` server-side so the session cookie is rewritten. Verifies the returned `access_token`'s `sub` matches the pre-call `auth.uid()` before writing.
- `link-identity` (at `/api/auth/link-identity`): called from the `/link-account` page after password re-auth; proxies to backend `POST /auth/link-identity`. The browser then calls `supabase.auth.linkIdentity({ provider: 'google' })` to attach the Google identity to the newly-combined user — this is the standard Supabase-browser-side auth-exception call.

### Cookie scoping (explicit)

`packages/web/app/lib/supabase/middleware.ts`, `server.ts`, and `client.ts` must set cookie options explicitly: `{ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }`. Added as a single `AUTH_COOKIE_OPTIONS` constant used from all three files. An integration check asserts the `Set-Cookie` header flags match on a response from `/api/auth/verify-otp`.

### Status caching

Middleware hitting `GET /auth/status` on every request DoSes our own backend from any logged-in browser (every image, every prefetch). Mitigation: a short-lived signed cookie `_auth_status` (HMAC over `{user_id, phone_verified, onboarding_completed, exp}`, 30s TTL) set by the status endpoint response. Middleware reads the cookie first; on miss/expiry/bad-HMAC, fetches status fresh. Any mutating endpoint (`verify-otp`, `complete-onboarding`, `link-identity`) invalidates the cookie in its response.

## Middleware: `packages/web/app/lib/supabase/middleware.ts`

Extend the existing `updateSession` function.

```
Route categories:
- PUBLIC_ROUTES:      /auth/callback, /reset-password, /error
- GUEST_ONLY_ROUTES:  /login, /signup, /forgot-password
- GATED_EXEMPT:       /verify-phone, /onboarding, /link-account, /api/auth/*, /logout
- everything else:    fully gated
```

**Decision tree (authenticated only):**

1. If path is `PUBLIC_ROUTE` → pass.
2. Read `_auth_status` signed cookie. If valid, use its flags. Else fetch `GET {BACKEND}/auth/status` with the user's access token as Bearer, 3s timeout, set the signed cookie on the response.
3. On fetch error or non-2xx:
   - If request accepts JSON (`accept: application/json`) or path starts with `/api/` → return **403 JSON** `{ error: 'auth_status_unavailable' }`.
   - Else → return a 503 HTML response pointing at `/error` (no fall-through).
4. `phone_verified === false`:
   - Path is `/verify-phone` or `/api/auth/phone/*` → pass.
   - Else if JSON/API → **403 JSON** `{ error: 'phone_verification_required' }`.
   - Else → redirect to `/verify-phone`.
5. `onboarding_completed === false`:
   - Path is `/onboarding` or `/api/auth/complete-onboarding` → pass.
   - Else if JSON/API → **403 JSON** `{ error: 'onboarding_required' }`.
   - Else → redirect to `/onboarding`.
6. Fully onboarded:
   - Path is `/verify-phone`, `/onboarding`, `/link-account`, or a `GUEST_ONLY_ROUTE` → redirect to `/`.
   - Else → pass.

Middleware pulls the access token from the SSR cookie (`supabase.auth.getSession()`) and forwards it. A helper `fetchAuthStatus(jwt)` wraps the call with a 3s timeout and uses `cache: 'no-store'`. The middleware also keeps a per-request memo so a single request does not fetch status twice.

**Incognito edge (requirement 7):** signing in again on a different device yields a fresh session; middleware's next request evaluates the same flags and redirects back to the appropriate gate. No client-side work needed.

## Screens

### `packages/web/app/verify-phone/page.tsx`

Client component wrapped in `AuthCard`. Two internal states.

**State 1 — enter phone**
- `<PhoneInput>` from `components/ui/phone-input.tsx`, required, international format.
- Continue button → `POST /api/auth/phone/check`. If `available === false`, inline error "This phone is already registered with another account." If available → `POST /api/auth/phone/send-otp` → advance to State 2.

**State 2 — enter OTP**
- 6-digit boxed input via new shadcn `input-otp` component (install: `npx shadcn@latest add input-otp`).
- Phone display with "Wrong number? [Edit]" link → back to State 1.
- Auto-submits on 6th digit → `POST /api/auth/phone/verify-otp`.
- On success: Next.js route rewrote the session cookie; `router.refresh()` triggers middleware to redirect to `/onboarding`.
- On failure: inline error "Invalid code, try again". Input cleared. Cooldown NOT reset. After 5 failures, UI shows "Too many attempts. Request a new code." and disables the input until resend.
- Resend link: disabled until the 2-minute cooldown from `cooldownUntil` expires. Shows live countdown `Resend code (1:47)`. After cooldown, click → calls send-otp again.

No skip, no back button to signup.

### `packages/web/app/onboarding/page.tsx`

Client component in an `AuthCard`-shaped wider shell. Single scrolling form, 5 sections.

1. **Industry** — single-select pill group.
2. **Company size** — single-select pill group.
3. **Role** — single-select pill group.
4. **How did you hear about us?** — multi-select, ≥1.
5. **What are you trying to build?** — multi-select, ≥1.

Sticky submit button, disabled until all sections valid. On submit → `POST /api/auth/complete-onboarding`. On success → `router.refresh()` → middleware redirects to `/`.

Pill component: one new shared component `components/ui/option-pill.tsx` (compact, h-8, rounded-md, with checked state). Keeps the design-system look consistent.

### `packages/web/app/link-account/page.tsx` (new)

Shown when OAuth callback detected a duplicate and the user needs to link Google to their pre-existing email/password account. URL carries `?email=<encoded>` so the UI can show the target account.

Flow on the page:
1. Copy: "An account already exists for `{email}`. Enter your password to connect Google to it."
2. Email input (read-only, pre-filled, `disabled`) + password input + "Continue" button.
3. On submit:
   1. Call `supabase.auth.signInWithPassword({ email, password })` from the browser (auth exception). The browser's active session flips from the Google user to the email user.
   2. On auth failure → inline "Invalid password" error; no further action.
   3. On auth success → `POST /api/auth/link-identity` which proxies to backend; backend runs `public.reassign_google_identity(from = google_user_id_from_cookie_or_state, to = auth.uid())` which moves the Google identity to the email user and deletes the stray Google row.
   4. On success → `supabase.auth.refreshSession()` so the client picks up the new `identities` list.
   5. Redirect to `/` (middleware takes over).

**How does the backend know which `from_user` to pass?** The `/auth/detect-link-needed` response (from the earlier OAuth callback step) stamps a short-lived signed cookie `_pending_link` containing `{ google_user_id, email, exp: now + 10min }`. The `link-identity` endpoint reads this cookie (via Next.js forwarding), verifies the HMAC, confirms the cookie's `email` matches the password-authenticated user's email, and passes `from_user = google_user_id`. Cookie is cleared on success or on any failure. All guards inside `reassign_google_identity` re-verify the claim on the DB side.

### `packages/web/app/error/page.tsx`

Minimal. Polls `/api/auth/status` every 5s with exponential backoff capped at 30s; on success → client-redirects to `/`. Copy: "Something's not right on our end. Retrying…" with a manual Retry button.

## Sign-in / sign-up / OAuth callback changes

### `app/signup/page.tsx`

Before `supabase.auth.signUp`:
1. `POST /api/auth/lookup-email`.
2. If `exists`:
   - providers includes `google` → "An account already exists with this email via Google. [Sign in with Google]." Block.
   - providers is `['email']` → "An account already exists with this email. [Sign in]." Block.
3. Else → call `signUp` as today. On success → `router.push('/verify-phone')`.

Remove the `data.session === null` "check your email" branch (dead code — email confirmations are off).

### `app/login/page.tsx`

Before `signInWithPassword`:
1. `POST /api/auth/lookup-email`.
2. If `exists` and providers is `['google']` → "This account uses Google. [Sign in with Google]." Block.
3. Else → proceed with `signInWithPassword`.

### `app/auth/callback/route.ts`

After `exchangeCodeForSession` succeeds:
1. `POST /auth/detect-link-needed` on the backend with the new access token.
2. If `needsLink === true`:
   - Set the short-lived signed `_pending_link` cookie described above.
   - **Sign out the current session** (`supabase.auth.signOut()`) so the browser holds no active Google-user session during the password step.
   - Redirect to `/link-account?email=<email>`.
3. Else → Redirect to `next` (or `/`). Middleware takes over from there.

**Identity ownership invariant:** the linking path requires proof of both identities:
- Google is proven because the user just completed an OAuth round-trip AND `identity_data.email_verified === true` is checked before `needsLink` is set.
- Email/password is proven by the password re-auth on `/link-account`.
Only after both proofs is `reassign_google_identity` called.

## Internationalization

New keys added to `packages/web/messages/en.json` (implementation scans `messages/` and syncs all locales present).

- `auth.signup.errors.emailExistsGoogle`
- `auth.signup.errors.emailExists`
- `auth.login.errors.emailUsesGoogle`
- `auth.verifyPhone.title`, `.description`, `.phoneLabel`, `.continue`
- `auth.verifyPhone.otpTitle`, `.otpDescription`, `.resend`, `.resendIn` (with `{time}`), `.editPhone`
- `auth.verifyPhone.errors.invalidOtp`, `.errors.tooManyAttempts`, `.errors.phoneTaken`, `.errors.sendFailed`
- `auth.linkAccount.title`, `.description` (with `{email}`), `.passwordLabel`, `.continue`, `.errors.invalidPassword`, `.errors.linkFailed`
- `onboarding.title`, `.description`, `.submit`
- `onboarding.sections.industry`, `.companySize`, `.role`, `.referral`, `.buildGoals`
- `onboarding.options.industry.*`, `.companySize.*`, `.role.*`, `.referral.*`, `.buildGoals.*` (one key per canonical enum value)
- `error.title`, `.description`, `.retrying`, `.retry`

## Environment variables

**Backend (`packages/backend`):** 
- `SUPABASE_SERVICE_ROLE_KEY` (required, new).
- `AUTH_COOKIE_SIGNING_SECRET` (required, new — HMAC secret for `_auth_status` and `_pending_link` cookies).

**Web (`packages/web`):** 
- `AUTH_COOKIE_SIGNING_SECRET` (required, new — same secret used by Next.js middleware and route handlers to verify cookies).

**Supabase (local `supabase/config.toml`):** enable `[auth.sms]` provider for local parity with prod.

## Tests

All tests live in `packages/backend`; `packages/web` has no existing test harness.

- `routes/auth/lookupEmail.test.ts` — exists/false; providers for email-only, google-only, mixed; per-email rate limit kicks in after 5 calls; per-IP after 20.
- `routes/auth/phoneCheck.test.ts` — available/unavailable; rejects callers whose own phone is already verified; per-user rate limits (5/min, 30/day).
- `routes/auth/phoneSendOtp.test.ts` — cooldown enforced (second call within 2min → 429 with `cooldownUntil`); cooldown persists across backend restart; uniqueness re-check in same transaction.
- `routes/auth/phoneVerifyOtp.test.ts` — success returns new tokens with matching `sub`; bad code returns 400; 5 wrong codes → lockout; 10 resends in 24h → 24h hard lockout.
- `routes/auth/completeOnboarding.test.ts` — zod validation rejects empty arrays, arrays > 20, unknown enum values; idempotency returns 409; user B can't write for user A.
- `routes/auth/status.test.ts` — returns both flags; missing `user_onboarding` row → `onboarding_completed = false`; grandfathered users → both flags true.
- `routes/auth/detectLinkNeeded.test.ts` — returns `needsLink:true` only when the caller is a fresh Google user AND another row has an email identity AND Google's `email_verified` claim is true; returns `needsLink:false` on any other combination.
- `routes/auth/linkIdentity.test.ts` — happy path: signed `_pending_link` cookie + password-auth'd caller → Google identity reassigned; rejects mismatched email; rejects expired cookie; rejects tampered HMAC; rejects when `from_user` has public data; rejects when `from_user` is >24h old.
- `routes/auth/gateMiddleware.test.ts` — `requireGateComplete` on a mutating route rejects un-verified users with 403; passes verified+onboarded users.
- `db/functions/reassign_google_identity.test.sql` (pgTAP or equivalent) — function guards each fire; REVOKE in place (anon/authenticated receive permission-denied).
- `db/functions/list_user_providers.test.sql` — REVOKE in place.

## Rollout

1. Ship the four migrations.
2. Ship backend with new endpoints, `SUPABASE_SERVICE_ROLE_KEY`, and `AUTH_COOKIE_SIGNING_SECRET`. Deploy `requireGateComplete` applied to all mutating routes *simultaneously* with the web tier that stamps status (to avoid existing users hitting 403 in the gap).
3. Ship web with the new screens, middleware, route handlers, and `AUTH_COOKIE_SIGNING_SECRET`.
4. Existing users are grandfathered by migration 3 — they never see the new gates.
5. New users go through verify-phone → onboarding on first session.
6. Post-deploy audit query: flag any row in `public.users` with `grandfathered_at is not null` created after deploy time (should be zero).

## Out of scope

- Changing phone after verification (not requested).
- Editing onboarding answers after completion (not requested).
- Admin UI for viewing onboarding data / audit log (not requested).
- Email confirmations — remains disabled per current config.
- Horizontal scaling of in-memory rate limiters (single-instance in-memory + Postgres-backed cooldown for OTPs is fine for now; swap to Redis when we scale backend).
- Undoing a bad link (no admin unlink UI). Linking is user-initiated and requires both proofs; rollback happens manually by an admin if ever needed.
