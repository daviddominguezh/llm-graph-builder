# Spec 5: Repo Selection & Agent Config

Connects the GitHub App installation (Spec 4) to the agent runtime (Specs 1-3). Covers the repo picker UI, per-tenant agent configuration, and how the backend assembles the VFS payload at dispatch time.

## Repo Selection UI

Lives in the agent editor, inline when the user enables the VFS tool group.

### States

1. **No GitHub connection for this tenant** — show a "Connect GitHub" button that kicks off the OAuth flow (Spec 4).
2. **GitHub connected, no repo selected** — show a repository dropdown populated from `github_installation_repos` for this tenant's installation.
3. **Repo selected** — show the selected repo with option to change.

### Per-tenant config table

Since GitHub installations are per-tenant, and the same agent can serve multiple tenants, the agent editor shows a table with one row per tenant:

| Tenant | GitHub Account | Repository | Status |
|---|---|---|---|
| Acme Corp | acme-org | acme-org/api-server | Connected |
| Beta Inc | — | — | Connect GitHub |
| Gamma Ltd | gamma-dev | (select repo) | Pending |

Each row independently shows the appropriate state (connect button, repo dropdown, or selected repo).

## Data Model

### agent_vfs_configs table (per-tenant repo binding)

```sql
CREATE TABLE agent_vfs_configs (
  id               BIGSERIAL PRIMARY KEY,
  agent_id         UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_id  BIGINT NOT NULL REFERENCES github_installations(installation_id) ON DELETE CASCADE,
  repo_id          BIGINT NOT NULL,
  repo_full_name   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, org_id)
);

CREATE INDEX idx_agent_vfs_configs_agent ON agent_vfs_configs (agent_id);
CREATE INDEX idx_agent_vfs_configs_org ON agent_vfs_configs (org_id);
```

### VFS runtime settings (per-agent, not per-tenant)

Stored on the agent record itself (or a dedicated column/JSONB field):

```typescript
interface AgentVFSSettings {
  enabled: boolean;
  protectedPaths?: string[];       // overrides DEFAULT_BLOCKED for writes
  searchCandidateLimit?: number;   // default 200
  readLineCeiling?: number;        // default 10000
  rateLimitThreshold?: number;     // default 100
}
```

These are properties of the agent's behavior, not the tenant's repo. Same values regardless of which tenant runs the agent.

### RLS policies

Uses `is_org_member()` SECURITY DEFINER helper to avoid infinite recursion on `org_members`:

```sql
ALTER TABLE agent_vfs_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_vfs_configs_select" ON agent_vfs_configs
FOR SELECT USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "agent_vfs_configs_insert" ON agent_vfs_configs
FOR INSERT WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY "agent_vfs_configs_update" ON agent_vfs_configs
FOR UPDATE USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "agent_vfs_configs_delete" ON agent_vfs_configs
FOR DELETE USING (is_org_member(org_id, auth.uid()));
```

## Commit SHA Resolution

The commit SHA is resolved by the backend at dispatch time, not stored in the agent config. The trigger context provides the ref:

- **PR webhook** — payload includes the PR head SHA directly.
- **Manual run** — the user or system specifies a branch. Backend calls `GET /repos/{owner}/{repo}/commits/{branch}` to resolve to SHA.
- **No ref provided** — backend resolves the repo's default branch HEAD.

The agent config stores no branch or SHA — it's always a property of the run, not the agent.

## Backend Dispatch Flow

When an agent with VFS is triggered:

1. **Look up VFS config** — query `agent_vfs_configs` for `(agent_id, org_id)`. If not found, the agent runs without VFS (or errors if VFS is required).
2. **Check installation status** — verify the `github_installations` record is `status = 'active'`. If suspended/revoked, return error.
3. **Mint installation token** — sign JWT with App private key, exchange for installation access token via `POST /app/installations/{installation_id}/access_tokens`.
4. **Resolve commit SHA** — from the trigger context ref (PR head, branch name, or default branch).
5. **Build payload** — include in the Edge Function payload:
   - `vfs.token` — the installation access token
   - `vfs.owner` — repo owner
   - `vfs.repo` — repo name
   - `vfs.commitSha` — the resolved SHA
   - `vfs.settings` — the agent's VFS runtime settings
6. **Dispatch to Edge Function** — the Edge Function constructs `GitHubSourceProvider` and `VFSContext` from the payload.

## Cleanup on Installation Changes

When a GitHub App installation is deleted or a repo is removed (via webhook, Spec 4):

- Remove any `agent_vfs_configs` rows referencing the affected installation/repo.
- Active VFS sessions for affected repos will naturally fail on source provider calls and expire via the cleanup cron.

## Naming note

The specs use "tenant" conceptually (as in a customer/company using the platform). In the database, the actual table is `organizations`. All foreign keys reference `organizations(id)` and the column name is `org_id`.
