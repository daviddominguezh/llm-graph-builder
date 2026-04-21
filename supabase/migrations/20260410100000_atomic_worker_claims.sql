-- Atomically claim N pending child executions
CREATE OR REPLACE FUNCTION claim_pending_child_executions(p_limit integer)
RETURNS SETOF pending_child_executions
LANGUAGE sql AS $$
  UPDATE pending_child_executions
  SET status = 'processing', last_attempt_at = now()
  WHERE id IN (
    SELECT id FROM pending_child_executions
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- Atomically claim N pending resumes
CREATE OR REPLACE FUNCTION claim_pending_resumes(p_limit integer)
RETURNS SETOF pending_resumes
LANGUAGE sql AS $$
  UPDATE pending_resumes
  SET status = 'processing', last_attempt_at = now()
  WHERE id IN (
    SELECT id FROM pending_resumes
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
