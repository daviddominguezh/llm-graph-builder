# Plan 1: Security Migration + Database Schema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt all existing secret columns (API keys, env variables, OAuth tokens) and create the new tables needed for agent execution (sessions, executions, node visits, messages, execution API keys).

**Architecture:** Single migration enables `pgcrypto`, creates SECURITY DEFINER encrypt/decrypt helper functions using a database-level encryption key, alters existing tables to use encrypted columns, and creates all new execution-related tables with indexes and RLS. Application code (lib + actions) is updated to use the new encrypt/decrypt RPC functions.

**Tech Stack:** PostgreSQL (pgcrypto), Supabase RLS, Supabase JS SDK (`.rpc()` calls), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-21-agent-execution-api-design.md`

**Divergence from spec:** Uses `pgcrypto` (`pgp_sym_encrypt`/`pgp_sym_decrypt`) instead of `pgsodium`. The `pgsodium` extension requires Supabase Vault key management which adds complexity for dev environments. `pgcrypto` provides equivalent security for this use case.

---

## File Structure

### New files
- `supabase/migrations/20260321000000_security_and_execution_tables.sql` — Main migration (encryption setup + altered tables + new tables)

### Modified files
- `supabase/seed.sql` — Use encryption functions for seeding secrets
- `packages/web/app/lib/api-keys.ts` — Use RPC for encrypted reads/writes
- `packages/web/app/lib/org-env-variables.ts` — Use RPC for encrypted reads/writes
- `packages/web/app/actions/api-keys.ts` — Update to match new lib signatures
- `packages/web/app/actions/org-env-variables.ts` — Update to match new lib signatures
- `packages/web/app/components/orgs/EnvVariablesSection.tsx` — Remove `variable.value` references
- `packages/web/app/components/orgs/EditEnvVariableDialog.tsx` — Remove `variable.value` default
- `packages/backend/src/db/queries/oauthConnectionOperations.ts` — Use RPC for encrypted reads/writes
- `packages/backend/src/mcp/oauth/encryption.ts` — Remove (dead code after DB-level encryption)

### Files that DON'T need changes (verified)
- `packages/web/app/api/simulate/route.ts` — calls `getApiKeyValueById()` which is updated in Task 5; no direct changes needed
- `packages/web/app/lib/resolve-variables.ts` — calls `getEnvVariableValue()` which is updated in Task 6; no direct changes needed

---

## Task 1: Create the migration — encryption infrastructure

**Files:**
- Create: `supabase/migrations/20260321000000_security_and_execution_tables.sql`

- [ ] **Step 1: Create migration file with pgcrypto + encryption key setup**

Create `supabase/migrations/20260321000000_security_and_execution_tables.sql`:

```sql
-- =============================================================================
-- Security Migration + Agent Execution Tables
-- =============================================================================
-- 1. Enable pgcrypto for encryption
-- 2. Set encryption key (database-level setting)
-- 3. Create encrypt/decrypt helper functions
-- 4. Alter org_api_keys for encrypted storage
-- 5. Alter org_env_variables for encrypted storage
-- 6. Alter mcp_oauth_connections for encrypted storage
-- 7. Create agent execution tables
-- 8. Create materialized view for dashboard
-- =============================================================================

-- ============================================================================
-- 1. Enable pgcrypto
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. Encryption key (server-side only, not accessible via PostgREST/API)
-- Change this value in production via: ALTER DATABASE postgres SET app.settings.encryption_key = 'your-production-key';
-- ============================================================================
ALTER DATABASE postgres SET app.settings.encryption_key = 'dev-encryption-key-CHANGE-IN-PRODUCTION-32chars!';
SET app.settings.encryption_key = 'dev-encryption-key-CHANGE-IN-PRODUCTION-32chars!';

