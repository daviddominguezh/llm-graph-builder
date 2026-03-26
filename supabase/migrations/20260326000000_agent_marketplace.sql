-- Agent Marketplace: template table, marketplace columns, indexes, RLS, download counter

-- ============================================================================
-- 1. Add marketplace columns to agents
-- ============================================================================

ALTER TABLE public.agents
  ADD COLUMN is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN category text NOT NULL DEFAULT 'other';

-- ============================================================================
-- 2. Create agent_templates table
-- ============================================================================

CREATE TABLE public.agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_slug text NOT NULL,
  org_avatar_url text,
  agent_slug text NOT NULL,
  agent_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  node_count integer NOT NULL DEFAULT 0,
  mcp_server_count integer NOT NULL DEFAULT 0,
  download_count integer NOT NULL DEFAULT 0,
  latest_version integer NOT NULL DEFAULT 1,
  template_graph_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. Add created_from_template_id to agents (after agent_templates exists)
-- ============================================================================

ALTER TABLE public.agents
  ADD COLUMN created_from_template_id uuid REFERENCES public.agent_templates(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. Indexes
-- ============================================================================

CREATE INDEX idx_agent_templates_category
  ON public.agent_templates(category);

CREATE INDEX idx_agent_templates_download_count
  ON public.agent_templates(download_count DESC);

CREATE INDEX idx_agent_templates_search
  ON public.agent_templates
  USING GIN (to_tsvector('english', coalesce(agent_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '')));

-- ============================================================================
-- 5. updated_at trigger (reuse existing update_updated_at function)
-- ============================================================================

CREATE TRIGGER agent_templates_updated_at
  BEFORE UPDATE ON public.agent_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 6. RLS for agent_templates
-- ============================================================================

ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_templates_select ON public.agent_templates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY agent_templates_insert ON public.agent_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY agent_templates_update ON public.agent_templates
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY agent_templates_delete ON public.agent_templates
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- ============================================================================
-- 7. Atomic download counter (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_template_downloads(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_templates
  SET download_count = download_count + 1
  WHERE id = p_template_id;
END;
$$;
