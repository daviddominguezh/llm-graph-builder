-- App types: add app_type columns, agent-specific fields, and context items table

-- ============================================================================
-- 1. Add app_type and agent-specific columns to agents
-- ============================================================================

ALTER TABLE public.agents
  ADD COLUMN app_type text NOT NULL DEFAULT 'workflow',
  ADD COLUMN system_prompt text,
  ADD COLUMN max_steps integer;

-- ============================================================================
-- 2. Create agent_context_items table
-- ============================================================================

CREATE TABLE public.agent_context_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  content    text NOT NULL,
  UNIQUE(agent_id, sort_order)
);

ALTER TABLE public.agent_context_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read context items"
  ON public.agent_context_items FOR SELECT
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can insert context items"
  ON public.agent_context_items FOR INSERT
  WITH CHECK (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can update context items"
  ON public.agent_context_items FOR UPDATE
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can delete context items"
  ON public.agent_context_items FOR DELETE
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

-- ============================================================================
-- 3. Add app_type and template_agent_config to agent_templates
-- ============================================================================

ALTER TABLE public.agent_templates
  ADD COLUMN app_type text NOT NULL DEFAULT 'workflow',
  ADD COLUMN template_agent_config jsonb;

-- ============================================================================
-- 4. Index for filtering templates by type
-- ============================================================================

CREATE INDEX idx_agent_templates_app_type ON public.agent_templates(app_type);
