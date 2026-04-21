-- WhatsApp message templates (Meta Cloud API)
-- Org-scoped: all org members can read, only owners/admins can mutate

CREATE TABLE public.whatsapp_templates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_connection_id  UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  meta_template_id       TEXT,
  name                   TEXT NOT NULL,
  body                   TEXT NOT NULL,
  language               TEXT NOT NULL DEFAULT 'en',
  variables              JSONB NOT NULL DEFAULT '[]'::jsonb,
  category               TEXT NOT NULL CHECK (category IN ('utility', 'marketing', 'authentication')),
  description            TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('approved', 'pending', 'rejected', 'paused', 'deactivated')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_connection_id, name)
);

CREATE INDEX idx_whatsapp_templates_org_id ON public.whatsapp_templates(org_id);
CREATE INDEX idx_whatsapp_templates_channel_connection_id
  ON public.whatsapp_templates(channel_connection_id);

CREATE OR REPLACE FUNCTION update_whatsapp_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_templates_updated_at();

-- Role check helper: owner or admin in an org
CREATE OR REPLACE FUNCTION public.is_org_admin_or_owner(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.org_members
     WHERE org_id = check_org_id
       AND user_id = (SELECT auth.uid())
       AND role IN ('owner', 'admin')
  );
$$;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- All org members can view templates
CREATE POLICY whatsapp_templates_select ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

-- Only owner/admin can create
CREATE POLICY whatsapp_templates_insert ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_owner(org_id));

-- Only owner/admin can update
CREATE POLICY whatsapp_templates_update ON public.whatsapp_templates
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_owner(org_id))
  WITH CHECK (public.is_org_admin_or_owner(org_id));

-- Only owner/admin can delete
CREATE POLICY whatsapp_templates_delete ON public.whatsapp_templates
  FOR DELETE TO authenticated
  USING (public.is_org_admin_or_owner(org_id));
