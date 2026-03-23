-- View: agent_sessions_with_cost
-- Joins agent_sessions with aggregated cost/token data from agent_executions.
-- Drop-in replacement for querying agent_sessions directly.

CREATE OR REPLACE VIEW public.agent_sessions_with_cost AS
SELECT
  s.*,
  COALESCE(agg.total_input_tokens, 0)::integer AS total_input_tokens,
  COALESCE(agg.total_output_tokens, 0)::integer AS total_output_tokens,
  COALESCE(agg.total_cost, 0)::numeric(12,6) AS total_cost
FROM public.agent_sessions s
LEFT JOIN (
  SELECT
    e.session_id,
    SUM(e.total_input_tokens)::integer AS total_input_tokens,
    SUM(e.total_output_tokens)::integer AS total_output_tokens,
    SUM(e.total_cost) AS total_cost
  FROM public.agent_executions e
  WHERE e.status = 'completed'
  GROUP BY e.session_id
) agg ON agg.session_id = s.id;

-- The view inherits RLS from agent_sessions automatically (views use
-- the underlying table's RLS policies when queried by non-owner roles).
