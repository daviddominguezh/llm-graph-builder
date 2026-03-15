# MCP OAuth Flow — Design Spec

## Overview

Enable MCP servers that require OAuth (Notion, Vercel, Square, etc.) to complete the OAuth authorization flow at install time. The user fills any non-OAuth variables first, then clicks "Discover Tools" which triggers the OAuth flow if needed. Tokens are encrypted at rest and refreshed automatically at runtime in the backend. OAuth connections are org-wide — one connection per MCP server per org, shared by all agents.

## Architecture

Follows the MCP Authorization spec. MCP servers advertise OAuth metadata at their well-known endpoint. We use Dynamic Client Registration (RFC 7591) — the MCP server handles registration internally (Linear, Notion, Vercel, Square all do this at their hosted endpoints). No pre-registered OAuth apps or client credentials needed from the user. Tokens are stored encrypted with AES-256-GCM using an application-level key.

---

## 1. Data Model

### New table: `mcp_oauth_connections`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `org_id` | uuid, FK → organizations(id) | Org that owns this connection |
| `library_item_id` | uuid, FK → mcp_library(id) ON DELETE CASCADE | Which MCP server this connection is for |
| `client_id` | text | From dynamic client registration |
| `client_registration` | text | Encrypted. Full DCR response (client_secret if provided) |
| `access_token` | text | Encrypted |
| `refresh_token` | text, nullable | Encrypted |
| `expires_at` | timestamptz, nullable | When the access token expires |
| `token_endpoint` | text | Stored for refresh (avoid re-discovery) |
| `scopes` | text, nullable | Granted scopes |
| `connected_by` | uuid, FK → auth.users | Who completed the OAuth flow |
| `key_version` | integer, default 1 | For future encryption key rotation |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Unique constraint** on `(org_id, library_item_id)` — one OAuth connection per MCP server per org.

**RLS:** Scoped to org members using the existing `is_org_member` SECURITY DEFINER helper.

### Encryption

- `access_token`, `refresh_token`, and `client_registration` are encrypted with AES-256-GCM before writing to the DB.
- Encryption key: `TOKEN_ENCRYPTION_KEY` environment variable on the backend (32-byte hex string).
- IV: generated with `crypto.randomBytes(12)` for **each** encryption operation. Reusing an IV with the same key catastrophically breaks GCM security.
- Format: `iv:ciphertext:authTag` (base64-encoded) so decryption is self-contained per value.
- `key_version` column enables future key rotation without a flag day.
- The backend encrypts before INSERT/UPDATE and decrypts after SELECT. The DB only ever sees ciphertext.

---

## 2. OAuth Flow

### Step-by-step

1. User installs an OAuth MCP from the library → fills any non-OAuth variables → clicks "Discover Tools"
2. Frontend checks `auth_type === 'oauth'` on the server's library item
3. Frontend calls `GET /mcp/oauth/status?orgId=X&libraryItemId=Y` to check if a connection exists
4. If connected: proceed with normal discover flow (backend injects stored token)
5. If not connected: frontend opens a new browser tab to `GET {BACKEND_URL}/mcp/oauth/authorize?orgId=X&libraryItemId=Y`
6. Backend looks up the MCP server URL from the `mcp_library` table using `libraryItemId` (never accepts URL from query params — prevents SSRF/open-redirect)
7. Backend constructs the well-known URL correctly: `{origin}/.well-known/oauth-authorization-server{path}` (per RFC 8414 as adapted by MCP spec)
8. Backend fetches OAuth metadata (authorize URL, token URL, registration endpoint, scopes_supported)
9. Backend checks if a DCR registration already exists for this `(org_id, library_item_id)` — reuses if present, otherwise performs Dynamic Client Registration (RFC 7591)
10. Backend generates PKCE `code_verifier` (cryptographic random, 43 chars) and computes `code_challenge = BASE64URL(SHA256(code_verifier))`
11. Backend builds the authorize URL with: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `code_challenge`, `code_challenge_method=S256`, `resource={mcp_server_url}` (RFC 8707), `state`
12. Backend encodes `{ orgId, libraryItemId, userId, codeVerifier }` into a signed JWT `state` parameter (5-minute expiry, signed with `JWT_SECRET`)
13. Backend redirects the user's browser to the provider's authorize URL
14. User signs in on the provider's site, grants permissions
15. Provider redirects to `GET {BACKEND_URL}/mcp/oauth/callback?code=X&state=Y`
16. Backend verifies the `state` JWT signature and expiry
17. Backend verifies `userId` in the JWT matches the authenticated user (prevents cross-user CSRF within same org)
18. Backend exchanges the auth code for tokens at the token endpoint, including `code_verifier` for PKCE and `resource` parameter. Uses `token_endpoint_auth_method` from DCR response to send credentials correctly (Basic auth or POST body)
19. Backend encrypts tokens with AES-256-GCM and upserts into `mcp_oauth_connections`
20. Backend redirects the user back to the editor: `{WEB_URL}/orgs/{slug}/editor/{agent}?oauth=success&serverId=Y` (slug looked up server-side, never from user input)
21. Frontend detects the `oauth=success` query param, cleans URL, auto-triggers discover tools

