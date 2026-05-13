-- Ranked simple search: ts_rank_cd over (to_tsvector('simple', content) @@ plainto_tsquery).
-- Replaces the previous boolean-only match-by-presence with TF + proximity ordering.
-- Uses the existing GIN index `idx_rag_chunks_content_fts` for the match clause.
--
-- Normalization mode 32 (rank / (rank + 1)) maps the raw cover-density score into
-- the half-open interval [0, 1) so it can be displayed alongside cosine similarity
-- and rerank scores without confusing users with an unbounded float.
CREATE OR REPLACE FUNCTION public.rag_text_search(
  p_rag_store_id uuid,
  p_tenant_id    uuid,
  p_query        text,
  p_k            integer
)
RETURNS TABLE (
  id            uuid,
  rag_file_id   uuid,
  rag_store_id  uuid,
  tenant_id     uuid,
  org_id        uuid,
  page_number   integer,
  page_end      integer,
  paragraph_idx integer,
  char_start    integer,
  char_end      integer,
  content       text,
  content_hash  text,
  token_count   integer,
  created_at    timestamptz,
  rank          double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT id, rag_file_id, rag_store_id, tenant_id, org_id, page_number, page_end,
         paragraph_idx, char_start, char_end, content, content_hash, token_count, created_at,
         ts_rank_cd(
           to_tsvector('simple', content),
           plainto_tsquery('simple', p_query),
           32
         )::double precision AS rank
  FROM public.rag_chunks
  WHERE rag_store_id = p_rag_store_id
    AND tenant_id    = p_tenant_id
    AND to_tsvector('simple', content) @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC, created_at ASC
  LIMIT p_k;
$$;

GRANT EXECUTE ON FUNCTION public.rag_text_search(uuid, uuid, text, integer) TO authenticated;
