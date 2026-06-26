-- Knowledge base: org-level RAG and KV store definitions plus per-(store, tenant) KV entries.
-- Slugs are alphanumeric only (matches tenants.slug format) and unique per (org_id).

CREATE TABLE public.rag_stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  UNIQUE (org_id, slug),
  CONSTRAINT rag_stores_slug_format CHECK (slug ~ '^[a-z0-9]{1,40}$')
);
CREATE INDEX idx_rag_stores_org ON public.rag_stores(org_id);

CREATE TABLE public.kv_stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name),
  UNIQUE (org_id, slug),
  CONSTRAINT kv_stores_slug_format CHECK (slug ~ '^[a-z0-9]{1,40}$')
);
CREATE INDEX idx_kv_stores_org ON public.kv_stores(org_id);

CREATE TABLE public.kv_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kv_store_id  uuid NOT NULL REFERENCES public.kv_stores(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key          text NOT NULL,
  value        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kv_store_id, tenant_id, key)
);
CREATE INDEX idx_kv_entries_store_tenant ON public.kv_entries(kv_store_id, tenant_id);

-- SECURITY DEFINER helper: resolve a kv_store's org_id without hitting RLS (used in
-- kv_entries policies — direct subqueries against kv_stores under the user's RLS
-- context would be a recursion hazard).
CREATE OR REPLACE FUNCTION public.kv_store_org_id(p_kv_store_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id FROM public.kv_stores WHERE id = p_kv_store_id;
$$;

-- RLS: rag_stores
ALTER TABLE public.rag_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read rag_stores"
  ON public.rag_stores FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Org members can insert rag_stores"
  ON public.rag_stores FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Org members can update rag_stores"
  ON public.rag_stores FOR UPDATE USING (public.is_org_member(org_id));
CREATE POLICY "Org members can delete rag_stores"
  ON public.rag_stores FOR DELETE USING (public.is_org_member(org_id));

-- RLS: kv_stores
ALTER TABLE public.kv_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read kv_stores"
  ON public.kv_stores FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Org members can insert kv_stores"
  ON public.kv_stores FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Org members can update kv_stores"
  ON public.kv_stores FOR UPDATE USING (public.is_org_member(org_id));
CREATE POLICY "Org members can delete kv_stores"
  ON public.kv_stores FOR DELETE USING (public.is_org_member(org_id));

-- RLS: kv_entries (org membership resolved via the helper)
ALTER TABLE public.kv_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read kv_entries"
  ON public.kv_entries FOR SELECT
  USING (public.is_org_member(public.kv_store_org_id(kv_store_id)));
CREATE POLICY "Org members can insert kv_entries"
  ON public.kv_entries FOR INSERT
  WITH CHECK (public.is_org_member(public.kv_store_org_id(kv_store_id)));
CREATE POLICY "Org members can update kv_entries"
  ON public.kv_entries FOR UPDATE
  USING (public.is_org_member(public.kv_store_org_id(kv_store_id)));
CREATE POLICY "Org members can delete kv_entries"
  ON public.kv_entries FOR DELETE
  USING (public.is_org_member(public.kv_store_org_id(kv_store_id)));
