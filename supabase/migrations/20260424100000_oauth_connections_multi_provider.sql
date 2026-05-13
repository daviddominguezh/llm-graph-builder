-- Generalize mcp_oauth_connections → oauth_connections so we can store OAuth
-- credentials for multiple providers (MCP servers, Google Calendar, and
-- future first-party integrations like Google Sheets / HubSpot / Shopify).
--
-- No production data yet (only seed), so we drop the old table + RPCs and
-- recreate cleanly.

DROP FUNCTION IF EXISTS public.upsert_oauth_connection(
  uuid, uuid, text, text, text, text, text, text, uuid, timestamptz
);
DROP FUNCTION IF EXISTS public.get_oauth_tokens(uuid);
DROP TABLE IF EXISTS public.mcp_oauth_connections;

CREATE TABLE public.oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('mcp', 'google_calendar')),
  library_item_id uuid REFERENCES public.mcp_library(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  encrypted_client_registration bytea,
  encrypted_access_token bytea NOT NULL,
  encrypted_refresh_token bytea,
  expires_at timestamptz,
  token_endpoint text NOT NULL,
  scopes text,
  connected_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_connections_mcp_requires_library_item
    CHECK (provider <> 'mcp' OR library_item_id IS NOT NULL),
  CONSTRAINT oauth_connections_mcp_requires_registration
    CHECK (provider <> 'mcp' OR encrypted_client_registration IS NOT NULL),
  CONSTRAINT oauth_connections_google_calendar_no_library_item
    CHECK (provider <> 'google_calendar' OR library_item_id IS NULL)
);

-- MCP: one connection per (org, library item).
CREATE UNIQUE INDEX oauth_connections_mcp_unique
  ON public.oauth_connections (org_id, library_item_id)
  WHERE provider = 'mcp';

-- Google Calendar: one connection per org (platform-level OAuth).
CREATE UNIQUE INDEX oauth_connections_google_calendar_unique
  ON public.oauth_connections (org_id)
  WHERE provider = 'google_calendar';

CREATE INDEX idx_oauth_connections_org_provider
  ON public.oauth_connections (org_id, provider);

CREATE TRIGGER oauth_connections_updated_at
  BEFORE UPDATE ON public.oauth_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY oauth_connections_select ON public.oauth_connections
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY oauth_connections_insert ON public.oauth_connections
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY oauth_connections_update ON public.oauth_connections
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY oauth_connections_delete ON public.oauth_connections
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- Decrypt tokens for a given connection (provider-agnostic).
CREATE OR REPLACE FUNCTION public.get_oauth_tokens(p_connection_id uuid)
RETURNS TABLE(access_token text, refresh_token text, client_registration text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_access bytea;
  v_refresh bytea;
  v_registration bytea;
BEGIN
  SELECT
    c.encrypted_access_token,
    c.encrypted_refresh_token,
    c.encrypted_client_registration
  INTO v_access, v_refresh, v_registration
  FROM public.oauth_connections c
  WHERE c.id = p_connection_id;

  IF v_access IS NULL THEN
    RAISE EXCEPTION 'OAuth connection not found';
  END IF;

  RETURN QUERY SELECT
    public.decrypt_secret(v_access),
    CASE WHEN v_refresh IS NOT NULL THEN public.decrypt_secret(v_refresh) ELSE NULL END,
    CASE WHEN v_registration IS NOT NULL THEN public.decrypt_secret(v_registration) ELSE NULL END;
END;
$$;

-- Upsert an MCP connection (keyed by org + library_item_id).
CREATE OR REPLACE FUNCTION public.upsert_mcp_oauth_connection(
  p_org_id uuid,
  p_library_item_id uuid,
  p_client_id text,
  p_client_registration text,
  p_access_token text,
  p_refresh_token text,
  p_token_endpoint text,
  p_scopes text,
  p_connected_by uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.oauth_connections (
    org_id, provider, library_item_id, client_id,
    encrypted_client_registration, encrypted_access_token, encrypted_refresh_token,
    token_endpoint, scopes, connected_by, expires_at
  ) VALUES (
    p_org_id, 'mcp', p_library_item_id, p_client_id,
    public.encrypt_secret(p_client_registration),
    public.encrypt_secret(p_access_token),
    CASE WHEN p_refresh_token IS NOT NULL THEN public.encrypt_secret(p_refresh_token) ELSE NULL END,
    p_token_endpoint, p_scopes, p_connected_by, p_expires_at
  )
  ON CONFLICT (org_id, library_item_id) WHERE provider = 'mcp' DO UPDATE SET
    client_id = EXCLUDED.client_id,
    encrypted_client_registration = EXCLUDED.encrypted_client_registration,
    encrypted_access_token = EXCLUDED.encrypted_access_token,
    encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
    token_endpoint = EXCLUDED.token_endpoint,
    scopes = EXCLUDED.scopes,
    connected_by = EXCLUDED.connected_by,
    expires_at = EXCLUDED.expires_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Upsert a Google Calendar connection (keyed by org; one per org at MVP).
CREATE OR REPLACE FUNCTION public.upsert_google_calendar_oauth_connection(
  p_org_id uuid,
  p_client_id text,
  p_access_token text,
  p_refresh_token text,
  p_token_endpoint text,
  p_scopes text,
  p_connected_by uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.oauth_connections (
    org_id, provider, client_id,
    encrypted_access_token, encrypted_refresh_token,
    token_endpoint, scopes, connected_by, expires_at
  ) VALUES (
    p_org_id, 'google_calendar', p_client_id,
    public.encrypt_secret(p_access_token),
    CASE WHEN p_refresh_token IS NOT NULL THEN public.encrypt_secret(p_refresh_token) ELSE NULL END,
    p_token_endpoint, p_scopes, p_connected_by, p_expires_at
  )
  ON CONFLICT (org_id) WHERE provider = 'google_calendar' DO UPDATE SET
    client_id = EXCLUDED.client_id,
    encrypted_access_token = EXCLUDED.encrypted_access_token,
    encrypted_refresh_token = COALESCE(EXCLUDED.encrypted_refresh_token, public.oauth_connections.encrypted_refresh_token),
    token_endpoint = EXCLUDED.token_endpoint,
    scopes = COALESCE(EXCLUDED.scopes, public.oauth_connections.scopes),
    connected_by = EXCLUDED.connected_by,
    expires_at = EXCLUDED.expires_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
