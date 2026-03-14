# MCP Server Library Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to publish MCP server configurations to a global library, browse/install them with variable substitution, and manage org-level environment variables for secret resolution.

**Architecture:** Template-Instance model. Published MCPs are stored as immutable templates in `mcp_library`. Installations copy the template config (with `{{VAR}}` placeholders) into `graph_mcp_servers`. Variables are resolved at runtime in the Next.js server layer before proxying to the backend. Org env variables are stored in `org_env_variables` and referenced by installations.

**Tech Stack:** Next.js 16 App Router, Zod, Supabase (Postgres + Storage + RPC), shadcn/ui, next-intl, sonner toasts

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/graph-types/src/schemas/mcp-library.schema.ts` | Zod schemas: category enum, library item, env variable, variable value |
| `packages/web/app/lib/mcp-library.ts` | Supabase queries for `mcp_library` table |
| `packages/web/app/lib/mcp-library-storage.ts` | Image upload/remove for `mcp-images` bucket |
| `packages/web/app/lib/org-env-variables.ts` | Supabase queries for `org_env_variables` table |
| `packages/web/app/lib/resolve-variables.ts` | Variable placeholder resolution utility |
| `packages/web/app/actions/mcp-library.ts` | Server actions: publish, unpublish, install |
| `packages/web/app/actions/org-env-variables.ts` | Server actions: CRUD for env variables |
| `packages/web/app/api/mcp-library/route.ts` | Route handler: GET browse/search library |
| `packages/web/app/api/mcp/discover/route.ts` | Route handler: POST discover proxy with variable resolution |
| `packages/web/app/components/panels/PublishMcpDialog.tsx` | Publish confirmation modal |
| `packages/web/app/components/panels/McpLibraryPanel.tsx` | Left slide-out library panel with search + cards |
| `packages/web/app/components/panels/McpLibraryCard.tsx` | Individual library item card |
| `packages/web/app/components/panels/VariableValuesEditor.tsx` | Variable value inputs (direct / env ref) |
| `packages/web/app/components/orgs/EnvVariablesSection.tsx` | Org settings env variables section |
| `packages/web/app/components/orgs/CreateEnvVariableDialog.tsx` | Dialog for creating/editing env variable |
| `packages/web/app/components/orgs/DeleteEnvVariableDialog.tsx` | Confirmation dialog for deleting env variable |

### Modified files

| File | Changes |
|------|---------|
| `packages/graph-types/src/schemas/mcp.schema.ts` | Add `libraryItemId`, `variableValues` to `McpServerConfigSchema` |
| `packages/graph-types/src/schemas/operation-mcp.schema.ts` | Add optional `libraryItemId`, `variableValues` to `McpServerDataSchema` |
| `packages/graph-types/src/schemas/index.ts` | Export new schemas from `mcp-library.schema.ts` |
| `packages/backend/src/db/queries/graphRowTypes.ts` | Add `library_item_id`, `variable_values` to `McpServerRow` |
| `packages/backend/src/db/queries/graphAssemblers.ts` | Map new fields in `assembleMcpServers` |
| `packages/backend/src/db/queries/mcpServerOperations.ts` | Add new fields to `McpServerInsertRow`, `buildMcpServerRow` |
| `packages/web/app/hooks/useMcpServers.ts` | Update `createDefaultServer`, operation builders, add `addServerFromLibrary` |
| `packages/web/app/lib/api.ts` | Route `discoverMcpTools` through Next.js proxy |
| `packages/web/app/api/simulate/route.ts` | Add variable resolution before proxying |
| `packages/web/app/components/panels/McpServersSection.tsx` | Add Publish/Library buttons, read-only fields for library servers, variable section |
| `packages/web/app/components/panels/ToolsPanel.tsx` | Pass library panel toggle, org context |
| `packages/web/app/components/SidePanels.tsx` | Add library panel state + rendering |
| `packages/web/app/components/GraphBuilder.tsx` | Add library panel open state |
| `packages/web/app/orgs/[slug]/(dashboard)/settings/page.tsx` | Add env variables section |
| `packages/web/messages/en.json` | Add `mcpLibrary` and `envVariables` translation namespaces |

---

## Chunk 1: Foundation — Schemas, Types & Database

### Task 1: Add MCP Library schemas to graph-types

**Files:**
- Create: `packages/graph-types/src/schemas/mcp-library.schema.ts`
- Modify: `packages/graph-types/src/schemas/index.ts`

- [ ] **Step 1: Create `mcp-library.schema.ts`**

```ts
// packages/graph-types/src/schemas/mcp-library.schema.ts
import { z } from 'zod';

import { McpTransportSchema } from './mcp.schema.js';

export const MCP_LIBRARY_CATEGORIES = [
  'Productivity',
  'Development',
  'Data & Analytics',
  'Communication',
  'Design',
  'DevOps & Infrastructure',
  'Security',
  'Finance',
  'AI & ML',
  'Project Management',
  'Customer Support',
  'Marketing',
  'Sales',
  'HR',
  'Legal',
  'Education',
  'Healthcare',
  'E-commerce',
  'Social Media',
  'Other',
] as const;

export const McpLibraryCategorySchema = z.enum(MCP_LIBRARY_CATEGORIES);

export const McpLibraryVariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const VariableValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('direct'), value: z.string() }),
  z.object({ type: z.literal('env_ref'), envVariableId: z.string() }),
]);

export const McpLibraryItemSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  orgName: z.string().optional(),
  name: z.string(),
  description: z.string(),
  category: McpLibraryCategorySchema,
  imageUrl: z.string().nullable().optional(),
  transportType: z.string(),
  transportConfig: z.record(z.string(), z.unknown()),
  transport: McpTransportSchema.optional(),
  variables: z.array(McpLibraryVariableSchema),
  installationsCount: z.number().default(0),
  publishedBy: z.string(),
  createdAt: z.string().optional(),
});

