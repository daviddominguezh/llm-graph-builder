-- Tenants table: manages tenants within an organization

CREATE TABLE public.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  avatar_url text,
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

-- Helper to look up tenant org_id bypassing RLS (for use in storage policies)
CREATE OR REPLACE FUNCTION public.tenant_org_id(p_tenant_id uuid)
RETURNS uuid AS $$
BEGIN
  RETURN (SELECT org_id FROM public.tenants WHERE id = p_tenant_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tenant avatar storage bucket and policies
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-avatars', 'tenant-avatars', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read tenant avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-avatars');

CREATE POLICY "Org members can upload tenant avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-avatars'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );

CREATE POLICY "Org members can update tenant avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'tenant-avatars'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );

CREATE POLICY "Org members can delete tenant avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tenant-avatars'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );
