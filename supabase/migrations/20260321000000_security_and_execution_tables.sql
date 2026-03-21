-- ============================================================================
-- Section 1: Encryption infrastructure
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER DATABASE postgres SET app.settings.encryption_key = 'dev-encryption-key-CHANGE-IN-PRODUCTION-32chars!';
SET app.settings.encryption_key = 'dev-encryption-key-CHANGE-IN-PRODUCTION-32chars!';

-- encrypt_secret(plaintext) — encrypts a text value using pgp_sym_encrypt
CREATE OR REPLACE FUNCTION public.encrypt_secret(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN pgp_sym_encrypt(
    plaintext,
    current_setting('app.settings.encryption_key')
  );
END;
$$;

-- decrypt_secret(encrypted) — decrypts a bytea value using pgp_sym_decrypt
CREATE OR REPLACE FUNCTION public.decrypt_secret(encrypted bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    encrypted,
    current_setting('app.settings.encryption_key')
  );
END;
$$;

-- ============================================================================
-- Section 2: Alter org_api_keys for encryption
-- ============================================================================

-- Add encrypted_value column
ALTER TABLE public.org_api_keys ADD COLUMN encrypted_value bytea;

-- Encrypt existing data
UPDATE public.org_api_keys
SET encrypted_value = public.encrypt_secret(key_value);

-- Make encrypted_value NOT NULL and drop key_value
ALTER TABLE public.org_api_keys ALTER COLUMN encrypted_value SET NOT NULL;
ALTER TABLE public.org_api_keys DROP COLUMN key_value;

-- Drop the old trigger and function
DROP TRIGGER IF EXISTS on_api_key_insert ON public.org_api_keys;
DROP FUNCTION IF EXISTS public.set_api_key_preview();

-- RPC: create_org_api_key — encrypts and inserts a new API key
CREATE OR REPLACE FUNCTION public.create_org_api_key(
  p_org_id uuid,
  p_name text,
  p_key_value text
)
RETURNS TABLE(id uuid, org_id uuid, name text, key_preview text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_org_id uuid;
  v_name text;
  v_key_preview text;
  v_created_at timestamptz;
BEGIN
  v_key_preview := '••••••••' || right(p_key_value, 4);

  INSERT INTO public.org_api_keys (org_id, name, encrypted_value, key_preview)
  VALUES (p_org_id, p_name, public.encrypt_secret(p_key_value), v_key_preview)
  RETURNING
    public.org_api_keys.id,
    public.org_api_keys.org_id,
    public.org_api_keys.name,
    public.org_api_keys.key_preview,
    public.org_api_keys.created_at
  INTO v_id, v_org_id, v_name, v_key_preview, v_created_at;

  RETURN QUERY SELECT v_id, v_org_id, v_name, v_key_preview, v_created_at;
END;
$$;

-- RPC: get_api_key_value — decrypts and returns the API key value
CREATE OR REPLACE FUNCTION public.get_api_key_value(p_key_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_encrypted bytea;
BEGIN
  SELECT encrypted_value INTO v_encrypted
  FROM public.org_api_keys
  WHERE id = p_key_id;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'API key not found';
  END IF;

  RETURN public.decrypt_secret(v_encrypted);
END;
$$;

-- ============================================================================
-- Section 3: Alter org_env_variables for encryption
-- ============================================================================

-- Add encrypted_value column
ALTER TABLE public.org_env_variables ADD COLUMN encrypted_value bytea;

-- Encrypt existing data
UPDATE public.org_env_variables
SET encrypted_value = public.encrypt_secret(value);

-- Make encrypted_value NOT NULL and drop value
ALTER TABLE public.org_env_variables ALTER COLUMN encrypted_value SET NOT NULL;
ALTER TABLE public.org_env_variables DROP COLUMN value;

-- RPC: create_org_env_variable — encrypts and inserts a new env variable
CREATE OR REPLACE FUNCTION public.create_org_env_variable(
  p_org_id uuid,
  p_name text,
  p_value text,
  p_is_secret boolean,
  p_created_by uuid
)
RETURNS TABLE(id uuid, org_id uuid, name text, is_secret boolean, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_org_id uuid;
  v_name text;
  v_is_secret boolean;
  v_created_at timestamptz;
BEGIN
  INSERT INTO public.org_env_variables (org_id, name, encrypted_value, is_secret, created_by)
  VALUES (p_org_id, p_name, public.encrypt_secret(p_value), p_is_secret, p_created_by)
  RETURNING
    public.org_env_variables.id,
    public.org_env_variables.org_id,
    public.org_env_variables.name,
    public.org_env_variables.is_secret,
    public.org_env_variables.created_at
  INTO v_id, v_org_id, v_name, v_is_secret, v_created_at;

  RETURN QUERY SELECT v_id, v_org_id, v_name, v_is_secret, v_created_at;
END;
$$;

-- RPC: get_env_variable_value — decrypts and returns the env variable value
CREATE OR REPLACE FUNCTION public.get_env_variable_value(p_var_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_encrypted bytea;
BEGIN
  SELECT encrypted_value INTO v_encrypted
  FROM public.org_env_variables
  WHERE id = p_var_id;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'Environment variable not found';
  END IF;

  RETURN public.decrypt_secret(v_encrypted);
END;
$$;

-- RPC: update_org_env_variable — updates env variable with optional fields
CREATE OR REPLACE FUNCTION public.update_org_env_variable(
  p_var_id uuid,
  p_name text DEFAULT NULL,
  p_value text DEFAULT NULL,
  p_is_secret boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.org_env_variables
  SET
    name = COALESCE(p_name, name),
    encrypted_value = CASE
      WHEN p_value IS NOT NULL THEN public.encrypt_secret(p_value)
      ELSE encrypted_value
    END,
    is_secret = COALESCE(p_is_secret, is_secret)
  WHERE id = p_var_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Environment variable not found';
  END IF;
END;
$$;

-- ============================================================================
-- Section 4: Alter mcp_oauth_connections for encryption
-- ============================================================================

-- Add encrypted columns
ALTER TABLE public.mcp_oauth_connections ADD COLUMN encrypted_access_token bytea;
ALTER TABLE public.mcp_oauth_connections ADD COLUMN encrypted_refresh_token bytea;
ALTER TABLE public.mcp_oauth_connections ADD COLUMN encrypted_client_registration bytea;

-- Encrypt existing data
UPDATE public.mcp_oauth_connections
SET
  encrypted_access_token = public.encrypt_secret(access_token),
  encrypted_refresh_token = CASE
    WHEN refresh_token IS NOT NULL THEN public.encrypt_secret(refresh_token)
    ELSE NULL
  END,
  encrypted_client_registration = public.encrypt_secret(client_registration);

-- Make required columns NOT NULL
ALTER TABLE public.mcp_oauth_connections ALTER COLUMN encrypted_access_token SET NOT NULL;
ALTER TABLE public.mcp_oauth_connections ALTER COLUMN encrypted_client_registration SET NOT NULL;

-- Drop old plaintext columns
ALTER TABLE public.mcp_oauth_connections DROP COLUMN access_token;
ALTER TABLE public.mcp_oauth_connections DROP COLUMN refresh_token;
ALTER TABLE public.mcp_oauth_connections DROP COLUMN client_registration;
ALTER TABLE public.mcp_oauth_connections DROP COLUMN key_version;

-- RPC: get_oauth_tokens — decrypts and returns all tokens
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
  FROM public.mcp_oauth_connections c
  WHERE c.id = p_connection_id;

  IF v_access IS NULL THEN
    RAISE EXCEPTION 'OAuth connection not found';
  END IF;

  RETURN QUERY SELECT
    public.decrypt_secret(v_access),
    CASE
      WHEN v_refresh IS NOT NULL THEN public.decrypt_secret(v_refresh)
      ELSE NULL
    END,
    public.decrypt_secret(v_registration);
END;
$$;

-- RPC: upsert_oauth_connection — inserts or updates an OAuth connection
CREATE OR REPLACE FUNCTION public.upsert_oauth_connection(
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
  INSERT INTO public.mcp_oauth_connections (
    org_id, library_item_id, client_id,
    encrypted_client_registration, encrypted_access_token, encrypted_refresh_token,
    token_endpoint, scopes, connected_by, expires_at
  ) VALUES (
    p_org_id, p_library_item_id, p_client_id,
    public.encrypt_secret(p_client_registration),
    public.encrypt_secret(p_access_token),
    CASE WHEN p_refresh_token IS NOT NULL THEN public.encrypt_secret(p_refresh_token) ELSE NULL END,
    p_token_endpoint, p_scopes, p_connected_by, p_expires_at
  )
  ON CONFLICT (org_id, library_item_id) DO UPDATE SET
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

-- ============================================================================
-- Section 5: New tables for agent execution
-- ============================================================================

-- 5a. agent_execution_keys
CREATE TABLE public.agent_execution_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX idx_agent_execution_keys_org_id
  ON public.agent_execution_keys(org_id);

ALTER TABLE public.agent_execution_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_execution_keys_select ON public.agent_execution_keys
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY agent_execution_keys_insert ON public.agent_execution_keys
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY agent_execution_keys_update ON public.agent_execution_keys
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY agent_execution_keys_delete ON public.agent_execution_keys
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- 5b. agent_execution_key_agents (join table)
CREATE TABLE public.agent_execution_key_agents (
  key_id uuid NOT NULL REFERENCES public.agent_execution_keys(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  PRIMARY KEY (key_id, agent_id)
);

CREATE INDEX idx_agent_execution_key_agents_reverse
  ON public.agent_execution_key_agents(agent_id, key_id);

ALTER TABLE public.agent_execution_key_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_execution_key_agents_select ON public.agent_execution_key_agents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_execution_keys k
      WHERE k.id = key_id
        AND is_org_member(k.org_id, auth.uid())
    )
  );

CREATE POLICY agent_execution_key_agents_insert ON public.agent_execution_key_agents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_execution_keys k
      WHERE k.id = key_id
        AND is_org_member(k.org_id, auth.uid())
    )
  );

CREATE POLICY agent_execution_key_agents_update ON public.agent_execution_key_agents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_execution_keys k
      WHERE k.id = key_id
        AND is_org_member(k.org_id, auth.uid())
    )
  );

CREATE POLICY agent_execution_key_agents_delete ON public.agent_execution_key_agents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_execution_keys k
      WHERE k.id = key_id
        AND is_org_member(k.org_id, auth.uid())
    )
  );

