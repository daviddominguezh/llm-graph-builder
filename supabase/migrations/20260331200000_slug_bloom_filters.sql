-- Bloom filter storage for slug availability checking.
-- Each row holds a bit(9600) bitmap representing all slugs in the target table.
-- Check: (bitmap & bitmask) = bitmask  -> slug MIGHT exist
-- Update: bitmap = bitmap | bitmask    -> add slug to filter

CREATE TABLE slug_bloom_filters (
  table_name TEXT PRIMARY KEY,
  bitmap     BIT(9600) NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with empty (all-zero) bitmaps for the two tables we track.
INSERT INTO slug_bloom_filters (table_name, bitmap, item_count)
VALUES
  ('organizations', repeat('0', 9600)::bit(9600), 0),
  ('agents', repeat('0', 9600)::bit(9600), 0);

-- RPC function: check if a slug might exist in the bloom filter.
-- Returns a single row with { might_exist: boolean }.
CREATE OR REPLACE FUNCTION check_slug_bloom(p_bitmask BIT(9600), p_table_name TEXT)
RETURNS TABLE(might_exist BOOLEAN) AS $$
  SELECT (bitmap & p_bitmask) = p_bitmask AS might_exist
  FROM slug_bloom_filters
  WHERE table_name = p_table_name;
$$ LANGUAGE sql STABLE;

-- RPC function: add a slug to the bloom filter by OR-ing its bitmask.
CREATE OR REPLACE FUNCTION update_slug_bloom(p_bitmask BIT(9600), p_table_name TEXT)
RETURNS VOID AS $$
  UPDATE slug_bloom_filters
  SET bitmap = bitmap | p_bitmask,
      item_count = item_count + 1,
      updated_at = now()
  WHERE table_name = p_table_name;
$$ LANGUAGE sql VOLATILE;
