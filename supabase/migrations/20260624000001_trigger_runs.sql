-- Range-partitioned by scheduled_for (whole-second, set by the backend). The
-- idempotency UNIQUE includes the partition key (legal on partitioned tables).
CREATE TABLE public.trigger_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL,
  scheduled_for timestamptz NOT NULL,
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  failure_reason text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (trigger_id, scheduled_for, id),
  UNIQUE (trigger_id, scheduled_for)
) PARTITION BY RANGE (scheduled_for);

ALTER TABLE public.trigger_runs ENABLE ROW LEVEL SECURITY;
-- Service-only: never client-read. No client policies.

-- Real daily partitions + rolling create/drop (no DEFAULT partition; no DELETE
-- churn). create_trigger_runs_partition makes one day; maintain_trigger_runs
-- ensures the next 3 days exist and DROPs partitions older than the 30-day
-- retention window. Both invoked by pg_cron below.
CREATE OR REPLACE FUNCTION public.create_trigger_runs_partition(p_day date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE part text := format('trigger_runs_%s', to_char(p_day, 'YYYYMMDD'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.trigger_runs FOR VALUES FROM (%L) TO (%L)',
    part, p_day::timestamptz, (p_day + 1)::timestamptz);
END $$;

CREATE OR REPLACE FUNCTION public.maintain_trigger_runs()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d int; old_part text; r record;
BEGIN
  FOR d IN 0..3 LOOP
    PERFORM public.create_trigger_runs_partition((now() AT TIME ZONE 'UTC')::date + d);
  END LOOP;
  FOR r IN
    SELECT c.relname FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'trigger_runs'
      AND c.relname < format('trigger_runs_%s', to_char((now() AT TIME ZONE 'UTC')::date - 30, 'YYYYMMDD'))
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I', r.relname);
  END LOOP;
END $$;

-- Bootstrap today + the next few days so inserts never fail before the cron runs.
SELECT public.maintain_trigger_runs();

-- Atomic enabled-gate + claim + re-arm in ONE round-trip. Locks the parent row,
-- returns empty when the trigger is disabled/deleted (so the fire neither runs
-- nor re-arms — the re-arm chain dies cleanly), inserts the run, advances the
-- schedule, and returns the run. ON CONFLICT → empty (duplicate delivery).
CREATE OR REPLACE FUNCTION public.claim_and_rearm(
  p_trigger_id uuid, p_scheduled_for timestamptz, p_next_run_at timestamptz
) RETURNS TABLE (run_id uuid, session_id uuid)
LANGUAGE plpgsql AS $$
DECLARE v_enabled boolean; v_run_id uuid; v_session uuid;
BEGIN
  SELECT enabled INTO v_enabled FROM public.agent_triggers WHERE id = p_trigger_id FOR UPDATE;
  IF v_enabled IS NULL OR v_enabled = false THEN
    RETURN; -- deleted or paused: do not run, do not re-arm
  END IF;

  INSERT INTO public.trigger_runs (trigger_id, scheduled_for, status)
  VALUES (p_trigger_id, p_scheduled_for, 'running')
  ON CONFLICT (trigger_id, scheduled_for) DO NOTHING
  RETURNING id, trigger_runs.session_id INTO v_run_id, v_session;

  IF v_run_id IS NULL THEN
    RETURN; -- duplicate delivery
  END IF;

  UPDATE public.agent_triggers
  SET next_run_at = p_next_run_at, last_run_at = now(), run_count = run_count + 1
  WHERE id = p_trigger_id;

  run_id := v_run_id; session_id := v_session;
  RETURN NEXT;
END $$;

-- Daily partition maintenance (create-ahead + drop-old). Housekeeping, not firing.
SELECT cron.schedule('maintain-trigger-runs', '17 3 * * *', $$ SELECT public.maintain_trigger_runs(); $$);