-- ============================================================================
-- 3. Encrypt / decrypt helper functions (SECURITY DEFINER — key never leaks)
-- ============================================================================
CREATE OR REPLACE FUNCTION encrypt_secret(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN pgp_sym_encrypt(plaintext, current_setting('app.settings.encryption_key'));
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_secret(encrypted bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN pgp_sym_decrypt(encrypted, current_setting('app.settings.encryption_key'));
END;
$$;
```

- [ ] **Step 2: Verify migration syntax is valid**

Run: `cd /Users/daviddominguez/closer/llm-graph-builder && npx supabase db reset`

Expected: migration applies without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260321000000_security_and_execution_tables.sql
git commit -m "feat: add pgcrypto encryption infrastructure"
```

---

## Task 2: Alter existing tables for encryption

**Files:**
- Modify: `supabase/migrations/20260321000000_security_and_execution_tables.sql`

- [ ] **Step 1: Add org_api_keys encryption section**

Append to the migration file:

```sql
-- ============================================================================
-- 4. Alter org_api_keys — encrypt key_value
-- ============================================================================

-- 4a. Add encrypted column
ALTER TABLE public.org_api_keys ADD COLUMN encrypted_value bytea;

-- 4b. Encrypt existing data (if any)
UPDATE public.org_api_keys
SET encrypted_value = encrypt_secret(key_value)
WHERE key_value IS NOT NULL;

-- 4c. Make encrypted_value NOT NULL, drop key_value
ALTER TABLE public.org_api_keys ALTER COLUMN encrypted_value SET NOT NULL;
ALTER TABLE public.org_api_keys DROP COLUMN key_value;

-- 4d. Drop the old trigger that generated key_preview from key_value
-- (defined in 20260309400000_fix_storage_policies_and_publish.sql as on_api_key_insert / set_api_key_preview)
DROP TRIGGER IF EXISTS on_api_key_insert ON public.org_api_keys;
DROP FUNCTION IF EXISTS public.set_api_key_preview();

-- 4e. RPC: create API key (encrypts value, generates preview)
CREATE OR REPLACE FUNCTION create_org_api_key(
  p_org_id uuid,
  p_name text,
  p_key_value text
)
RETURNS TABLE(id uuid, org_id uuid, name text, key_preview text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.org_api_keys (org_id, name, encrypted_value, key_preview)
  VALUES (
    p_org_id,
    p_name,
    encrypt_secret(p_key_value),
    '••••••••' || right(p_key_value, 4)
  )
  RETURNING
    public.org_api_keys.id,
    public.org_api_keys.org_id,
    public.org_api_keys.name,
    public.org_api_keys.key_preview,
    public.org_api_keys.created_at;
END;
$$;

-- 4f. RPC: get decrypted API key value (for simulate/execution flows)
CREATE OR REPLACE FUNCTION get_api_key_value(p_key_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result text;
BEGIN
  SELECT decrypt_secret(encrypted_value) INTO result
  FROM public.org_api_keys
  WHERE id = p_key_id;
  RETURN result;
END;
$$;
```

- [ ] **Step 2: Add org_env_variables encryption section**

Append to the migration file:

```sql
-- ============================================================================
-- 5. Alter org_env_variables — encrypt value
-- ============================================================================

-- 5a. Add encrypted column
ALTER TABLE public.org_env_variables ADD COLUMN encrypted_value bytea;

-- 5b. Encrypt existing data (if any)
UPDATE public.org_env_variables
SET encrypted_value = encrypt_secret(value)
WHERE value IS NOT NULL;

-- 5c. Make encrypted_value NOT NULL, drop value
ALTER TABLE public.org_env_variables ALTER COLUMN encrypted_value SET NOT NULL;
ALTER TABLE public.org_env_variables DROP COLUMN value;

-- 5d. RPC: create env variable (encrypts value)
CREATE OR REPLACE FUNCTION create_org_env_variable(
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
BEGIN
  RETURN QUERY
  INSERT INTO public.org_env_variables (org_id, name, encrypted_value, is_secret, created_by)
  VALUES (p_org_id, p_name, encrypt_secret(p_value), p_is_secret, p_created_by)
  RETURNING
    public.org_env_variables.id,
    public.org_env_variables.org_id,
    public.org_env_variables.name,
    public.org_env_variables.is_secret,
    public.org_env_variables.created_at;
END;
$$;

-- 5e. RPC: get decrypted env variable value
CREATE OR REPLACE FUNCTION get_env_variable_value(p_var_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result text;
BEGIN
  SELECT decrypt_secret(encrypted_value) INTO result
  FROM public.org_env_variables
  WHERE id = p_var_id;
  RETURN result;
END;
$$;

-- 5f. RPC: update env variable (encrypts new value if provided)
CREATE OR REPLACE FUNCTION update_org_env_variable(
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
  UPDATE public.org_env_variables SET
    name = COALESCE(p_name, name),
    encrypted_value = CASE
      WHEN p_value IS NOT NULL THEN encrypt_secret(p_value)
      ELSE encrypted_value
    END,
    is_secret = COALESCE(p_is_secret, is_secret)
  WHERE id = p_var_id;
END;
$$;
```

- [ ] **Step 3: Add mcp_oauth_connections encryption section**

Append to the migration file:

```sql
-- ============================================================================
-- 6. Alter mcp_oauth_connections — encrypt tokens
-- ============================================================================

-- 6a. Add encrypted columns
ALTER TABLE public.mcp_oauth_connections
  ADD COLUMN encrypted_access_token bytea,
  ADD COLUMN encrypted_refresh_token bytea,
  ADD COLUMN encrypted_client_registration bytea;

-- 6b. Encrypt existing data
UPDATE public.mcp_oauth_connections SET
  encrypted_access_token = encrypt_secret(access_token),
  encrypted_refresh_token = CASE WHEN refresh_token IS NOT NULL THEN encrypt_secret(refresh_token) ELSE NULL END,
  encrypted_client_registration = encrypt_secret(client_registration)
WHERE access_token IS NOT NULL;

-- 6c. Make encrypted_access_token NOT NULL, drop plaintext columns
ALTER TABLE public.mcp_oauth_connections ALTER COLUMN encrypted_access_token SET NOT NULL;
ALTER TABLE public.mcp_oauth_connections ALTER COLUMN encrypted_client_registration SET NOT NULL;
ALTER TABLE public.mcp_oauth_connections DROP COLUMN access_token;
ALTER TABLE public.mcp_oauth_connections DROP COLUMN refresh_token;
ALTER TABLE public.mcp_oauth_connections DROP COLUMN client_registration;

-- 6c2. Drop key_version — was used for Node.js encryption key rotation, no longer needed with DB-level encryption
ALTER TABLE public.mcp_oauth_connections DROP COLUMN key_version;

-- 6d. RPC: get decrypted OAuth tokens
CREATE OR REPLACE FUNCTION get_oauth_tokens(p_connection_id uuid)
RETURNS TABLE(access_token text, refresh_token text, client_registration text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    decrypt_secret(c.encrypted_access_token),
    CASE WHEN c.encrypted_refresh_token IS NOT NULL
      THEN decrypt_secret(c.encrypted_refresh_token)
      ELSE NULL
    END,
    decrypt_secret(c.encrypted_client_registration)
  FROM public.mcp_oauth_connections c
  WHERE c.id = p_connection_id;
END;
$$;

-- 6e. RPC: upsert OAuth connection (encrypts tokens)
CREATE OR REPLACE FUNCTION upsert_oauth_connection(
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
  result_id uuid;
BEGIN
  INSERT INTO public.mcp_oauth_connections (
    org_id, library_item_id, client_id, encrypted_client_registration,
    encrypted_access_token, encrypted_refresh_token,
    token_endpoint, scopes, connected_by, expires_at
  ) VALUES (
    p_org_id, p_library_item_id, p_client_id,
    encrypt_secret(p_client_registration),
    encrypt_secret(p_access_token),
    CASE WHEN p_refresh_token IS NOT NULL THEN encrypt_secret(p_refresh_token) ELSE NULL END,
    p_token_endpoint, p_scopes, p_connected_by, p_expires_at
  )
  ON CONFLICT (org_id, library_item_id) DO UPDATE SET
    client_id = EXCLUDED.client_id,
    encrypted_client_registration = EXCLUDED.encrypted_client_registration,
    encrypted_access_token = EXCLUDED.encrypted_access_token,
    encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
    token_endpoint = EXCLUDED.token_endpoint,
    scopes = EXCLUDED.scopes,
    expires_at = EXCLUDED.expires_at
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;
```

- [ ] **Step 4: Run supabase db reset to verify**

Run: `npx supabase db reset`

Expected: all migrations apply, seed runs (will fail on env variable insert — that's expected and fixed in Task 3).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260321000000_security_and_execution_tables.sql
git commit -m "feat: encrypt org_api_keys, org_env_variables, mcp_oauth_connections"
```

---

## Task 3: Create agent execution tables

**Files:**
- Modify: `supabase/migrations/20260321000000_security_and_execution_tables.sql`

- [ ] **Step 1: Add execution keys table**

Append to the migration file:

```sql
-- ============================================================================
-- 7. Agent execution tables
-- ============================================================================

-- 7a. agent_execution_keys — Bearer tokens for external API callers
CREATE TABLE public.agent_execution_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  key_prefix   text NOT NULL,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX idx_execution_keys_org ON public.agent_execution_keys(org_id);

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

-- 7b. agent_execution_key_agents — scopes keys to specific agents
CREATE TABLE public.agent_execution_key_agents (
  key_id   uuid NOT NULL REFERENCES public.agent_execution_keys(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  PRIMARY KEY (key_id, agent_id)
);

CREATE INDEX idx_exec_key_agents_agent ON public.agent_execution_key_agents(agent_id, key_id);

ALTER TABLE public.agent_execution_key_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY exec_key_agents_select ON public.agent_execution_key_agents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_execution_keys k
    WHERE k.id = key_id AND is_org_member(k.org_id, auth.uid())
  ));

CREATE POLICY exec_key_agents_insert ON public.agent_execution_key_agents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_execution_keys k
    WHERE k.id = key_id AND is_org_member(k.org_id, auth.uid())
  ));

