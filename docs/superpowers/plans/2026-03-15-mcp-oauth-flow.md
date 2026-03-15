# MCP OAuth Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable OAuth-based MCP servers to complete authorization at install time, store encrypted tokens, and use them automatically at runtime with transparent refresh.

**Architecture:** OAuth flow runs through the Express backend (`packages/backend`). MCP servers advertise OAuth metadata via `/.well-known/oauth-authorization-server`. Dynamic Client Registration gets a `client_id` automatically. Tokens are AES-256-GCM encrypted, stored in `mcp_oauth_connections` (org-wide), and injected into MCP transport headers at runtime. Token refresh on 401 with `SELECT ... FOR UPDATE` mutex.

**Tech Stack:** Express, jose (JWT signing), Node crypto (AES-256-GCM), Supabase (Postgres), @ai-sdk/mcp

---

## File Structure

### New files (backend)

| File | Responsibility |
|------|---------------|
| `packages/backend/src/mcp/oauth/encryption.ts` | AES-256-GCM encrypt/decrypt with random IV per operation |
| `packages/backend/src/mcp/oauth/stateJwt.ts` | Sign/verify OAuth state JWT (includes userId, PKCE code_verifier) |
| `packages/backend/src/mcp/oauth/discovery.ts` | Fetch and parse `/.well-known/oauth-authorization-server` metadata |
| `packages/backend/src/mcp/oauth/registration.ts` | Dynamic Client Registration (RFC 7591) |
| `packages/backend/src/mcp/oauth/tokenExchange.ts` | Exchange auth code for tokens, refresh tokens (with PKCE, resource param) |
| `packages/backend/src/mcp/oauth/tokenRefresh.ts` | Refresh logic with row-level locking and error classification |
| `packages/backend/src/routes/oauth.ts` | Express route handlers: authorize, callback, status, disconnect |
| `packages/backend/src/db/queries/oauthConnectionOperations.ts` | CRUD for mcp_oauth_connections table |
| `supabase/migrations/20260315100000_mcp_oauth_connections.sql` | Create table, RLS policies |

### New files (web)

| File | Responsibility |
|------|---------------|
| `packages/web/app/hooks/useOAuthStatus.ts` | Check OAuth connection status for a server |

### Modified files

| File | Changes |
|------|---------|
| `packages/backend/src/server.ts` | Register OAuth routes |
| `packages/backend/src/mcp/lifecycle.ts` | Inject OAuth tokens into transport headers, handle 401 refresh |
| `packages/backend/src/mcp/client.ts` | Accept injected headers override |
| `packages/backend/package.json` | Add `jose` dependency |
| `packages/web/app/components/panels/McpServersSection.tsx` | Show "Connected" badge for OAuth servers |
| `packages/web/app/components/panels/LibraryServerFields.tsx` | OAuth connect/disconnect UI |
| `packages/web/app/hooks/useMcpServers.ts` | Trigger OAuth flow on discover for OAuth servers |
| `packages/web/app/hooks/useMcpDiscovery.ts` | Skip OAuth servers without connections during auto-discover |
| `packages/web/messages/en.json` | OAuth-related translations |

---

## Chunk 1: Backend OAuth Infrastructure

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260315100000_mcp_oauth_connections.sql`

- [ ] **Step 1: Create migration file**

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

- [ ] **Step 2: Run migration**

Run: `supabase db reset`
Expected: All migrations pass including the new one.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260315100000_mcp_oauth_connections.sql
git commit -m "feat: add mcp_oauth_connections table"
```

---

### Task 2: AES-256-GCM encryption module

**Files:**
- Create: `packages/backend/src/mcp/oauth/encryption.ts`

- [ ] **Step 1: Create encryption module**

Uses Node's built-in `crypto` module. No external dependencies.

