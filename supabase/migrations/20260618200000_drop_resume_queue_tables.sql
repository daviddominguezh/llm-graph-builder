-- Drop unused queue tables. The live multi-agent dispatch path is always inline
-- (executeCoreInlineDispatch.ts); these tables have been populated by zero live code paths.
DROP TABLE IF EXISTS public.pending_resumes;
DROP TABLE IF EXISTS public.pending_child_executions;
