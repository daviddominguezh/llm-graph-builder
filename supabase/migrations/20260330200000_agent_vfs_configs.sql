-- ============================================================================
-- Agent VFS Configs (per-tenant repo binding)
-- ============================================================================

CREATE TABLE agent_vfs_configs (
  id               BIGSERIAL PRIMARY KEY,
  agent_id         UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Intentionally references installation_id (GitHub's numeric ID / PK),
  -- so webhook handlers can correlate by GitHub's installation_id without a join.
  installation_id  BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE CASCADE,
  repo_id          BIGINT NOT NULL,
  repo_full_name   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, org_id)
);

CREATE INDEX idx_agent_vfs_configs_agent ON agent_vfs_configs (agent_id);
CREATE INDEX idx_agent_vfs_configs_org ON agent_vfs_configs (org_id);

-- ============================================================================
-- VFS runtime settings on agents table
-- ============================================================================

ALTER TABLE agents ADD COLUMN vfs_settings JSONB DEFAULT NULL
  CHECK (vfs_settings IS NULL OR (
    (vfs_settings ? 'enabled') AND (vfs_settings->>'enabled')::boolean = true
  ));

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE agent_vfs_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_vfs_configs_select" ON agent_vfs_configs
FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "agent_vfs_configs_insert" ON agent_vfs_configs
FOR INSERT WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "agent_vfs_configs_update" ON agent_vfs_configs
FOR UPDATE
USING (public.is_org_member(org_id))
WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "agent_vfs_configs_delete" ON agent_vfs_configs
FOR DELETE USING (public.is_org_member(org_id));

-- ============================================================================
-- updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_agent_vfs_configs_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_agent_vfs_configs_updated
  BEFORE UPDATE ON agent_vfs_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_vfs_configs_updated_at();

-- ============================================================================
-- RPC function for joined query (used by backend)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_agent_vfs_configs(p_agent_id UUID)
RETURNS TABLE (
  id BIGINT, agent_id UUID, org_id UUID,
  installation_id BIGINT, repo_id BIGINT, repo_full_name TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  installation_status TEXT, account_name TEXT, repo_exists BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT avc.id, avc.agent_id, avc.org_id,
         avc.installation_id, avc.repo_id, avc.repo_full_name,
         avc.created_at, avc.updated_at,
         gi.status, gi.account_name,
         EXISTS (
           SELECT 1 FROM public.github_installation_repos gir
           WHERE gir.installation_id = avc.installation_id
             AND gir.repo_id = avc.repo_id
         )
  FROM public.agent_vfs_configs avc
  JOIN public.github_installations gi ON gi.installation_id = avc.installation_id
  WHERE avc.agent_id = p_agent_id
  ORDER BY avc.created_at;
$$;

-- Single-config dispatch query
CREATE OR REPLACE FUNCTION public.get_agent_vfs_config_for_dispatch(p_agent_id UUID, p_org_id UUID)
RETURNS TABLE (
  id BIGINT, agent_id UUID, org_id UUID,
  installation_id BIGINT, repo_id BIGINT, repo_full_name TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  installation_status TEXT, account_name TEXT, repo_exists BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT avc.id, avc.agent_id, avc.org_id,
         avc.installation_id, avc.repo_id, avc.repo_full_name,
         avc.created_at, avc.updated_at,
         gi.status, gi.account_name,
         EXISTS (
           SELECT 1 FROM public.github_installation_repos gir
           WHERE gir.installation_id = avc.installation_id
             AND gir.repo_id = avc.repo_id
         )
  FROM public.agent_vfs_configs avc
  JOIN public.github_installations gi ON gi.installation_id = avc.installation_id
  WHERE avc.agent_id = p_agent_id AND avc.org_id = p_org_id
  LIMIT 1;
$$;