CREATE POLICY exec_key_agents_delete ON public.agent_execution_key_agents
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_execution_keys k
    WHERE k.id = key_id AND is_org_member(k.org_id, auth.uid())
  ));
```

- [ ] **Step 2: Add agent_sessions table**

Append:

```sql
-- 7c. agent_sessions — tracks session state per composite key
CREATE TABLE public.agent_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version          integer NOT NULL,
  tenant_id        text NOT NULL,
  user_id          text NOT NULL,
  session_id       text NOT NULL,
  channel          text NOT NULL DEFAULT 'web' CHECK (channel IN ('whatsapp', 'web')),
  current_node_id  text NOT NULL DEFAULT 'INITIAL_STEP',
  model            text NOT NULL,
  structured_outputs jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (agent_id, version, tenant_id, user_id, session_id, channel)
);

CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON public.agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sessions_org_agent ON public.agent_sessions(org_id, agent_id);
CREATE INDEX idx_sessions_org_agent_tenant ON public.agent_sessions(org_id, agent_id, tenant_id);
CREATE INDEX idx_sessions_org_agent_date ON public.agent_sessions(org_id, agent_id, created_at DESC);
CREATE INDEX idx_sessions_agent_version ON public.agent_sessions(agent_id, version);

ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_sessions_select ON public.agent_sessions
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));
```

- [ ] **Step 3: Add agent_executions table**

Append:

```sql
-- 7d. agent_executions — one row per API call, denormalized for dashboard
CREATE TABLE public.agent_executions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id           uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  tenant_id          text NOT NULL,
  external_user_id   text NOT NULL,
  channel            text NOT NULL DEFAULT 'web' CHECK (channel IN ('whatsapp', 'web')),
  execution_key_id   uuid REFERENCES public.agent_execution_keys(id) ON DELETE SET NULL,
  model              text NOT NULL,
  total_input_tokens  integer NOT NULL DEFAULT 0,
  total_output_tokens integer NOT NULL DEFAULT 0,
  total_cached_tokens integer NOT NULL DEFAULT 0,
  total_cost         numeric(12,6) NOT NULL DEFAULT 0,
  total_duration_ms  integer NOT NULL DEFAULT 0,
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  status             text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error              text
);

