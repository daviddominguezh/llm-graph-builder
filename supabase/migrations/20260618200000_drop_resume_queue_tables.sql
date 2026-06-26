-- The worker-claim RPCs depend on the table types via SETOF return,
-- so they must be dropped before the tables.
DROP FUNCTION IF EXISTS claim_pending_child_executions(integer);
DROP FUNCTION IF EXISTS claim_pending_resumes(integer);

-- Drop unused queue tables. The live multi-agent dispatch path is always inline
-- (executeCoreInlineDispatch.ts); these tables have been populated by zero live code paths.
DROP TABLE IF EXISTS public.pending_resumes;
DROP TABLE IF EXISTS public.pending_child_executions;
