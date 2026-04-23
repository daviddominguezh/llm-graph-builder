-- Slug bloom RPCs must bypass RLS on slug_bloom_filters.
-- Prod has RLS enabled on the table with no permissive policies, so the
-- authenticated role's SELECT/UPDATE inside the original LANGUAGE sql
-- functions returned zero rows silently:
--   * check_slug_bloom -> [] -> backend fallback treats as "might exist"
--     -> /slugs/check-availability always reports available: false
--   * update_slug_bloom -> 0 rows updated (204 OK) -> item_count stuck at 0
--
-- Fix: mark both functions SECURITY DEFINER with a locked-down search_path
-- so they run as the function owner and operate on the row regardless of
-- the caller's RLS context. Access control is enforced by EXECUTE grants.

ALTER TABLE slug_bloom_filters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_slug_bloom(p_bitmask BIT(9600), p_table_name TEXT)
RETURNS TABLE(might_exist BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (bitmap & p_bitmask) = p_bitmask AS might_exist
  FROM slug_bloom_filters
  WHERE table_name = p_table_name;
$$;

CREATE OR REPLACE FUNCTION update_slug_bloom(p_bitmask BIT(9600), p_table_name TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE slug_bloom_filters
  SET bitmap = bitmap | p_bitmask,
      item_count = item_count + 1,
      updated_at = now()
  WHERE table_name = p_table_name;
$$;

REVOKE ALL ON FUNCTION check_slug_bloom(BIT(9600), TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_slug_bloom(BIT(9600), TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION check_slug_bloom(BIT(9600), TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_slug_bloom(BIT(9600), TEXT) TO authenticated;
