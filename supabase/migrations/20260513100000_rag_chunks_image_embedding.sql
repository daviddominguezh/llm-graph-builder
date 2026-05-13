-- Multimodal image embeddings (Vertex AI multimodalembedding@001 → 1408-dim).
-- Image chunks set image_embedding and leave the text `embedding` (768-dim) NULL.
-- Text chunks continue to set `embedding` and leave image_embedding NULL.
ALTER TABLE public.rag_chunks
  ADD COLUMN image_embedding vector(1408) NULL;

CREATE INDEX idx_rag_chunks_image_embedding_cosine
  ON public.rag_chunks USING hnsw (image_embedding vector_cosine_ops);

-- Semantic search over the image pool. Mirrors rag_semantic_search but against
-- the 1408-dim column. Returns the same row shape so callers can merge.
CREATE OR REPLACE FUNCTION public.rag_image_semantic_search(
  p_rag_store_id uuid,
  p_tenant_id uuid,
  p_query_vector vector(1408),
  p_k integer,
  p_max_distance double precision
)
RETURNS TABLE (
  id uuid,
  rag_file_id uuid,
  rag_store_id uuid,
  tenant_id uuid,
  org_id uuid,
  page_number integer,
  page_end integer,
  paragraph_idx integer,
  char_start integer,
  char_end integer,
  content text,
  content_hash text,
  token_count integer,
  created_at timestamptz,
  distance double precision
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    c.id, c.rag_file_id, c.rag_store_id, c.tenant_id, c.org_id,
    c.page_number, c.page_end, c.paragraph_idx, c.char_start, c.char_end,
    c.content, c.content_hash, c.token_count, c.created_at,
    (c.image_embedding <=> p_query_vector)::double precision AS distance
  FROM public.rag_chunks c
  WHERE c.rag_store_id = p_rag_store_id
    AND c.tenant_id = p_tenant_id
    AND c.image_embedding IS NOT NULL
    AND (p_max_distance IS NULL OR (c.image_embedding <=> p_query_vector) <= p_max_distance)
  ORDER BY c.image_embedding <=> p_query_vector
  LIMIT p_k;
$$;

GRANT EXECUTE ON FUNCTION public.rag_image_semantic_search(uuid, uuid, vector(1408), integer, double precision)
  TO authenticated, service_role;

-- Cheap "does this store/tenant hold any image chunks?" probe.
CREATE OR REPLACE FUNCTION public.rag_has_image_chunks(
  p_rag_store_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rag_chunks
    WHERE rag_store_id = p_rag_store_id
      AND tenant_id = p_tenant_id
      AND image_embedding IS NOT NULL
    LIMIT 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.rag_has_image_chunks(uuid, uuid)
  TO authenticated, service_role;
