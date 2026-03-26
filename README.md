# OpenFlow

## Making it easier to build AI agents

**The platform for building agent-powered SaaS.**

Build an AI agent, connect WhatsApp, Slack, or a chatbot — and each of your customers gets their own isolated instance. Multi-tenant from day one.

---

## The Problem

Every no-code agent builder assumes **you** are the end user. The moment you try to resell an agent to your own customers, you hit a wall:

- How do I give each customer their own WhatsApp number?
- How do I isolate conversation history per tenant?
- How do I track usage and costs per customer?
- How do I manage different channels for different clients?

You end up building months of SaaS infrastructure from scratch.

## How We're Different

We don't sell to people who build agents for themselves. **We sell to people who build agents to sell to other people.**

If you're building a SaaS product powered by AI agents, this is your backend.

### Multi-Tenant I/O Layer

Connect WhatsApp, Instagram, Slack, Telegram, or a web chatbot — **per tenant**. Each of your customers gets their own isolated channels, their own conversation history, and their own data. You configure it once, we handle the routing.

### Build Any Agent in Minutes

Design agents visually with our builder. No code required. Your customers have specific needs — build a tailored agent for each one in minutes, not weeks. Vibe coding for agents: describe what you want, wire up the tools, deploy.

### Any LLM, Any Provider

Powered by OpenRouter, so you can use OpenAI, Anthropic, Google, Mistral, Meta, Cohere, or any other provider. Switch models per agent, per tenant, or per use case — no lock-in.

### Tools via MCP

Need your agent to call external APIs, query databases, or integrate with third-party services? Create or install MCP (Model Context Protocol) servers directly from the visual builder. No glue code.

### Observability Built In

Every execution is logged with full trace visibility:

- **Cost and token tracking** per execution, per tenant, per agent
- **Full message history** — see exactly what prompts were sent and what the LLM returned at each turn
- **Step-by-step trace view** — tool calls, branching decisions, latency breakdown
- **Filtering and search** across all executions
- **Session grouping** for multi-turn conversations
- **Dashboards** for usage trends, costs, and performance over time

### API-First Execution

Deploy any agent as an API endpoint. Call it from your app, your backend, your mobile client — anywhere. Your infrastructure, our agents.

---

## Quick Comparison

|                                             | AgentStack | Dify    | Langflow | n8n     | LangSmith |
| ------------------------------------------- | ---------- | ------- | -------- | ------- | --------- |
| Visual agent builder                        | ✅          | ✅       | ✅        | ✅       | ✅         |
| Multi-tenant isolation                      | ✅          | ❌       | ❌        | ❌       | ❌         |
| Per-tenant channels (WhatsApp, Slack, etc.) | ✅          | ❌       | ❌        | Partial | ❌         |
| Per-tenant cost tracking                    | ✅          | ❌       | ❌        | ❌       | ❌         |
| Any LLM via OpenRouter                      | ✅          | Partial | Partial  | Partial | Partial   |
| MCP tool support                            | ✅          | ❌       | ✅        | Partial | ✅         |
| API-first execution                         | ✅          | ✅       | ✅        | ✅       | ✅         |
| Built-in observability                      | ✅          | Basic   | Basic    | Basic   | ✅         |
| Open source                                 | ✅          | ✅       | ✅        | ✅       | ❌         |
| Built for SaaS resale                       | ✅          | ❌       | ❌        | ❌       | ❌         |

---

## Who Is This For

- **AI agencies** building custom agents for multiple clients
- **SaaS founders** adding AI agents as a core product feature
- **Consultancies** deploying tailored AI solutions per customer
- **Teams** that need to ship agent-powered products fast, without building multi-tenant infrastructure from scratch

---

## Tech Stack

- **Runtime:** Node.js 22+, ESM modules
- **Monorepo:** npm workspaces
- **Agent runtime:** [Vercel AI SDK](https://sdk.vercel.ai) + [OpenRouter](https://openrouter.ai)
- **Web:** Next.js 16 (App Router), React 19, TailwindCSS 4, shadcn/ui
- **Graph editor:** [@xyflow/react](https://reactflow.dev)
- **Backend:** Express 5, MCP SDK
- **Types:** Zod 4, TypeScript (strict mode)
- **Auth & DB:** Supabase
- **Deploy:** Docker, Fly.io

---

## Project Structure

```
packages/
├── api/           # State machine runtime — executes LLM graph workflows
├── backend/       # Express server with MCP support (port 4000)
├── web/           # Next.js visual graph editor (port 3101)
├── graph-types/   # Shared Zod schemas & TypeScript types
└── landing/       # Landing page
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18 (22+ recommended)
- **npm** >= 9

### Install

```bash
git clone https://github.com/your-org/openflow.git
cd openflow
npm install
```

### Environment

Create a `.env` file inside `packages/backend/` with your required credentials (Supabase, OpenRouter, etc.).

### Development

```bash
# Start both backend (port 4000) and web (port 3101) in dev mode
npm run dev

# Or run them separately
npm run dev -w packages/web       # Web only
npm run dev -w packages/backend   # Backend only
```

### Build

```bash
npm run build          # All packages
npm run build:web      # Web only
npm run build:api      # API only
```

### Checks

```bash
npm run check          # Format + lint + typecheck (all packages)
npm run lint           # ESLint
npm run format         # Prettier
npm run typecheck      # TypeScript
npm test               # Tests
```

### Docker

```bash
docker build -t openflow .
docker run -p 4000:4000 --env-file packages/backend/.env openflow
```

---

## Contributing

1. Fork the repo and create a feature branch
2. Follow the code style enforced by ESLint and Prettier (`npm run check`)
3. Never use `any` — always use explicit TypeScript types
4. Use shadcn/ui components for UI work
5. Add translations for all user-facing text
6. Open a PR against `main`

---

## License

[MIT](./LICENSE)