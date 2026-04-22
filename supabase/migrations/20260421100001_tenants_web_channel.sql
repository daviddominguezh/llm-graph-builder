-- Per-tenant web channel access control.
--
-- The OpenFlow widget runs in the browser, so we gate access via a tenant-
-- scoped origin allowlist (not per agent — agents are reused across many
-- tenants). The default seed grants every agent on our infrastructure:
--   https://<tenant.slug>-*.live.openflow.build
--
-- Idempotent: columns use IF NOT EXISTS; backfill only fills empty arrays.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS web_channel_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS web_channel_allowed_origins text[] NOT NULL DEFAULT '{}';

-- Backfill: seed existing tenants with the default wildcard covering every
-- agent at their slug on our live subdomain. Only touches tenants whose array
-- is still empty so this migration is safe to rerun against a partly-migrated
-- environment.
UPDATE public.tenants
SET web_channel_allowed_origins =
  ARRAY['https://' || slug || '-*.live.openflow.build']
WHERE web_channel_allowed_origins = '{}';
