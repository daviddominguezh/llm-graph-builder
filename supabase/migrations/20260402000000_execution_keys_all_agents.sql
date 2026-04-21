-- Add all_agents flag to execution keys
-- When true, the key grants access to all agents in the org (no join table rows needed)
ALTER TABLE public.agent_execution_keys
  ADD COLUMN all_agents boolean NOT NULL DEFAULT false;