CREATE INDEX idx_executions_org_agent_date ON public.agent_executions(org_id, agent_id, started_at DESC);
CREATE INDEX idx_executions_org_agent_version ON public.agent_executions(org_id, agent_id, version, started_at DESC);
CREATE INDEX idx_executions_org_agent_tenant ON public.agent_executions(org_id, agent_id, tenant_id, started_at DESC);
CREATE INDEX idx_executions_org_agent_model ON public.agent_executions(org_id, agent_id, model, started_at DESC);
CREATE INDEX idx_executions_session ON public.agent_executions(session_id, started_at DESC);
CREATE INDEX idx_executions_running ON public.agent_executions(status) WHERE status = 'running';
CREATE INDEX idx_executions_org_date ON public.agent_executions(org_id, started_at DESC);
CREATE INDEX idx_executions_org_agent_channel ON public.agent_executions(org_id, agent_id, channel);

ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_executions_select ON public.agent_executions
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));
```

- [ ] **Step 4: Add agent_execution_nodes table**

Append:

```sql
-- 7e. agent_execution_nodes — per-node visit data with full LLM messages
CREATE TABLE public.agent_execution_nodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  uuid NOT NULL REFERENCES public.agent_executions(id) ON DELETE CASCADE,
  node_id       text NOT NULL,
  step_order    integer NOT NULL,
  messages_sent jsonb NOT NULL,
  response      jsonb NOT NULL,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,
  cost          numeric(12,6) NOT NULL DEFAULT 0,
  duration_ms   integer NOT NULL DEFAULT 0,
  model         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exec_nodes_execution ON public.agent_execution_nodes(execution_id, step_order);

