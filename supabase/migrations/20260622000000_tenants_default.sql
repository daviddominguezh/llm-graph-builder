-- SP1: default-tenant subsystem. Additive only; RLS unchanged (column rides
-- existing is_org_member(org_id, auth.uid()) policies on public.tenants).

-- 1. Column + one-default-per-org partial unique index
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_one_default_per_org
  ON public.tenants (org_id) WHERE is_default;

-- 2. Shared hyphen-free, denylist-safe, globally-unique slug generator
CREATE OR REPLACE FUNCTION public.next_default_tenant_slug(org_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
  denylist text[] := ARRAY[
    'app','api','www','live','admin','assets','cdn','docs','status','root',
    'support','help','blog','mail','email','auth','oauth','static','public',
    'internal','staging','preview','dev','localhost'
  ];
BEGIN
  base := substr(regexp_replace(lower(coalesce(org_name, '')), '[^a-z0-9]', '', 'g'), 1, 37);
  IF base = '' OR base = ANY(denylist) THEN
    base := 'tenant';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = candidate) LOOP
    n := n + 1;
    candidate := base || n::text;
  END LOOP;
  RETURN candidate;
END; $$;

-- 3. AFTER INSERT trigger: create the org's default tenant atomically
CREATE OR REPLACE FUNCTION public.create_default_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.tenants (org_id, name, slug, is_default, avatar_url)
  VALUES (new.id, new.name, public.next_default_tenant_slug(new.name), true, new.avatar_url);
  RETURN new;
END; $$;

CREATE TRIGGER on_org_created_default_tenant
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_default_tenant();

-- 4. Identity-lock + delete guards (BEFORE triggers, GUC-gated)
CREATE OR REPLACE FUNCTION public.guard_default_tenant_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF old.is_default AND (
       new.name <> old.name
       OR new.slug <> old.slug
       OR new.avatar_url IS DISTINCT FROM old.avatar_url
       OR new.is_default <> old.is_default
     ) THEN
    IF current_setting('app.mirror_default_tenant', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'default tenant identity is locked';
    END IF;
  END IF;
  RETURN new;
END; $$;

CREATE TRIGGER trg_guard_default_tenant_update
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_default_tenant_update();

CREATE OR REPLACE FUNCTION public.guard_default_tenant_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF old.is_default
     AND current_setting('app.allow_default_tenant_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'default tenant cannot be deleted';
  END IF;
  RETURN old;
END; $$;

CREATE TRIGGER trg_guard_default_tenant_delete
  BEFORE DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_default_tenant_delete();

-- 5. SECURITY DEFINER RPCs: set the GUC transaction-locally + write atomically
CREATE OR REPLACE FUNCTION public.set_default_tenant_identity(
  p_org_id uuid, p_name text, p_slug text, p_avatar_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM set_config('app.mirror_default_tenant', 'on', true);
  UPDATE public.tenants
     SET name = p_name, slug = p_slug, avatar_url = p_avatar_url, updated_at = now()
   WHERE org_id = p_org_id AND is_default;
END; $$;

CREATE OR REPLACE FUNCTION public.set_default_tenant_avatar(
  p_org_id uuid, p_avatar_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM set_config('app.mirror_default_tenant', 'on', true);
  UPDATE public.tenants
     SET avatar_url = p_avatar_url, updated_at = now()
   WHERE org_id = p_org_id AND is_default;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_org_with_default_tenant(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM set_config('app.allow_default_tenant_delete', 'on', true);
  DELETE FROM public.organizations WHERE id = p_org_id;
END; $$;

-- 6. Backfill: one org-named default tenant per existing org (idempotent)
DO $backfill$
DECLARE
  o record;
  existing_id uuid;
  new_slug text;
BEGIN
  FOR o IN
    SELECT id, name, avatar_url FROM public.organizations org
    WHERE NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.org_id = org.id AND t.is_default)
  LOOP
    SELECT id INTO existing_id FROM public.tenants
     WHERE org_id = o.id AND name = o.name LIMIT 1;
    IF existing_id IS NOT NULL THEN
      PERFORM set_config('app.mirror_default_tenant', 'on', true);
      UPDATE public.tenants SET is_default = true WHERE id = existing_id;
    ELSE
      new_slug := public.next_default_tenant_slug(o.name);
      INSERT INTO public.tenants (org_id, name, slug, is_default, avatar_url)
      VALUES (o.id, o.name, new_slug, true, o.avatar_url)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $backfill$;
