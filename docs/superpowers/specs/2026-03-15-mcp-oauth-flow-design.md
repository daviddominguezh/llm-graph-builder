# MCP OAuth Flow — Design Spec

## Overview

Enable MCP servers that require OAuth (Notion, Vercel, Square, etc.) to complete the OAuth authorization flow at install time. The user fills any non-OAuth variables first, then clicks "Discover Tools" which triggers the OAuth flow if needed. Tokens are encrypted at rest and refreshed automatically at runtime in the backend.

## Architecture

Follows the MCP Authorization spec. The MCP server advertises OAuth metadata at `/.well-known/oauth-authorization-server`. We use Dynamic Client Registration (RFC 7591) so no pre-registered OAuth apps are needed. Tokens are stored per-agent per-server in a dedicated table, encrypted with AES-256 using an application-level key.

---

## 1. Data Model

### New table: `mcp_oauth_connections`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `agent_id` | text | FK → graph_mcp_servers.agent_id |
| `server_id` | text | FK → graph_mcp_servers.server_id |
| `client_id` | text | From dynamic client registration |
| `client_registration` | text | Encrypted. Full registration response (client_secret if provided, etc.) |
| `access_token` | text | Encrypted |
| `refresh_token` | text, nullable | Encrypted |
| `expires_at` | timestamptz, nullable | When the access token expires |
| `token_endpoint` | text | For refresh — stored so we don't need to re-discover |
| `scopes` | text, nullable | Granted scopes |
| `connected_by` | uuid, FK → auth.users | Who completed the flow |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Unique constraint** on `(agent_id, server_id)` — one OAuth connection per MCP server per agent.

**RLS:** Scoped to org members using the existing `is_org_member` SECURITY DEFINER helper (join through `graph_mcp_servers` → agent → org).

### Encryption

- `access_token`, `refresh_token`, and `client_registration` are encrypted with AES-256-GCM before writing to the DB.
- Encryption key: `TOKEN_ENCRYPTION_KEY` environment variable on the backend.
- Format: `iv:ciphertext:authTag` (base64-encoded) so decryption is self-contained per value.
- The backend encrypts before INSERT/UPDATE and decrypts after SELECT. The DB only ever sees ciphertext.

---

## 2. OAuth Flow

### Step-by-step

1. User installs an OAuth MCP from the library → fills any non-OAuth variables → clicks "Discover Tools"
2. Frontend checks `auth_type === 'oauth'` on the server's library item
3. Instead of calling discover directly, frontend opens a new browser tab to: `GET {BACKEND_URL}/mcp/oauth/authorize?agentId=X&serverId=Y&mcpUrl=Z`
4. Backend fetches `{mcpUrl}/.well-known/oauth-authorization-server` to discover OAuth metadata (authorize URL, token URL, registration endpoint)
5. Backend performs Dynamic Client Registration (RFC 7591) at the registration endpoint → receives `client_id` (and optionally `client_secret`)
6. Backend builds the provider's authorize URL with appropriate params (`client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`)
7. Backend encodes `{ agentId, serverId, mcpUrl, clientId }` into a signed JWT `state` parameter (5-minute expiry, signed with `JWT_SECRET`)
8. Backend redirects the user's browser to the provider's authorize URL
9. User signs in on the provider's site, grants permissions
10. Provider redirects to `GET {BACKEND_URL}/mcp/oauth/callback?code=X&state=Y`
11. Backend verifies the `state` JWT, extracts context
12. Backend exchanges the auth code for tokens at the token endpoint
13. Backend encrypts tokens and stores in `mcp_oauth_connections`
14. Backend redirects the user back to the editor URL with a success indicator: `{WEB_URL}/orgs/{slug}/editor/{agent}?oauth=success&serverId=Y`
15. Frontend detects the `oauth=success` query param, auto-triggers discover tools for that server

### Auto-discovery fallback

If `/.well-known/oauth-authorization-server` is not available, fall back to stored OAuth metadata in the `mcp_library` table (future: optional `oauth_metadata` jsonb column). For now, if discovery fails, return an error to the user.

### Token refresh at runtime

Happens in `packages/backend/src/mcp/lifecycle.ts` when building MCP sessions:

1. For each MCP server in the session, check if it has an `mcp_oauth_connections` row
2. If yes, decrypt the tokens
3. If `expires_at` is past (or within a 60-second buffer), refresh using `refresh_token` + stored `token_endpoint`
4. Encrypt and update the stored tokens
5. Inject `Authorization: Bearer {access_token}` into the transport headers
6. If no refresh token and token expired → return error (connection is dead, user must re-authenticate)

---

## 3. Backend Routes

### `GET /mcp/oauth/authorize`

**Query params:** `agentId`, `serverId`, `mcpUrl`

1. Validate params
2. Fetch OAuth metadata from `{mcpUrl}/.well-known/oauth-authorization-server`
3. Perform Dynamic Client Registration
4. Build authorize URL with signed `state` JWT
5. Redirect (302) to provider's authorize URL

### `GET /mcp/oauth/callback`

**Query params:** `code`, `state`

1. Verify `state` JWT signature and expiry
2. Extract `agentId`, `serverId`, `mcpUrl`, `clientId`
3. Exchange `code` for tokens at the token endpoint
4. Encrypt tokens with AES-256-GCM
5. Upsert into `mcp_oauth_connections`
6. Redirect to `{WEB_URL}/orgs/.../editor/...?oauth=success&serverId=Y`