export const OrgEnvVariableSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  value: z.string(),
  isSecret: z.boolean().default(false),
  createdAt: z.string().optional(),
});
```

- [ ] **Step 2: Export from schemas index**

In `packages/graph-types/src/schemas/index.ts`, add after the mcp.schema.js exports (line 28):

```ts
export {
  MCP_LIBRARY_CATEGORIES,
  McpLibraryCategorySchema,
  McpLibraryItemSchema,
  McpLibraryVariableSchema,
  OrgEnvVariableSchema,
  VariableValueSchema,
} from './mcp-library.schema.js';
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/graph-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/graph-types/src/schemas/mcp-library.schema.ts packages/graph-types/src/schemas/index.ts
git commit -m "feat: add MCP library Zod schemas (categories, library item, env variable, variable value)"
```

---

### Task 2: Extend McpServerConfig with library fields

**Files:**
- Modify: `packages/graph-types/src/schemas/mcp.schema.ts`
- Modify: `packages/graph-types/src/schemas/operation-mcp.schema.ts`

- [ ] **Step 1: Add optional fields to McpServerConfigSchema**

In `packages/graph-types/src/schemas/mcp.schema.ts`, add import at top:

```ts
import { VariableValueSchema } from './mcp-library.schema.js';
```

Then modify `McpServerConfigSchema` (line 28-33) to:

```ts
export const McpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: McpTransportSchema,
  enabled: z.boolean().default(true),
  libraryItemId: z.string().optional(),
  variableValues: z.record(z.string(), VariableValueSchema).optional(),
});
```

- [ ] **Step 2: Add optional fields to McpServerDataSchema**

In `packages/graph-types/src/schemas/operation-mcp.schema.ts`, add import:

```ts
import { VariableValueSchema } from './mcp-library.schema.js';
```

Modify `McpServerDataSchema` (line 5-10) to:

```ts
const McpServerDataSchema = z.object({
  serverId: z.string(),
  name: z.string(),
  transport: McpTransportSchema,
  enabled: z.boolean().optional(),
  libraryItemId: z.string().optional(),
  variableValues: z.record(z.string(), VariableValueSchema).optional(),
});
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/graph-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/graph-types/src/schemas/mcp.schema.ts packages/graph-types/src/schemas/operation-mcp.schema.ts
git commit -m "feat: extend McpServerConfig and operations with libraryItemId and variableValues"
```

---

### Task 3: Update backend row types, assemblers, and operations

**Files:**
- Modify: `packages/backend/src/db/queries/graphRowTypes.ts`
- Modify: `packages/backend/src/db/queries/graphAssemblers.ts`
- Modify: `packages/backend/src/db/queries/mcpServerOperations.ts`

- [ ] **Step 1: Update McpServerRow**

In `packages/backend/src/db/queries/graphRowTypes.ts`, modify `McpServerRow` (line 55-62):

```ts
export interface McpServerRow {
  agent_id: string;
  server_id: string;
  name: string;
  transport_type: McpTransportType;
  transport_config: Record<string, unknown>;
  enabled: boolean;
  library_item_id: string | null;
  variable_values: Record<string, unknown> | null;
}
```

- [ ] **Step 2: Update assembleMcpServers**

In `packages/backend/src/db/queries/graphAssemblers.ts`, add import of `VariableValueSchema`:

```ts
import { McpTransportSchema, OutputSchemaFieldSchema, ToolFieldValueSchema, VariableValueSchema } from '@daviddh/graph-types';
```

Add a helper function before `assembleMcpServers` (after `buildTransport` at line 140):

```ts
function parseVariableValues(
  raw: Record<string, unknown> | null
): Record<string, z.infer<typeof VariableValueSchema>> | undefined {
  if (raw === null) return undefined;
  const schema = z.record(z.string(), VariableValueSchema);
  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}
```

Modify `assembleMcpServers` return mapping (line 145-150):

```ts
return rows.map((row) => ({
  id: row.server_id,
  name: row.name,
  transport: buildTransport(row),
  enabled: row.enabled,
  libraryItemId: row.library_item_id ?? undefined,
  variableValues: parseVariableValues(row.variable_values),
}));
```

- [ ] **Step 3: Update McpServerInsertRow and buildMcpServerRow**

In `packages/backend/src/db/queries/mcpServerOperations.ts`, update `McpServerInsertRow` (line 9-16):

```ts
interface McpServerInsertRow {
  agent_id: string;
  server_id: string;
  name: string;
  transport_type: string;
  transport_config: Record<string, unknown>;
  enabled: boolean | undefined;
  library_item_id: string | undefined;
  variable_values: Record<string, unknown> | undefined;
}
```

Update `buildMcpServerRow` (line 23-31):

```ts
function buildMcpServerRow(agentId: string, data: InsertMcpOp['data']): McpServerInsertRow {
  return {
    agent_id: agentId,
    server_id: data.serverId,
    name: data.name,
    transport_type: data.transport.type,
    transport_config: extractTransportConfig(data.transport),
    enabled: data.enabled,
    library_item_id: data.libraryItemId,
    variable_values: data.variableValues,
  };
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck -w packages/backend`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/queries/graphRowTypes.ts packages/backend/src/db/queries/graphAssemblers.ts packages/backend/src/db/queries/mcpServerOperations.ts
git commit -m "feat: update backend to handle libraryItemId and variableValues in MCP servers"
```

---

### Task 4: Database migrations

> **Note:** These SQL statements should be executed via the Supabase dashboard or migration tool. Create one migration file per logical unit if using Supabase CLI.

- [ ] **Step 1: Create `mcp_library` table**

```sql
CREATE TABLE mcp_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  image_url text,
  transport_type text NOT NULL,
  transport_config jsonb NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]',
  installations_count integer NOT NULL DEFAULT 0,
  published_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mcp_library_updated_at
  BEFORE UPDATE ON mcp_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Create `org_env_variables` table**

```sql
CREATE TABLE org_env_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  value text NOT NULL,
  is_secret boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE TRIGGER org_env_variables_updated_at
  BEFORE UPDATE ON org_env_variables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 3: Add columns to `graph_mcp_servers`**

```sql
ALTER TABLE graph_mcp_servers
  ADD COLUMN library_item_id uuid REFERENCES mcp_library(id) ON DELETE SET NULL,
  ADD COLUMN variable_values jsonb;

CREATE UNIQUE INDEX idx_graph_mcp_servers_library_unique
  ON graph_mcp_servers (agent_id, library_item_id)
  WHERE library_item_id IS NOT NULL;
```

- [ ] **Step 4: Create atomic increment RPC function**

```sql
CREATE OR REPLACE FUNCTION increment_installations_count(p_library_item_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE mcp_library
  SET installations_count = installations_count + 1
  WHERE id = p_library_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 5: Create org membership check helper (SECURITY DEFINER)**

```sql
CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid, p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 6: RLS policies for `mcp_library`**

```sql
ALTER TABLE mcp_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcp_library_select ON mcp_library
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY mcp_library_insert ON mcp_library
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY mcp_library_delete ON mcp_library
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));
```

- [ ] **Step 7: RLS policies for `org_env_variables`**

```sql
ALTER TABLE org_env_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_env_variables_select ON org_env_variables
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY org_env_variables_insert ON org_env_variables
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY org_env_variables_update ON org_env_variables
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY org_env_variables_delete ON org_env_variables
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));
```

- [ ] **Step 8: Create `mcp-images` storage bucket**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('mcp-images', 'mcp-images', true);

CREATE POLICY mcp_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'mcp-images');

CREATE POLICY mcp_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mcp-images');

