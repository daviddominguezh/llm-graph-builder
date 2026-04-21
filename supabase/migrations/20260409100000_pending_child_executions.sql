-- Durable child execution dispatch table
CREATE TABLE pending_child_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  parent_execution_id uuid NOT NULL REFERENCES agent_executions(id),
  agent_config jsonb NOT NULL,
  org_id uuid NOT NULL,
  api_key_enc text NOT NULL,
  app_type text NOT NULL CHECK (app_type IN ('agent', 'workflow')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(execution_id)
);

CREATE INDEX idx_pending_child_executions_status
  ON pending_child_executions(status) WHERE status = 'pending';

ALTER TABLE pending_child_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_child_executions" ON pending_child_executions
  FOR ALL USING (true) WITH CHECK (true);

-- Add 'suspended' status to agent_executions for parent agents waiting on children
-- First check if the constraint exists and what values it allows
DO $$
BEGIN
  -- Try to add the suspended status
  -- If the check constraint doesn't exist yet, this is fine
  -- If it does exist, we need to drop and recreate it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'agent_executions'
    AND constraint_type = 'CHECK'
    AND constraint_name = 'agent_executions_status_check'
  ) THEN
    ALTER TABLE agent_executions DROP CONSTRAINT agent_executions_status_check;
    ALTER TABLE agent_executions ADD CONSTRAINT agent_executions_status_check
      CHECK (status IN ('running', 'completed', 'failed', 'suspended'));
  END IF;
END $$;
