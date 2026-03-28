CREATE OR REPLACE VIEW public.tenant_execution_summary AS
SELECT
  e.org_id,
  e.tenant_id,
  COUNT(*)::integer AS total_executions,
  COUNT(*) FILTER (WHERE e.status = 'failed')::integer AS failed_executions,
  SUM(e.total_input_tokens) FILTER (WHERE e.status = 'completed')::integer AS total_input_tokens,
  SUM(e.total_output_tokens) FILTER (WHERE e.status = 'completed')::integer AS total_output_tokens,
  SUM(e.total_cost) FILTER (WHERE e.status = 'completed') AS total_cost,
  COUNT(DISTINCT e.agent_id)::integer AS unique_agents,
  COUNT(DISTINCT e.external_user_id)::integer AS unique_users,
  COUNT(DISTINCT e.session_id)::integer AS unique_sessions,
  MAX(e.started_at) AS last_execution_at
FROM public.agent_executions e
GROUP BY e.org_id, e.tenant_id;