CREATE POLICY mcp_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'mcp-images');
```

- [ ] **Step 9: Commit migration notes**

Document the migration steps in a file or commit message for tracking.

---

### Task 5: Add translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add `mcpLibrary` namespace**

Add after the `"apiKeys"` section (before the final `}`):

```json
"mcpLibrary": {
  "publish": "Publish",
  "publishTitle": "Publish MCP Server",
  "publishWarning": "This MCP will be visible to all users. Ensure all sensitive data uses variables (e.g., {{API_TOKEN}}).",
  "publishConfirm": "Publish",
  "publishCancel": "Cancel",
  "publishSuccess": "MCP server published successfully.",
  "publishError": "Failed to publish MCP server.",
  "unpublishSuccess": "MCP server unpublished.",
  "unpublishError": "Failed to unpublish MCP server.",
  "description": "Description",
  "descriptionPlaceholder": "What does this MCP server do?",
  "descriptionRequired": "Description is required.",
  "category": "Category",
  "categoryRequired": "Category is required.",
  "image": "Image (optional)",
  "imageUpload": "Upload image",
  "detectedVariables": "Detected variables",
  "noVariables": "No variables detected.",
  "libraryTitle": "MCP Library",
  "searchPlaceholder": "Search MCP servers...",
  "topInstalled": "Most installed",
  "noResults": "No MCP servers found.",
  "install": "Install",
  "installed": "Installed",
  "installSuccess": "MCP server installed.",
  "installError": "Failed to install MCP server.",
  "installations": "{count} installs",
  "variables": "Variables",
  "directValue": "Direct value",
  "envVariable": "Env variable",
  "valuePlaceholder": "Enter value...",
  "selectEnvVar": "Select variable",
  "allVariablesRequired": "All variables must have values before discovering tools.",
  "readOnlyConfig": "Configuration from library (read-only)",
  "categoryProductivity": "Productivity",
  "categoryDevelopment": "Development",
  "categoryDataAnalytics": "Data & Analytics",
  "categoryCommunication": "Communication",
  "categoryDesign": "Design",
  "categoryDevOps": "DevOps & Infrastructure",
  "categorySecurity": "Security",
  "categoryFinance": "Finance",
  "categoryAiMl": "AI & ML",
  "categoryProjectManagement": "Project Management",
  "categoryCustomerSupport": "Customer Support",
  "categoryMarketing": "Marketing",
  "categorySales": "Sales",
  "categoryHr": "HR",
  "categoryLegal": "Legal",
  "categoryEducation": "Education",
  "categoryHealthcare": "Healthcare",
  "categoryEcommerce": "E-commerce",
  "categorySocialMedia": "Social Media",
  "categoryOther": "Other"
},
"envVariables": {
  "title": "Environment Variables",
  "description": "Manage environment variables used by MCP servers installed from the library.",
  "add": "Add variable",
  "name": "Name",
  "namePlaceholder": "MY_API_TOKEN",
  "nameRequired": "Variable name is required.",
  "nameFormat": "Name must be uppercase letters and underscores only.",
  "value": "Value",
  "valuePlaceholder": "Enter value...",
  "valueRequired": "Value is required.",
  "secret": "Secret",
  "secretDescription": "Secret values are masked after saving.",
  "noVariables": "No environment variables configured.",
  "createError": "Failed to create variable.",
  "updateError": "Failed to update variable.",
  "deleteTitle": "Delete variable",
  "deleteDescription": "This will delete \"{name}\". MCP servers referencing this variable will need a new value.",
  "deleteConfirm": "Delete",
  "deleteCancel": "Cancel",
  "deleteError": "Failed to delete variable."
}
```

- [ ] **Step 2: Run format check**

Run: `npm run format`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add translations for MCP library and environment variables"
```

---

## Chunk 2: Data Access Layer

### Task 6: Org environment variables lib module

**Files:**
- Create: `packages/web/app/lib/org-env-variables.ts`

- [ ] **Step 1: Create lib module**

Follow the pattern from `packages/web/app/lib/api-keys.ts`:

```ts
// packages/web/app/lib/org-env-variables.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrgEnvVariableRow {
  id: string;
  org_id: string;
  name: string;
  value: string;
  is_secret: boolean;
  created_at: string;
}

export function isOrgEnvVariableRow(value: unknown): value is OrgEnvVariableRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value && 'org_id' in value;
}

function mapRows(data: unknown[]): OrgEnvVariableRow[] {
  return data.reduce<OrgEnvVariableRow[]>((acc, row) => {
    if (isOrgEnvVariableRow(row)) acc.push(row);
    return acc;
  }, []);
}

const COLUMNS = 'id, org_id, name, value, is_secret, created_at';
const LIST_COLUMNS = 'id, org_id, name, is_secret, created_at';

export async function getEnvVariablesByOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ result: OrgEnvVariableRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('org_env_variables')
    .select(LIST_COLUMNS)
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function getEnvVariableValue(
  supabase: SupabaseClient,
  variableId: string
): Promise<{ value: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('org_env_variables')
    .select('value')
    .eq('id', variableId)
    .single();

  if (error !== null) return { value: null, error: error.message };
  const row = data as { value: string } | null;
  return { value: row?.value ?? null, error: null };
}

export async function createEnvVariable(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  value: string,
  isSecret: boolean
): Promise<{ result: OrgEnvVariableRow | null; error: string | null }> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const result = await supabase
    .from('org_env_variables')
    .insert({ org_id: orgId, name, value, is_secret: isSecret, created_by: userId })
    .select(COLUMNS)
    .single();

  if (result.error !== null) return { result: null, error: result.error.message };
  if (!isOrgEnvVariableRow(result.data)) return { result: null, error: 'Invalid data' };
  return { result: result.data, error: null };
}

export async function updateEnvVariable(
  supabase: SupabaseClient,
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
): Promise<{ error: string | null }> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.value !== undefined) updateData.value = updates.value;
  if (updates.isSecret !== undefined) updateData.is_secret = updates.isSecret;

  const { error } = await supabase
    .from('org_env_variables')
    .update(updateData)
    .eq('id', variableId);

  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function deleteEnvVariable(
  supabase: SupabaseClient,
  variableId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('org_env_variables').delete().eq('id', variableId);
  if (error !== null) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/lib/org-env-variables.ts
git commit -m "feat: add org environment variables lib module"
```

---

### Task 7: Org environment variables server actions

**Files:**
- Create: `packages/web/app/actions/org-env-variables.ts`

- [ ] **Step 1: Create server actions**

Follow the pattern from `packages/web/app/actions/api-keys.ts`:

```ts
// packages/web/app/actions/org-env-variables.ts
'use server';

import type { OrgEnvVariableRow } from '@/app/lib/org-env-variables';
import {
  createEnvVariable as createEnvVariableLib,
  deleteEnvVariable as deleteEnvVariableLib,
  getEnvVariablesByOrg as getEnvVariablesByOrgLib,
  updateEnvVariable as updateEnvVariableLib,
} from '@/app/lib/org-env-variables';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

export async function getEnvVariablesByOrgAction(
  orgId: string
): Promise<{ result: OrgEnvVariableRow[]; error: string | null }> {
  serverLog('[getEnvVariablesByOrgAction] orgId:', orgId);
  const supabase = await createClient();
  const res = await getEnvVariablesByOrgLib(supabase, orgId);
  if (res.error !== null) serverError('[getEnvVariablesByOrgAction]', res.error);
  return res;
}

export async function createEnvVariableAction(
  orgId: string,
  name: string,
  value: string,
  isSecret: boolean
): Promise<{ result: OrgEnvVariableRow | null; error: string | null }> {
  serverLog('[createEnvVariableAction] orgId:', orgId, 'name:', name);
  const supabase = await createClient();
  const res = await createEnvVariableLib(supabase, orgId, name, value, isSecret);
  if (res.error !== null) serverError('[createEnvVariableAction]', res.error);
  return res;
}

export async function updateEnvVariableAction(
  variableId: string,
  updates: { name?: string; value?: string; isSecret?: boolean }
): Promise<{ error: string | null }> {
  serverLog('[updateEnvVariableAction] variableId:', variableId);
  const supabase = await createClient();
  const res = await updateEnvVariableLib(supabase, variableId, updates);
  if (res.error !== null) serverError('[updateEnvVariableAction]', res.error);
  return res;
}

export async function deleteEnvVariableAction(
  variableId: string
): Promise<{ error: string | null }> {
  serverLog('[deleteEnvVariableAction] variableId:', variableId);
  const supabase = await createClient();
  const res = await deleteEnvVariableLib(supabase, variableId);
  if (res.error !== null) serverError('[deleteEnvVariableAction]', res.error);
  return res;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/actions/org-env-variables.ts
git commit -m "feat: add org environment variables server actions"
```

---

### Task 8: MCP library lib module + storage

**Files:**
- Create: `packages/web/app/lib/mcp-library.ts`
- Create: `packages/web/app/lib/mcp-library-storage.ts`

- [ ] **Step 1: Create storage module**

Follow pattern from `packages/web/app/lib/org-storage.ts`:

