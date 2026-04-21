# Auth: Phone verification, onboarding, and account linking

**Date:** 2026-04-21
**Status:** Approved for implementation
**Scope:** Sign-in/sign-up flow changes, phone OTP verification, onboarding survey, gated navigation, account-linking merge for OAuth/email duplicates.

## Context

Supabase auth is already set up in `packages/web` (email/password + Google OAuth). Email confirmations are disabled in prod. We're adding:

1. A post-signup **phone verification** step the user cannot bypass.
2. A post-verify **onboarding survey** the user cannot bypass.
3. Detection of pre-existing accounts by email on both signup and login paths, with friendly error messages.
4. Automatic **account linking** when a user signs up/in with Google using an email that already has an email/password account.
5. Strict, middleware-enforced gating: incognito sessions re-encounter the same gates until completed.

## Architecture constraints (non-negotiable)

- **No anon-readable Supabase access from the client or from Next.js server-side.** All sensitive reads/writes live in `packages/backend` (Express) and are exposed via HTTP endpoints. Next.js route handlers proxy to the backend using the existing `packages/web/app/lib/backendProxy.ts` pattern, forwarding the user's Supabase JWT as `Bearer`.
- The only `supabase.auth.*` calls allowed on the browser remain the pure auth-session ones already in use (`signInWithPassword`, `signInWithOAuth`, `signUp`, session cookie management). New auth operations (phone OTP send/verify, onboarding write, account merge, cross-user reads) go through the backend.
- Backend creates a JWT-scoped Supabase client by default so RLS still enforces per-user access. A new `serviceSupabase()` helper is added for the narrow set of endpoints that need cross-user visibility (phone uniqueness, email provider lookup, merge).
- Strict failure mode: if the backend status endpoint fails, gated navigation is blocked (503 error page), never fails-open.

## Data model

Two migrations, plus a backfill for existing users.

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
  referral_sources text[] not null check (array_length(referral_sources, 1) >= 1),
  build_goals text[] not null check (array_length(build_goals, 1) >= 1),
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

update public.users
  set grandfathered_at = now(),
      onboarding_completed_at = now()
  where created_at < '2026-04-21T00:00:00Z';
```

Grandfathered users bypass both gates. `/auth/status` computes:
- `phone_verified = (auth.users.phone_confirmed_at is not null) OR (public.users.grandfathered_at is not null)`
- `onboarding_completed = public.users.onboarding_completed_at is not null`

### Supporting Postgres functions

Added in a third migration `20260421000003_auth_helpers.sql`:

```sql
create or replace function public.list_user_providers(p_email text)
returns text[]
language plpgsql
security definer set search_path = ''
as $$
  -- returns identity providers for the given email across all auth.users
  -- rows that share it. Returns empty array if no user exists.
$$;