-- 5c. agent_sessions
CREATE TABLE public.agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  session_id text NOT NULL,
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('whatsapp', 'web')),
  current_node_id text NOT NULL DEFAULT 'INITIAL_STEP',
  model text NOT NULL,
  structured_outputs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version, tenant_id, user_id, session_id, channel)
);

CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON public.agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_agent_sessions_org_agent
  ON public.agent_sessions(org_id, agent_id);

CREATE INDEX idx_agent_sessions_org_agent_tenant
  ON public.agent_sessions(org_id, agent_id, tenant_id);

CREATE INDEX idx_agent_sessions_org_agent_created
  ON public.agent_sessions(org_id, agent_id, created_at DESC);

CREATE INDEX idx_agent_sessions_agent_version
  ON public.agent_sessions(agent_id, version);

ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_sessions_select ON public.agent_sessions
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- 5d. agent_executions
CREATE TABLE public.agent_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  tenant_id text NOT NULL,
  external_user_id text NOT NULL,
  channel text NOT NULL DEFAULT 'web',
  execution_key_id uuid REFERENCES public.agent_execution_keys(id) ON DELETE SET NULL,
  model text NOT NULL,
  total_input_tokens integer NOT NULL DEFAULT 0,
  total_output_tokens integer NOT NULL DEFAULT 0,
  total_cached_tokens integer NOT NULL DEFAULT 0,
  total_cost numeric(12,6) NOT NULL DEFAULT 0,
  total_duration_ms integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error text
);

