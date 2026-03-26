-- Fix: agent_execution_summary should count ALL executions, not just completed.
-- Cost and token sums remain filtered to completed executions only.

DROP MATERIALIZED VIEW IF EXISTS public.agent_execution_summary;

CREATE MATERIALIZED VIEW public.agent_execution_summary AS
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

CREATE UNIQUE INDEX idx_exec_summary_pk
  ON public.agent_execution_summary(org_id, agent_id, version);