ALTER TABLE public.agent_execution_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_execution_nodes_select ON public.agent_execution_nodes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_executions e
    WHERE e.id = execution_id AND is_org_member(e.org_id, auth.uid())
  ));
```

- [ ] **Step 5: Add agent_execution_messages table**

Append:

```sql
-- 7f. agent_execution_messages — conversation history per session
CREATE TABLE public.agent_execution_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  execution_id  uuid NOT NULL REFERENCES public.agent_executions(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content       jsonb NOT NULL,
  tool_calls    jsonb,
  tool_call_id  text,
  node_id       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exec_messages_session ON public.agent_execution_messages(session_id, created_at ASC);
CREATE INDEX idx_exec_messages_execution ON public.agent_execution_messages(execution_id);

ALTER TABLE public.agent_execution_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_execution_messages_select ON public.agent_execution_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_sessions s
    WHERE s.id = session_id AND is_org_member(s.org_id, auth.uid())
  ));
```

- [ ] **Step 6: Add materialized view**

Append:

```sql
-- ============================================================================
-- 8. Materialized view for dashboard level 1
-- ============================================================================
CREATE MATERIALIZED VIEW public.agent_execution_summary AS
SELECT
  e.org_id,
  e.agent_id,
  e.version,
  COUNT(*)::integer                           AS total_executions,
  SUM(e.total_input_tokens)::integer          AS total_input_tokens,
  SUM(e.total_output_tokens)::integer         AS total_output_tokens,
  SUM(e.total_cost)                           AS total_cost,
  COUNT(DISTINCT e.tenant_id)::integer        AS unique_tenants,
  COUNT(DISTINCT e.external_user_id)::integer AS unique_users,
  COUNT(DISTINCT e.session_id)::integer       AS unique_sessions,
  MAX(e.started_at)                           AS last_execution_at
FROM public.agent_executions e
WHERE e.status = 'completed'
GROUP BY e.org_id, e.agent_id, e.version;

CREATE UNIQUE INDEX idx_exec_summary_pk ON public.agent_execution_summary(org_id, agent_id, version);
```

- [ ] **Step 7: Run supabase db reset to verify all tables**

Run: `npx supabase db reset`

Expected: all migrations apply. Seed may fail on the env variable insert (uses old `value` column) — that's fixed in the next task.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260321000000_security_and_execution_tables.sql
git commit -m "feat: add agent execution tables with indexes, RLS, and materialized view"
```

---

## Task 4: Update seed.sql for encrypted columns

**Files:**
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Update the env variable insert to use encryption**

In `supabase/seed.sql`, find the env variable insert (section 11, around line 289-300):

