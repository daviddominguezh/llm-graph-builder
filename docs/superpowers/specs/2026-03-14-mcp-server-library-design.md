# MCP Server Library — Design Spec

## Overview

A global MCP Server Library that allows users to publish their MCP server configurations for others to discover and install. Introduces a variable system (`{{VARIABLE_NAME}}`) that separates sensitive credentials from server configuration, enabling safe sharing. Users provide variable values at install time — either directly or by referencing org-level environment variables managed in org settings.

## Architecture: Template-Instance Model

Published MCPs are stored as **templates** in a global `mcp_library` table. When a user installs one, an **instance** is created in their graph's `graph_mcp_servers` with a `library_item_id` foreign key pointing back to the template. The instance stores the **template config with `{{VAR}}` placeholders** — variables are resolved at runtime, so changing an env variable value takes effect without re-saving. Templates are immutable — to change, unpublish and republish. Existing installations keep working independently after install.

---

## 1. Data Model

### New table: `mcp_library`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `org_id` | FK → orgs | Publishing org |
| `name` | text | Display name |
| `description` | text | Required on publish |
| `category` | text | From predefined list (Zod enum in graph-types) |
| `image_url` | text, nullable | Optional MCP image (Supabase Storage, `mcp-images` bucket) |
| `transport_type` | text | http, sse, stdio |
| `transport_config` | jsonb | URL/command/args/headers with `{{VARIABLE}}` placeholders. Same shape as existing `graph_mcp_servers.transport_config`. |
| `variables` | jsonb | Array of `{ name: string, description?: string }`, auto-extracted from config |
| `installations_count` | integer, default 0 | Incremented atomically via Supabase RPC `increment_installations_count(library_item_id uuid)` |
| `published_by` | FK → user | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**RLS:** Read is public (all authenticated users can browse). Write/delete restricted to members of `org_id`. Use `SECURITY DEFINER` helper function for org membership check to avoid self-referencing RLS recursion on `org_members`.

### New table: `org_env_variables`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `org_id` | FK → orgs | |
| `name` | text | e.g., `LINEAR_TOKEN`. Uppercase + underscores. |
| `value` | text | The actual secret/value |
| `is_secret` | boolean, default false | If true, value is masked in UI after save |
| `created_by` | FK → user | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique constraint on `(org_id, name)`.

**RLS:** Scoped to org members. Use same `SECURITY DEFINER` helper pattern.

### Modified table: `graph_mcp_servers`

Add columns:
- `library_item_id` (FK → mcp_library, nullable, **`ON DELETE SET NULL`**) — links to template if installed from library. If template is unpublished, this becomes NULL but the installation keeps working.
- `variable_values` (jsonb, nullable) — map of variable name → `{ type: 'direct', value: string } | { type: 'env_ref', env_variable_id: uuid }`

**Unique constraint:** `UNIQUE (agent_id, library_item_id) WHERE library_item_id IS NOT NULL` — prevents duplicate installations of the same library item in a graph.

**Transport config storage:** Installed-from-library servers store the **template config with `{{VAR}}` placeholders** in `transport_config`. Resolution happens at runtime.

### Predefined categories (shared Zod enum in `graph-types`)

`Productivity`, `Development`, `Data & Analytics`, `Communication`, `Design`, `DevOps & Infrastructure`, `Security`, `Finance`, `AI & ML`, `Project Management`, `Customer Support`, `Marketing`, `Sales`, `HR`, `Legal`, `Education`, `Healthcare`, `E-commerce`, `Social Media`, `Other`

Defined as a typed constant array + Zod enum in `packages/graph-types` so publish form, library panel, and validation all reference the same source of truth.

---

## 2. Variable System

### Syntax

`{{VARIABLE_NAME}}` — double curly braces. Allowed in URL, header values, and for stdio transport: in `command`, `args`, and `env` values.

### Extraction

On publish, the system parses the full transport config to extract all `{{...}}` patterns. These automatically become the template's `variables` array.

### Resolution at runtime — Next.js layer

Variable resolution happens in the **Next.js server layer**, not in the Express backend. The backend remains stateless and receives fully-resolved transport configs.

