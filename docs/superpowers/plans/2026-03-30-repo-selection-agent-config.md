# Repo Selection & Agent Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect GitHub App installations to the agent runtime by adding per-tenant repo bindings, a repo picker UI in the agent editor, and backend dispatch logic that assembles the VFS payload at execution time.

**Architecture:** A Supabase migration creates the `agent_vfs_configs` table (per-tenant repo binding) and adds a `vfs_settings` JSONB column to the `agents` table. The backend (`packages/backend`) gets new CRUD endpoints for VFS configs, plus dispatch-time logic that mints installation tokens, resolves commit SHAs, and builds the VFS payload for the Edge Function. The Edge Function receives the VFS payload and bootstraps `VFSContext` with tools. The Next.js web app gets a per-tenant config table component in the agent editor with repo dropdowns and GitHub connect buttons.

**Tech Stack:** TypeScript (ESM, strict mode), Express 5 (backend routes), Next.js 16 App Router (server actions + components), Supabase (Postgres + RLS), `@xyflow/react` (agent editor context), `jose` (JWT signing for GitHub App), shadcn/ui (Select, Button, Badge), next-intl (translations)

**Spec:** `docs/superpowers/specs/2026-03-30-repo-selection-agent-config-design.md`

**Depends on:** Spec 4 (GitHub OAuth -- `github_installations` and `github_installation_repos` tables must exist, plus `appJwt.ts`, `installationToken.ts`, and `githubApi.ts` modules), Spec 1 (VFS Core -- `VFSContext`, `VFSContextConfig`, `SourceProvider`, `generateVFSTools` must exist)

**ESLint constraints:** max 40 lines/function (skip blanks/comments), max 300 lines/file, max depth 2. When hitting limits, extract helpers into separate files.

---

## File Structure

### New files to create

```
supabase/migrations/
  20260330200000_agent_vfs_configs.sql    -- agent_vfs_configs table, vfs_settings column, RLS, trigger

packages/backend/src/db/queries/
  vfsConfigQueries.ts                     -- CRUD for agent_vfs_configs table
  vfsConfigTypes.ts                       -- Row types and interfaces

packages/backend/src/routes/agents/
  vfsConfigRouter.ts                      -- Express router for VFS config CRUD
  getVfsConfigs.ts                        -- GET /:agentId/vfs-configs
  upsertVfsConfig.ts                      -- PUT /:agentId/vfs-configs/:orgId
  deleteVfsConfig.ts                      -- DELETE /:agentId/vfs-configs/:orgId
  getVfsSettings.ts                       -- GET /:agentId/vfs-settings
  updateVfsSettings.ts                    -- PATCH /:agentId/vfs-settings

packages/backend/src/routes/execute/
  vfsDispatch.ts                          -- VFS payload assembly (token, SHA, slugs)
  vfsDispatchHelpers.ts                   -- Helper functions for VFS dispatch

packages/web/app/actions/
  vfsConfig.ts                            -- Server actions for VFS config CRUD

packages/web/app/components/agent-editor/
  VfsConfigSection.tsx                    -- Main VFS configuration section
  VfsConfigTable.tsx                      -- Per-tenant config table
  VfsConfigRow.tsx                        -- Single tenant row (connect/select/status)
  VfsSettingsPanel.tsx                    -- Agent-level VFS settings (protected paths, limits)
  useVfsConfigState.ts                    -- Hook for VFS config state management
```

### Files to modify

```
packages/backend/src/routes/agents/agentRouter.ts    -- Mount vfsConfigRouter
packages/backend/src/routes/execute/edgeFunctionClient.ts -- Add optional vfs field to ExecuteAgentParams
packages/backend/src/routes/execute/executeHandler.ts    -- Inject VFS payload during dispatch
packages/backend/src/routes/execute/executeFetcher.ts    -- Fetch vfs_settings from agents table
packages/backend/src/routes/execute/executeAgentPath.ts  -- Pass VFS payload to edge function
packages/web/app/components/agent-editor/AgentEditor.tsx -- Add VfsConfigSection
packages/web/app/components/agent-editor/index.ts        -- Export new components
packages/web/messages/en.json                            -- Add translation keys for VFS config UI
supabase/functions/execute-agent/index.ts                -- Add VFS bootstrap logic
```

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260330200000_agent_vfs_configs.sql`

- [ ] **Step 1: Create the migration file**

Copy the exact SQL from the spec. The migration has four sections:

1. `agent_vfs_configs` table with foreign keys to `agents`, `organizations`, and `github_installations`
2. `vfs_settings` JSONB column on `agents` with CHECK constraint
3. RLS policies using `public.is_org_member(org_id)` (single-arg SECURITY DEFINER helper)
4. `updated_at` trigger function and trigger

```sql
-- ============================================================================
-- Agent VFS Configs (per-tenant repo binding)
-- ============================================================================

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

