# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Full check (format + lint + typecheck), you MUST run this after you think you have finished your changes
npm run check

# Individual checks
npm run format          # Prettier
npm run lint            # ESLint
npm run typecheck       # TypeScript (tsc -b, all packages)

# Build
npm run build           # All packages
npm run build:web       # Web package only

# API package
npm run typecheck -w packages/api
npm run test -w packages/api                          # Jest (ESM)
npm run test -w packages/api -- --testPathPattern=foo # Single test

# Web package
npm run dev -w packages/web     # Dev server on port 3101
npm run build -w packages/web
npm run typecheck -w packages/web
npm run lint -w packages/web
```

## Architecture

Monorepo (npm workspaces) with two packages:

- **`packages/api`** (`@daviddh/llm-graph-runner`) - State machine runtime that executes LLM graph workflows. Nodes represent agent steps, edges represent transitions with preconditions (`user_said`, `agent_decision`, `tool_call`). Key modules: `src/stateMachine/` (orchestration, graph traversal, prompt formatting).
- **`packages/web`** - Next.js 16 app (App Router, port 3101) providing a visual graph editor built with `@xyflow/react`. Users create/edit nodes and edges, validate graphs, and export JSON schemas.

### Path aliases

- API package: `@src/*` maps to `./src/*` (defined in `compilerOptions.paths`)
- Web package: `@/*` maps to `./*`

### Web package structure

- `app/components/` - Graph builder UI (nodes, edges, panels)
- `app/schemas/` - Zod validation schemas for graph data
- `app/utils/` - Graph validation, transformers (schema <-> React Flow), layout (Dagre)
- `app/data/` - Sample graph JSON files (ecommerce, airline)
- `components/ui/` - shadcn/ui components

### Graph data model

Graphs have **nodes** (kinds: `agent`, `agent_decision`, `tool`) and **edges** with preconditions. Three routing modes:
- `tool_call` - invoke external tools
- `agent_decision` - LLM selects next node
- `user_reply` - await user input

### Data access

- **Client components never talk to the database.** The data flow is: Client → Next.js backend (Server Components, Server Actions, Route Handlers) → dedicated backend. No direct Supabase calls from the browser.
- Auth flows (login, signup, OAuth, password reset) are the only exception — these use the Supabase browser client for auth token management.

## Code style and constraints

### ESLint (strict, do not disable)

- `max-lines-per-function`: 40 (skip blanks/comments)
- `max-lines`: 300 per file (skip comments)
- `max-depth`: 2
- When hitting line limits, extract helper functions or split files — never compress code onto single lines

### TypeScript

- Strict mode, `noUncheckedIndexedAccess` enabled
- Never use `any` — always use explicit types
- ESM modules (`"type": "module"`, NodeNext resolution)

### UI (web package)

- Always use shadcn/ui components from `components/ui/` — don't create from scratch
- Add new shadcn components: `npx shadcn@latest add <component-name>`
- Never use `!important` in CSS or Tailwind classes

### Internationalization

- Always add translations when adding user-facing text

### Formatting

- Prettier: single quotes, 2-space indent, 110 print width, trailing comma es5
- Import sorting via `@trivago/prettier-plugin-sort-imports`