```ts
// packages/web/app/lib/mcp-library-storage.ts
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'mcp-images';

function buildPath(libraryItemId: string): string {
  return `${libraryItemId}/image`;
}

export async function uploadMcpImage(
  supabase: SupabaseClient,
  libraryItemId: string,
  file: File
): Promise<{ result: string | null; error: string | null }> {
  const path = buildPath(libraryItemId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });

  if (error !== null) return { result: null, error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { result: data.publicUrl, error: null };
}

export async function removeMcpImage(
  supabase: SupabaseClient,
  libraryItemId: string
): Promise<{ error: string | null }> {
  const path = buildPath(libraryItemId);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error !== null) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 2: Create library lib module**

```ts
// packages/web/app/lib/mcp-library.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface McpLibraryRow {
  id: string;
  org_id: string;
  org_name?: string;
  name: string;
  description: string;
  category: string;
  image_url: string | null;
  transport_type: string;
  transport_config: Record<string, unknown>;
  variables: Array<{ name: string; description?: string }>;
  installations_count: number;
  published_by: string;
  created_at: string;
}

function isLibraryRow(value: unknown): value is McpLibraryRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'transport_type' in value;
}

function mapRows(data: unknown[]): McpLibraryRow[] {
  return data.reduce<McpLibraryRow[]>((acc, row) => {
    if (isLibraryRow(row)) acc.push(row);
    return acc;
  }, []);
}

const COLUMNS = 'id, org_id, name, description, category, image_url, transport_type, transport_config, variables, installations_count, published_by, created_at';

const LIST_COLUMNS = 'id, org_id, orgs(name), name, description, category, image_url, transport_type, variables, installations_count';

export async function browseLibrary(
  supabase: SupabaseClient,
  options?: { query?: string; category?: string; limit?: number; offset?: number }
): Promise<{ result: McpLibraryRow[]; error: string | null }> {
  const limit = options?.limit ?? 15;
  const offset = options?.offset ?? 0;

  let q = supabase
    .from('mcp_library')
    .select(LIST_COLUMNS)
    .order('installations_count', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.query) {
    q = q.or(`name.ilike.%${options.query}%,description.ilike.%${options.query}%`);
  }
  if (options?.category) {
    q = q.eq('category', options.category);
  }

  const { data, error } = await q;
  if (error !== null) return { result: [], error: error.message };

  const raw: unknown[] = (data as unknown[] | null) ?? [];
  const rows = mapRows(raw);
  return { result: rows, error: null };
}

export async function getLibraryItemById(
  supabase: SupabaseClient,
  id: string
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('mcp_library')
    .select(COLUMNS)
    .eq('id', id)
    .single();

  if (error !== null) return { result: null, error: error.message };
  if (!isLibraryRow(data)) return { result: null, error: 'Invalid data' };
  return { result: data, error: null };
}

export async function publishToLibrary(
  supabase: SupabaseClient,
  item: {
    orgId: string;
    name: string;
    description: string;
    category: string;
    transportType: string;
    transportConfig: Record<string, unknown>;
    variables: Array<{ name: string; description?: string }>;
    imageUrl?: string | null;
  }
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  const userId = (await supabase.auth.getUser()).data.user?.id;

  const result = await supabase
    .from('mcp_library')
    .insert({
      org_id: item.orgId,
      name: item.name,
      description: item.description,
      category: item.category,
      transport_type: item.transportType,
      transport_config: item.transportConfig,
      variables: item.variables,
      image_url: item.imageUrl ?? null,
      published_by: userId,
    })
    .select(COLUMNS)
    .single();

  if (result.error !== null) return { result: null, error: result.error.message };
  if (!isLibraryRow(result.data)) return { result: null, error: 'Invalid data' };
  return { result: result.data, error: null };
}

export async function unpublishFromLibrary(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('mcp_library').delete().eq('id', id);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function incrementInstallations(
  supabase: SupabaseClient,
  libraryItemId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('increment_installations_count', {
    p_library_item_id: libraryItemId,
  });
  if (error !== null) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/mcp-library.ts packages/web/app/lib/mcp-library-storage.ts
git commit -m "feat: add MCP library and image storage lib modules"
```

---

### Task 9: MCP library server actions

**Files:**
- Create: `packages/web/app/actions/mcp-library.ts`

- [ ] **Step 1: Create server actions**

```ts
// packages/web/app/actions/mcp-library.ts
'use server';

import type { McpLibraryRow } from '@/app/lib/mcp-library';
import {
  getLibraryItemById as getLibraryItemByIdLib,
  incrementInstallations,
  publishToLibrary as publishToLibraryLib,
  unpublishFromLibrary as unpublishFromLibraryLib,
} from '@/app/lib/mcp-library';
import { uploadMcpImage } from '@/app/lib/mcp-library-storage';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

export async function publishMcpAction(
  orgId: string,
  data: {
    name: string;
    description: string;
    category: string;
    transportType: string;
    transportConfig: Record<string, unknown>;
    variables: Array<{ name: string; description?: string }>;
  },
  imageFormData?: FormData
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  serverLog('[publishMcpAction] orgId:', orgId, 'name:', data.name);
  const supabase = await createClient();

  const res = await publishToLibraryLib(supabase, { ...data, orgId });
  if (res.error !== null || res.result === null) {
    serverError('[publishMcpAction]', res.error);
    return res;
  }

  if (imageFormData !== undefined) {
    const file = imageFormData.get('file');
    if (file instanceof File) {
      const uploadRes = await uploadMcpImage(supabase, res.result.id, file);
      if (uploadRes.error === null && uploadRes.result !== null) {
        await supabase.from('mcp_library').update({ image_url: uploadRes.result }).eq('id', res.result.id);
        res.result.image_url = uploadRes.result;
      }
    }
  }

  return res;
}

export async function unpublishMcpAction(
  libraryItemId: string
): Promise<{ error: string | null }> {
  serverLog('[unpublishMcpAction] id:', libraryItemId);
  const supabase = await createClient();
  const res = await unpublishFromLibraryLib(supabase, libraryItemId);
  if (res.error !== null) serverError('[unpublishMcpAction]', res.error);
  return res;
}

export async function installMcpAction(
  libraryItemId: string
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  serverLog('[installMcpAction] libraryItemId:', libraryItemId);
  const supabase = await createClient();

  const itemRes = await getLibraryItemByIdLib(supabase, libraryItemId);
  if (itemRes.error !== null || itemRes.result === null) {
    serverError('[installMcpAction] item fetch error:', itemRes.error);
    return { result: null, error: itemRes.error ?? 'Item not found' };
  }

  const countRes = await incrementInstallations(supabase, libraryItemId);
  if (countRes.error !== null) {
    serverError('[installMcpAction] increment error:', countRes.error);
  }

  return { result: itemRes.result, error: null };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/actions/mcp-library.ts
git commit -m "feat: add MCP library server actions (publish, unpublish, install)"
```

---

### Task 10: Variable resolution utility

**Files:**
- Create: `packages/web/app/lib/resolve-variables.ts`

- [ ] **Step 1: Create utility**

```ts
// packages/web/app/lib/resolve-variables.ts
import type { McpTransport } from '@/app/schemas/graph.schema';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getEnvVariableValue } from './org-env-variables';

interface DirectValue {
  type: 'direct';
  value: string;
}

interface EnvRefValue {
  type: 'env_ref';
  envVariableId: string;
}

type VariableValue = DirectValue | EnvRefValue;

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function extractVariableNames(transport: McpTransport): string[] {
  const names = new Set<string>();
  const text = JSON.stringify(transport);
  let match: RegExpExecArray | null = VARIABLE_PATTERN.exec(text);
  while (match !== null) {
    names.add(match[1]);
    match = VARIABLE_PATTERN.exec(text);
  }
  return [...names];
}

function replaceVariablesInString(str: string, resolved: Record<string, string>): string {
  return str.replace(VARIABLE_PATTERN, (_, name: string) => resolved[name] ?? `{{${name}}}`);
}

function replaceInHeaders(
  headers: Record<string, string> | undefined,
  resolved: Record<string, string>
): Record<string, string> | undefined {
  if (headers === undefined) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = replaceVariablesInString(value, resolved);
  }
  return result;
}

function replaceInTransport(transport: McpTransport, resolved: Record<string, string>): McpTransport {
  if (transport.type === 'http' || transport.type === 'sse') {
    return {
      ...transport,
      url: replaceVariablesInString(transport.url, resolved),
      headers: replaceInHeaders(transport.headers, resolved),
    };
  }
  return {
    ...transport,
    command: replaceVariablesInString(transport.command, resolved),
    args: transport.args?.map((a) => replaceVariablesInString(a, resolved)),
    env: transport.env !== undefined ? replaceInHeaders(transport.env, resolved) : undefined,
  };
}

async function resolveValues(
  supabase: SupabaseClient,
  variableValues: Record<string, VariableValue>
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};

  for (const [name, val] of Object.entries(variableValues)) {
    if (val.type === 'direct') {
      resolved[name] = val.value;
    } else {
      const { value, error } = await getEnvVariableValue(supabase, val.envVariableId);
      if (error === null && value !== null) {
        resolved[name] = value;
      }
    }
  }

  return resolved;
}