CREATE INDEX idx_agent_executions_org_agent_started
  ON public.agent_executions(org_id, agent_id, started_at DESC);

CREATE INDEX idx_agent_executions_org_agent_version_started
  ON public.agent_executions(org_id, agent_id, version, started_at DESC);

CREATE INDEX idx_agent_executions_org_agent_tenant_started
  ON public.agent_executions(org_id, agent_id, tenant_id, started_at DESC);

CREATE INDEX idx_agent_executions_org_agent_model_started
  ON public.agent_executions(org_id, agent_id, model, started_at DESC);

CREATE INDEX idx_agent_executions_session_started
  ON public.agent_executions(session_id, started_at DESC);

CREATE INDEX idx_agent_executions_running
  ON public.agent_executions(status)
  WHERE status = 'running';

CREATE INDEX idx_agent_executions_org_started
  ON public.agent_executions(org_id, started_at DESC);

CREATE INDEX idx_agent_executions_org_agent_channel
  ON public.agent_executions(org_id, agent_id, channel);

ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_executions_select ON public.agent_executions
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- 5e. agent_execution_nodes
CREATE TABLE public.agent_execution_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.agent_executions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  step_order integer NOT NULL,
  messages_sent jsonb NOT NULL,
  response jsonb NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,
  cost numeric(12,6) NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_execution_nodes_execution_step
  ON public.agent_execution_nodes(execution_id, step_order);

ALTER TABLE public.agent_execution_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_execution_nodes_select ON public.agent_execution_nodes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_executions e
      WHERE e.id = execution_id
        AND is_org_member(e.org_id, auth.uid())
    )
  );

-- 5f. agent_execution_messages
CREATE TABLE public.agent_execution_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.agent_executions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content jsonb NOT NULL,
  tool_calls jsonb,
  tool_call_id text,
  node_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_execution_messages_session_created
  ON public.agent_execution_messages(session_id, created_at ASC);

CREATE INDEX idx_agent_execution_messages_execution
  ON public.agent_execution_messages(execution_id);

ALTER TABLE public.agent_execution_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_execution_messages_select ON public.agent_execution_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = session_id
        AND is_org_member(s.org_id, auth.uid())
    )
  );

-- ============================================================================
-- Section 6: Materialized view for execution summaries
-- ============================================================================

CREATE MATERIALIZED VIEW public.agent_execution_summary AS
SELECT
  e.org_id,
  e.agent_id,
  e.version,
  COUNT(*)::integer AS total_executions,
  SUM(e.total_input_tokens)::integer AS total_input_tokens,
  SUM(e.total_output_tokens)::integer AS total_output_tokens,
  SUM(e.total_cost) AS total_cost,
  COUNT(DISTINCT e.tenant_id)::integer AS unique_tenants,
  COUNT(DISTINCT e.external_user_id)::integer AS unique_users,
  COUNT(DISTINCT e.session_id)::integer AS unique_sessions,
  MAX(e.started_at) AS last_execution_at
FROM public.agent_executions e
WHERE e.status = 'completed'
GROUP BY e.org_id, e.agent_id, e.version;

CREATE UNIQUE INDEX idx_exec_summary_pk
  ON public.agent_execution_summary(org_id, agent_id, version);
