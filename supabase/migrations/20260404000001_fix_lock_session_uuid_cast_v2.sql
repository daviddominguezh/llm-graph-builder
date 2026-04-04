-- Fix: accept p_agent_id as text and cast internally.
-- The Supabase JS client sends RPC params as JSON strings, so PostgREST
-- passes them as text. If the function signature expects uuid, PostgREST
-- cannot find a matching function overload.

DROP FUNCTION IF EXISTS lock_session_for_update(uuid, integer, text, text, text, text);
DROP FUNCTION IF EXISTS lock_session_for_update(text, integer, text, text, text, text);

CREATE OR REPLACE FUNCTION lock_session_for_update(
  p_agent_id text,
  p_version integer,
  p_tenant_id text,
  p_user_id text,
  p_session_id text,
  p_channel text
)
RETURNS SETOF agent_sessions
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.agent_sessions
  WHERE agent_id = p_agent_id::uuid
    AND version = p_version
    AND tenant_id = p_tenant_id
    AND user_id = p_user_id
    AND session_id = p_session_id
    AND channel = p_channel
  FOR UPDATE NOWAIT;
END;
$$;