**Simulation flow:**
1. In `packages/web/app/api/simulate/route.ts`, before proxying to backend:
2. For each MCP server in the graph that has `variable_values`:
   - `type: 'direct'` → use value as-is
   - `type: 'env_ref'` → fetch from `org_env_variables` via Supabase
3. Replace all `{{VARIABLE_NAME}}` in URL, headers, command, args, env
4. Send resolved config to backend

**Discover tools flow:**
Currently `discoverMcpTools()` in `app/lib/api.ts` calls the backend directly from the browser. For library-installed MCPs with variables, this must change to avoid exposing resolved secrets in the browser:

1. Add a new Next.js Route Handler: `POST /api/mcp/discover/route.ts`
2. The client sends the transport config **with `{{VAR}}` placeholders** + `variable_values` to this route
3. The Route Handler calls `resolveTransportVariables()` server-side to replace placeholders with actual values
4. The Route Handler proxies the resolved config to the backend's `/mcp/discover` endpoint
5. Update `discoverMcpTools()` in `app/lib/api.ts` to call the new Next.js route instead of the backend directly
6. Secrets never transit through the browser

### Validation

- **On publish:** Warn if no variables detected but headers contain values that look like tokens/keys (heuristic: long alphanumeric strings, "Bearer ..." patterns)
- **On install/use:** Require all variables to have values before MCP can be used (discover tools / simulation disabled until all variables filled)

---

## 3. UI Components & Flows

### 3.1 Publish Flow

1. User creates an MCP server in the existing toolbar dialog, using `{{VARIABLES}}` in URL/headers
2. **"Publish" button** sits left of the "Discover Tools" button (which becomes primary/filled style)
3. Click "Publish" → **confirmation modal** (using existing `AlertDialog` pattern):
   - Read-only preview of the MCP config
   - Description field (required)
   - Category dropdown (required)
   - Optional image upload (follows org avatar Server Action + `mcp-images` storage bucket pattern)
   - Warning text: "This MCP will be visible to all users. Ensure all sensitive data uses variables (e.g., `{{API_TOKEN}}`)."
   - List of detected variables shown for review
   - "Publish" and "Cancel" buttons

### 3.2 Library Panel

