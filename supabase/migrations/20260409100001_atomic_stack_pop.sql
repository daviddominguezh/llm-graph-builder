CREATE OR REPLACE FUNCTION pop_stack_entry(p_session_id uuid)
RETURNS SETOF agent_stack_entries
LANGUAGE sql
AS $$
  DELETE FROM agent_stack_entries
  WHERE id = (
    SELECT id FROM agent_stack_entries
    WHERE session_id = p_session_id
    ORDER BY depth DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
