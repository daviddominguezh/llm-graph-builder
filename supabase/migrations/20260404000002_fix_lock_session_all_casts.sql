-- Fix: add explicit uuid casts for all uuid columns in lock_session_for_update.
-- tenant_id is uuid (FK to tenants.id), agent_id is uuid (FK to agents.id).
-- PostgREST/PL/pgSQL no longer implicitly casts text → uuid in all contexts.

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
    AND tenant_id = p_tenant_id::uuid
    AND user_id = p_user_id
    AND session_id = p_session_id
    AND channel = p_channel
  FOR UPDATE NOWAIT;
END;
$$;
