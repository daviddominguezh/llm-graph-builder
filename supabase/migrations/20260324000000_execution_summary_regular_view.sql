-- Convert agent_execution_summary from materialized view to regular view.
-- The materialized view required manual REFRESH calls that were never triggered,
-- causing the dashboard to show stale (empty) data.
-- A regular view is always up-to-date and the aggregation is lightweight.

DROP MATERIALIZED VIEW IF EXISTS public.agent_execution_summary;

CREATE VIEW public.agent_execution_summary AS
SELECT
  e.org_id,
  e.agent_id,
  e.version,
  COUNT(*)::integer AS total_executions,
  SUM(e.total_input_tokens) FILTER (WHERE e.status = 'completed')::integer AS total_input_tokens,
  SUM(e.total_output_tokens) FILTER (WHERE e.status = 'completed')::integer AS total_output_tokens,
  SUM(e.total_cost) FILTER (WHERE e.status = 'completed') AS total_cost,
  COUNT(DISTINCT e.tenant_id)::integer AS unique_tenants,
  COUNT(DISTINCT e.external_user_id)::integer AS unique_users,
  COUNT(DISTINCT e.session_id)::integer AS unique_sessions,
  MAX(e.started_at) AS last_execution_at
FROM public.agent_executions e
GROUP BY e.org_id, e.agent_id, e.version;
