-- Adds structured tool-reference columns to graph_edge_preconditions for tool_call rows.
-- Replaces the JSON-encoded blob in `value` with explicit columns:
--   provider_type ('builtin' | 'mcp')
--   provider_id   (canonical provider id)
--   tool_name     (tool name)
--
-- Backfill strategy:
-- 1. Add columns nullable.
-- 2. For each existing tool_call row, parse `value` as JSON. If valid and shaped
--    correctly, populate the three columns. If unparseable (legacy rows that
--    stored the bare tool name as the value before the JSON encoding bridge),
--    fall back to provider_type='builtin', provider_id='calendar', tool_name=value.
-- 3. The columns stay nullable — non-tool_call rows (user_said / agent_decision)
--    have NULL for all three. Application code reads them only when type='tool_call'.
--
-- After this migration, the codebase reads/writes tool_ref_columns directly.
-- The `value` column for tool_call rows becomes redundant (and is no longer
-- written by new code). Existing rows keep their old `value` for one release
-- so a rollback is non-destructive; a follow-up migration can drop `value` for
-- tool_call rows after the deploy transition.

ALTER TABLE public.graph_edge_preconditions
  ADD COLUMN provider_type text NULL,
  ADD COLUMN provider_id   text NULL,
  ADD COLUMN tool_name     text NULL;

-- Type discipline: only allow the canonical values.
ALTER TABLE public.graph_edge_preconditions
  ADD CONSTRAINT graph_edge_preconditions_provider_type_check
  CHECK (provider_type IS NULL OR provider_type IN ('builtin', 'mcp'));

-- Backfill tool_call rows from JSON-encoded value (the transitional bridge in
-- packages/backend/src/db/queries/graphAssemblers.ts and edgeOperations.ts).
-- Rows whose value is valid JSON with shape { providerType, providerId, toolName }
-- are filled; everything else falls back to builtin/calendar/<value>.
DO $$
DECLARE
  r record;
  parsed jsonb;
BEGIN
  FOR r IN
    SELECT id, value FROM public.graph_edge_preconditions WHERE type = 'tool_call'
  LOOP
    BEGIN
      parsed := r.value::jsonb;
      IF parsed ? 'providerType' AND parsed ? 'providerId' AND parsed ? 'toolName' THEN
        UPDATE public.graph_edge_preconditions
          SET provider_type = parsed->>'providerType',
              provider_id   = parsed->>'providerId',
              tool_name     = parsed->>'toolName'
          WHERE id = r.id;
      ELSE
        UPDATE public.graph_edge_preconditions
          SET provider_type = 'builtin',
              provider_id   = 'calendar',
              tool_name     = r.value
          WHERE id = r.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Not valid JSON — treat as legacy bare tool name; same fallback as above.
      UPDATE public.graph_edge_preconditions
        SET provider_type = 'builtin',
            provider_id   = 'calendar',
            tool_name     = r.value
        WHERE id = r.id;
    END;
  END LOOP;
END $$;

-- Index for tool_call lookups by provider + tool — useful for admin/migration tooling.
CREATE INDEX IF NOT EXISTS idx_graph_edge_preconditions_tool_ref
  ON public.graph_edge_preconditions (provider_type, provider_id, tool_name)
  WHERE type = 'tool_call';

-- Update upsert_edge_tx to populate structured columns. We read the new fields
-- from the JSON payload (`elem->'tool'`) when present; the TS write path is
-- updated alongside this migration to send the structured ref. Legacy callers
-- that still send JSON-encoded value continue to work — the read path reads
-- columns first and falls back to value-parse when columns are NULL.
CREATE OR REPLACE FUNCTION public.upsert_edge_tx(
  p_agent_id uuid,
  p_from_node text,
  p_to_node text,
  p_preconditions jsonb DEFAULT '[]'::jsonb,
  p_context_preconditions jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.agents a
    JOIN public.org_members om ON om.org_id = a.org_id
    WHERE a.id = p_agent_id AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'AGENT_NOT_FOUND:%', p_agent_id;
  END IF;

  INSERT INTO public.graph_edges (agent_id, from_node, to_node)
  VALUES (p_agent_id, p_from_node, p_to_node)
  ON CONFLICT (agent_id, from_node, to_node) DO UPDATE SET from_node = excluded.from_node
  RETURNING id INTO v_edge_id;

  DELETE FROM public.graph_edge_preconditions WHERE edge_id = v_edge_id;
  DELETE FROM public.graph_edge_context_preconditions WHERE edge_id = v_edge_id;

  IF jsonb_array_length(p_preconditions) > 0 THEN
    INSERT INTO public.graph_edge_preconditions (
      edge_id, type, value, description, tool_fields,
      provider_type, provider_id, tool_name
    )
    SELECT DISTINCT ON ((elem->>'type'), (elem->>'value'))
      v_edge_id,
      (elem->>'type')::text,
      (elem->>'value')::text,
      (elem->>'description')::text,
      CASE WHEN elem ? 'toolFields' THEN (elem->'toolFields') ELSE NULL END,
      CASE
        WHEN (elem->>'type') = 'tool_call' AND elem ? 'tool'
          THEN (elem->'tool'->>'providerType')
        ELSE NULL
      END,
      CASE
        WHEN (elem->>'type') = 'tool_call' AND elem ? 'tool'
          THEN (elem->'tool'->>'providerId')
        ELSE NULL
      END,
      CASE
        WHEN (elem->>'type') = 'tool_call' AND elem ? 'tool'
          THEN (elem->'tool'->>'toolName')
        ELSE NULL
      END
    FROM jsonb_array_elements(p_preconditions) AS elem;
  END IF;

  IF p_context_preconditions IS NOT NULL THEN
    INSERT INTO public.graph_edge_context_preconditions (edge_id, preconditions, jump_to)
    VALUES (
      v_edge_id,
      array(SELECT jsonb_array_elements_text(p_context_preconditions->'preconditions')),
      (p_context_preconditions->>'jumpTo')::text
    );
  END IF;

  RETURN v_edge_id;
END;
$$;
