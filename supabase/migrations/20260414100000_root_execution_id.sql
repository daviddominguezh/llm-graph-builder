-- Add root_execution_id to composition tables for N-depth notification routing

ALTER TABLE agent_stack_entries
  ADD COLUMN root_execution_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE pending_child_executions
  ADD COLUMN root_execution_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE pending_resumes
  ADD COLUMN root_execution_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Backfill existing rows: root = parent (or self if no parent)
UPDATE agent_stack_entries
  SET root_execution_id = COALESCE(parent_execution_id, execution_id);

UPDATE pending_child_executions
  SET root_execution_id = parent_execution_id;

UPDATE pending_resumes
  SET root_execution_id = parent_execution_id;
