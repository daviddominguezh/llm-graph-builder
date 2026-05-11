-- RAG pipeline: per-tenant file uploads, parsed chunks, embeddings.
-- Requires the vector extension. Tenant isolation enforced by denormalized
-- tenant_id + org_id on every row plus RLS via is_org_member.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.rag_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_store_id  uuid NOT NULL REFERENCES public.rag_stores(id)    ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id)       ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL,
  page_count    integer,
  status        text NOT NULL DEFAULT 'pending',
  status_error  text,
  gcs_object    text NOT NULL,
  da_operation  text,
  parsed_uri    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rag_files_status_valid
    CHECK (status IN ('pending','uploading','parsing','chunking','embedding','done','failed'))
);
CREATE INDEX idx_rag_files_store_tenant ON public.rag_files(rag_store_id, tenant_id);
CREATE INDEX idx_rag_files_status_pending
  ON public.rag_files(status)
  WHERE status NOT IN ('done','failed');

CREATE TABLE public.rag_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_file_id     uuid NOT NULL REFERENCES public.rag_files(id)   ON DELETE CASCADE,
  rag_store_id    uuid NOT NULL REFERENCES public.rag_stores(id)  ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id)     ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  page_number     integer,
  paragraph_idx   integer,
  char_start      integer,
  char_end        integer,
  content         text NOT NULL,
  content_hash    text NOT NULL,
  token_count     integer,
  embedding       vector(768),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rag_chunks_file              ON public.rag_chunks(rag_file_id);
CREATE INDEX idx_rag_chunks_store_tenant      ON public.rag_chunks(rag_store_id, tenant_id);
CREATE INDEX idx_rag_chunks_embedding_cosine
  ON public.rag_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_rag_chunks_content_fts
  ON public.rag_chunks USING gin (to_tsvector('simple', content));

CREATE OR REPLACE FUNCTION public.rag_file_org_id(p_rag_file_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id FROM public.rag_files WHERE id = p_rag_file_id;
$$;

ALTER TABLE public.rag_files  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read rag_files"
  ON public.rag_files FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Org members can insert rag_files"
  ON public.rag_files FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Org members can update rag_files"
  ON public.rag_files FOR UPDATE USING (public.is_org_member(org_id));
CREATE POLICY "Org members can delete rag_files"
  ON public.rag_files FOR DELETE USING (public.is_org_member(org_id));

CREATE POLICY "Org members can read rag_chunks"
  ON public.rag_chunks FOR SELECT
  USING (public.is_org_member(public.rag_file_org_id(rag_file_id)));
CREATE POLICY "Org members can insert rag_chunks"
  ON public.rag_chunks FOR INSERT
  WITH CHECK (public.is_org_member(public.rag_file_org_id(rag_file_id)));
CREATE POLICY "Org members can update rag_chunks"
  ON public.rag_chunks FOR UPDATE
  USING (public.is_org_member(public.rag_file_org_id(rag_file_id)));
CREATE POLICY "Org members can delete rag_chunks"
  ON public.rag_chunks FOR DELETE
  USING (public.is_org_member(public.rag_file_org_id(rag_file_id)));

CREATE VIEW public.rag_usage_by_tenant AS
SELECT org_id, tenant_id, rag_store_id,
       count(*) FILTER (WHERE status = 'done')                          AS files_count,
       coalesce(sum(page_count) FILTER (WHERE status = 'done'), 0)::bigint AS pages_count,
       coalesce(sum(size_bytes), 0)::bigint                              AS bytes_total
FROM public.rag_files
GROUP BY org_id, tenant_id, rag_store_id;

CREATE VIEW public.rag_usage_by_org AS
SELECT org_id,
       count(*) FILTER (WHERE status = 'done')                          AS files_count,
       coalesce(sum(page_count) FILTER (WHERE status = 'done'), 0)::bigint AS pages_count,
       coalesce(sum(size_bytes), 0)::bigint                              AS bytes_total
FROM public.rag_files
GROUP BY org_id;

-- Semantic search RPC: scopes by (store, tenant), orders by cosine distance.
CREATE OR REPLACE FUNCTION public.rag_semantic_search(
  p_rag_store_id uuid,
  p_tenant_id    uuid,
  p_query_vector vector(768),
  p_k            integer
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
SET search_path = ''
AS $$
  SELECT id, rag_file_id, rag_store_id, tenant_id, org_id, page_number, paragraph_idx,
         char_start, char_end, content, content_hash, token_count, created_at,
         (embedding <=> p_query_vector)::double precision AS distance
  FROM public.rag_chunks
  WHERE rag_store_id = p_rag_store_id
    AND tenant_id    = p_tenant_id
    AND embedding IS NOT NULL
  ORDER BY embedding <=> p_query_vector
  LIMIT p_k;
$$;

GRANT EXECUTE ON FUNCTION public.rag_semantic_search(uuid, uuid, vector(768), integer) TO authenticated;
