-- Drop unused queue tables. The live multi-agent dispatch path is always inline
-- (executeCoreInlineDispatch.ts); these tables have been populated by zero live code paths.
DROP TABLE IF EXISTS public.pending_resumes;
DROP TABLE IF EXISTS public.pending_child_executions;

-- Drop the worker-claim RPC functions that referenced the dropped tables.
-- Their SETOF return types depended on the table types; they're orphans now.
DROP FUNCTION IF EXISTS claim_pending_child_executions(integer);
DROP FUNCTION IF EXISTS claim_pending_resumes(integer);