```ts
// packages/backend/src/mcp/oauth/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SEPARATOR = ':';

function getEncryptionKey(): Buffer {
  const hex = process.env['TOKEN_ENCRYPTION_KEY'];
  if (hex === undefined || hex.length === 0) {
    throw new Error('TOKEN_ENCRYPTION_KEY env var is required');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), encrypted.toString('base64'), authTag.toString('base64')].join(SEPARATOR);
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivB64, encB64, tagB64] = ciphertext.split(SEPARATOR);
  if (ivB64 === undefined || encB64 === undefined || tagB64 === undefined) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/mcp/oauth/encryption.ts
git commit -m "feat: add AES-256-GCM encryption module for OAuth tokens"
```

---

### Task 3: State JWT module

**Files:**
- Create: `packages/backend/src/mcp/oauth/stateJwt.ts`
- Modify: `packages/backend/package.json` (add `jose`)

- [ ] **Step 1: Add jose dependency**

```bash
npm install jose -w packages/backend
```

- [ ] **Step 2: Create state JWT module**

```ts
// packages/backend/src/mcp/oauth/stateJwt.ts
import { SignJWT, jwtVerify } from 'jose';

const STATE_EXPIRY = '5m';

export interface OAuthStatePayload {
  orgId: string;
  libraryItemId: string;
  userId: string;
  codeVerifier: string;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env['JWT_SECRET'];
  if (secret === undefined || secret.length === 0) {
    throw new Error('JWT_SECRET env var is required');
  }
  return new TextEncoder().encode(secret);
}

export async function signState(payload: OAuthStatePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(STATE_EXPIRY)
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyState(token: string): Promise<OAuthStatePayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return {
    orgId: payload['orgId'] as string,
    libraryItemId: payload['libraryItemId'] as string,
    userId: payload['userId'] as string,
    codeVerifier: payload['codeVerifier'] as string,
  };
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/mcp/oauth/stateJwt.ts packages/backend/package.json package-lock.json
git commit -m "feat: add OAuth state JWT sign/verify module"
```

---

### Task 4: OAuth discovery module

**Files:**
- Create: `packages/backend/src/mcp/oauth/discovery.ts`

- [ ] **Step 1: Create discovery module**

Constructs the well-known URL per RFC 8414 as adapted by MCP spec: `{origin}/.well-known/oauth-authorization-server{path}`.

```ts
// packages/backend/src/mcp/oauth/discovery.ts

export interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  revocation_endpoint?: string;
}

function buildWellKnownUrl(mcpServerUrl: string): string {
  const parsed = new URL(mcpServerUrl);
  return `${parsed.origin}/.well-known/oauth-authorization-server${parsed.pathname}`;
}

export async function discoverOAuthMetadata(mcpServerUrl: string): Promise<OAuthMetadata> {
  const wellKnownUrl = buildWellKnownUrl(mcpServerUrl);
  const res = await fetch(wellKnownUrl);
  if (!res.ok) {
    throw new Error(`OAuth discovery failed: ${String(res.status)} from ${wellKnownUrl}`);
  }
  return (await res.json()) as OAuthMetadata;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/mcp/oauth/discovery.ts
git commit -m "feat: add MCP OAuth metadata discovery (RFC 8414)"
```

---

### Task 5: Dynamic Client Registration module

**Files:**
- Create: `packages/backend/src/mcp/oauth/registration.ts`

- [ ] **Step 1: Create registration module**

```ts
// packages/backend/src/mcp/oauth/registration.ts

export interface ClientRegistration {
  client_id: string;
  client_secret?: string;
  token_endpoint_auth_method?: string;
  [key: string]: unknown;
}

export async function registerClient(
  registrationEndpoint: string,
  callbackUrl: string
): Promise<ClientRegistration> {
  const body = {
    redirect_uris: [callbackUrl],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  };

  const res = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dynamic client registration failed: ${String(res.status)} — ${text}`);
  }

  return (await res.json()) as ClientRegistration;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/mcp/oauth/registration.ts
git commit -m "feat: add Dynamic Client Registration (RFC 7591)"
```

---

### Task 6: Token exchange module

**Files:**
- Create: `packages/backend/src/mcp/oauth/tokenExchange.ts`

- [ ] **Step 1: Create token exchange module**

Handles both initial code exchange (with PKCE) and token refresh. Supports `client_secret_post` and `client_secret_basic` auth methods.

```ts
// packages/backend/src/mcp/oauth/tokenExchange.ts

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

