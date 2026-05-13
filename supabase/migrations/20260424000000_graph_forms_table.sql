-- supabase/migrations/20260424000000_graph_forms_table.sql
CREATE TABLE public.graph_forms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  form_slug    text NOT NULL,
  schema_id    text NOT NULL,
  validations  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT graph_forms_agent_slug_unique UNIQUE (agent_id, form_slug),
  FOREIGN KEY (agent_id, schema_id)
    REFERENCES public.graph_output_schemas(agent_id, schema_id)
    ON DELETE RESTRICT,
  CONSTRAINT form_slug_format
    CHECK (form_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT form_slug_length
    CHECK (char_length(form_slug) BETWEEN 1 AND 64),
  CONSTRAINT form_slug_not_reserved
    CHECK (form_slug NOT IN ('new','all','any','none','edit','delete','create',
                             'export','import','settings','admin','api','null','undefined')),
  CONSTRAINT display_name_length
    CHECK (char_length(display_name) BETWEEN 1 AND 120)
);

CREATE INDEX graph_forms_schema_idx ON public.graph_forms (agent_id, schema_id);

CREATE TRIGGER graph_forms_set_updated_at
  BEFORE UPDATE ON public.graph_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.graph_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can select forms"
  ON public.graph_forms FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    JOIN public.org_members om ON om.org_id = a.org_id
    WHERE a.id = graph_forms.agent_id
      AND om.user_id = auth.uid()
  ));

CREATE POLICY "org members can insert forms"
  ON public.graph_forms FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agents a
    JOIN public.org_members om ON om.org_id = a.org_id
    WHERE a.id = graph_forms.agent_id
      AND om.user_id = auth.uid()
  ));

CREATE POLICY "org members can update forms"
  ON public.graph_forms FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    JOIN public.org_members om ON om.org_id = a.org_id
    WHERE a.id = graph_forms.agent_id
      AND om.user_id = auth.uid()
  ));

CREATE POLICY "org members can delete forms"
  ON public.graph_forms FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.agents a
    JOIN public.org_members om ON om.org_id = a.org_id
    WHERE a.id = graph_forms.agent_id
      AND om.user_id = auth.uid()
  ));
