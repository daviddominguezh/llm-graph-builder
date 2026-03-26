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

## Why You Can't Build an Agent-Powered SaaS with the Alternatives

If you're building a SaaS product where AI agents are the core of what you sell to your customers, most popular agent-building platforms are not an option — not because of technical limitations, but because their licenses explicitly forbid it.

### Dify

Dify's license states:

> "Unless explicitly authorized by Dify in writing, you may not use the Dify source code to operate a multi-tenant environment."

In Dify's terms, one tenant equals one workspace. The open-source Community Edition allows unlimited workflows within a single workspace, but the moment you need separate workspaces for separate customers — which is the definition of a SaaS — you need a paid Enterprise license with written authorization from Dify. Multi-tenant capability and custom branding are exclusive to Dify Enterprise.

This isn't a technical gap you can work around. It's a legal restriction baked into the license.

### n8n

n8n uses the Sustainable Use License, which restricts usage to internal business purposes. Specifically:

- It prohibits hosting n8n and charging customers for access.
- It prohibits selling a product or service whose value derives substantially from n8n functionality.
- It prohibits workflows that dynamically use customer credentials to connect to their own systems.

If you want to expose n8n-based functionality to your customers, you need to negotiate a separate Embed License — individual, commercial, and often costly. n8n was designed for single organizations, not for multi-tenant SaaS platforms. Their own community forums are full of founders asking whether their SaaS idea is allowed under the license. The answer is almost always no.

### Langflow

Langflow is MIT licensed, which means there are no legal restrictions on commercial or multi-tenant use. You could, in theory, build a SaaS on top of it.

However, Langflow has no built-in concept of tenants, per-customer channel routing, or per-tenant usage tracking. You would need to build the entire multi-tenant layer yourself: tenant isolation, channel management (WhatsApp, Slack, Telegram per customer), cost tracking per tenant, and customer-facing APIs. That's months of infrastructure work before you ship a single agent to a customer.

### LangSmith

LangSmith is a closed-source proprietary platform. Self-hosting requires an enterprise license. More fundamentally, LangSmith has no concept of "your customers" as end users — it's built for teams developing and monitoring their own agents, not for reselling agents to third parties.

### The Bottom Line

| Platform          | Can you legally build a SaaS with it? | What's blocking you?                                          |
| ----------------- | ------------------------------------- | ------------------------------------------------------------- |
| Dify (Community)  | No                                    | License prohibits multi-tenant use without Enterprise agreement |
| n8n (Community)   | No                                    | License restricts to internal business use only               |
| Langflow          | Yes, but...                           | No multi-tenant infrastructure — you build everything yourself |
| LangSmith         | No                                    | Closed-source, no resale model, enterprise license required   |

If you're building agents for yourself, these tools work great. If you're building agents to sell to other people, they either can't help you or will cost you months of custom engineering before you can start.

**OpenFlow is MIT licensed and multi-tenant from day one.** No license restrictions, no enterprise upsell for basic SaaS functionality, no months of plumbing before your first customer.

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