-- Agent/Workflow Composition schema changes

-- 1. Agent stack entries (tracks parent/child nesting per session)
CREATE TABLE agent_stack_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  depth integer NOT NULL,
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  parent_execution_id uuid REFERENCES agent_executions(id),
  parent_tool_output_message_id uuid,
  parent_session_state jsonb,
  agent_config jsonb NOT NULL,
  app_type text NOT NULL CHECK (app_type IN ('agent', 'workflow')),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, depth)
);

CREATE INDEX idx_stack_entries_session ON agent_stack_entries(session_id);
CREATE INDEX idx_stack_entries_execution ON agent_stack_entries(execution_id);

ALTER TABLE agent_stack_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_stack_entries" ON agent_stack_entries
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Pending resumes (durable resume intent for reliability)
CREATE TABLE pending_resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id),
  parent_execution_id uuid NOT NULL REFERENCES agent_executions(id),
  parent_tool_output_message_id uuid NOT NULL,
  child_output text NOT NULL,
  child_status text NOT NULL CHECK (child_status IN ('success', 'error')),
  parent_session_state jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_execution_id)
);

CREATE INDEX idx_pending_resumes_status ON pending_resumes(status) WHERE status = 'pending';

ALTER TABLE pending_resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pending_resumes" ON pending_resumes
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Agent execution events (SSE event persistence for replay)
CREATE TABLE agent_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES agent_executions(id),
  org_id uuid NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(execution_id, sequence)
);

CREATE INDEX idx_execution_events_replay ON agent_execution_events(execution_id, sequence);

ALTER TABLE agent_execution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_events" ON agent_execution_events
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "service_role_insert_events" ON agent_execution_events
  FOR INSERT WITH CHECK (true);

-- 4. Add parent_execution_id and is_dynamic_child to agent_executions
ALTER TABLE agent_executions ADD COLUMN IF NOT EXISTS parent_execution_id uuid REFERENCES agent_executions(id);
ALTER TABLE agent_executions ADD COLUMN IF NOT EXISTS is_dynamic_child boolean NOT NULL DEFAULT false;

CREATE INDEX idx_agent_executions_parent ON agent_executions(parent_execution_id)
  WHERE parent_execution_id IS NOT NULL;

CREATE INDEX idx_agent_executions_top_level ON agent_executions(org_id, agent_id, version)
  WHERE parent_execution_id IS NULL AND status = 'completed';

-- 5. Allow UPDATE on agent_execution_messages for sentinel replacement
CREATE POLICY "service_role_update_messages" ON agent_execution_messages
  FOR UPDATE USING (true) WITH CHECK (true);
