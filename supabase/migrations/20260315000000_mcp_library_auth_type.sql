-- Add auth_type column to mcp_library
-- Values: 'none', 'token', 'oauth'

ALTER TABLE mcp_library
  ADD COLUMN auth_type text NOT NULL DEFAULT 'token'
  CHECK (auth_type IN ('none', 'token', 'oauth'));