Replace:
```sql
INSERT INTO public.org_env_variables (
  id, org_id, name, value, is_secret, created_by, created_at, updated_at
) VALUES (
  'd20ad0b2-dbc3-4b92-a6bb-d4f84fc6813c',
  v_org_id,
  'LINEAR_KEY',
  'lin_api_REPLACE_ME',
  true,
  v_user_id,
  now(), now()
) ON CONFLICT (org_id, name) DO NOTHING;
```

With:
```sql
INSERT INTO public.org_env_variables (
  id, org_id, name, encrypted_value, is_secret, created_by, created_at, updated_at
) VALUES (
  'd20ad0b2-dbc3-4b92-a6bb-d4f84fc6813c',
  v_org_id,
  'LINEAR_KEY',
  encrypt_secret('lin_api_REPLACE_ME'),
  true,
  v_user_id,
  now(), now()
) ON CONFLICT (org_id, name) DO NOTHING;
```

- [ ] **Step 2: Run supabase db reset to verify seed works**

Run: `npx supabase db reset`

Expected: all migrations apply AND seed runs without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "fix: update seed to use encrypted env variable values"
```

---

## Task 5: Update web lib for org_api_keys

**Files:**
- Modify: `packages/web/app/lib/api-keys.ts`

- [ ] **Step 1: Update createApiKey to use RPC**

In `packages/web/app/lib/api-keys.ts`, replace the `createApiKey` function:

```typescript
export async function createApiKey(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  keyValue: string
): Promise<{ result: ApiKeyRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_org_api_key', {
    p_org_id: orgId,
    p_name: name,
    p_key_value: keyValue,
  });

  if (error !== null) return { result: null, error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  if (rows.length === 0 || !isApiKeyRow(rows[0])) {
    return { result: null, error: 'Invalid API key data' };
  }
  return { result: rows[0], error: null };
}
```

- [ ] **Step 2: Update getApiKeyValueById to use RPC**

Replace the `getApiKeyValueById` function:

```typescript
export async function getApiKeyValueById(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ value: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_api_key_value', {
    p_key_id: keyId,
  });

  if (error !== null) return { value: null, error: error.message };
  return { value: (data as string) ?? null, error: null };
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/web`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/api-keys.ts
git commit -m "feat: use encrypted RPC functions for org_api_keys"
```

---

## Task 6: Update web lib for org_env_variables

**Files:**
- Modify: `packages/web/app/lib/org-env-variables.ts`

- [ ] **Step 1: Update OrgEnvVariableRow type — remove value field**

