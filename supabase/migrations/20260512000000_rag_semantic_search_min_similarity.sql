-- Extend rag_semantic_search with an optional max-distance filter so callers
-- can express "only return chunks at least X similar" (similarity = 1 - distance).
DROP FUNCTION IF EXISTS public.rag_semantic_search(uuid, uuid, vector(768), integer);

CREATE OR REPLACE FUNCTION public.rag_semantic_search(
  p_rag_store_id uuid,
  p_tenant_id    uuid,
  p_query_vector vector(768),
  p_k            integer,
  p_max_distance double precision DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  rag_file_id   uuid,
  rag_store_id  uuid,
  tenant_id     uuid,
  org_id        uuid,
  page_number   integer,
  paragraph_idx integer,
  char_start    integer,
  char_end      integer,
  content       text,
  content_hash  text,
  token_count   integer,
  created_at    timestamptz,
  distance      double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT id, rag_file_id, rag_store_id, tenant_id, org_id, page_number, paragraph_idx,
         char_start, char_end, content, content_hash, token_count, created_at,
         (embedding <=> p_query_vector)::double precision AS distance
  FROM public.rag_chunks
  WHERE rag_store_id = p_rag_store_id
    AND tenant_id    = p_tenant_id
    AND embedding IS NOT NULL
    AND (p_max_distance IS NULL OR (embedding <=> p_query_vector) <= p_max_distance)
  ORDER BY embedding <=> p_query_vector
  LIMIT p_k;
$$;

GRANT EXECUTE ON FUNCTION public.rag_semantic_search(uuid, uuid, vector(768), integer, double precision)
  TO authenticated;
