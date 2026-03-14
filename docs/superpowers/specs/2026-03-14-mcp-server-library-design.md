# MCP Server Library — Design Spec

## Overview

A global MCP Server Library that allows users to publish their MCP server configurations for others to discover and install. Introduces a variable system (`{{VARIABLE_NAME}}`) that separates sensitive credentials from server configuration, enabling safe sharing. Users provide variable values at install time — either directly or by referencing org-level environment variables managed in org settings.

## Architecture: Template-Instance Model

Published MCPs are stored as **templates** in a global `mcp_library` table. When a user installs one, an **instance** is created in their graph's `graph_mcp_servers` with a `library_item_id` foreign key pointing back to the template. Templates are immutable — to change, unpublish and republish. Existing installations keep working independently after install.

---

## 1. Data Model

### New table: `mcp_library`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `org_id` | FK → orgs | Publishing org |
| `name` | text | Display name |
| `description` | text | Required on publish |
| `category` | text | From predefined list |
| `image_url` | text, nullable | Optional MCP image (Supabase Storage) |
| `transport_type` | text | http, sse, stdio |
| `transport_config` | jsonb | URL/command/args/headers with `{{VARIABLE}}` placeholders |
| `variables` | jsonb | Array of `{ name: string, description?: string }`, auto-extracted |
| `installations_count` | integer, default 0 | Incremented on install |
| `published_by` | FK → user | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### New table: `org_env_variables`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `org_id` | FK → orgs | |
| `name` | text | e.g., `LINEAR_TOKEN`. Uppercase + underscores. |
| `value` | text | The actual secret/value |
| `is_secret` | boolean, default false | If true, value is masked in UI |
| `created_by` | FK → user | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique constraint on `(org_id, name)`.

### Modified table: `graph_mcp_servers`

Add columns:
- `library_item_id` (FK → mcp_library, nullable) — links to template if installed from library
- `variable_values` (jsonb, nullable) — map of variable name → `{ type: 'direct', value: string } | { type: 'env_ref', env_variable_id: uuid }`

### Predefined categories

`Productivity`, `Development`, `Data & Analytics`, `Communication`, `Design`, `DevOps & Infrastructure`, `Security`, `Finance`, `AI & ML`, `Project Management`, `Customer Support`, `Marketing`, `Sales`, `HR`, `Legal`, `Education`, `Healthcare`, `E-commerce`, `Social Media`, `Other`

---

## 2. Variable System

### Syntax

`{{VARIABLE_NAME}}` — double curly braces. Allowed in URL and header values only.

### Extraction

On publish, the system parses transport config (URL + all header values) to extract all `{{...}}` patterns. These automatically become the template's `variables` array.

### Resolution at runtime

When the backend executes an MCP server (simulation/graph run):

1. Read the instance's `variable_values` from `graph_mcp_servers`
2. For each variable:
   - `type: 'direct'` → use value as-is
   - `type: 'env_ref'` → fetch the referenced org env variable's value from `org_env_variables`
3. Replace all `{{VARIABLE_NAME}}` occurrences in URL and headers with resolved values
4. Connect to the MCP server with resolved config

### Validation

- **On publish:** Warn if no variables detected but headers contain values that look like tokens/keys (heuristic: long alphanumeric strings, "Bearer ..." patterns)
- **On install/use:** Require all variables to have values before MCP can be used (discover tools / simulation disabled until all variables filled)

---

## 3. UI Components & Flows

### 3.1 Publish Flow

1. User creates an MCP server in the existing toolbar dialog, using `{{VARIABLES}}` in URL/headers
2. **"Publish" button** sits left of the "Discover Tools" button (which becomes primary/filled style)
3. Click "Publish" → **confirmation modal**:
   - Read-only preview of the MCP config
   - Description field (required)
   - Category dropdown (required)
   - Optional image upload
   - Warning text: "This MCP will be visible to all users. Ensure all sensitive data uses variables (e.g., `{{API_TOKEN}}`)."
   - List of detected variables shown for review
   - "Publish" and "Cancel" buttons

### 3.2 Library Panel

- **"Library" button** added left of the "+" icon in the MCP Servers section header
- Opens a **left slide-out panel** (same style as context/settings presets panel)
- **Top:** search bar
- **Default content:** top 15 most installed MCPs
- **On search:** filtered results; on clear: back to top 15
- **Each card shows:**
  - MCP image (or placeholder icon)
  - Name
  - Publishing org name
  - Description (truncated)
  - Category badge
  - Installation count
  - "Install" button

### 3.3 Install Flow

1. Click "Install" → `installations_count` incremented in DB → MCP appears in the central toolbar dialog's server list
2. When expanded, if the MCP has variables, a **"Variables" section** appears below the normal fields
3. Each variable shows: name, and a toggle between "Direct value" (text input) or "Env variable" (dropdown of org env variables)
4. URL/headers fields are **read-only** for library-installed MCPs (config comes from template)
5. "Discover Tools" is **disabled** until all variables have values

### 3.4 Org Environment Variables (Settings Page)

- New section in `/orgs/[slug]/settings` between API Keys and Danger Zone
- Title: "Environment Variables"
- Table with columns: Name, Value (masked if secret), Secret toggle, Actions (edit/delete)
- "Add Variable" button opens inline row or small form
- Name validation: uppercase letters and underscores only

---

## 4. API & Backend

### Route Handlers

1. **`POST /api/mcp-library`** — Publish an MCP
   - Accepts: name, description, category, image (multipart), transport config
   - Extracts variables from config, stores template
   - Returns: created library item

2. **`GET /api/mcp-library`** — Browse/search library
   - Query params: `?q=search&category=Development`
   - Default (no params): returns top 15 by `installations_count` desc
   - Returns: array of library items with org name

3. **`DELETE /api/mcp-library/[id]`** — Unpublish
   - Only the publishing org's members can unpublish
   - Existing installations keep working (config is copied)

4. **`POST /api/mcp-library/[id]/install`** — Install to a graph
   - Accepts: `graph_id` (agent_id)
   - Increments `installations_count`
   - Copies template config into `graph_mcp_servers` with `library_item_id` set
   - Returns: created MCP server instance

5. **CRUD `/api/org-env-variables`** — Org environment variables
   - Scoped to user's current org
   - GET returns all (values masked for secrets)
   - POST/PUT/DELETE for management

### Backend Variable Resolution

In `packages/backend/src/mcp/lifecycle.ts`, before creating MCP sessions:

1. Check if server has `variable_values`
2. Resolve each variable (direct value or fetch from `org_env_variables`)
3. String-replace `{{VAR}}` patterns in URL and header values
4. Pass resolved config to MCP client

### Image Storage

- Upload to Supabase Storage bucket (e.g., `mcp-images`)
- Store public URL in `mcp_library.image_url`

---

## 5. Translations

All user-facing text requires i18n entries:

- Publish button, modal title, warning, form labels
- Library panel title, search placeholder, "Install" button, empty states
- Variable section labels, "Direct value" / "Env variable" toggle
- Org settings: "Environment Variables" section, form labels, validation messages
- Category names (all 20)
- Success/error toasts for publish, install, unpublish, variable CRUD

---

## 6. Schema Changes (graph-types package)

- New Zod schemas: `McpLibraryItem`, `OrgEnvVariable`, `VariableValue`
- Extend `McpServerConfig` with optional `library_item_id` and `variable_values`
- New operation schemas for library and env variable CRUD