interface ClientCredentials {
  clientId: string;
  clientSecret?: string;
  authMethod?: string;
}

function buildAuthHeaders(creds: ClientCredentials): Record<string, string> {
  if (creds.authMethod === 'client_secret_basic' && creds.clientSecret !== undefined) {
    const encoded = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

function buildAuthBody(creds: ClientCredentials): Record<string, string> {
  const body: Record<string, string> = { client_id: creds.clientId };
  if (creds.authMethod !== 'client_secret_basic' && creds.clientSecret !== undefined) {
    body['client_secret'] = creds.clientSecret;
  }
  return body;
}

export async function exchangeCode(
  tokenEndpoint: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  resourceUrl: string,
  creds: ClientCredentials
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    ...buildAuthBody(creds),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    resource: resourceUrl,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...buildAuthHeaders(creds) },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${String(res.status)} — ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(
  tokenEndpoint: string,
  refreshToken: string,
  resourceUrl: string,
  creds: ClientCredentials
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    ...buildAuthBody(creds),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    resource: resourceUrl,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...buildAuthHeaders(creds) },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${String(res.status)} — ${text}`);
  }

  return (await res.json()) as TokenResponse;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/mcp/oauth/tokenExchange.ts
git commit -m "feat: add OAuth token exchange and refresh (with PKCE + resource)"
```

---

### Task 7: OAuth connection DB operations

**Files:**
- Create: `packages/backend/src/db/queries/oauthConnectionOperations.ts`

- [ ] **Step 1: Create CRUD module**

```ts
// packages/backend/src/db/queries/oauthConnectionOperations.ts
import { encrypt, decrypt } from '../../mcp/oauth/encryption.js';

import type { SupabaseClient } from './operationHelpers.js';

export interface OAuthConnectionRow {
  id: string;
  org_id: string;
  library_item_id: string;
  client_id: string;
  client_registration: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  token_endpoint: string;
  scopes: string | null;
  connected_by: string;
  key_version: number;
}

export interface DecryptedConnection {
  id: string;
  orgId: string;
  libraryItemId: string;
  clientId: string;
  clientRegistration: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  tokenEndpoint: string;
  scopes: string | null;
}

function decryptRow(row: OAuthConnectionRow): DecryptedConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    libraryItemId: row.library_item_id,
    clientId: row.client_id,
    clientRegistration: decrypt(row.client_registration),
    accessToken: decrypt(row.access_token),
    refreshToken: row.refresh_token !== null ? decrypt(row.refresh_token) : null,
    expiresAt: row.expires_at !== null ? new Date(row.expires_at) : null,
    tokenEndpoint: row.token_endpoint,
    scopes: row.scopes,
  };
}

export async function getConnection(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<DecryptedConnection | null> {
  const { data, error } = await supabase
    .from('mcp_oauth_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId)
    .single();

  if (error !== null || data === null) return null;
  return decryptRow(data as OAuthConnectionRow);
}

interface UpsertConnectionInput {
  orgId: string;
  libraryItemId: string;
  clientId: string;
  clientRegistration: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  tokenEndpoint: string;
  scopes: string | null;
  connectedBy: string;
}

export async function upsertConnection(
  supabase: SupabaseClient,
  input: UpsertConnectionInput
): Promise<void> {
  const row = {
    org_id: input.orgId,
    library_item_id: input.libraryItemId,
    client_id: input.clientId,
    client_registration: encrypt(input.clientRegistration),
    access_token: encrypt(input.accessToken),
    refresh_token: input.refreshToken !== null ? encrypt(input.refreshToken) : null,
    expires_at: input.expiresAt?.toISOString() ?? null,
    token_endpoint: input.tokenEndpoint,
    scopes: input.scopes,
    connected_by: input.connectedBy,
  };

  const { error } = await supabase
    .from('mcp_oauth_connections')
    .upsert(row, { onConflict: 'org_id,library_item_id' });

  if (error !== null) throw new Error(`Failed to upsert OAuth connection: ${error.message}`);
}

export async function deleteConnection(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<void> {
  const { error } = await supabase
    .from('mcp_oauth_connections')
    .delete()
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId);

  if (error !== null) throw new Error(`Failed to delete OAuth connection: ${error.message}`);
}

export async function getConnectionStatus(
  supabase: SupabaseClient,
  orgId: string,
  libraryItemId: string
): Promise<{ connected: boolean; connectedBy?: string; expiresAt?: string }> {
  const { data, error } = await supabase
    .from('mcp_oauth_connections')
    .select('connected_by, expires_at')
    .eq('org_id', orgId)
    .eq('library_item_id', libraryItemId)
    .single();

  if (error !== null || data === null) return { connected: false };
  const row = data as { connected_by: string; expires_at: string | null };
  return { connected: true, connectedBy: row.connected_by, expiresAt: row.expires_at ?? undefined };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/queries/oauthConnectionOperations.ts
git commit -m "feat: add OAuth connection CRUD operations with encryption"
```

---

## Chunk 2: Backend OAuth Routes

### Task 8: OAuth route handlers

**Files:**
- Create: `packages/backend/src/routes/oauth.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Create PKCE helper**

Add a `pkce.ts` utility (or inline in the route file):

```ts
// packages/backend/src/mcp/oauth/pkce.ts
import { createHash, randomBytes } from 'node:crypto';

const VERIFIER_LENGTH = 43;

export function generateCodeVerifier(): string {
  return randomBytes(VERIFIER_LENGTH).toString('base64url').slice(0, VERIFIER_LENGTH);
}

export function computeCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
```

- [ ] **Step 2: Create OAuth route handlers**

The authorize handler looks up the MCP URL from the DB (never from query params), discovers OAuth metadata, performs DCR if needed, generates PKCE, signs the state JWT, and redirects.

The callback handler verifies the state JWT (including userId), exchanges the code, encrypts tokens, and upserts the connection.

The status handler checks if a connection exists.

The disconnect handler deletes the connection.

**CRITICAL:** Each route handler function must be ≤40 lines. Extract helpers as needed. The authorize flow has many steps — split into `buildAuthorizeUrl()` and `handleAuthorize()` helpers. Similarly split callback into `handleCallback()` + `processTokenResponse()`.

The routes need a Supabase client to read `mcp_library` and write `mcp_oauth_connections`. Since `/mcp/oauth/authorize` is called from a browser redirect (no Bearer token in the request), use the service role key or an admin client for DB access. For the callback, similarly use an admin client since it's a redirect from the OAuth provider.

**Environment variables needed:**
- `OAUTH_CALLBACK_URL` — e.g., `http://localhost:4000/mcp/oauth/callback`
- `WEB_URL` — e.g., `http://localhost:3101`
- `TOKEN_ENCRYPTION_KEY` — 32-byte hex
- `JWT_SECRET` — for state JWT

Register the routes in `server.ts`:
```ts
app.get('/mcp/oauth/authorize', handleOAuthAuthorize);
app.get('/mcp/oauth/callback', handleOAuthCallback);
app.get('/mcp/oauth/status', handleOAuthStatus);
app.delete('/mcp/oauth/connections', handleOAuthDisconnect);
```

The status and disconnect endpoints should use `requireAuth` middleware since they need the user's identity.

- [ ] **Step 3: Register routes in server.ts**

In `packages/backend/src/server.ts`, import and register the OAuth routes. The authorize and callback routes are public (browser redirects). The status and disconnect routes go on the authenticated router.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/oauth.ts packages/backend/src/mcp/oauth/pkce.ts packages/backend/src/server.ts
git commit -m "feat: add OAuth authorize, callback, status, and disconnect routes"
```

---

## Chunk 3: Token Injection at Runtime

### Task 9: Inject OAuth tokens in MCP lifecycle

**Files:**
- Modify: `packages/backend/src/mcp/lifecycle.ts`
- Create: `packages/backend/src/mcp/oauth/tokenRefresh.ts`

- [ ] **Step 1: Create token refresh module**

Handles checking expiry, refreshing with row lock, updating stored tokens.

```ts
// packages/backend/src/mcp/oauth/tokenRefresh.ts
```

Key logic:
- Accept a `DecryptedConnection` and the MCP server URL
- If `expiresAt` is null or more than 5 minutes in the future: return the existing `accessToken`
- Otherwise: call `refreshAccessToken()` from `tokenExchange.ts`
- On success: call `upsertConnection()` to update the stored tokens
- On `invalid_grant` error: throw a typed error indicating re-auth needed
- On other errors: throw with context

For the row-level lock (`SELECT ... FOR UPDATE`), this needs to use a raw SQL query since Supabase JS client doesn't support `FOR UPDATE`. Use `supabase.rpc()` with a Postgres function, or accept eventual consistency for now and use optimistic concurrency (check `updated_at` before writing back).

- [ ] **Step 2: Modify lifecycle.ts**

In `createMcpSession()`, before connecting to each MCP server:

1. Check if the server has `libraryItemId` and the library item has `auth_type === 'oauth'`
2. If so, fetch the OAuth connection for the org
3. Refresh the token if needed
4. Inject `Authorization: Bearer {accessToken}` into the transport headers

This requires the function to receive `orgId` as a parameter (currently it only receives `McpServerConfig[]`). Update the signature and all callers.

**Important:** The simulate handler (`simulateHandler.ts`) doesn't have org context since `/simulate` is unauthenticated. The org_id and library_item_id need to be passed in the request body along with the MCP servers, or the Next.js simulate route needs to resolve OAuth tokens before proxying (similar to how it resolves variable values).

The cleaner approach: resolve OAuth tokens in the **Next.js simulate route** (`packages/web/app/api/simulate/route.ts`) before proxying — consistent with how variable resolution already works there. Add a `resolveOAuthTokens()` step alongside the existing `resolveServerVariables()`.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/mcp/oauth/tokenRefresh.ts packages/backend/src/mcp/lifecycle.ts
git commit -m "feat: inject OAuth tokens into MCP transport at runtime"
```

---

### Task 10: Resolve OAuth tokens in Next.js simulate route

**Files:**
- Modify: `packages/web/app/api/simulate/route.ts`
- Create: `packages/web/app/lib/resolve-oauth.ts`

- [ ] **Step 1: Create OAuth resolution utility**

```ts
// packages/web/app/lib/resolve-oauth.ts
```

For each MCP server in the graph payload that has `libraryItemId` and `auth_type === 'oauth'`:
1. Look up `mcp_oauth_connections` row for the org
2. If connected: inject `Authorization: Bearer {access_token}` into transport headers
3. If token expired: call the backend's refresh endpoint or do server-side refresh

Since the Next.js route has a Supabase client (user-scoped via RLS), it can read `mcp_oauth_connections` and decrypt tokens. But decryption requires `TOKEN_ENCRYPTION_KEY` which is a backend env var.

**Alternative approach:** Add a backend endpoint `POST /mcp/oauth/resolve-token` that accepts `orgId` + `libraryItemId`, checks/refreshes the token, and returns the current access token. The Next.js simulate route calls this for each OAuth server, then injects the token into the transport config before proxying.

This keeps encryption/decryption entirely in the backend.

- [ ] **Step 2: Update simulate route**

In `packages/web/app/api/simulate/route.ts`, after the existing `resolveMcpServersInGraph()` call, add an OAuth token resolution step that calls the backend for each OAuth server.

- [ ] **Step 3: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/resolve-oauth.ts packages/web/app/api/simulate/route.ts
git commit -m "feat: resolve OAuth tokens in simulate route before proxying"
```

---

## Chunk 4: Frontend Integration

### Task 11: Add translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add OAuth-related translations**

Add to the `mcpLibrary` namespace:

```json
"oauthConnect": "Connect",
"oauthConnected": "Connected",
"oauthDisconnect": "Disconnect",
"oauthExpired": "Connection expired — click Discover Tools to reconnect",
"oauthRequired": "This MCP requires sign-in. Click Discover Tools to connect.",
"oauthSuccess": "Successfully connected!",
"oauthError": "Failed to connect. Please try again."
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add OAuth-related translations"
```

---

### Task 12: OAuth status hook

**Files:**
- Create: `packages/web/app/hooks/useOAuthStatus.ts`

- [ ] **Step 1: Create hook**

Calls the backend's `/mcp/oauth/status` endpoint to check if an OAuth connection exists.

```ts
// packages/web/app/hooks/useOAuthStatus.ts
```

Returns `{ connected: boolean, loading: boolean, connectedBy?: string }`.

Uses the `NEXT_PUBLIC_API_URL` to call the backend.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/hooks/useOAuthStatus.ts
git commit -m "feat: add useOAuthStatus hook"
```

---

### Task 13: Update discover flow for OAuth

**Files:**
- Modify: `packages/web/app/hooks/useMcpServers.ts`
- Modify: `packages/web/app/hooks/useMcpDiscovery.ts`

- [ ] **Step 1: Update useToolDiscovery in useMcpServers**

When "Discover Tools" is clicked on a server with `auth_type === 'oauth'`:
1. Check OAuth status via backend
2. If not connected: open new browser tab to `{API_URL}/mcp/oauth/authorize?orgId=X&libraryItemId=Y`
3. If connected: proceed with normal discover

The `auth_type` information needs to come from the library item data. Thread it through via `McpServerConfig` or look it up from the library data already loaded by `useMcpLibrary`.

- [ ] **Step 2: Update useMcpDiscovery**

During auto-discover on canvas load, skip OAuth servers that don't have a connection. They'll show as "pending" until the user connects.

- [ ] **Step 3: Handle OAuth redirect**

In the editor page component, detect `?oauth=success&serverId=Y` query params:
1. Remove params from URL
2. Auto-trigger discover for the specified server

- [ ] **Step 4: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/hooks/useMcpServers.ts packages/web/app/hooks/useMcpDiscovery.ts
git commit -m "feat: trigger OAuth flow from Discover Tools for OAuth MCPs"
```

---

### Task 14: Update UI for OAuth servers

**Files:**
- Modify: `packages/web/app/components/panels/LibraryServerFields.tsx`
- Modify: `packages/web/app/components/panels/McpServersSection.tsx`
- Modify: `packages/web/app/components/panels/McpLibraryCard.tsx`

- [ ] **Step 1: Update LibraryServerFields**

For OAuth MCPs:
- If connected: show "Connected" badge with a "Disconnect" option
- If not connected: show "Requires sign-in" message
- Hide `VariableValuesEditor` for OAuth-only servers (no manual variables)
- Keep showing variable editor for servers that have BOTH OAuth and regular variables

- [ ] **Step 2: Update McpServersSection**

The `DiscoverButton` should show appropriate state for OAuth servers:
- Not connected: normal "Discover Tools" (triggers OAuth flow)
- Connected: normal "Discover Tools" / "Reload Tools" (works normally)
- Expired: "Reconnect" label

- [ ] **Step 3: Update McpLibraryCard**

Show a small lock icon on library cards where `auth_type === 'oauth'`.

- [ ] **Step 4: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/panels/LibraryServerFields.tsx packages/web/app/components/panels/McpServersSection.tsx packages/web/app/components/panels/McpLibraryCard.tsx
git commit -m "feat: OAuth UI — connected badge, disconnect, lock icon on library cards"
```

---

### Task 15: Final integration check

- [ ] **Step 1: Run full check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 2: Run API tests**

Run: `npm run test -w packages/api`
Expected: PASS

- [ ] **Step 3: Manual smoke test**

1. Reset DB: `supabase db reset`
2. Start backend and web dev servers
3. Sign in as david@usecloser.ai
4. Open an agent editor
5. Open Library panel → install an OAuth MCP (e.g., Notion)
6. Click "Discover Tools" → should open new tab to OAuth authorize
7. Complete OAuth flow on provider's site
8. Should redirect back with `?oauth=success`
9. Tools should auto-discover
10. Close and reopen the editor → OAuth server should auto-discover on load
11. Test disconnect flow

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: final OAuth flow integration fixes"
```