export async function resolveTransportVariables(
  supabase: SupabaseClient,
  transport: McpTransport,
  variableValues: Record<string, VariableValue>
): Promise<McpTransport> {
  const resolved = await resolveValues(supabase, variableValues);
  return replaceInTransport(transport, resolved);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/lib/resolve-variables.ts
git commit -m "feat: add variable resolution utility for MCP transport configs"
```

---

### Task 11: Browse library route handler

**Files:**
- Create: `packages/web/app/api/mcp-library/route.ts`

- [ ] **Step 1: Create route handler**

```ts
// packages/web/app/api/mcp-library/route.ts
import { browseLibrary } from '@/app/lib/mcp-library';
import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';

const HTTP_UNAUTHORIZED = 401;

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_UNAUTHORIZED });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const limit = Number(searchParams.get('limit') ?? '15');
  const offset = Number(searchParams.get('offset') ?? '0');

  const res = await browseLibrary(supabase, { query, category, limit, offset });
  return NextResponse.json(res);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/api/mcp-library/route.ts
git commit -m "feat: add browse/search MCP library route handler"
```

---

### Task 12: Discover proxy route handler

**Files:**
- Create: `packages/web/app/api/mcp/discover/route.ts`

- [ ] **Step 1: Create route handler**

```ts
// packages/web/app/api/mcp/discover/route.ts
import { resolveTransportVariables } from '@/app/lib/resolve-variables';
import { createClient } from '@/app/lib/supabase/server';
import { McpTransportSchema } from '@daviddh/graph-types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

