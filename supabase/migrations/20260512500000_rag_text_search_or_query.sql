-- Switch from AND-joined plainto_tsquery to OR-joined matching.
-- Natural-language queries like "Si el empleado recibe un bono..." were returning
-- 0 hits because plainto_tsquery requires ALL terms in a single chunk. Now we
-- transform "word1 & word2 & word3" → "word1 | word2 | word3" so any matching
-- chunk surfaces, then rely on ts_rank_cd (TF + proximity) to rank chunks that
-- contain multiple query terms close together higher.
--
-- The query goes through plainto_tsquery first to inherit its tokenization,
-- punctuation stripping, and lexeme normalization, then we swap operators on
-- the text form before parsing back through to_tsquery.

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
  WITH q AS (
    SELECT NULLIF(
      regexp_replace(
        plainto_tsquery('simple', p_query)::text,
        ' & ',
        ' | ',
        'g'
      ),
      ''
    )::tsquery AS tsquery
  )
  SELECT c.id, c.rag_file_id, c.rag_store_id, c.tenant_id, c.org_id, c.page_number, c.page_end,
         c.paragraph_idx, c.char_start, c.char_end, c.content, c.content_hash, c.token_count, c.created_at,
         ts_rank_cd(
           to_tsvector('simple', c.content),
           q.tsquery,
           32
         )::double precision AS rank
  FROM public.rag_chunks AS c, q
  WHERE c.rag_store_id = p_rag_store_id
    AND c.tenant_id    = p_tenant_id
    AND q.tsquery IS NOT NULL
    AND to_tsvector('simple', c.content) @@ q.tsquery
  ORDER BY rank DESC, c.created_at ASC
  LIMIT p_k;
$$;
