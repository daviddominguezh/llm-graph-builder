-- 20260617100000_rag_regex_search.sql
-- POSIX regex search over rag_chunks with a 500ms statement timeout enforced inside
-- the SECURITY DEFINER function so concurrent malicious patterns can't exhaust the pool.
-- Locked to service_role only — the architecture rule says clients never touch the DB,
-- so authenticated/anon JWTs have no legitimate need to invoke this directly.

CREATE OR REPLACE FUNCTION public.rag_regex_search(
  p_store_id  UUID,
  p_tenant_id UUID,
  p_pattern   TEXT,
  p_offset    INT,
  p_limit     INT
) RETURNS TABLE (
  id          UUID,
  content     TEXT,
  page_number INT,
  rag_file_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '500ms', true);
  RETURN QUERY
    SELECT c.id, c.content, c.page_number, c.rag_file_id
    FROM public.rag_chunks c
    WHERE c.rag_store_id = p_store_id
      AND c.tenant_id    = p_tenant_id
      AND c.content ~ p_pattern
    ORDER BY c.id
    OFFSET p_offset
    LIMIT  p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.rag_regex_search(UUID, UUID, TEXT, INT, INT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rag_regex_search(UUID, UUID, TEXT, INT, INT) TO service_role;

-- Also harden the existing rag_text_search: same architecture rule applies.
-- Actual signature from 20260512500000_rag_text_search_or_query.sql is (uuid, uuid, text, integer).
REVOKE ALL ON FUNCTION public.rag_text_search(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rag_text_search(UUID, UUID, TEXT, INTEGER) TO service_role;