-- ============================================================================
-- VFS runtime settings on agents table
-- ============================================================================

ALTER TABLE agents ADD COLUMN vfs_settings JSONB DEFAULT NULL
  CHECK (vfs_settings IS NULL OR (
    (vfs_settings ? 'enabled') AND (vfs_settings->>'enabled')::boolean = true
  ));

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE agent_vfs_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_vfs_configs_select" ON agent_vfs_configs
FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "agent_vfs_configs_insert" ON agent_vfs_configs
FOR INSERT WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "agent_vfs_configs_update" ON agent_vfs_configs
FOR UPDATE
USING (public.is_org_member(org_id))
WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "agent_vfs_configs_delete" ON agent_vfs_configs
FOR DELETE USING (public.is_org_member(org_id));

-- ============================================================================
-- updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_agent_vfs_configs_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_agent_vfs_configs_updated
  BEFORE UPDATE ON agent_vfs_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_vfs_configs_updated_at();
```

Key details:
- `installation_id` references `github_installations(installation_id)` (natural key, not surrogate) with `ON DELETE CASCADE` -- when an installation is deleted, all VFS configs for that installation are cleaned up automatically.
- `UNIQUE(agent_id, org_id)` enforces one repo binding per tenant per agent.
- UPDATE policy has both `USING` and `WITH CHECK` to prevent org_id mutation.
- The trigger is named `on_agent_vfs_configs_updated` (matches spec naming convention seen in `on_agents_updated`).
- No FK on `repo_id` -- intentional. Cleanup for repo removal is application-level (Spec 4 webhook handler).

- [ ] **Step 2: Verify migration applies cleanly**

```bash
npx supabase db reset
```

---

### Task 2: Backend -- VFS config types and queries

**Files:**
- Create: `packages/backend/src/db/queries/vfsConfigTypes.ts`
- Create: `packages/backend/src/db/queries/vfsConfigQueries.ts`

- [ ] **Step 1: Create `vfsConfigTypes.ts`**

Define row types and interfaces. Follow the pattern from `orgQueries.ts` -- keep types in a dedicated file when queries will be large.

```typescript
// --- DB row types ---

export interface AgentVfsConfigRow {
  id: number;
  agent_id: string;
  org_id: string;
  installation_id: number;
  repo_id: number;
  repo_full_name: string;
  created_at: string;
  updated_at: string;
}

// Extended row from JOIN with github_installations + github_installation_repos
export interface VfsConfigWithInstallation extends AgentVfsConfigRow {
  installation_status: 'active' | 'suspended' | 'revoked';
  account_name: string;
  repo_exists: boolean;  // whether repo still exists in installation
}

// Input for upsert operations
export interface VfsConfigUpsertInput {
  agentId: string;
  orgId: string;
  installationId: number;
  repoId: number;
  repoFullName: string;
}

// VFS settings stored on agents.vfs_settings
export interface AgentVfsSettings {
  enabled: boolean;
  protectedPaths?: string[];
  searchCandidateLimit?: number;
  readLineCeiling?: number;
  rateLimitThreshold?: number;
}
```

- [ ] **Step 2: Create `vfsConfigQueries.ts`**

CRUD operations for `agent_vfs_configs`. Uses `SupabaseClient` from `operationHelpers.ts` (same pattern as other query files). Important: these queries use service role client (backend) so RLS is bypassed, but the migration still has RLS for any direct-from-browser reads.

```typescript
// Functions to implement:

// getVfsConfigsByAgent(supabase, agentId) -> VfsConfigWithInstallation[]
//   SELECT avc.*, gi.status AS installation_status, gi.account_name,
//          (EXISTS (SELECT 1 FROM github_installation_repos gir
//                   WHERE gir.installation_id = avc.installation_id
//                   AND gir.repo_id = avc.repo_id)) AS repo_exists
//   FROM agent_vfs_configs avc
//   JOIN github_installations gi ON gi.installation_id = avc.installation_id
//   WHERE avc.agent_id = $1
//   ORDER BY avc.created_at

// getVfsConfigForDispatch(supabase, agentId, orgId) -> VfsConfigWithInstallation | null
//   Same JOIN but filtered by both agent_id AND org_id

// upsertVfsConfig(supabase, input: VfsConfigUpsertInput) -> AgentVfsConfigRow
//   INSERT INTO agent_vfs_configs ... ON CONFLICT (agent_id, org_id) DO UPDATE

// deleteVfsConfig(supabase, agentId, orgId) -> void
//   DELETE FROM agent_vfs_configs WHERE agent_id = $1 AND org_id = $2

// getAgentVfsSettings(supabase, agentId) -> AgentVfsSettings | null
//   SELECT vfs_settings FROM agents WHERE id = $1