const DiscoverRequestSchema = z.object({
  transport: McpTransportSchema,
  variableValues: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_UNAUTHORIZED });
  }

  const raw: unknown = await request.json();
  const parsed = DiscoverRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: HTTP_BAD_REQUEST });
  }

  let { transport } = parsed.data;
  const { variableValues } = parsed.data;

  if (variableValues !== undefined && Object.keys(variableValues).length > 0) {
    const typedValues = variableValues as Record<string, { type: 'direct'; value: string } | { type: 'env_ref'; envVariableId: string }>;
    transport = await resolveTransportVariables(supabase, transport, typedValues);
  }

  const upstream = await fetch(`${API_URL}/mcp/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transport }),
  });

  const body: unknown = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/api/mcp/discover/route.ts
git commit -m "feat: add discover proxy route handler with variable resolution"
```

---

## Chunk 3: UI — Org Environment Variables

### Task 13: EnvVariablesSection component

**Files:**
- Create: `packages/web/app/components/orgs/EnvVariablesSection.tsx`
- Create: `packages/web/app/components/orgs/CreateEnvVariableDialog.tsx`
- Create: `packages/web/app/components/orgs/DeleteEnvVariableDialog.tsx`

- [ ] **Step 1: Create DeleteEnvVariableDialog**

Follow pattern from `packages/web/app/components/orgs/DeleteApiKeyDialog.tsx`:

```ts
// packages/web/app/components/orgs/DeleteEnvVariableDialog.tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteEnvVariableAction } from '@/app/actions/org-env-variables';

interface DeleteEnvVariableDialogProps {
  variableId: string;
  variableName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteEnvVariableDialog({
  variableId,
  variableName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteEnvVariableDialogProps) {
  const t = useTranslations('envVariables');
  const [loading, setLoading] = useState(false);

  async function handleDelete(): Promise<void> {
    setLoading(true);
    const { error } = await deleteEnvVariableAction(variableId);
    setLoading(false);
    if (error !== null) {
      toast.error(t('deleteError'));
      return;
    }
    onOpenChange(false);
    onDeleted();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('deleteDescription', { name: variableName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading}>
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Create CreateEnvVariableDialog**

Follow pattern from `packages/web/app/components/orgs/CreateApiKeyDialog.tsx`:

```ts
// packages/web/app/components/orgs/CreateEnvVariableDialog.tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createEnvVariableAction } from '@/app/actions/org-env-variables';

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

interface CreateEnvVariableDialogProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateEnvVariableDialog({ orgId, open, onOpenChange, onCreated }: CreateEnvVariableDialogProps) {
  const t = useTranslations('envVariables');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  function resetForm(): void {
    setName('');
    setValue('');
    setIsSecret(false);
    setNameError(null);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();

    if (name.trim() === '') { setNameError(t('nameRequired')); return; }
    if (!NAME_PATTERN.test(name.trim())) { setNameError(t('nameFormat')); return; }
    if (value.trim() === '') return;

    setLoading(true);
    const res = await createEnvVariableAction(orgId, name.trim(), value, isSecret);
    setLoading(false);

    if (res.error !== null) {
      toast.error(t('createError'));
      return;
    }

    resetForm();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t('name')}</Label>
            <Input value={name} onChange={(e) => { setName(e.target.value); setNameError(null); }} placeholder={t('namePlaceholder')} />
            {nameError !== null && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t('value')}</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('valuePlaceholder')} type={isSecret ? 'password' : 'text'} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={isSecret} onCheckedChange={(c) => setIsSecret(c === true)} id="is-secret" />
            <Label htmlFor="is-secret" className="text-sm font-normal">{t('secret')}</Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>{t('add')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create EnvVariablesSection**

Follow pattern from `packages/web/app/components/orgs/ApiKeysSection.tsx`:

```ts
// packages/web/app/components/orgs/EnvVariablesSection.tsx
'use client';

import { useState } from 'react';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEnvVariablesByOrgAction } from '@/app/actions/org-env-variables';
import type { OrgEnvVariableRow } from '@/app/lib/org-env-variables';
import { CreateEnvVariableDialog } from './CreateEnvVariableDialog';
import { DeleteEnvVariableDialog } from './DeleteEnvVariableDialog';

interface EnvVariablesSectionProps {
  orgId: string;
  initialVariables: OrgEnvVariableRow[];
}

function VariableRow({
  variable,
  onDelete,
}: {
  variable: OrgEnvVariableRow;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="flex items-center gap-2">
        <code className="text-sm font-mono">{variable.name}</code>
        {variable.is_secret ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <EyeOff className="size-3" /> Secret
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="size-3" /> Visible
          </span>
        )}
      </div>
      <Button variant="destructive" size="icon-xs" onClick={onDelete}>
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

export function EnvVariablesSection({ orgId, initialVariables }: EnvVariablesSectionProps) {
  const t = useTranslations('envVariables');
  const [variables, setVariables] = useState(initialVariables);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgEnvVariableRow | null>(null);

  async function refreshVariables(): Promise<void> {
    const res = await getEnvVariablesByOrgAction(orgId);
    if (res.error === null) setVariables(res.result);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3 mr-1" />
            {t('add')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {variables.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noVariables')}</p>
        ) : (
          <div>
            {variables.map((v) => (
              <VariableRow key={v.id} variable={v} onDelete={() => setDeleteTarget(v)} />
            ))}
          </div>
        )}
      </CardContent>
      <CreateEnvVariableDialog orgId={orgId} open={createOpen} onOpenChange={setCreateOpen} onCreated={refreshVariables} />
      {deleteTarget !== null && (
        <DeleteEnvVariableDialog
          variableId={deleteTarget.id}
          variableName={deleteTarget.name}
          open={deleteTarget !== null}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          onDeleted={refreshVariables}
        />
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/orgs/EnvVariablesSection.tsx packages/web/app/components/orgs/CreateEnvVariableDialog.tsx packages/web/app/components/orgs/DeleteEnvVariableDialog.tsx
git commit -m "feat: add org environment variables settings UI"
```

---

### Task 14: Wire EnvVariablesSection into settings page

**Files:**
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Import and fetch env variables**

Add import:
```ts
import { EnvVariablesSection } from '@/app/components/orgs/EnvVariablesSection';
import { getEnvVariablesByOrg } from '@/app/lib/org-env-variables';
```

In the server component data fetching section, add alongside the existing `getApiKeysByOrg` call:
```ts
const envVarsResult = await getEnvVariablesByOrg(supabase, org.id);
const envVariables = envVarsResult.error === null ? envVarsResult.result : [];
```

- [ ] **Step 2: Add component to JSX**

Add between `<ApiKeysSection>` and `<DangerZone>`:

```tsx
<EnvVariablesSection orgId={org.id} initialVariables={envVariables} />
```

- [ ] **Step 3: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/orgs/[slug]/(dashboard)/settings/page.tsx
git commit -m "feat: add environment variables section to org settings page"
```

---

## Chunk 4: UI — Publish Flow

### Task 15: PublishMcpDialog component

**Files:**
- Create: `packages/web/app/components/panels/PublishMcpDialog.tsx`

- [ ] **Step 1: Create the dialog**

```ts
// packages/web/app/components/panels/PublishMcpDialog.tsx
'use client';

import { useState } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { MCP_LIBRARY_CATEGORIES } from '@daviddh/graph-types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { publishMcpAction } from '@/app/actions/mcp-library';
import { extractVariableNames } from '@/app/lib/resolve-variables';
import type { McpServerConfig } from '@/app/schemas/graph.schema';

interface PublishMcpDialogProps {
  server: McpServerConfig;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}

function extractTransportConfig(transport: McpServerConfig['transport']): Record<string, unknown> {
  const { type: _type, ...config } = transport;
  return config;
}

export function PublishMcpDialog({ server, orgId, open, onOpenChange, onPublished }: PublishMcpDialogProps) {
  const t = useTranslations('mcpLibrary');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const variables = extractVariableNames(server.transport);

  async function handlePublish(): Promise<void> {
    if (description.trim() === '' || category === '') return;

    setLoading(true);

    let imageFormData: FormData | undefined;
    if (imageFile !== null) {
      imageFormData = new FormData();
      imageFormData.set('file', imageFile);
    }

    const res = await publishMcpAction(
      orgId,
      {
        name: server.name,
        description: description.trim(),
        category,
        transportType: server.transport.type,
        transportConfig: extractTransportConfig(server.transport),
        variables: variables.map((name) => ({ name })),
      },
      imageFormData
    );

    setLoading(false);

    if (res.error !== null) {
      toast.error(t('publishError'));
      return;
    }

    toast.success(t('publishSuccess'));
    onOpenChange(false);
    onPublished();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('publishTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3">
            <AlertTriangle className="size-4 text-orange-500 mt-0.5 shrink-0" />
            <p className="text-xs text-orange-700">{t('publishWarning')}</p>
          </div>

          <div className="space-y-1">
            <Label>{t('description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label>{t('category')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MCP_LIBRARY_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t('image')}</Label>
            <Button variant="outline" size="sm" onClick={() => document.getElementById('mcp-image-input')?.click()}>
              <Upload className="size-3 mr-1" />
              {t('imageUpload')}
            </Button>
            <input
              id="mcp-image-input"
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setImageFile(f); }}
            />
            {imageFile !== null && <p className="text-xs text-muted-foreground">{imageFile.name}</p>}
          </div>

          {variables.length > 0 && (
            <div className="space-y-1">
              <Label>{t('detectedVariables')}</Label>
              <div className="flex flex-wrap gap-1">
                {variables.map((v) => <Badge key={v} variant="secondary">{v}</Badge>)}
              </div>
            </div>
          )}
          {variables.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('noVariables')}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('publishCancel')}</Button>
          <Button onClick={handlePublish} disabled={loading || description.trim() === '' || category === ''}>{t('publishConfirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/PublishMcpDialog.tsx
git commit -m "feat: add publish MCP server dialog with variable detection"
```

---

### Task 16: Add Publish button and Library button to McpServersSection

**Files:**
- Modify: `packages/web/app/components/panels/McpServersSection.tsx`

- [ ] **Step 1: Update the interface and imports**

Add to the `McpServersSectionProps` interface:
- `orgId: string`
- `onPublish: (server: McpServerConfig) => void`
- `onOpenLibrary: () => void`

Add import: `import { BookOpen } from 'lucide-react';`

- [ ] **Step 2: Add Publish button to ServerItemExpanded**

In `ServerItemExpanded`, modify the bottom section. Replace the single `DiscoverButton` line (line 223) with a two-button row:

```tsx
<div className="flex gap-2">
  <Button variant="outline" size="sm" className="flex-1" onClick={() => onPublish(server)}>
    {t('publish')}
  </Button>
  <DiscoverButton status={status} isDiscovering={isDiscovering} onDiscover={onDiscover} />
</div>
```

Make `DiscoverButton` use `variant="default"` (primary) instead of `variant="outline"`, and add `className="flex-1"`.

Pass `onPublish` through `ServerItemProps` → `ServerItem` → `ServerItemExpanded`.

- [ ] **Step 3: Add Library button to section header**

In the `McpServersSection` component, modify the header (line 282-286) to add a Library button left of the Plus button:

```tsx
<div className="flex items-center justify-between mb-2">
  <Label>MCP Servers</Label>
  <div className="flex items-center gap-1">
    <Button variant="ghost" size="icon-xs" onClick={onOpenLibrary} title={t('libraryTitle')}>
      <BookOpen className="size-3" />
    </Button>
    <Button variant="ghost" size="icon-xs" onClick={onAdd}>
      <Plus className="size-3" />
    </Button>
  </div>
</div>
```

- [ ] **Step 4: Add translations for MCP section**

Use `useTranslations('mcpLibrary')` in the component for the `t('publish')` and `t('libraryTitle')` keys.

- [ ] **Step 5: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/components/panels/McpServersSection.tsx
git commit -m "feat: add Publish and Library buttons to MCP servers section"
```

---

## Chunk 5: UI — Library Panel, Variable Editor & Integration

### Task 17: McpLibraryCard component

**Files:**
- Create: `packages/web/app/components/panels/McpLibraryCard.tsx`

- [ ] **Step 1: Create the card component**

```ts
// packages/web/app/components/panels/McpLibraryCard.tsx
'use client';

import { Download, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { McpLibraryRow } from '@/app/lib/mcp-library';

interface McpLibraryCardProps {
  item: McpLibraryRow;
  isInstalled: boolean;
  onInstall: (item: McpLibraryRow) => void;
}

export function McpLibraryCard({ item, isInstalled, onInstall }: McpLibraryCardProps) {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="flex gap-3 rounded-md border p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
        {item.image_url !== null ? (
          <img src={item.image_url} alt={item.name} className="size-10 rounded-md object-cover" />
        ) : (
          <Server className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{item.name}</p>
            {item.org_name !== undefined && (
              <p className="text-[10px] text-muted-foreground">{item.org_name}</p>
            )}
          </div>
          <Button
            variant={isInstalled ? 'outline' : 'default'}
            size="sm"
            className="shrink-0"
            disabled={isInstalled}
            onClick={() => onInstall(item)}
          >
            {isInstalled ? t('installed') : t('install')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Download className="size-2.5" />
            {t('installations', { count: item.installations_count })}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/McpLibraryCard.tsx
git commit -m "feat: add MCP library card component"
```

---

### Task 18: McpLibraryPanel component

**Files:**
- Create: `packages/web/app/components/panels/McpLibraryPanel.tsx`

- [ ] **Step 1: Create the panel component**

```ts
// packages/web/app/components/panels/McpLibraryPanel.tsx
'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { McpLibraryRow } from '@/app/lib/mcp-library';
import { McpLibraryCard } from './McpLibraryCard';

interface McpLibraryPanelProps {
  installedLibraryIds: string[];
  onInstall: (item: McpLibraryRow) => void;
  onClose: () => void;
}

async function fetchLibrary(query?: string): Promise<McpLibraryRow[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('limit', '15');

  const res = await fetch(`/api/mcp-library?${params.toString()}`);
  if (!res.ok) return [];

  const data: unknown = await res.json();
  const parsed = data as { result?: McpLibraryRow[] };
  return parsed.result ?? [];
}

export function McpLibraryPanel({ installedLibraryIds, onInstall, onClose }: McpLibraryPanelProps) {
  const t = useTranslations('mcpLibrary');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<McpLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const loadItems = useCallback(async (q?: string) => {
    setLoading(true);
    const result = await fetchLibrary(q);
    setItems(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  function handleQueryChange(value: string): void {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadItems(value || undefined);
    }, 300);
  }

  const installedSet = new Set(installedLibraryIds);

  return (
    <aside className="absolute left-0 top-0 bottom-0 w-80 border-r border-gray-200 bg-white z-10 flex flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="text-sm font-semibold">{t('libraryTitle')}</h2>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3" />
        </Button>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Search className="size-3.5 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="h-7 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!query && <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('topInstalled')}</p>}
        {loading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">{t('searchPlaceholder')}</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">{t('noResults')}</p>
        ) : (
          items.map((item) => (
            <McpLibraryCard
              key={item.id}
              item={item}
              isInstalled={installedSet.has(item.id)}
              onInstall={onInstall}
            />
          ))
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/McpLibraryPanel.tsx
git commit -m "feat: add MCP library browse panel with search"
```

---

### Task 19: VariableValuesEditor component

**Files:**
- Create: `packages/web/app/components/panels/VariableValuesEditor.tsx`

- [ ] **Step 1: Create the component**

```ts
// packages/web/app/components/panels/VariableValuesEditor.tsx
'use client';

import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OrgEnvVariableRow } from '@/app/lib/org-env-variables';

interface VariableValue {
  type: 'direct' | 'env_ref';
  value?: string;
  envVariableId?: string;
}

interface VariableValuesEditorProps {
  variables: Array<{ name: string; description?: string }>;
  values: Record<string, VariableValue>;
  envVariables: OrgEnvVariableRow[];
  onChange: (values: Record<string, VariableValue>) => void;
}

function VariableRow({
  variable,
  value,
  envVariables,
  onChange,
}: {
  variable: { name: string; description?: string };
  value: VariableValue | undefined;
  envVariables: OrgEnvVariableRow[];
  onChange: (value: VariableValue) => void;
}) {
  const t = useTranslations('mcpLibrary');
  const mode = value?.type ?? 'direct';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-mono">{variable.name}</Label>
        <Select value={mode} onValueChange={(v) => {
          if (v === 'direct') onChange({ type: 'direct', value: '' });
          else onChange({ type: 'env_ref', envVariableId: '' });
        }}>
          <SelectTrigger className="h-6 w-24 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">{t('directValue')}</SelectItem>
            <SelectItem value="env_ref">{t('envVariable')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === 'direct' ? (
        <Input
          value={value?.value ?? ''}
          onChange={(e) => onChange({ type: 'direct', value: e.target.value })}
          placeholder={t('valuePlaceholder')}
          className="h-7 text-xs"
        />
      ) : (
        <Select
          value={value?.envVariableId ?? ''}
          onValueChange={(v) => onChange({ type: 'env_ref', envVariableId: v })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder={t('selectEnvVar')} />
          </SelectTrigger>
          <SelectContent>
            {envVariables.map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function VariableValuesEditor({ variables, values, envVariables, onChange }: VariableValuesEditorProps) {
  const t = useTranslations('mcpLibrary');

  if (variables.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">{t('variables')}</Label>
      {variables.map((v) => (
        <VariableRow
          key={v.name}
          variable={v}
          value={values[v.name]}
          envVariables={envVariables}
          onChange={(val) => onChange({ ...values, [v.name]: val })}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/VariableValuesEditor.tsx
git commit -m "feat: add variable values editor component (direct/env-ref)"
```

---

### Task 20: Wire library panel and publish into SidePanels and GraphBuilder

**Files:**
- Modify: `packages/web/app/components/SidePanels.tsx`
- Modify: `packages/web/app/components/GraphBuilder.tsx`
- Modify: `packages/web/app/components/panels/ToolsPanel.tsx`
- Modify: `packages/web/app/hooks/useMcpServers.ts`

This is a wiring task that connects all the pieces. The exact code depends on how `GraphBuilder.tsx` manages state (it uses `useState` for panel toggles). The key changes:

- [ ] **Step 1: Add `libraryOpen` state to GraphBuilder**

Add alongside existing panel states:
```ts
const [libraryOpen, setLibraryOpen] = useState(false);
```

Pass it down through SidePanels props.

- [ ] **Step 2: Add `addServerFromLibrary` to useMcpServers**

In `packages/web/app/hooks/useMcpServers.ts`, add a new function in `useServerMutations` that creates a server from a library template:

```ts
const addServerFromLibrary = useCallback(
  (config: {
    name: string;
    transport: McpServerConfig['transport'];
    libraryItemId: string;
    variables: Array<{ name: string }>;
  }) => {
    const emptyValues: Record<string, { type: 'direct'; value: string }> = {};
    for (const v of config.variables) {
      emptyValues[v.name] = { type: 'direct', value: '' };
    }
    const server: McpServerConfig = {
      id: nanoid(),
      name: config.name,
      transport: config.transport,
      enabled: true,
      libraryItemId: config.libraryItemId,
      variableValues: emptyValues,
    };
    setServers((prev) => [...prev, server]);
    pushOperation(buildInsertMcpOp(server));
    return server;
  },
  [setServers, pushOperation]
);
```

Add to `McpServersState` interface and return value.

- [ ] **Step 3: Update operation builders to include new fields**

In `buildInsertMcpOp` and `buildUpdateMcpOp`, include `libraryItemId` and `variableValues`:

```ts
function buildInsertMcpOp(server: McpServerConfig): Operation {
  return {
    type: 'insertMcpServer',
    data: {
      serverId: server.id,
      name: server.name,
      transport: server.transport,
      enabled: server.enabled,
      libraryItemId: server.libraryItemId,
      variableValues: server.variableValues,
    },
  };
}
```

Same pattern for `buildUpdateMcpOp`.

- [ ] **Step 4: Pass orgId through ToolsPanel and McpServersSection**

The `orgId` is needed for publish actions and env variable loading. Thread it from `GraphBuilder` (where it's available from the route params) through `SidePanels` → `ToolsPanel` → `McpServersSection`.

- [ ] **Step 5: Wire McpLibraryPanel in SidePanels**

Add the library panel to `SidePanels`, conditionally rendered when `libraryOpen` is true. It should toggle with the presets panel (only one left panel visible at a time):

```tsx
{libraryOpen && (
  <McpLibraryPanel
    installedLibraryIds={props.mcpHook.servers
      .filter((s) => s.libraryItemId !== undefined)
      .map((s) => s.libraryItemId as string)}
    onInstall={handleInstall}
    onClose={() => setLibraryOpen(false)}
  />
)}
```

- [ ] **Step 6: Wire PublishMcpDialog**

Add state for publish dialog in `ToolsPanel` or `SidePanels`:

```ts
const [publishServer, setPublishServer] = useState<McpServerConfig | null>(null);
```

Render `PublishMcpDialog` when `publishServer` is not null.

- [ ] **Step 7: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/components/SidePanels.tsx packages/web/app/components/GraphBuilder.tsx packages/web/app/components/panels/ToolsPanel.tsx packages/web/app/hooks/useMcpServers.ts
git commit -m "feat: wire library panel, publish dialog, and addServerFromLibrary into editor"
```

---

### Task 21: Update discover flow to use proxy route

**Files:**
- Modify: `packages/web/app/lib/api.ts`

- [ ] **Step 1: Update discoverMcpTools**

Change `discoverMcpTools` (line 43-56 in `api.ts`) to call the Next.js proxy route instead of the backend directly:

```ts
export async function discoverMcpTools(
  transport: McpTransport,
  variableValues?: Record<string, unknown>
): Promise<DiscoveredTool[]> {
  const res = await fetch('/api/mcp/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transport, variableValues }),
  });
  if (!res.ok) {
    const message = await parseDiscoverError(res);
    throw new Error(message);
  }
  const raw = await fetchJsonUnknown(res);
  const data = DiscoverResponseSchema.parse(raw);
  return data.tools;
}
```

- [ ] **Step 2: Update useMcpServers discover call**

In `packages/web/app/hooks/useMcpServers.ts`, update `useToolDiscovery` to pass `variableValues` to `discoverMcpTools`:

```ts
void discoverMcpTools(server.transport, server.variableValues)
```

- [ ] **Step 3: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/api.ts packages/web/app/hooks/useMcpServers.ts
git commit -m "feat: route MCP discover through Next.js proxy for variable resolution"
```

---

### Task 22: Add variable resolution to simulate route

**Files:**
- Modify: `packages/web/app/api/simulate/route.ts`

- [ ] **Step 1: Add variable resolution before proxying**

Import the resolver:
```ts
import { resolveTransportVariables } from '@/app/lib/resolve-variables';
import { McpTransportSchema } from '@daviddh/graph-types';
```

In the `POST` handler, after `resolveApiKey` and before `fetchUpstream`, add a step to resolve MCP server variables in the graph payload:

```ts
// Resolve MCP server variables
const graph = rest.graph as Record<string, unknown> | undefined;
if (graph !== undefined) {
  const mcpServers = graph.mcpServers as Array<Record<string, unknown>> | undefined;
  if (mcpServers !== undefined) {
    const resolved = await Promise.all(
      mcpServers.map(async (server) => {
        const variableValues = server.variableValues as Record<string, { type: string; value?: string; envVariableId?: string }> | undefined;
        if (variableValues === undefined) return server;
        const transport = McpTransportSchema.parse(server.transport);
        const resolvedTransport = await resolveTransportVariables(supabase, transport, variableValues as Record<string, { type: 'direct'; value: string } | { type: 'env_ref'; envVariableId: string }>);
        return { ...server, transport: resolvedTransport, variableValues: undefined };
      })
    );
    graph.mcpServers = resolved;
  }
}
```

- [ ] **Step 2: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/api/simulate/route.ts
git commit -m "feat: resolve MCP variable placeholders in simulate route before proxying"
```

---

### Task 23: Update McpServersSection for library-installed servers

**Files:**
- Modify: `packages/web/app/components/panels/McpServersSection.tsx`

- [ ] **Step 1: Add read-only mode for library servers**

In `ServerItemExpanded`, check if `server.libraryItemId` is defined. If so:
- Show name as read-only text (not editable)
- Show transport fields as read-only (disabled inputs)
- Show a "read-only config" label
- Show the `VariableValuesEditor` if the server has variables
- Disable "Discover Tools" if any variable is missing a value

```tsx
const isFromLibrary = server.libraryItemId !== undefined;
```

Conditionally render read-only vs editable fields based on `isFromLibrary`.

- [ ] **Step 2: Integrate VariableValuesEditor**

Import and render `VariableValuesEditor` when server has `variableValues`:

```tsx
{isFromLibrary && server.variableValues !== undefined && (
  <VariableValuesEditor
    variables={extractVariableNames(server.transport).map((n) => ({ name: n }))}
    values={server.variableValues}
    envVariables={envVariables}
    onChange={(newValues) => onUpdate({ variableValues: newValues })}
  />
)}
```

The `envVariables` prop needs to be threaded from the settings/org context. Add it to `McpServersSectionProps`.

- [ ] **Step 3: Disable discover when variables incomplete**

Check if all variables have non-empty values:

```ts
function areVariablesComplete(variableValues: Record<string, VariableValue> | undefined): boolean {
  if (variableValues === undefined) return true;
  return Object.values(variableValues).every((v) =>
    v.type === 'direct' ? v.value !== '' : v.envVariableId !== ''
  );
}
```

Pass `disabled={!areVariablesComplete(server.variableValues)}` to `DiscoverButton` alongside `isDiscovering`.

- [ ] **Step 4: Run check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/panels/McpServersSection.tsx
git commit -m "feat: read-only mode and variable editor for library-installed MCP servers"
```

---

### Task 24: Final integration check

- [ ] **Step 1: Run full check**

Run: `npm run check`
Expected: PASS (format + lint + typecheck across all packages)

- [ ] **Step 2: Run API tests**

Run: `npm run test -w packages/api`
Expected: PASS (no regressions — schema changes are additive/optional)

- [ ] **Step 3: Manual smoke test**

1. Start dev server: `npm run dev -w packages/web`
2. Navigate to org settings → verify env variables section appears
3. Create an env variable
4. Open graph editor → open tools panel → verify Library and Plus buttons
5. Click Library → verify panel opens with search
6. Create an MCP server with `{{API_TOKEN}}` in a header → click Publish → fill form → publish
7. Open Library → verify published MCP appears
8. Click Install → verify it appears in server list with variable inputs
9. Fill variable values → click Discover Tools → verify tools are discovered

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: final integration fixes for MCP server library"
```
