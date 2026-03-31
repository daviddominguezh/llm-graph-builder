-- ============================================================================
-- GitHub App Installations
-- ============================================================================

CREATE TABLE github_installations (
  installation_id  BIGINT PRIMARY KEY,
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_name     TEXT NOT NULL,
  account_type     TEXT NOT NULL CHECK (account_type IN ('Organization', 'User')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_installations_org ON github_installations (org_id);

-- ============================================================================
-- GitHub Installation Repos
-- ============================================================================

CREATE TABLE github_installation_repos (
  id               BIGSERIAL PRIMARY KEY,
  installation_id  BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE CASCADE,
  repo_id          BIGINT NOT NULL,
  repo_full_name   TEXT NOT NULL,
  private          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No updated_at — rows are inserted or deleted, never updated in place.
  UNIQUE(installation_id, repo_id)
);

CREATE INDEX idx_github_repos_installation ON github_installation_repos (installation_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_installation_repos ENABLE ROW LEVEL SECURITY;

-- Users can read installations for orgs they belong to
CREATE POLICY "github_installations_read" ON github_installations
FOR SELECT USING (public.is_org_member(org_id));

-- Repos readable through their installation's org
CREATE POLICY "github_repos_read" ON github_installation_repos
FOR SELECT USING (
  installation_id IN (
    SELECT gi.installation_id FROM github_installations gi
    WHERE public.is_org_member(gi.org_id)
  )
);

-- ============================================================================
-- updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_github_installations_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_github_installations_updated_at
  BEFORE UPDATE ON github_installations
  FOR EACH ROW EXECUTE FUNCTION public.update_github_installations_updated_at();