- **"Library" button** added left of the "+" icon in the MCP Servers section header
- Opens a **left slide-out panel** (dedicated panel, toggles with presets panel — only one visible at a time)
- **Top:** search bar with category filter dropdown
- **Default content:** top 15 most installed MCPs
- **On search:** filtered results (paginated if library grows large); on clear: back to top 15
- **Each card shows:**
  - MCP image (or placeholder icon)
  - Name
  - Publishing org name
  - Description (truncated)
  - Category badge
  - Installation count
  - "Install" button (or "Installed" if `library_item_id` already exists in this graph's servers)

### 3.3 Install Flow

1. Click "Install" → `installations_count` atomically incremented → MCP appears in the central toolbar dialog's server list
2. If the same `library_item_id` is already installed in this graph, show "Installed" instead of "Install"
3. When expanded, if the MCP has variables, a **"Variables" section** appears below the normal fields
4. Each variable shows: name, and a toggle between "Direct value" (text input) or "Env variable" (dropdown of org env variables)
5. URL/headers fields are **read-only** for library-installed MCPs (config comes from template, shown with `{{VAR}}` placeholders)
6. "Discover Tools" is **disabled** until all variables have values

### 3.4 Org Environment Variables (Settings Page)

- New section in `/orgs/[slug]/settings` between API Keys and Danger Zone
- Title: "Environment Variables"
- Table with columns: Name, Value (masked if secret), Secret toggle, Actions (edit/delete)
- "Add Variable" button opens inline row or small form
- Name validation: uppercase letters and underscores only

---

## 4. Data Access Layer

Following existing codebase patterns:

### Server Actions (org-scoped data, like API keys)

- **`app/actions/mcp-library.ts`** — publish, unpublish. Uses Supabase client.
- **`app/actions/org-env-variables.ts`** — CRUD for org env variables. Uses Supabase client. Follows same pattern as `app/actions/api-keys.ts`.
- **`app/actions/mcp-library-install.ts`** — install (copies template to graph, increments count atomically via Supabase RPC).

### Server Action for variable resolution

- **`app/actions/resolve-variables.ts`** — given variable values with env refs, fetches actual values from `org_env_variables` and returns resolved transport config. Called by discover flow and simulation route.

### Route Handlers

- **`GET /api/mcp-library/route.ts`** — browse/search library. Query params: `?q=search&category=Development&page=1&limit=15`. Default: top 15 by installations_count desc. Returns array of library items with org name. Uses a Route Handler (not Server Action) because the library panel needs client-side fetch with dynamic search/pagination parameters — Server Actions are better suited for mutations and one-shot data loading.
- **`POST /api/mcp/discover/route.ts`** — proxy for MCP tool discovery. Accepts transport config with `{{VAR}}` placeholders + variable_values. Resolves variables server-side, then proxies resolved config to backend's `/mcp/discover`. Prevents secrets from transiting through the browser.

### Lib modules

- **`app/lib/mcp-library.ts`** — Supabase queries for library CRUD
- **`app/lib/org-env-variables.ts`** — Supabase queries for env variables
- **`app/lib/mcp-library-storage.ts`** — image upload to `mcp-images` bucket (follows `lib/org-storage.ts` pattern)

### Variable resolution in simulate route

In `packages/web/app/api/simulate/route.ts`, before proxying to backend:
1. Extract MCP servers from the graph payload
2. Call `resolveTransportVariables()` for each server with variable values
3. Replace `{{VAR}}` placeholders with resolved values
4. Send resolved config to backend

### Image Storage

- Upload to Supabase Storage bucket `mcp-images`
- Store public URL in `mcp_library.image_url`
- Follow existing org avatar pattern: Server Action with FormData → storage lib

---

## 5. Translations

Translation namespaces: `mcpLibrary` and `envVariables` in `messages/en.json`.

All user-facing text requires i18n entries:

- Publish button, modal title, warning, form labels
- Library panel title, search placeholder, "Install" / "Installed" button, empty states
- Variable section labels, "Direct value" / "Env variable" toggle
- Org settings: "Environment Variables" section, form labels, validation messages
- Category names (all 20)
- Success/error toasts for publish, install, unpublish, variable CRUD

---

## 6. Schema Changes (graph-types package)

### New schemas
- `McpLibraryCategory` — Zod enum of predefined categories (shared constant)
- `McpLibraryItem` — full library item shape
- `OrgEnvVariable` — env variable shape
- `VariableValue` — discriminated union: `{ type: 'direct', value: string } | { type: 'env_ref', env_variable_id: string }`

### Extended schemas
- `McpServerConfig` — add optional `library_item_id` and `variable_values`

### Affected files (migration checklist)
- `packages/graph-types/src/schemas/mcp.schema.ts` — add `library_item_id`, `variable_values` to `McpServerConfigSchema`
- `packages/graph-types/src/schemas/operation-mcp.schema.ts` — update `McpServerDataSchema` with new optional fields
- `packages/backend/src/db/queries/graphRowTypes.ts` — update `McpServerRow` with `library_item_id`, `variable_values`
- `packages/backend/src/db/queries/graphAssemblers.ts` — update `assembleMcpServers()` to map new fields
- `packages/backend/src/db/queries/graphFetchers.ts` — verify `fetchMcpServers()` `select('*')` picks up new columns, update `McpServerRow` shape
- `packages/backend/src/db/queries/mcpServerOperations.ts` — update `McpServerInsertRow`, `buildMcpServerRow()` with new columns
- `packages/web/app/hooks/useMcpServers.ts` — update `createDefaultServer()`, `buildInsertMcpOp()`, `buildUpdateMcpOp()`
- `packages/web/app/lib/api.ts` — update `discoverMcpTools()` to call new Next.js discover route instead of backend directly

### Supabase migrations needed
- Add `library_item_id` and `variable_values` columns to `graph_mcp_servers`
- Add unique partial index `UNIQUE (agent_id, library_item_id) WHERE library_item_id IS NOT NULL`
- Create `mcp_library` table with RLS policies (SECURITY DEFINER for org membership checks)
- Create `org_env_variables` table with RLS policies (SECURITY DEFINER for org membership checks)
- Create RPC function `increment_installations_count(p_library_item_id uuid)` — atomically increments count
- Create `mcp-images` Supabase Storage bucket with public-read policy (library items are browsable by all authenticated users)
- Add `BEFORE UPDATE` triggers on `mcp_library` and `org_env_variables` for auto-updating `updated_at`