### `GET /mcp/oauth/status`

**Query params:** `agentId`, `serverId`

**Response:** `{ connected: boolean, connectedBy?: string, expiresAt?: string }`

Used by the frontend to check if an OAuth connection exists before showing "Connect" vs "Connected".

---

## 4. Backend Modules

### `packages/backend/src/mcp/oauth/` (new directory)

- **`discovery.ts`** — fetch and parse `/.well-known/oauth-authorization-server` metadata
- **`registration.ts`** — Dynamic Client Registration (RFC 7591)
- **`tokenExchange.ts`** — exchange auth code for tokens, refresh tokens
- **`encryption.ts`** — AES-256-GCM encrypt/decrypt helpers using `TOKEN_ENCRYPTION_KEY`
- **`stateJwt.ts`** — sign/verify the `state` JWT parameter

### `packages/backend/src/routes/oauth.ts` (new)

Express route handlers for `/mcp/oauth/authorize`, `/mcp/oauth/callback`, `/mcp/oauth/status`.

### `packages/backend/src/db/queries/oauthConnectionOperations.ts` (new)

CRUD for `mcp_oauth_connections`: `upsertConnection`, `getConnection`, `deleteConnection`.

### Changes to `packages/backend/src/mcp/lifecycle.ts`

Before creating MCP sessions, check for OAuth connections and inject resolved tokens into transport headers. Handle token refresh on expiry.

---

## 5. Frontend Changes

### Discover Tools trigger (`packages/web`)

In `useMcpServers.ts` (or the discover flow), when "Discover Tools" is clicked:

1. Check if the server's library item has `auth_type === 'oauth'`
2. Call `GET /mcp/oauth/status?agentId=X&serverId=Y` to check connection
3. If not connected: open a new browser tab to `GET {BACKEND_URL}/mcp/oauth/authorize?agentId=X&serverId=Y&mcpUrl=Z`
4. If connected: proceed with normal discover flow (the backend will inject the stored token)

### OAuth redirect handling

In the editor page component, detect `?oauth=success&serverId=Y` in the URL:
1. Remove the query params from the URL (clean up)
2. Auto-trigger discover tools for the specified server

### UI changes in `McpServersSection` / `LibraryServerFields`

For OAuth MCPs (`auth_type === 'oauth'`):
- If not connected: "Discover Tools" button label stays the same, but triggers OAuth flow instead
- If connected: show a small "Connected" badge, "Discover Tools" works normally
- No `VariableValuesEditor` shown for OAuth-only variables (the token is managed automatically)
- Non-OAuth variables (if any) still show the normal editor

### Library card

For OAuth MCPs in the library panel, show a small "OAuth" badge or icon to indicate the auth type.

---

## 6. Configuration

### New environment variables (backend)

- `TOKEN_ENCRYPTION_KEY` — 32-byte hex string for AES-256-GCM encryption of OAuth tokens
- `JWT_SECRET` — for signing/verifying state JWTs (can reuse existing if available)
- `OAUTH_CALLBACK_URL` — the public URL of the backend callback endpoint (e.g., `https://api.example.com/mcp/oauth/callback`)
- `WEB_URL` — the public URL of the web app (for redirect after OAuth, e.g., `https://app.example.com`)

---

## 7. Migration

```sql
CREATE TABLE mcp_oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  server_id text NOT NULL,
  client_id text NOT NULL,
  client_registration text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  token_endpoint text NOT NULL,
  scopes text,
  connected_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, server_id)
);

CREATE TRIGGER mcp_oauth_connections_updated_at
  BEFORE UPDATE ON mcp_oauth_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE mcp_oauth_connections ENABLE ROW LEVEL SECURITY;

-- RLS: allow access if user is member of the org that owns the agent
CREATE POLICY mcp_oauth_connections_select ON mcp_oauth_connections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM graph_mcp_servers gms
      JOIN agents a ON a.id = gms.agent_id
      WHERE gms.agent_id = mcp_oauth_connections.agent_id
        AND gms.server_id = mcp_oauth_connections.server_id
        AND is_org_member(a.org_id, auth.uid())
    )
  );

CREATE POLICY mcp_oauth_connections_insert ON mcp_oauth_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM graph_mcp_servers gms
      JOIN agents a ON a.id = gms.agent_id
      WHERE gms.agent_id = mcp_oauth_connections.agent_id
        AND gms.server_id = mcp_oauth_connections.server_id
        AND is_org_member(a.org_id, auth.uid())
    )
  );

CREATE POLICY mcp_oauth_connections_update ON mcp_oauth_connections
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM graph_mcp_servers gms
      JOIN agents a ON a.id = gms.agent_id
      WHERE gms.agent_id = mcp_oauth_connections.agent_id
        AND gms.server_id = mcp_oauth_connections.server_id
        AND is_org_member(a.org_id, auth.uid())
    )
  );

CREATE POLICY mcp_oauth_connections_delete ON mcp_oauth_connections
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM graph_mcp_servers gms
      JOIN agents a ON a.id = gms.agent_id
      WHERE gms.agent_id = mcp_oauth_connections.agent_id
        AND gms.server_id = mcp_oauth_connections.server_id
        AND is_org_member(a.org_id, auth.uid())
    )
  );
```
