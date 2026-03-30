# Spec 4: GitHub App OAuth Flow

GitHub App installation and OAuth flow that connects a tenant's GitHub account to the platform. Enables the VFS source provider to access repositories on behalf of the tenant.

## GitHub App Configuration

### Permissions

| Scope | Access | Purpose |
|---|---|---|
| Repository contents | Read | Fetch files, trees for VFS |
| Pull requests | Write | Post review comments, reactions, replies |
| Metadata | Read | Basic repo info (always included) |

Note: GitHub does not offer granular PR permissions. "Pull requests: write" is required for comments/reactions but also grants merge/close ability. Document this in the app description: "Write access to Pull Requests is required for posting review comments and reactions. This app does not merge, close, or modify pull request state."

### App Credentials

Stored as environment variables (not per-user secrets):

- `GITHUB_APP_ID` — the app's numeric ID
- `GITHUB_APP_PRIVATE_KEY` — PEM-formatted private key for signing JWTs
- `GITHUB_APP_WEBHOOK_SECRET` — secret for verifying webhook signatures

Set in backend `.env` and Edge Function `.env`. Same pattern as existing `EDGE_FUNCTION_MASTER_KEY`.

## OAuth Flow

1. **User clicks "Connect GitHub"** in the agent editor (for a specific tenant).
2. **Redirect to GitHub** — `https://github.com/apps/{app-name}/installations/new` with `state` parameter containing tenant info.
3. **User authorizes** — chooses which repos to grant access to (all or selected).
4. **GitHub redirects to callback** — Next.js API route `/api/auth/github/callback` with `code` and `installation_id`.
5. **Next.js calls backend** — `POST /github/installations` with `code`, `installation_id`, user session.
6. **Backend exchanges code** — calls GitHub API to validate the installation and get details.
7. **Backend stores installation** — saves to `github_installations` table (see Data Model).
8. **Backend fetches repo list** — calls `GET /user/installations/{installation_id}/repositories` and stores.
9. **Redirect back** — user returns to agent editor, sees their connected repos.

## Webhook Handling

Endpoint: `POST /webhooks/github` in the backend package.

### Signature verification

Every incoming webhook is verified against `GITHUB_APP_WEBHOOK_SECRET` using the `x-hub-signature-256` header (HMAC-SHA256).

### Events handled

| Event | Action |
|---|---|
| `installation.created` | Upsert installation record. Sync repo list. |
| `installation.deleted` | Mark installation as revoked. Clean up agent configs. |
| `installation.suspend` | Mark installation as suspended. |
| `installation.unsuspend` | Mark installation as active. |
| `installation_repositories.added` | Add repos to installation record. |
| `installation_repositories.removed` | Remove repos from installation record. Clean up agent configs referencing removed repos. |

### Why both callback + webhook

- **Callback + API** handles the initial setup flow — immediate response for the user.
- **Webhook** handles ongoing changes — user adds/removes repos from the installation outside our platform. Keeps our records in sync without requiring the user to re-authorize.

## Data Model

### github_installations table

```sql
CREATE TABLE github_installations (
  id               BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_id  BIGINT NOT NULL UNIQUE,  -- GitHub's installation ID
  account_name     TEXT NOT NULL,            -- GitHub org/user name
  account_type     TEXT NOT NULL,            -- 'Organization' or 'User'
  status           TEXT NOT NULL DEFAULT 'active',  -- 'active', 'suspended', 'revoked'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_installations_tenant ON github_installations (org_id);
```

### github_installation_repos table

```sql
CREATE TABLE github_installation_repos (
  id               BIGSERIAL PRIMARY KEY,
  installation_id  BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE CASCADE,
  repo_id          BIGINT NOT NULL,          -- GitHub's repo ID
  repo_full_name   TEXT NOT NULL,            -- "owner/repo"
  private          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(installation_id, repo_id)
);

CREATE INDEX idx_github_repos_installation ON github_installation_repos (installation_id);
```

### RLS policies

Uses the existing `is_org_member()` SECURITY DEFINER helper to avoid infinite recursion on `org_members`:

```sql
ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_installation_repos ENABLE ROW LEVEL SECURITY;

-- Users can read installations for orgs they belong to
CREATE POLICY "github_installations_read" ON github_installations
FOR SELECT USING (is_org_member(org_id, auth.uid()));

-- Repos readable through their installation's org
CREATE POLICY "github_repos_read" ON github_installation_repos
FOR SELECT USING (
  installation_id IN (
    SELECT gi.installation_id FROM github_installations gi
    WHERE is_org_member(gi.org_id, auth.uid())
  )
);
```

Note: write operations on these tables go through the backend (service role), not directly from the browser. Read-only RLS policies are sufficient.

### updated_at trigger

```sql
CREATE TRIGGER update_github_installations_updated_at
  BEFORE UPDATE ON github_installations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Token Minting at Runtime

When an agent with VFS runs:

1. Backend looks up the `github_installations` record for the (agent, tenant) pair.
2. Backend generates a JWT signed with the App private key (short-lived, ~10 min).
3. Backend exchanges the JWT for an installation access token: `POST /app/installations/{installation_id}/access_tokens`.
4. The token (1-hour lifetime) is passed to the Edge Function in the payload.
5. The Edge Function constructs `GitHubSourceProvider` with this token.

No token is persisted — a fresh one is minted on every run.
