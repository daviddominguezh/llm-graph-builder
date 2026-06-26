# Project Core

Monorepo (npm workspaces, `"type": "module"`, ESM/NodeNext throughout). Builds state-machine-like LLM workflows: nodes = agent steps, edges = transitions with preconditions (`user_said`, `agent_decision`, `tool_call`). Routing modes: `tool_call`, `agent_decision`, `user_reply`.

Note: root CLAUDE.md describes only 2 packages (api, web) — outdated. Actual = 7 packages (see `mem:tech_stack`).

## Package map (packages/*)
- `api` (`@daviddh/llm-graph-runner`) — runtime that executes graphs; agents/tools/MCPs/prompts live here. Src dirs: `stateMachine/` (orchestration, traversal, prompt formatting), `agentLoop/`, `core/`, `tools/`, `provider(s)/`, `services/`, `vfs/`, `google/`, `cache/`.
- `backend` (`@daviddh/graph-runner-backend`) — dedicated backend server (`server.ts`). Dirs: `routes/`, `db/`, `mcp/`, `mcp-server/`, `rag/`, `messaging/`, `workers/`, `github/`, `google/`, `notifications/`, `observability/`, `middleware/`.
- `web` — Next.js 16 App Router visual graph editor (port 3101). See `mem:web/core`.
- `widget` (`@openflow/widget`) — Vite + vitest embeddable widget.
- `landing` — Next.js marketing site.
- `graph-types` (`@daviddh/graph-types`) — shared graph schemas/types.
- `shared-validation` (`@openflow/shared-validation`) — validation shared web↔backend (origins, sqlParity, onboarding).

## Invariants
- Client → Next.js backend (Server Components/Actions/Route Handlers) → dedicated backend. No direct DB/Supabase from browser, except auth flows (Supabase browser client).
- Conventions in `mem:conventions`; commands in `mem:suggested_commands`; done-criteria in `mem:task_completion`.
