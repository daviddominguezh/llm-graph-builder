-- Add slug to tenants so they can be addressed by URL segment.
-- Slugs are unique within an organization (not globally).

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill existing rows from name using the same slugify rules as the backend.
UPDATE public.tenants
SET slug = regexp_replace(
  regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'),
  '(^-+|-+$)', '', 'g'
)
WHERE slug IS NULL;

-- Resolve intra-org collisions by appending a numeric suffix to duplicates.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY org_id, slug ORDER BY created_at) AS rn
  FROM public.tenants
)
UPDATE public.tenants t
SET slug = t.slug || '-' || (r.rn - 1)::text
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

-- Ensure no empty slugs remain (name was entirely non-alphanumeric).
UPDATE public.tenants
SET slug = 'tenant-' || substr(id::text, 1, 8)
WHERE slug IS NULL OR slug = '';

ALTER TABLE public.tenants ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_org_slug_unique UNIQUE (org_id, slug);

CREATE INDEX IF NOT EXISTS idx_tenants_org_slug ON public.tenants(org_id, slug);

-- Helper: resolve (org_id, slug) → tenant id, bypassing RLS for use in other policies.
CREATE OR REPLACE FUNCTION public.tenant_id_by_slug(p_org_id uuid, p_slug text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.tenants WHERE org_id = p_org_id AND slug = p_slug;
$$;
