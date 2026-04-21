-- Move tenant slugs from org-scoped to globally unique, add format CHECK,
-- and repoint the tenant_id_by_slug RPC. No tenant rows exist yet
-- (confirmed with product); backfill/normalization unnecessary.

-- Preflight: fail loudly with a descriptive message if staging has rows
-- from the old slug generator (which inserts hyphens). Without this, the
-- CHECK constraint below would fail with a bare check_violation.
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug !~ '^[a-z0-9]{1,40}$') THEN
    RAISE EXCEPTION
      'tenants.slug contains rows incompatible with the hyphen-free format. '
      'Review and normalize before retrying. '
      'Query: SELECT id, slug FROM public.tenants WHERE slug !~ ''^[a-z0-9]{1,40}$'';';
  END IF;
END
$preflight$;

-- Drop RPC first so dependency errors (if any RLS policy references the
-- old signature) surface before schema changes, not after partial success.
DROP FUNCTION IF EXISTS public.tenant_id_by_slug(uuid, text);

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_org_slug_unique;
DROP INDEX IF EXISTS public.idx_tenants_org_slug;

ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);

ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_format
  CHECK (
    slug ~ '^[a-z0-9]{1,40}$'
    AND slug NOT IN (
      'app','api','www','live','admin','assets','cdn','docs','status','root',
      'support','help','blog','mail','email','auth','oauth','static','public',
      'internal','staging','preview','dev','localhost'
    )
  );

-- UNIQUE constraint above auto-creates a supporting index; no explicit CREATE INDEX needed.

CREATE OR REPLACE FUNCTION public.tenant_id_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.tenants WHERE slug = p_slug;
$$;
