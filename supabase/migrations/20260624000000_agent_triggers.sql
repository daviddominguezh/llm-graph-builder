CREATE TABLE public.agent_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('recurring','once','after-event')),
  recurring jsonb,
  once_datetime timestamptz,
  initial_message text NOT NULL,
  next_run_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  armed_task_epoch bigint, -- hopEpoch of the currently-armed Cloud Task (for exact cancel); null when none
  run_count int NOT NULL DEFAULT 0,
  last_status text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_triggers_agent_tenant_idx ON public.agent_triggers (agent_id, tenant_id);

ALTER TABLE public.agent_triggers ENABLE ROW LEVEL SECURITY;
-- Service role (backend) bypasses RLS. No client policies: the browser never
-- reads this table directly (web → backend routes only). Add an org-scoped
-- SELECT policy only if a future client-direct read is introduced.
