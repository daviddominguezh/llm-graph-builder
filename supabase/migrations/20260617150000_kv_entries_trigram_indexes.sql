-- 20260617150000_kv_entries_trigram_indexes.sql
-- Trigram GIN indexes on kv_entries (key, value) to accelerate agent-tool substring search
-- via ILIKE. Skip equivalent index on rag_chunks.content — RAG substring is BM25/regex, not ILIKE.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_kv_entries_key_trgm
  ON public.kv_entries USING GIN (key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kv_entries_value_trgm
  ON public.kv_entries USING GIN (value gin_trgm_ops);
