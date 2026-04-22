-- Per-agent widget execution key.
--
-- Agents are agency-owned (org-scoped) and reused across tenants. The widget
-- execution key is scoped to a single agent: we store a nullable FK on
-- `agents.widget_execution_key_id` pointing at the agent's dedicated row in
-- `agent_execution_keys` (with `all_agents = false` + a junction row pinning
-- it to that agent).
--
-- Unlike regular execution keys (which only keep a SHA-256 hash for Bearer
-- validation), the widget key must be retrievable server-side so the Next.js
-- proxy can inject it as `Authorization: Bearer <token>` without ever sending
-- it to the browser. We therefore add an `encrypted_value` column (pgp_sym via
-- the existing `public.encrypt_secret` / `public.decrypt_secret` helpers
-- introduced in `20260321000000_security_and_execution_tables.sql`) plus two
-- RPCs for set/get.
--
-- Idempotent: columns use IF NOT EXISTS; RPCs use CREATE OR REPLACE.

-- 1. agents → execution key FK
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS widget_execution_key_id uuid
  REFERENCES public.agent_execution_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_widget_execution_key_id
  ON public.agents(widget_execution_key_id);

-- 2. agent_execution_keys → encrypted token storage (widget keys only; other
--    execution keys never populate this column and it stays NULL for them)
ALTER TABLE public.agent_execution_keys
  ADD COLUMN IF NOT EXISTS encrypted_value bytea;

-- 3. RPC: set_execution_key_value(p_key_id, p_value)
--    Encrypts p_value via public.encrypt_secret and stores it on the row.
CREATE OR REPLACE FUNCTION public.set_execution_key_value(p_key_id uuid, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_execution_keys
  SET encrypted_value = public.encrypt_secret(p_value)
  WHERE id = p_key_id;
END;
$$;

-- 4. RPC: get_execution_key_value(p_key_id)
--    Decrypts and returns the raw token (or NULL if none stored).
CREATE OR REPLACE FUNCTION public.get_execution_key_value(p_key_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_encrypted bytea;
BEGIN
  SELECT encrypted_value INTO v_encrypted
  FROM public.agent_execution_keys
  WHERE id = p_key_id;
  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.decrypt_secret(v_encrypted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_execution_key_value(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_execution_key_value(uuid) TO service_role;
