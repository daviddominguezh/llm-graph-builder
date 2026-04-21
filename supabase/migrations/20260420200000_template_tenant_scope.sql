-- Move whatsapp_templates from org-scoped to tenant-scoped.
-- A template now belongs to a tenant (and by transitivity to an org and a WABA via channel_connection).

-- 1. Drop existing policies we're about to replace.
DROP POLICY IF EXISTS whatsapp_templates_select ON public.whatsapp_templates;
DROP POLICY IF EXISTS whatsapp_templates_insert ON public.whatsapp_templates;
DROP POLICY IF EXISTS whatsapp_templates_update ON public.whatsapp_templates;
DROP POLICY IF EXISTS whatsapp_templates_delete ON public.whatsapp_templates;

-- 2. Add tenant_id column. Backfill from channel_connections when possible,
--    otherwise from a random tenant in the same org (safety net for pre-existing rows —
--    there should be none in practice since this feature is new).
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE public.whatsapp_templates wt
SET tenant_id = cc.tenant_id
FROM public.channel_connections cc
WHERE wt.channel_connection_id = cc.id AND wt.tenant_id IS NULL;

-- Any row whose channel_connection has vanished gets the first tenant in its org,
-- or gets deleted if no tenant exists.
DELETE FROM public.whatsapp_templates WHERE tenant_id IS NULL AND org_id IS NULL;

UPDATE public.whatsapp_templates wt
SET tenant_id = (
  SELECT id FROM public.tenants t WHERE t.org_id = wt.org_id ORDER BY created_at LIMIT 1
)
WHERE tenant_id IS NULL;

DELETE FROM public.whatsapp_templates WHERE tenant_id IS NULL;

ALTER TABLE public.whatsapp_templates
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT whatsapp_templates_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 3. Replace the composite unique constraint to be tenant-scoped rather than connection-scoped.
--    Template names must be unique within a tenant (often a single WABA per tenant anyway).
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_channel_connection_id_name_key;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_tenant_name_unique UNIQUE (tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant_id ON public.whatsapp_templates(tenant_id);

-- 4. Drop the now-redundant org_id column (it's derivable via tenant_id).
ALTER TABLE public.whatsapp_templates DROP COLUMN IF EXISTS org_id;

-- 5. Rewrite RLS to go through tenant_org_id().
--    SELECT: any org member (via tenant's org).
--    INSERT/UPDATE/DELETE: owner/admin of the tenant's org.
CREATE POLICY whatsapp_templates_select ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (public.is_org_member(public.tenant_org_id(tenant_id)));

CREATE POLICY whatsapp_templates_insert ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_owner(public.tenant_org_id(tenant_id)));

CREATE POLICY whatsapp_templates_update ON public.whatsapp_templates
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_owner(public.tenant_org_id(tenant_id)))
  WITH CHECK (public.is_org_admin_or_owner(public.tenant_org_id(tenant_id)));

CREATE POLICY whatsapp_templates_delete ON public.whatsapp_templates
  FOR DELETE TO authenticated
  USING (public.is_org_admin_or_owner(public.tenant_org_id(tenant_id)));
