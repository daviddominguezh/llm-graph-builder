CREATE TABLE mcp_oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  library_item_id uuid NOT NULL REFERENCES mcp_library(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  client_registration text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  token_endpoint text NOT NULL,
  scopes text,
  connected_by uuid NOT NULL REFERENCES auth.users(id),
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, library_item_id)
);

CREATE TRIGGER mcp_oauth_connections_updated_at
  BEFORE UPDATE ON mcp_oauth_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE mcp_oauth_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcp_oauth_connections_select ON mcp_oauth_connections
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY mcp_oauth_connections_insert ON mcp_oauth_connections
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY mcp_oauth_connections_update ON mcp_oauth_connections
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY mcp_oauth_connections_delete ON mcp_oauth_connections
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));
