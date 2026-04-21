DROP FUNCTION IF EXISTS public.dashboard_timeseries(uuid);

CREATE FUNCTION public.dashboard_timeseries(p_org_id uuid)
RETURNS TABLE (
  date timestamptz,
  executions integer,
  cost numeric,
  users integer,
  tenants integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    date_bin('30 minutes'::interval, e.started_at, '2020-01-01'::timestamptz) AS date,
    COUNT(*)::integer AS executions,
    COALESCE(SUM(e.total_cost) FILTER (WHERE e.status = 'completed'), 0) AS cost,
    COUNT(DISTINCT e.external_user_id)::integer AS users,
    COUNT(DISTINCT e.tenant_id)::integer AS tenants
  FROM public.agent_executions e
  WHERE e.org_id = p_org_id
    AND e.started_at >= now() - interval '30 days'
  GROUP BY 1
  ORDER BY 1 ASC;
$$;