create or replace function public.merge_users(keep_id uuid, drop_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
  -- Transactionally:
  --   1. Reassign auth.identities.user_id from drop_id to keep_id
  --      (so the Google identity attaches to the surviving row).
  --   2. Delete the drop_id row from public.users (cascades onboarding).
  --   3. Delete drop_id from auth.users.
  -- Caller is the backend merge endpoint running with service role.
$$;
```

Phone is **not** mirrored to `public.users`. Source of truth stays `auth.users.phone` / `auth.users.phone_confirmed_at`. Supabase already has a unique index on verified phones.

## Backend: `packages/backend/src/routes/auth/`

New `authRouter` mounted at `app.use('/auth', authRouter)` in `server.ts`.

A new helper `serviceSupabase()` lives in `packages/backend/src/db/client.ts` — reads `SUPABASE_SERVICE_ROLE_KEY` and returns a service-role client. Called only from the endpoints below that need cross-user access.

| Endpoint | Auth | Client | Purpose |
|---|---|---|---|
| `POST /auth/lookup-email` | public, rate-limited 20/min per forwarded IP | service-role via `public.list_user_providers` | Returns `{ exists: boolean, providers: ('email' \| 'google')[] }`. Called by signup and login forms. Next.js route handler forwards `x-forwarded-for` so the backend can key the bucket by the real client IP. |
| `POST /auth/phone/check` | JWT | service-role | Returns `{ available: boolean }` for a given E.164 phone. Checks `auth.users.phone where phone_confirmed_at is not null`. |
| `POST /auth/phone/send-otp` | JWT | JWT-scoped | Calls `supabase.auth.updateUser({ phone })` on the current user. Rate-limited server-side with an in-memory token bucket (1 request / 2min / user). Returns `{ ok: true, cooldownUntil: ISO string }`. |
| `POST /auth/phone/verify-otp` | JWT | JWT-scoped | Calls `verifyOtp({ phone, token, type: 'phone_change' })`. Returns `{ access_token, refresh_token }` on success so Next.js can rewrite the session cookie. On failure, does NOT reset cooldown. |
| `POST /auth/complete-onboarding` | JWT | JWT-scoped | Zod-validates payload (`industry`, `company_size`, `role`, `referral_sources >= 1`, `build_goals >= 1`). Inserts into `public.user_onboarding` and stamps `public.users.onboarding_completed_at`. Returns 409 if already completed. |
| `GET /auth/status` | JWT | JWT-scoped | Returns `{ phone_verified: boolean, onboarding_completed: boolean }`. Consumed by middleware and gating layouts. |
| `POST /auth/merge-duplicate` | JWT | service-role | Called at OAuth callback. If another `auth.users` row shares the email and has an `email` identity, runs `public.merge_users(keep = earlier created_at, drop = later created_at)`. Re-issues a session for the surviving user via `admin.generateLink({type:'magiclink'})` + server-side `verifyOtp({type:'magiclink', token_hash})`. Returns `{ merged: boolean, access_token?, refresh_token? }`. No-op (and returns `{merged:false}`) if no duplicate exists — handles the case where Supabase's default linking already merged them. |

Rate-limiting uses an in-process `Map<key, {count, windowStart}>` — acceptable for a single backend instance. If we horizontally scale, swap to Redis; the existing backend already depends on `@upstash/redis` and `ioredis`.

### Options taxonomy (single source of truth)

Both the UI and the backend validator import the same enum lists. A new module `packages/shared-validation/src/onboarding.ts` exports:

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

UI labels live in `messages/<locale>.json` keyed by these canonical values.

## Next.js: `packages/web/app/api/auth/`

Thin route handlers that forward to the backend via `proxyToBackend` / `fetchFromBackend`. One route per backend endpoint. Public endpoints (`lookup-email`) use a bodyless proxy that doesn't require a session.

`verify-otp`'s route handler is slightly special: on backend success, it unpacks `{access_token, refresh_token}` and calls `supabase.auth.setSession(...)` server-side via the SSR client so the session cookie is rewritten. Same for the merge-duplicate route handler in the OAuth callback.

## Middleware: `packages/web/app/lib/supabase/middleware.ts`

Extend the existing `updateSession` function.

```
Route categories:
- PUBLIC_ROUTES:      /auth/callback, /reset-password, /error
- GUEST_ONLY_ROUTES:  /login, /signup, /forgot-password
- GATED_EXEMPT:       /verify-phone, /onboarding, /api/auth/*, /logout
- everything else:    fully gated
```

**Decision tree (authenticated only):**

1. If path is `PUBLIC_ROUTE` → pass.
2. Fetch `GET {BACKEND}/auth/status` with the user's access token as Bearer.
3. On fetch error or non-2xx → **strict block**: return a 503 response pointing at `/error` (no fall-through).
4. `phone_verified === false`:
   - Path is `/verify-phone` or `/api/auth/phone/*` → pass.
   - Else → redirect to `/verify-phone`.
5. `onboarding_completed === false`:
   - Path is `/onboarding` or `/api/auth/complete-onboarding` → pass.
   - Else → redirect to `/onboarding`.
6. Fully onboarded:
   - Path is `/verify-phone`, `/onboarding`, or a `GUEST_ONLY_ROUTE` → redirect to `/`.
   - Else → pass.

Middleware pulls the access token from the SSR cookie (`supabase.auth.getSession()`) and forwards it. A small helper `fetchAuthStatus(jwt)` wraps the call with a 3s timeout. On timeout → 503.

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
- On failure: inline error "Invalid code, try again". Input cleared. Cooldown NOT reset.
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

### `packages/web/app/error/page.tsx`

Minimal. Polls `/api/auth/status` every 5s; on success → client-redirects to `/`. Copy: "Something's not right on our end. Retrying…" with a manual Retry button.

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
1. `POST /auth/merge-duplicate` on the backend with the new access token.
2. If response `merged === true` and contains new tokens → call `supabase.auth.setSession(...)` to rewrite cookies to the surviving user's session.
3. Redirect to the original `next` (or `/`). Middleware takes over from there.

**Merge semantics:** the surviving user is the `auth.users` row with the earlier `created_at`. Any onboarding / phone state on the dropped row is lost (acceptable — the dropped row is fresh from this single callback and has no onboarding yet). If the other user is also Google (edge), do nothing. If Supabase's built-in identity linking already merged them (possible even with email confirmations off, depending on Supabase's current behavior for auto-confirmed emails), the endpoint returns `{merged:false}` and the current session is used as-is.

## Internationalization

New keys added to `packages/web/messages/en.json` (implementation scans `messages/` and syncs all locales present).

- `auth.signup.errors.emailExistsGoogle`
- `auth.signup.errors.emailExists`
- `auth.login.errors.emailUsesGoogle`
- `auth.verifyPhone.title`, `.description`, `.phoneLabel`, `.continue`
- `auth.verifyPhone.otpTitle`, `.otpDescription`, `.resend`, `.resendIn` (with `{time}`), `.editPhone`
- `auth.verifyPhone.errors.invalidOtp`, `.errors.phoneTaken`, `.errors.sendFailed`
- `onboarding.title`, `.description`, `.submit`
- `onboarding.sections.industry`, `.companySize`, `.role`, `.referral`, `.buildGoals`
- `onboarding.options.industry.*`, `.companySize.*`, `.role.*`, `.referral.*`, `.buildGoals.*` (one key per canonical enum value)
- `error.title`, `.description`, `.retrying`, `.retry`

## Environment variables

**Backend (`packages/backend`):** add `SUPABASE_SERVICE_ROLE_KEY` (required).

**Web (`packages/web`):** none new.

**Supabase (local `supabase/config.toml`):** enable `[auth.sms]` provider for local parity with prod.

## Tests

All tests live in `packages/backend`; `packages/web` has no existing test harness and we don't add one for this feature.

- `routes/auth/lookupEmail.test.ts` — exists/false; providers for email-only, google-only, mixed.
- `routes/auth/phoneCheck.test.ts` — available/unavailable; ignores unverified phones.
- `routes/auth/phoneSendOtp.test.ts` — cooldown enforced (second call within 2min → 429 with `cooldownUntil`).
- `routes/auth/phoneVerifyOtp.test.ts` — success returns new tokens; bad code returns 400; cooldown not reset on failure.
- `routes/auth/completeOnboarding.test.ts` — zod validation rejects empty arrays; idempotency returns 409; user B can't write for user A.
- `routes/auth/mergeDuplicate.test.ts` — detects duplicate, merges via `public.merge_users`, returns new session; no-op when no duplicate; no-op when "other" user is also Google.
- `routes/auth/status.test.ts` — returns both flags; missing `user_onboarding` row → `onboarding_completed = false`; grandfathered users → both flags true.

## Rollout

1. Ship the three migrations.
2. Ship backend with new endpoints and `SUPABASE_SERVICE_ROLE_KEY` set.
3. Ship web with the new screens, middleware, and route handlers.
4. Existing users are grandfathered by migration 3 — they never see the new gates.
5. New users go through verify-phone → onboarding on first session.

## Out of scope

- Changing phone after verification (not requested).
- Editing onboarding answers after completion (not requested).
- Admin UI for viewing onboarding data (not requested).
- Email confirmations — remains disabled per current config.
- Horizontal scaling of the OTP rate-limiter (single-instance in-memory is fine for now; swap to Redis if we scale).
