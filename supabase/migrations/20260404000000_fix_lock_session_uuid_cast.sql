-- Fix: explicit uuid cast in lock_session_for_update to prevent
-- "operator does not exist: uuid = text" when called via Supabase RPC.
-- The JS client sends all parameters as JSON strings, and PostgreSQL
-- may not implicitly cast text → uuid depending on the context.

CREATE OR REPLACE FUNCTION lock_session_for_update(
  p_agent_id uuid,
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