// updateAgentVfsSettings(supabase, agentId, settings: AgentVfsSettings | null) -> void
//   UPDATE agents SET vfs_settings = $2 WHERE id = $1
```

Follow the existing pattern: type guards (`isVfsConfigRow`), extract helpers for mapping rows, keep functions under 40 lines. The JOIN query for `getVfsConfigsByAgent` requires a raw SQL call via `supabase.rpc()` or a view -- prefer an RPC function if the Supabase query builder cannot express the EXISTS subquery cleanly.

**Alternative approach:** If the Supabase JS client cannot express the join + exists cleanly, create a Postgres function in the migration:

```sql
CREATE OR REPLACE FUNCTION public.get_agent_vfs_configs(p_agent_id UUID)
RETURNS TABLE (
  id BIGINT, agent_id UUID, org_id UUID,
  installation_id BIGINT, repo_id BIGINT, repo_full_name TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  installation_status TEXT, account_name TEXT, repo_exists BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT avc.id, avc.agent_id, avc.org_id,
         avc.installation_id, avc.repo_id, avc.repo_full_name,
         avc.created_at, avc.updated_at,
         gi.status, gi.account_name,
         EXISTS (
           SELECT 1 FROM public.github_installation_repos gir
           WHERE gir.installation_id = avc.installation_id
             AND gir.repo_id = avc.repo_id
         )
  FROM public.agent_vfs_configs avc
  JOIN public.github_installations gi ON gi.installation_id = avc.installation_id
  WHERE avc.agent_id = p_agent_id
  ORDER BY avc.created_at;
$$;
```

If using this approach, add the function to the migration file (Task 1) and call it via `supabase.rpc('get_agent_vfs_configs', { p_agent_id: agentId })`.

---

### Task 3: Backend -- VFS config CRUD routes

**Files:**
- Create: `packages/backend/src/routes/agents/vfsConfigRouter.ts`
- Create: `packages/backend/src/routes/agents/getVfsConfigs.ts`
- Create: `packages/backend/src/routes/agents/upsertVfsConfig.ts`
- Create: `packages/backend/src/routes/agents/deleteVfsConfig.ts`
- Create: `packages/backend/src/routes/agents/getVfsSettings.ts`
- Create: `packages/backend/src/routes/agents/updateVfsSettings.ts`
- Modify: `packages/backend/src/routes/agents/agentRouter.ts`

- [ ] **Step 1: Create `vfsConfigRouter.ts`**

```typescript
import express from 'express';

import { handleDeleteVfsConfig } from './deleteVfsConfig.js';
import { handleGetVfsConfigs } from './getVfsConfigs.js';
import { handleGetVfsSettings } from './getVfsSettings.js';
import { handleUpdateVfsSettings } from './updateVfsSettings.js';
import { handleUpsertVfsConfig } from './upsertVfsConfig.js';

export const vfsConfigRouter = express.Router({ mergeParams: true });

vfsConfigRouter.get('/', handleGetVfsConfigs);
vfsConfigRouter.put('/:orgId', handleUpsertVfsConfig);
vfsConfigRouter.delete('/:orgId', handleDeleteVfsConfig);
```

Note: `mergeParams: true` so `:agentId` from the parent router is accessible.

- [ ] **Step 2: Create `getVfsConfigs.ts`**

Handler for `GET /agents/:agentId/vfs-configs`. Returns the list of per-tenant VFS configs with installation status. Uses `getVfsConfigsByAgent` from queries.

```typescript
// Pattern: extract supabase from res.locals, call query, return JSON
// Follow existing handler patterns (see getAgentBySlug.ts)
```

- [ ] **Step 3: Create `upsertVfsConfig.ts`**

Handler for `PUT /agents/:agentId/vfs-configs/:orgId`. Validates input with Zod:
- `installationId`: number (required)
- `repoId`: number (required)
- `repoFullName`: string (required)

Before upserting, verify:
1. The installation exists and belongs to the specified org (`github_installations WHERE installation_id = $1 AND org_id = $2`)
2. The repo exists in the installation (`github_installation_repos WHERE installation_id = $1 AND repo_id = $2`)

If validation fails, return 422 with descriptive error.

- [ ] **Step 4: Create `deleteVfsConfig.ts`**

Handler for `DELETE /agents/:agentId/vfs-configs/:orgId`. Deletes the VFS config for the given agent and org. Returns 204 on success.

- [ ] **Step 5: Create `getVfsSettings.ts`**

Handler for `GET /agents/:agentId/vfs-settings`. Returns the `vfs_settings` JSONB from the agents table. Returns `null` if VFS is not enabled.

- [ ] **Step 6: Create `updateVfsSettings.ts`**

Handler for `PATCH /agents/:agentId/vfs-settings`. Accepts a JSON body matching `AgentVfsSettings` (validated with Zod). Set `vfs_settings = null` to disable VFS. When enabling, enforce `enabled: true`.

```typescript
// Zod schema:
const VfsSettingsSchema = z.object({
  enabled: z.literal(true),
  protectedPaths: z.array(z.string()).optional(),
  searchCandidateLimit: z.number().positive().optional(),
  readLineCeiling: z.number().positive().optional(),
  rateLimitThreshold: z.number().positive().optional(),
}).nullable();
```

- [ ] **Step 7: Mount routes in `agentRouter.ts`**

Add to `packages/backend/src/routes/agents/agentRouter.ts`:

```typescript
import { vfsConfigRouter } from './vfsConfigRouter.js';

// Mount under /:agentId/vfs-configs
agentRouter.use('/:agentId/vfs-configs', vfsConfigRouter);

// VFS settings (agent-level, not per-tenant)
agentRouter.get('/:agentId/vfs-settings', handleGetVfsSettings);
agentRouter.patch('/:agentId/vfs-settings', handleUpdateVfsSettings);
```

- [ ] **Step 8: Verify all routes work**

```bash
npm run typecheck -w packages/backend
```

---

### Task 4: Backend -- VFS dispatch flow

**Files:**
- Create: `packages/backend/src/routes/execute/vfsDispatch.ts`
- Create: `packages/backend/src/routes/execute/vfsDispatchHelpers.ts`
- Modify: `packages/backend/src/routes/execute/edgeFunctionClient.ts`
- Modify: `packages/backend/src/routes/execute/executeFetcher.ts`
- Modify: `packages/backend/src/routes/execute/executeHandler.ts`

This is the most critical task -- it wires VFS into the execution pipeline.

- [ ] **Step 1: Create `vfsDispatchHelpers.ts`**

Small helper functions used by the dispatch flow:

```typescript
// splitRepoFullName(fullName: string): { owner: string; repo: string }
//   Split on first '/'. Throw if invalid format.

// resolveCommitSha(token: string, owner: string, repo: string, ref?: string): Promise<string>
//   If ref is provided, call GET /repos/{owner}/{repo}/commits/{ref} to resolve SHA.
//   If no ref, call GET /repos/{owner}/{repo} to get default branch, then resolve SHA.
//   Uses GitHub REST API with the installation access token.

// fetchOrgSlug(supabase, orgId): Promise<string>
//   SELECT slug FROM organizations WHERE id = $1

// fetchAgentSlug(supabase, agentId): Promise<string>
//   SELECT slug FROM agents WHERE id = $1
```

Each function must be under 40 lines. Keep GitHub API calls simple -- use `fetch` directly with the token in Authorization header.

- [ ] **Step 2: Create `vfsDispatch.ts`**

The main dispatch orchestrator. This function is called from `executeHandler.ts` when `vfs_settings` is non-null.

```typescript
interface VfsPayload {
  token: string;
  owner: string;
  repo: string;
  commitSha: string;
  tenantSlug: string;
  agentSlug: string;
  userJwt: string;
  settings: Omit<AgentVfsSettings, 'enabled'>;
}

// buildVfsPayload(supabase, params): Promise<VfsPayload | null>
//
// Steps (matching spec section "Backend Dispatch Flow"):
//
// 1. Look up VFS config: getVfsConfigForDispatch(supabase, agentId, orgId)
//    - JOIN validates repo still exists in installation
//    - If not found but agent has vfs_settings != null: throw error
//    - If vfs_settings is null: return null (no VFS)
//
// 2. Check installation status: must be 'active'
//    - If suspended: throw HttpError(422, 'GitHub installation is suspended')
//    - If revoked: throw HttpError(422, 'GitHub installation was revoked')
//
// 3. Mint installation token: use appJwt.ts + installationToken.ts from Spec 4
//    - Sign App JWT, exchange for installation access token
//
// 4. Resolve commit SHA: from trigger context ref (or default branch)
//    - For v1, always resolve default branch HEAD (no PR/branch context yet)
//
// 5. Resolve slugs: fetch tenantSlug from organizations, agentSlug from agents
//
// 6. Derive owner/repo: splitRepoFullName(config.repo_full_name)
//
// 7. Build and return VfsPayload
//
// The userJwt comes from the request -- the authenticated user's Supabase JWT.
// It's extracted in executeAuth.ts and passed through.
```

Important: `buildVfsPayload` must handle errors gracefully. If GitHub API is unreachable, throw HttpError(502). If installation token minting fails, throw HttpError(502).

- [ ] **Step 3: Modify `edgeFunctionClient.ts`**

Add optional `vfs` field to `ExecuteAgentParams`:

```typescript
export interface ExecuteAgentParams {
  // ... existing fields ...
  vfs?: {
    token: string;
    owner: string;
    repo: string;
    commitSha: string;
    tenantSlug: string;
    agentSlug: string;
    userJwt: string;
    settings: Record<string, unknown>;
  };
}
```

The `vfs` field is included in the JSON body sent to the Edge Function. No other changes needed -- it's already `JSON.stringify(params)`.

- [ ] **Step 4: Modify `executeFetcher.ts`**

Add `vfsSettings` to `FetchedData`:

```typescript
export interface FetchedData {
  // ... existing fields ...
  vfsSettings: AgentVfsSettings | null;
}
```

In `fetchAllData`, add a parallel fetch for `vfs_settings`:

```typescript
const [graphAndKeys, sessionData, vfsSettings] = await Promise.all([
  fetchGraphAndKeys({ ... }),
  fetchSessionData({ ... }),
  getAgentVfsSettings(supabase, agentId),
]);
return { ...graphAndKeys, ...sessionData, graph: resolvedGraph, agentConfig, vfsSettings };
```

- [ ] **Step 5: Modify `executeHandler.ts`**

In `buildExecuteParams`, conditionally call `buildVfsPayload` when `fetched.vfsSettings` is non-null. This requires access to the user's JWT (for `vfs.userJwt`).

Two changes needed:

1. Pass the user JWT through the execution context. The JWT is already available in `executeAuth.ts` (`extractBearerToken`) -- add it to `ExecutionAuthLocals`:

```typescript
// In executeAuth.ts (or wherever locals are typed):
interface ExecutionAuthLocals {
  // ... existing ...
  userJwt: string;  // The raw Bearer token
}
```

2. In `prepareExecution` or `buildExecuteParams`, call `buildVfsPayload`:

```typescript
// Pseudo-code for the integration point:
let vfsPayload = undefined;
if (fetched.vfsSettings !== null) {
  vfsPayload = await buildVfsPayload(supabase, {
    agentId,
    orgId,
    vfsSettings: fetched.vfsSettings,
    userJwt: res.locals.userJwt,
    ref: undefined,  // v1: resolve default branch
  });
}

// Include in params:
const params = { ...baseParams, vfs: vfsPayload ?? undefined };
```

Keep the handler under 40 lines -- extract the VFS payload building into a separate helper function.

- [ ] **Step 6: Verify typecheck passes**

```bash
npm run typecheck -w packages/backend
```

---

### Task 5: Edge Function modifications

**Files:**
- Modify: `supabase/functions/execute-agent/index.ts`

- [ ] **Step 1: Add `vfs` field to `ExecutePayload`**

```typescript
interface ExecutePayload {
  // ... existing fields ...
  vfs?: {
    token: string;
    owner: string;
    repo: string;
    commitSha: string;
    tenantSlug: string;
    agentSlug: string;
    userJwt: string;
    settings: {
      protectedPaths?: string[];
      searchCandidateLimit?: number;
      readLineCeiling?: number;
      rateLimitThreshold?: number;
    };
  };
}
```

- [ ] **Step 2: Add VFS bootstrap logic**

Between MCP connection and `executeWithCallbacks`, add VFS bootstrap. This section is conditional on `payload.vfs` being present.

```typescript
// Pseudo-code for the bootstrap:
//
// if (payload.vfs !== undefined) {
//   1. Construct Supabase client with anon key + payload.vfs.userJwt
//      const supabaseForVfs = createClient(
//        Deno.env.get('SUPABASE_URL')!,
//        Deno.env.get('SUPABASE_ANON_KEY')!,
//        { global: { headers: { Authorization: `Bearer ${payload.vfs.userJwt}` } } }
//      );
//
//   2. Construct Redis client
//      const redis = new Redis({
//        url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
//        token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
//      });
//
//   3. Construct GitHubSourceProvider
//      const sourceProvider = new GitHubSourceProvider({
//        token: payload.vfs.token,
//        owner: payload.vfs.owner,
//        repo: payload.vfs.repo,
//        commitSha: payload.vfs.commitSha,
//      });
//
//   4. Construct and initialize VFSContext
//      const vfsContext = new VFSContext({
//        tenantSlug: payload.vfs.tenantSlug,
//        agentSlug: payload.vfs.agentSlug,
//        userID: payload.userID,
//        sessionId: payload.sessionID,
//        commitSha: payload.vfs.commitSha,
//        sourceProvider,
//        supabase: supabaseForVfs,
//        redis,
//        ...payload.vfs.settings,
//      });
//      await vfsContext.initialize();
//
//   5. Generate VFS tools and merge
//      const vfsTools = generateVFSTools(context, vfsContext);
//      Object.assign(allTools, vfsTools);
// }
```

Extract the VFS bootstrap into a separate function (`bootstrapVfs`) to keep the main handler clean. This function returns `{ tools: Record<string, Tool> } | null`.

Important: The VFS imports (`VFSContext`, `GitHubSourceProvider`, `generateVFSTools`) come from `@daviddh/llm-graph-runner` (the API package). These must be importable in the Deno Edge Function. Verify the package exports include these.

- [ ] **Step 3: Merge VFS tools with MCP tools**

In the main handler, after MCP validation and VFS bootstrap:

```typescript
const allTools = { ...validation.success.tools };
if (vfsResult !== null) {
  Object.assign(allTools, vfsResult.tools);
}

// Pass allTools to executeWithCallbacks:
toolsOverride: allTools,
```

- [ ] **Step 4: Add required env vars to Edge Function**

Ensure these are in the Edge Function environment:
- `SUPABASE_URL` (already exists)
- `SUPABASE_ANON_KEY` (may need adding)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Update `supabase/functions/.env.example` if it exists, or document the required env vars.

- [ ] **Step 5: Verify the Edge Function compiles**

```bash
# Check Deno types (if deno check is available)
cd supabase/functions && deno check execute-agent/index.ts
```

---

### Task 6: Frontend -- Server actions for VFS config

**Files:**
- Create: `packages/web/app/actions/vfsConfig.ts`

- [ ] **Step 1: Create `vfsConfig.ts`**

Server actions that proxy to the backend VFS config endpoints. Follow the pattern from `agentSettings.ts` -- use `fetchFromBackend`.

```typescript
'use server';

import { fetchFromBackend } from '@/app/lib/backendProxy';

// fetchVfsConfigs(agentId: string): Promise<VfsConfigWithInstallation[]>
//   GET /agents/{agentId}/vfs-configs

// upsertVfsConfig(agentId, orgId, data): Promise<{ error: string | null }>
//   PUT /agents/{agentId}/vfs-configs/{orgId}

// deleteVfsConfig(agentId, orgId): Promise<{ error: string | null }>
//   DELETE /agents/{agentId}/vfs-configs/{orgId}

// fetchVfsSettings(agentId): Promise<AgentVfsSettings | null>
//   GET /agents/{agentId}/vfs-settings

// updateVfsSettings(agentId, settings): Promise<{ error: string | null }>
//   PATCH /agents/{agentId}/vfs-settings

// fetchInstallationRepos(installationId): Promise<GitHubInstallationRepoRow[]>
//   GET /github/installations/{installationId}/repos
//   (This route is from Spec 4 -- verify it exists)

// fetchOrgInstallations(orgId): Promise<GitHubInstallationRow[]>
//   Need to determine the right endpoint. Options:
//   a) GET /github/installations?orgId={orgId} (if Spec 4 provides this)
//   b) Direct Supabase query from server component (RLS allows SELECT for org members)
//   Prefer (b) for simplicity -- the RLS policy already allows reads.
```

Define shared response types at the top of the file. Each function follows the pattern:

```typescript
export async function fetchVfsConfigs(agentId: string): Promise<VfsConfigResponse> {
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/vfs-configs`;
    const data = await fetchFromBackend('GET', path);
    return { configs: data as VfsConfigWithInstallation[], error: null };
  } catch (err) {
    return { configs: [], error: extractError(err) };
  }
}
```

---

### Task 7: Frontend -- VFS config section in agent editor

**Files:**
- Create: `packages/web/app/components/agent-editor/VfsConfigSection.tsx`
- Create: `packages/web/app/components/agent-editor/VfsConfigTable.tsx`
- Create: `packages/web/app/components/agent-editor/VfsConfigRow.tsx`
- Create: `packages/web/app/components/agent-editor/VfsSettingsPanel.tsx`
- Create: `packages/web/app/components/agent-editor/useVfsConfigState.ts`
- Modify: `packages/web/app/components/agent-editor/AgentEditor.tsx`
- Modify: `packages/web/app/components/agent-editor/index.ts`
- Modify: `packages/web/messages/en.json`

This is the largest frontend task. Break component design into small, focused files.

- [ ] **Step 1: Add translation keys to `messages/en.json`**

Add under a new `vfsConfig` key:

```json
{
  "vfsConfig": {
    "sectionTitle": "Repository Access (VFS)",
    "enableVfs": "Enable file system access",
    "enableVfsDescription": "Allow this agent to read and write files in connected repositories",
    "connectGitHub": "Connect GitHub",
    "reconnectGitHub": "Reconnect GitHub",
    "selectRepository": "Select repository",
    "noRepositorySelected": "No repository selected",
    "connected": "Connected",
    "suspended": "Suspended",
    "revoked": "Revoked",
    "pending": "Pending",
    "tenantColumn": "Tenant",
    "githubAccountColumn": "GitHub Account",
    "repositoryColumn": "Repository",
    "statusColumn": "Status",
    "removeConfig": "Remove",
    "removeConfigTitle": "Remove repository binding?",
    "removeConfigDescription": "This will disconnect the repository from this agent for this tenant. The agent will no longer have file system access for this tenant.",
    "removeConfigCancel": "Cancel",
    "removeConfigConfirm": "Remove",
    "settingsTitle": "VFS Settings",
    "protectedPaths": "Protected paths",
    "protectedPathsDescription": "Glob patterns for paths the agent cannot write to (one per line)",
    "searchCandidateLimit": "Search candidate limit",
    "readLineCeiling": "Read line ceiling",
    "rateLimitThreshold": "Rate limit threshold",
    "installationSuspended": "GitHub installation is suspended. The owner must unsuspend it from GitHub settings.",
    "installationRevoked": "GitHub installation was revoked. Click Reconnect to set up a new connection.",
    "repoRemoved": "This repository is no longer accessible. Select a different repository."
  }
}
```

- [ ] **Step 2: Create `useVfsConfigState.ts`**

Custom hook that manages the VFS configuration state:

```typescript
// State:
// - configs: VfsConfigWithInstallation[] (per-tenant configs)
// - settings: AgentVfsSettings | null (agent-level settings)
// - loading: boolean
// - error: string | null

// On mount: fetch both configs and settings via server actions

// Actions:
// - handleUpsertConfig(orgId, installationId, repoId, repoFullName)
// - handleDeleteConfig(orgId)
// - handleUpdateSettings(settings)
// - handleToggleEnabled(enabled)
```

Keep the hook under 40 lines by extracting action handlers into helper functions.

- [ ] **Step 3: Create `VfsConfigRow.tsx`**

A single row in the per-tenant config table. Handles four states from the spec:

1. **No GitHub connection** -- show "Connect GitHub" button (links to OAuth flow)
2. **Connected, no repo** -- show repo dropdown (Select component from shadcn)
3. **Repo selected** -- show repo name with change option
4. **Suspended/revoked** -- show warning with "Reconnect GitHub" button

```typescript
// Props:
interface VfsConfigRowProps {
  orgId: string;
  orgName: string;
  config: VfsConfigWithInstallation | null;
  installation: GitHubInstallationRow | null;
  repos: GitHubInstallationRepoRow[];
  onSelectRepo: (orgId: string, installationId: number, repoId: number, repoFullName: string) => void;
  onRemove: (orgId: string) => void;
  onConnect: (orgId: string) => void;
}
```

Use shadcn components:
- `Select` for the repo dropdown
- `Button` for connect/reconnect
- `Badge` for status display

Keep under 40 lines per function -- extract status rendering into a helper.

- [ ] **Step 4: Create `VfsConfigTable.tsx`**

Renders the per-tenant config table header and rows:

```
| Tenant | GitHub Account | Repository | Status |
```

Maps through the user's organizations and renders a `VfsConfigRow` for each.

```typescript
// Props:
interface VfsConfigTableProps {
  configs: VfsConfigWithInstallation[];
  organizations: OrgRow[];  // All orgs the user belongs to
  installations: GitHubInstallationRow[];
  repos: Map<number, GitHubInstallationRepoRow[]>;  // keyed by installation_id
  onSelectRepo: (orgId, installationId, repoId, repoFullName) => void;
  onRemove: (orgId) => void;
  onConnect: (orgId) => void;
}
```

For each org, determine which state applies:
- Check if there's an installation for this org
- Check if there's a config for this agent + org
- Check the installation status

- [ ] **Step 5: Create `VfsSettingsPanel.tsx`**

Agent-level VFS settings panel. Only shown when VFS is enabled (`vfs_settings.enabled === true`). Contains form fields for:
- `protectedPaths` -- Textarea, one glob pattern per line
- `searchCandidateLimit` -- Input number (default 200)
- `readLineCeiling` -- Input number (default 10000)
- `rateLimitThreshold` -- Input number (default 100)

Use shadcn Input, Textarea, Label, and Field components.

- [ ] **Step 6: Create `VfsConfigSection.tsx`**

The top-level section component that composes everything:

```typescript
// Structure:
// 1. Enable/disable toggle (Checkbox from shadcn)
// 2. If enabled:
//    a. VfsConfigTable (per-tenant repo bindings)
//    b. VfsSettingsPanel (agent-level settings)
```

This component receives the `agentId` and fetches data on mount via `useVfsConfigState`.

For the "Connect GitHub" action: redirect to the GitHub App installation URL with CSRF state. The URL pattern is `https://github.com/apps/{app-name}/installations/new?state={state}`. The state JWT must include the `orgId`. This requires a server action that generates the state and returns the redirect URL.

Add a server action in `vfsConfig.ts`:

```typescript
export async function getGitHubConnectUrl(orgId: string): Promise<string>
//   POST /github/connect-url with { orgId }
//   Backend generates CSRF state JWT, returns the full GitHub URL
```

- [ ] **Step 7: Modify `AgentEditor.tsx`**

Add `VfsConfigSection` to the agent editor layout. Place it in the right column, after `SkillsList` and `ContextItemsList`:

```tsx
<VfsConfigSection agentId={agentId} />
```

This requires passing `agentId` as a prop to `AgentEditor`. Check if it's already available through the config or needs to be added to `AgentEditorProps`.

Looking at the current code: `AgentEditor` receives `config: AgentConfigData`. Check if `AgentConfigData` includes the agent ID. If not, add it to the props.

- [ ] **Step 8: Update `index.ts` exports**

Export the new components from the agent-editor index.

- [ ] **Step 9: Run full check**

```bash
npm run check
```

This runs format + lint + typecheck across all packages. Fix any issues.

---

### Task 8: Integration testing and verification

This is a manual verification task, not automated tests.

- [ ] **Step 1: Database migration verification**

```bash
npx supabase db reset
# Verify: agent_vfs_configs table exists
# Verify: vfs_settings column on agents
# Verify: RLS policies work (can read configs for org member, cannot for non-member)
# Verify: ON DELETE CASCADE works (delete installation -> configs deleted)
```

- [ ] **Step 2: Backend API verification**

```bash
npm run typecheck -w packages/backend
# Manual test: create VFS config, read it, update settings, delete config
# Verify: upsert validates installation + repo existence
# Verify: dispatch flow builds VFS payload correctly
```

- [ ] **Step 3: Frontend verification**

```bash
npm run dev -w packages/web
# Navigate to agent editor
# Verify: VFS section appears with enable toggle
# Verify: Per-tenant table shows correct states
# Verify: Repo dropdown populates from installation repos
# Verify: Connect GitHub button redirects to OAuth flow
```

- [ ] **Step 4: Full pipeline check**

```bash
npm run check
```

---

## Implementation Notes

### Data flow summary

```
Frontend (Agent Editor)
  |-- Server Action: fetchVfsConfigs(agentId)
  |     |-- Backend: GET /agents/:agentId/vfs-configs
  |           |-- DB: agent_vfs_configs JOIN github_installations
  |
  |-- Server Action: upsertVfsConfig(agentId, orgId, ...)
  |     |-- Backend: PUT /agents/:agentId/vfs-configs/:orgId
  |           |-- DB: INSERT/UPDATE agent_vfs_configs
  |
  |-- Server Action: updateVfsSettings(agentId, settings)
        |-- Backend: PATCH /agents/:agentId/vfs-settings
              |-- DB: UPDATE agents SET vfs_settings = ...

Execution (runtime):
  Backend receives execution request
    |-- Fetch vfs_settings from agents table (parallel with graph+keys)
    |-- If vfs_settings is non-null:
    |     |-- Look up agent_vfs_configs for (agentId, orgId)
    |     |-- Validate installation is active
    |     |-- Mint installation token (GitHub App JWT -> access token)
    |     |-- Resolve commit SHA (GitHub API)
    |     |-- Resolve slugs (org slug, agent slug)
    |     |-- Build VFS payload
    |-- Dispatch to Edge Function with vfs payload
          |-- Edge Function bootstraps VFSContext
          |-- Generates VFS tools
          |-- Merges into tool map
          |-- Executes agent with file system access
```

### Cleanup behavior

- **Installation deleted** (GitHub webhook): `ON DELETE CASCADE` on `agent_vfs_configs.installation_id` automatically removes all configs for that installation.
- **Repo removed from installation** (GitHub webhook): Spec 4 webhook handler runs `DELETE FROM agent_vfs_configs WHERE installation_id = $1 AND repo_id = ANY($2)`. No FK cascade needed.
- **Agent deleted**: `ON DELETE CASCADE` on `agent_vfs_configs.agent_id` handles cleanup.
- **Organization deleted**: `ON DELETE CASCADE` on `agent_vfs_configs.org_id` handles cleanup.

### Key architectural decisions

1. **Per-tenant config, not per-agent**: Since GitHub installations are per-tenant (org), the same agent serving multiple tenants needs separate repo bindings per tenant. The `UNIQUE(agent_id, org_id)` constraint enforces one repo per tenant per agent.

2. **VFS settings are agent-level**: `protectedPaths`, `searchCandidateLimit`, etc. are properties of the agent's behavior, not the tenant's repo. Same values regardless of which tenant runs the agent.

3. **No branch/SHA in config**: The commit SHA is resolved at dispatch time from the trigger context. The agent config stores no branch -- it's always a property of the run.

4. **User JWT in payload**: The Edge Function needs the user's JWT to construct a Supabase client that passes RLS checks for Storage and `vfs_sessions`. This is the same user who triggered the execution.

5. **Slug resolution at dispatch time**: `tenantSlug` and `agentSlug` are resolved from the database at dispatch time (not stored in config). This ensures slugs are always current even if an org or agent is renamed.
