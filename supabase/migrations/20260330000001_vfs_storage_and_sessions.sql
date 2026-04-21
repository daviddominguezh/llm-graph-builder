-- VFS Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('vfs', 'vfs', false);

-- Storage RLS policies (userID at path segment [3], 1-indexed)
CREATE POLICY "vfs_select" ON storage.objects FOR SELECT
USING (
  bucket_id = 'vfs'
  AND (storage.foldername(name))[3] = auth.uid()::text
);

CREATE POLICY "vfs_insert" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vfs'
  AND (storage.foldername(name))[3] = auth.uid()::text
);

CREATE POLICY "vfs_update" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'vfs'
  AND (storage.foldername(name))[3] = auth.uid()::text
);

CREATE POLICY "vfs_delete" ON storage.objects FOR DELETE
USING (
  bucket_id = 'vfs'
  AND (storage.foldername(name))[3] = auth.uid()::text
);

-- VFS sessions table
CREATE TABLE vfs_sessions (
  session_key      TEXT PRIMARY KEY,
  tenant_slug      TEXT NOT NULL,
  agent_slug       TEXT NOT NULL,
  user_id          UUID NOT NULL,
  session_id       TEXT NOT NULL,
  commit_sha       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vfs_sessions_last_accessed ON vfs_sessions (last_accessed_at);

ALTER TABLE vfs_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vfs_sessions_user" ON vfs_sessions
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Extensions for cleanup
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Conditional cleanup cron (only calls Edge Function when stale sessions exist)
SELECT cron.schedule(
  'cleanup-stale-vfs-sessions',
  '*/15 * * * *',
  $$
    DO $inner$
    DECLARE
      stale_count INTEGER;
    BEGIN
      SELECT count(*) INTO stale_count
      FROM vfs_sessions
      WHERE last_accessed_at < now() - interval '30 minutes';

      IF stale_count > 0 THEN
        PERFORM net.http_post(
          url := current_setting('app.edge_function_url') || '/vfs-cleanup',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-master-key', current_setting('app.edge_function_master_key')
          ),
          body := '{}'::jsonb
        );
      END IF;
    END $inner$;
  $$
);

-- Prune cron history hourly
SELECT cron.schedule(
  'cleanup-cron-history',
  '0 * * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '24 hours'$$
);
