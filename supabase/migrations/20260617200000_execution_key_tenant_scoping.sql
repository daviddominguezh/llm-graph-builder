-- 20260617200000_execution_key_tenant_scoping.sql
-- Tenant scoping for agent execution keys, mirroring the existing all_agents +
-- agent_execution_key_agents pattern (see 20260321000000_security_and_execution_tables.sql).
--
-- Naming note: the plan referred to "execution_keys" and "execution_key_agents", but the
-- actual tables in this codebase are agent_execution_keys / agent_execution_key_agents
-- with a join column named key_id (not execution_key_id). Mirroring exactly.

ALTER TABLE public.agent_execution_keys
  ADD COLUMN all_tenants BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE public.agent_execution_key_tenants (
  key_id    UUID NOT NULL REFERENCES public.agent_execution_keys(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)              ON DELETE CASCADE,
  PRIMARY KEY (key_id, tenant_id)
);

CREATE INDEX idx_agent_execution_key_tenants_reverse
  ON public.agent_execution_key_tenants(tenant_id, key_id);

ALTER TABLE public.agent_execution_key_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_execution_key_tenants_select ON public.agent_execution_key_tenants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_execution_keys k
      WHERE k.id = key_id
        AND public.is_org_member(k.org_id, auth.uid())
    )
  );

CREATE POLICY agent_execution_key_tenants_insert ON public.agent_execution_key_tenants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_execution_keys k
      WHERE k.id = key_id
        AND public.is_org_member(k.org_id, auth.uid())
    )
  );

CREATE POLICY agent_execution_key_tenants_update ON public.agent_execution_key_tenants
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_execution_keys k
      WHERE k.id = key_id
        AND public.is_org_member(k.org_id, auth.uid())
    )
  );

CREATE POLICY agent_execution_key_tenants_delete ON public.agent_execution_key_tenants
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_execution_keys k
      WHERE k.id = key_id
        AND public.is_org_member(k.org_id, auth.uid())
    )
  );