The list view no longer returns the `value` field (it's encrypted). Update the type and columns:

```typescript
export interface OrgEnvVariableRow {
  id: string;
  org_id: string;
  name: string;
  is_secret: boolean;
  created_at: string;
}
```

Update the type predicate:
```typescript
export function isOrgEnvVariableRow(value: unknown): value is OrgEnvVariableRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value && 'org_id' in value;
}
```

Update columns constants:
```typescript
const COLUMNS = 'id, org_id, name, is_secret, created_at';
const LIST_COLUMNS = 'id, org_id, name, is_secret, created_at';
```

- [ ] **Step 2: Update getEnvVariableValue to use RPC**

Replace:
```typescript
export async function getEnvVariableValue(
  supabase: SupabaseClient,
  variableId: string
): Promise<{ value: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_env_variable_value', {
    p_var_id: variableId,
  });

  if (error !== null) return { value: null, error: error.message };
  return { value: (data as string) ?? null, error: null };
}
```

- [ ] **Step 3: Update createEnvVariable to use RPC**

Replace:
```typescript
export async function createEnvVariable(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  value: string,
  isSecret: boolean
): Promise<{ result: OrgEnvVariableRow | null; error: string | null }> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { data, error } = await supabase.rpc('create_org_env_variable', {
    p_org_id: orgId,
    p_name: name,
    p_value: value,
    p_is_secret: isSecret,
    p_created_by: userId,
  });

  if (error !== null) return { result: null, error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  if (rows.length === 0 || !isOrgEnvVariableRow(rows[0])) {
    return { result: null, error: 'Invalid env variable data' };
  }
  return { result: rows[0], error: null };
}
```

- [ ] **Step 4: Update updateEnvVariable to use RPC**

Replace:
```typescript
export async function updateEnvVariable(
  supabase: SupabaseClient,
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_org_env_variable', {
    p_var_id: variableId,
    p_name: updates.name ?? null,
    p_value: updates.value ?? null,
    p_is_secret: updates.isSecret ?? null,
  });

  if (error !== null) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck -w packages/web`

Expected: may show errors in components that reference `row.value` — those are addressed in the next step.

- [ ] **Step 6: Fix EnvVariablesSection.tsx — remove `variable.value` reference**

In `packages/web/app/components/orgs/EnvVariablesSection.tsx` line 49, the `VariableRow` component renders:
```tsx
<MaskedValue value={variable.value} isSecret={variable.is_secret} />
```

Since `value` is no longer in `OrgEnvVariableRow`, replace this with a simple masked display:
```tsx
<span className="text-xs text-muted-foreground font-mono">••••••••</span>
```

The value is always masked in the list view — no need to fetch the decrypted value just for display.

- [ ] **Step 6b: Fix EditEnvVariableDialog.tsx — remove `variable.value` default**

In `packages/web/app/components/orgs/EditEnvVariableDialog.tsx` line 81, the edit form pre-fills:
```tsx
defaultValue={variable.value}
```

Since the value is no longer available, change to an empty field with placeholder text:
```tsx
defaultValue=""
placeholder={t('envVariables.enterNewValue')}
```

Add the translation key `envVariables.enterNewValue` = "Enter new value (leave empty to keep current)" to the translation files.

Also update the `update_org_env_variable` RPC call so that if `p_value` is empty string or null, it keeps the existing encrypted value (the RPC already handles this with `CASE WHEN p_value IS NOT NULL`).

- [ ] **Step 7: Run typecheck again**

Run: `npm run typecheck -w packages/web`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/lib/org-env-variables.ts packages/web/app/components/orgs/
git commit -m "feat: use encrypted RPC functions for org_env_variables"
```

---

## Task 7: Update OAuth connection code for encryption

**Files:**
- Modify: `packages/backend/src/db/queries/oauthConnectionOperations.ts`
- Delete: `packages/backend/src/mcp/oauth/encryption.ts` (dead code — encryption now in DB)
- Modify: any files importing from `encryption.ts`

- [ ] **Step 1: Update `oauthConnectionOperations.ts` — remove Node.js encryption imports**

In `packages/backend/src/db/queries/oauthConnectionOperations.ts`:

Remove the import:
```typescript
import { decrypt, encrypt } from '../../mcp/oauth/encryption.js';
```

- [ ] **Step 2: Update `OAuthConnectionRow` and schema — remove encrypted fields + `key_version`**

The `getConnection` function currently does `SELECT *` and gets plaintext columns. After encryption, those columns no longer exist. Instead, `getConnection` should:
1. SELECT non-secret columns directly: `id, org_id, library_item_id, client_id, expires_at, token_endpoint, scopes, connected_by`
2. Call the `get_oauth_tokens` RPC for secret columns

Update the interface:
```typescript
export interface OAuthConnectionRow {
  id: string;
  org_id: string;
  library_item_id: string;
  client_id: string;
  expires_at: string | null;
  token_endpoint: string;
  scopes: string | null;
  connected_by: string;
}
```

Remove `key_version` from `OAuthConnectionRowSchema`. Remove `client_registration`, `access_token`, `refresh_token` from schema.

- [ ] **Step 3: Rewrite `getConnection` to use RPC for secrets**

```typescript
export async function getConnection(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<DecryptedConnection | null> {
  const result = await supabase
    .from('mcp_oauth_connections')
    .select('id, org_id, library_item_id, client_id, expires_at, token_endpoint, scopes, connected_by')
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId)
    .single();

  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return null;
    throw new Error(`getConnection: ${result.error.message}`);
  }

  const row = OAuthConnectionRowSchema.parse(result.data);

  // Decrypt secret fields via DB RPC
  const { data: tokens, error: rpcError } = await supabase.rpc('get_oauth_tokens', {
    p_connection_id: row.id,
  });

  if (rpcError !== null) throw new Error(`getConnection decrypt: ${rpcError.message}`);
  const tokenRow = (tokens as unknown[])?.[0] as {
    access_token: string;
    refresh_token: string | null;
    client_registration: string;
  } | undefined;

  if (tokenRow === undefined) throw new Error('getConnection: no token data');

  return {
    id: row.id,
    orgId: row.org_id,
    libraryItemId: row.library_item_id,
    clientId: row.client_id,
    clientRegistration: tokenRow.client_registration,
    accessToken: tokenRow.access_token,
    refreshToken: tokenRow.refresh_token,
    expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
    tokenEndpoint: row.token_endpoint,
    scopes: row.scopes,
    connectedBy: row.connected_by,
  };
}
```

- [ ] **Step 4: Rewrite `upsertConnection` to use RPC**

```typescript
export async function upsertConnection(
  supabase: SupabaseClient,
  input: UpsertConnectionInput
): Promise<void> {
  const { error } = await supabase.rpc('upsert_oauth_connection', {
    p_org_id: input.orgId,
    p_library_item_id: input.libraryItemId,
    p_client_id: input.clientId,
    p_client_registration: input.clientRegistration,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken,
    p_token_endpoint: input.tokenEndpoint,
    p_scopes: input.scopes,
    p_connected_by: input.connectedBy,
    p_expires_at: input.expiresAt?.toISOString() ?? null,
  });
  if (error !== null) throw new Error(`upsertConnection: ${error.message}`);
}
```

- [ ] **Step 5: Remove `decryptRow` and `buildUpsertRow` functions**

These are now dead code — decryption happens in the DB RPC, not in Node.js.

- [ ] **Step 6: Delete `packages/backend/src/mcp/oauth/encryption.ts`**

This module used Node.js `crypto` for AES-256-GCM encryption with a `TOKEN_ENCRYPTION_KEY` env var. It's no longer needed — all encryption is DB-level.

- [ ] **Step 7: Fix any imports of `encryption.ts`**

Search for files importing from `../../mcp/oauth/encryption.js` or similar. Key files to check:
- `packages/backend/src/mcp/oauth/tokenRefresh.ts` — may call `encrypt()`/`decrypt()` for token refresh flows
- Any other files in `packages/backend/src/mcp/oauth/`

Replace any `encrypt()`/`decrypt()` calls with the equivalent RPC approach (supabase.rpc).

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`