### Well-known URL construction

Per the MCP spec (RFC 8414 adapted): for an MCP server at `https://api.example.com/v1/mcp`, the metadata URL is:

```
https://api.example.com/.well-known/oauth-authorization-server/v1/mcp
```

Algorithm: take the origin, prepend `/.well-known/oauth-authorization-server`, append the path component.

### Token refresh at runtime

Happens in `packages/backend/src/mcp/lifecycle.ts` when building MCP sessions:

1. For each MCP server that has `auth_type === 'oauth'`, look up the org's `mcp_oauth_connections` row (via `org_id` + `library_item_id`)
2. If no connection exists: return error (user must connect first)
3. `SELECT ... FOR UPDATE` to acquire a row-level lock (prevents concurrent refresh race conditions)
4. Decrypt the tokens
5. If `expires_at` is past (or within a 5-minute buffer): refresh using `refresh_token` + stored `token_endpoint`
6. If refresh succeeds: encrypt and update stored tokens, release lock
7. If refresh fails with `invalid_grant`: mark connection as stale, return error (user must re-authenticate)
8. Inject `Authorization: Bearer {access_token}` into the transport headers
9. If a 401 is received mid-session during MCP tool calls: attempt token refresh and retry once

### Error states

| Scenario | Behavior |
|----------|----------|
| No connection exists | Error: "MCP requires OAuth. Click Discover Tools to connect." |
| Token expired, refresh succeeds | Transparent to user — new token used |
| Token expired, refresh fails | Error: "Connection expired. Reconnect via Discover Tools." |
| Provider revoked access | Same as refresh failure — detected on next use |
| Provider down during refresh | Error returned, connection kept (don't delete) |

---

## 3. Backend Routes

All in `packages/backend/src/routes/oauth.ts`.

### `GET /mcp/oauth/authorize`

**Query params:** `orgId`, `libraryItemId`

1. Validate params
2. Look up MCP server URL from `mcp_library` table (prevents SSRF)
3. Construct well-known URL correctly and fetch OAuth metadata
4. Check for existing DCR registration — reuse `client_id` if present
5. If no registration: perform Dynamic Client Registration
6. Generate PKCE `code_verifier` + `code_challenge`
7. Build authorize URL with all required params including `resource` (RFC 8707)
8. Sign state JWT with `{ orgId, libraryItemId, userId, codeVerifier }` (5-min expiry)
9. Redirect (302) to provider's authorize URL

### `GET /mcp/oauth/callback`

**Query params:** `code`, `state`

1. Verify `state` JWT signature and expiry
2. Verify `userId` matches authenticated user
3. Extract `orgId`, `libraryItemId`, `codeVerifier`
4. Look up MCP server URL and token endpoint from DB/metadata
5. Exchange `code` for tokens (with `code_verifier` for PKCE, `resource` param, correct auth method)
6. Encrypt tokens with AES-256-GCM (fresh IV per value)
7. Upsert into `mcp_oauth_connections`
8. Look up org slug and agent slug server-side for redirect URL
9. Redirect to `{WEB_URL}/orgs/{slug}/editor/{agent}?oauth=success&serverId=Y`

### `GET /mcp/oauth/status`

**Query params:** `orgId`, `libraryItemId`

**Response:** `{ connected: boolean, connectedBy?: string, expiresAt?: string }`

### `DELETE /mcp/oauth/connections`

**Query params:** `orgId`, `libraryItemId`

1. Optionally call provider's revocation endpoint (RFC 7009) if advertised in metadata
2. Delete the `mcp_oauth_connections` row

---

## 4. Backend Modules

### `packages/backend/src/mcp/oauth/` (new directory)

- **`discovery.ts`** — fetch and parse well-known OAuth metadata. Correct URL construction per RFC 8414.
- **`registration.ts`** — Dynamic Client Registration (RFC 7591). Check for existing registration before creating new one.
- **`tokenExchange.ts`** — exchange auth code for tokens (with PKCE), refresh tokens. Handle `token_endpoint_auth_method` (Basic vs POST body).
- **`encryption.ts`** — AES-256-GCM encrypt/decrypt. Fresh `crypto.randomBytes(12)` IV per encryption. `key_version` support.
- **`stateJwt.ts`** — sign/verify state JWT. Payload includes `userId` for CSRF protection.

### `packages/backend/src/routes/oauth.ts` (new)

Express route handlers for all 4 endpoints.

### `packages/backend/src/db/queries/oauthConnectionOperations.ts` (new)

- `getConnection(orgId, libraryItemId)` — SELECT with optional FOR UPDATE
- `upsertConnection(...)` — INSERT ... ON CONFLICT UPDATE
- `deleteConnection(orgId, libraryItemId)`

### Changes to `packages/backend/src/mcp/lifecycle.ts`

When building MCP sessions:
1. For OAuth servers: fetch connection, refresh if needed (with row lock), inject token
2. Handle 401 mid-session: refresh and retry once

---

## 5. Frontend Changes

### Discover Tools trigger

In the discover flow, when "Discover Tools" is clicked on an OAuth MCP:

1. Check `auth_type === 'oauth'` on the library item
2. Call `GET /mcp/oauth/status?orgId=X&libraryItemId=Y`
3. If not connected: open new browser tab to `{BACKEND_URL}/mcp/oauth/authorize?orgId=X&libraryItemId=Y`
4. If connected: proceed with normal discover (backend handles token injection)

### OAuth redirect handling

In the editor page component, detect `?oauth=success&serverId=Y`:
1. Remove query params from URL (clean up)
2. Auto-trigger discover tools for the specified server

### UI in `LibraryServerFields`

For OAuth MCPs:
- If not connected: "Discover Tools" triggers OAuth flow
- If connected: show "Connected" badge, "Discover Tools" works normally
- Non-OAuth variables (if any) still show the normal variable editor
- Add a "Disconnect" option that calls `DELETE /mcp/oauth/connections`

### Re-authorization

When a connection is stale (refresh failed):
- Show "Connection expired — click Discover Tools to reconnect"
- "Discover Tools" triggers the OAuth flow again (upserts over the stale connection)

### Library card

Show a small lock/OAuth icon on library cards where `auth_type === 'oauth'`.

---

## 6. Configuration

### New environment variables (backend)

| Variable | Description |
|----------|-------------|
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex string for AES-256-GCM. Must be kept secret. |
| `JWT_SECRET` | For signing state JWTs. Can reuse existing if available. |
| `OAUTH_CALLBACK_URL` | Public URL of backend callback (e.g., `http://localhost:4000/mcp/oauth/callback` for dev) |
| `WEB_URL` | Public URL of web app (e.g., `http://localhost:3101` for dev) |

---

## 7. Migration

```sql
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
```
