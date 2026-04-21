-- Agent skills table: persists skills attached to an agent

CREATE TABLE public.agent_skills (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name       text NOT NULL,
  description text NOT NULL DEFAULT '',
  content    text NOT NULL,
  repo_url   text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(agent_id, name)
);

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read skills"
  ON public.agent_skills FOR SELECT
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can insert skills"
  ON public.agent_skills FOR INSERT
  WITH CHECK (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can update skills"
  ON public.agent_skills FOR UPDATE
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));

CREATE POLICY "Org members can delete skills"
  ON public.agent_skills FOR DELETE
  USING (public.is_org_member(
    (SELECT org_id FROM public.agents WHERE id = agent_id), auth.uid()
  ));