Expected: no errors across all packages.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: use DB-level encryption for OAuth connections, remove Node.js encryption module"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run full check**

Run: `npm run check`

Expected: format, lint, and typecheck all pass.

- [ ] **Step 2: Run supabase db reset**

Run: `npx supabase db reset`

Expected: all migrations apply, seed runs, no errors.

- [ ] **Step 3: Verify the new tables exist**

Run in `npx supabase db` or via SQL editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'agent_%'
ORDER BY table_name;
```

Expected output should include:
- `agent_execution_keys`
- `agent_execution_key_agents`
- `agent_execution_messages`
- `agent_execution_nodes`
- `agent_executions`
- `agent_sessions`

And the materialized view:
- `agent_execution_summary`

- [ ] **Step 4: Verify encryption works**

Run SQL:
```sql
-- Test encrypt/decrypt round-trip
SELECT decrypt_secret(encrypt_secret('test-value')) = 'test-value';
-- Expected: true

-- Test that env variable is stored encrypted
SELECT encrypted_value IS NOT NULL, pg_typeof(encrypted_value)
FROM org_env_variables
WHERE name = 'LINEAR_KEY';
-- Expected: true, bytea

-- Test decrypt
SELECT decrypt_secret(encrypted_value) FROM org_env_variables WHERE name = 'LINEAR_KEY';
-- Expected: 'lin_api_REPLACE_ME'
```

- [ ] **Step 5: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address verification issues"
```

- [ ] **Step 6: Start the dev server and verify existing features work**

Run: `npm run dev -w packages/web` and `npm run dev -w packages/backend` (or however the dev server starts).

Verify:
1. Can log in
2. Can view agents
3. Can view settings page (API keys and env variables sections load without errors)
4. Can create a new API key (value stored encrypted, preview shows correctly)
5. Can create a new env variable (value stored encrypted)
6. Simulation still works (API key is decrypted correctly for OpenRouter calls)
