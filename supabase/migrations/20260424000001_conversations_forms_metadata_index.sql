-- supabase/migrations/20260424000001_conversations_forms_metadata_index.sql
CREATE INDEX IF NOT EXISTS conversations_metadata_forms_key_idx
  ON public.conversations USING gin ((metadata -> 'forms'));
