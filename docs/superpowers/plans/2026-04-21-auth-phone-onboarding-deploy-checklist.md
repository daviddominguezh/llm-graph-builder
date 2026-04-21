# Auth / Phone / Onboarding Deploy Checklist

**Scope:** the auth + phone verification + onboarding + account linking feature implemented in `docs/superpowers/plans/2026-04-21-auth-phone-onboarding.md`.

## 1. FK cascade audit (BLOCKING)

Run this query against production Supabase. Expected: **zero rows**.

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

Any non-cascade FK must be fixed before deploy — otherwise `admin.deleteUser()` in `handle-oauth-duplicate` will fail on FK violation.

## 2. Environment variables (BLOCKING)

### Backend (`packages/backend`)

- `SUPABASE_SERVICE_ROLE_KEY` — required; bypasses RLS for the few narrow endpoints.
- `RATE_LIMIT_BUCKET_SECRET` — required, ≥32 bytes of entropy. HMACs the rate-limit bucket keys.
- `TRUST_PROXY_HOPS` — optional; defaults to `1`. Must match the production LB topology (1 hop for typical ALB/Vercel; more if there's a CDN in front).

### Web (`packages/web`)

- `AUTH_STATUS_COOKIE_SECRET` — required, ≥32 bytes. Signs the `_auth_status` cache cookie.
- `AUTH_STATUS_COOKIE_SECRET_PREVIOUS` — optional. Set this to the previous secret during a rotation window (~30 days to cover refresh token TTL). Drop it when no valid cookies signed by the old secret remain.

### Startup assertions

The backend throws at boot if any of the following are missing or invalid:
- `SUPABASE_SERVICE_ROLE_KEY` or `RATE_LIMIT_BUCKET_SECRET` absent, empty, or <32 bytes.
- Trust-proxy setting doesn't resolve the expected client IP on a canned XFF header (see `packages/backend/src/lib/trustProxyAssertion.ts`; verify the assertion matches your real LB topology).
- Any of the required Postgres tables (`otp_attempts`, `otp_cooldowns`, `auth_audit_log`, `user_onboarding`) is missing.

## 3. Supabase dashboard (BLOCKING)

- **Auth → Providers → Phone**: enabled with configured SMS provider (Twilio/MessageBird/Vonage/etc.) and a sender ID approved for the target country.
- **Auth → Providers → Email**: "Confirm email" remains **disabled** (the feature depends on this setting).
- **Database → Extensions**: `pg_cron` enabled (required by migration 0004 for the abandoned-phone sweep and audit-log retention jobs).

## 4. Migration order

Migrations run in this order (all share the `20260421*` prefix):

1. `20260421000000_onboarding_completed.sql`
2. `20260421000001_user_onboarding.sql`
3. `20260421000002_backfill_existing_users.sql` — grandfathers existing users (`created_at < now()` at migration time).
4. `20260421000003_auth_helpers.sql` — postgres functions (`list_user_providers`, `reject_oauth_duplicate`, `get_safe_identities`), unique phone index, OTP tables.
5. `20260421000004_audit_log_and_retention.sql` — audit log + GDPR scrub trigger + pg_cron jobs.
6. `20260421000005_otp_record_fail.sql` — atomic OTP-fail increment function.

## 5. Deploy order

1. Apply all six migrations.
2. Deploy backend with the env vars from section 2.
3. Deploy web with `AUTH_STATUS_COOKIE_SECRET`.

Existing users are grandfathered by migration 3 — they never see the new gates. New users go through verify-phone → onboarding on first session.

## 6. Post-deploy audit (NON-BLOCKING)

Run once the web tier is up:

```sql
select count(*) from public.users
where grandfathered_at is not null
  and created_at > '<deploy-timestamp-in-ISO-8601>';
```

Expected: `0`. If anything shows up, investigate — a code path is creating already-grandfathered users (shouldn't happen through normal signup).

## 7. Smoke test (NON-BLOCKING)

1. Sign up with a fresh email → redirected to `/verify-phone`.
2. Enter a valid US/UK/CA phone → OTP SMS received.
3. Enter OTP → redirected to `/onboarding`.
4. Fill the form → redirected to `/`.
5. Log out; log in again → skips both gates.
6. Visit `/account` → Connections section shows the email identity; "Connect Google" triggers OAuth.

## Known concerns carried forward from implementation

- **Trust-proxy assertion** in `packages/backend/src/lib/trustProxyAssertion.ts` uses a custom reimplementation of `proxy-addr`'s XFF logic (direct `proxy-addr` import was blocked by ESLint's `no-require-imports`/`no-unsafe-type-assertion` rules). Verify the assertion matches your real LB topology before deploying to prod.
- **Express 5 router walker**: `assertGateCoverage()` only inspects app-level routes; sub-router routes are invisible because Express 5 routers are functions (not objects) and the walker's type guard checks for objects. All existing mutating mount points were wrapped with `requireGateComplete` manually — the walker is a safety net for future top-level `app.post/put/patch/delete(...)` calls, not an exhaustive check. Extending the walker to handle Express 5's function-router shape is a follow-up.
- **Account page full-name editing** is read-only; no backend user-update endpoint exists. Adding one is a follow-up.
