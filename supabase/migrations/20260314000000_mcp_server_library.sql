-- MCP Server Library: tables, functions, RLS policies, storage bucket

-- 1. Create mcp_library table
CREATE TABLE mcp_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  image_url text,
  transport_type text NOT NULL,
  transport_config jsonb NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]',
  installations_count integer NOT NULL DEFAULT 0,
  published_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create org_env_variables table
CREATE TABLE org_env_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  value text NOT NULL,
  is_secret boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- 3. Add columns to graph_mcp_servers
ALTER TABLE graph_mcp_servers
  ADD COLUMN library_item_id uuid REFERENCES mcp_library(id) ON DELETE SET NULL,
  ADD COLUMN variable_values jsonb;

CREATE UNIQUE INDEX idx_graph_mcp_servers_library_unique
  ON graph_mcp_servers (agent_id, library_item_id)
  WHERE library_item_id IS NOT NULL;

-- 4. updated_at trigger (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mcp_library_updated_at
  BEFORE UPDATE ON mcp_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER org_env_variables_updated_at
  BEFORE UPDATE ON org_env_variables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Atomic increment RPC
CREATE OR REPLACE FUNCTION increment_installations_count(p_library_item_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE mcp_library
  SET installations_count = installations_count + 1
  WHERE id = p_library_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Org membership check helper (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid, p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS for mcp_library
ALTER TABLE mcp_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcp_library_select ON mcp_library
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY mcp_library_insert ON mcp_library
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY mcp_library_update ON mcp_library
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY mcp_library_delete ON mcp_library
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- 8. RLS for org_env_variables
ALTER TABLE org_env_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_env_variables_select ON org_env_variables
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY org_env_variables_insert ON org_env_variables
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY org_env_variables_update ON org_env_variables
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY org_env_variables_delete ON org_env_variables
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- 9. Storage bucket for MCP images
INSERT INTO storage.buckets (id, name, public)
VALUES ('mcp-images', 'mcp-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY mcp_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'mcp-images');

CREATE POLICY mcp_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mcp-images');

CREATE POLICY mcp_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'mcp-images');
