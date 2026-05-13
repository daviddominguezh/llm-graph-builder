-- supabase/migrations/20260424000002_form_rpcs.sql

-- Merge pre-validated form data into conversations.metadata.forms[<form_id>]
-- under a row lock. Field-level JSONB merge (new keys overwrite, siblings preserved).
CREATE OR REPLACE FUNCTION public.write_form_data(
  p_conversation_id uuid,
  p_form_id uuid,
  p_new_fields jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
  UPDATE public.conversations
     SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           ARRAY['forms', p_form_id::text],
           COALESCE(metadata->'forms'->p_form_id::text, '{}'::jsonb) || p_new_fields,
           true
         )
   WHERE id = p_conversation_id;
END;
$$;

-- Prepend a failure record and truncate to 3 newest entries in a single UPDATE.
CREATE OR REPLACE FUNCTION public.append_form_failure(
  p_conversation_id uuid,
  p_form_id uuid,
  p_entry jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _path text[] := ARRAY['forms_diagnostics', p_form_id::text, 'lastFailures'];
  _existing jsonb;
  _new_list jsonb;
BEGIN
  PERFORM 1 FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
  SELECT COALESCE(metadata #> _path, '[]'::jsonb)
    INTO _existing
    FROM public.conversations WHERE id = p_conversation_id;
  -- Prepend newest, keep first 3.
  SELECT COALESCE(jsonb_agg(elt), '[]'::jsonb)
    INTO _new_list
    FROM (
      SELECT elt FROM jsonb_array_elements(jsonb_build_array(p_entry) || _existing)
      WITH ORDINALITY AS t(elt, idx)
      ORDER BY idx ASC LIMIT 3
    ) s;
  UPDATE public.conversations
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), _path, _new_list, true)
   WHERE id = p_conversation_id;
END;
$$;

-- Observe max array length at a canonical container path (top-level arrays only for MVP).
CREATE OR REPLACE FUNCTION public.form_array_max_length(
  p_agent uuid,
  p_tenant uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_form_id uuid,
  p_container text
) RETURNS int
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    MAX(jsonb_array_length(metadata->'forms'->p_form_id::text->p_container)),
    0
  )
  FROM public.conversations
  WHERE agent_id = p_agent AND tenant_id = p_tenant
    AND created_at >= p_from AND created_at < p_to
    AND jsonb_typeof(metadata->'forms'->p_form_id::text->p_container) = 'array';
$$;

GRANT EXECUTE ON FUNCTION public.write_form_data TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_form_failure TO authenticated;
GRANT EXECUTE ON FUNCTION public.form_array_max_length TO authenticated;
