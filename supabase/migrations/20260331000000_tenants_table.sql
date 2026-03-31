-- Tenants table: manages tenants within an organization

CREATE TABLE public.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE INDEX idx_tenants_org_id ON public.tenants(org_id);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read tenants"
  ON public.tenants FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can insert tenants"
  ON public.tenants FOR INSERT
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can update tenants"
  ON public.tenants FOR UPDATE
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can delete tenants"
  ON public.tenants FOR DELETE
  USING (is_org_member(org_id, auth.uid()));
