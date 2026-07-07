# OpenFlow — What We're Building

**A business briefing for our design & copy partners.**

This document explains what OpenFlow is, who it's for, and the 33 characteristics that define the product — organized into families, each with a plain-language explanation and its current status. Use it to understand our proposition and write copy that reflects it.

---

## The one-liner

**OpenFlow is the AI Cloud — the AWS of AI agents.**

You go to AWS to build your company. You come to OpenFlow to build the AI agents you will sell. We are the platform-as-a-service for the agent economy: we run the infrastructure — channels, isolation, knowledge, scheduling, observability, billing-grade metering — so you focus entirely on building the agent your customers pay for.

Build an AI agent, connect it to WhatsApp or a website chat, and every one of your customers gets their own isolated instance — their own channels, their own conversations, their own data, their own costs. Multi-tenant from day one, the way a cloud is.

## The insight behind the product

Nobody builds their own data center to launch a SaaS anymore — they build on a cloud. Yet everyone building an agent business today is still building their own "data center": per-customer channels, isolated data, cost tracking, versioning, monitoring. Months of undifferentiated plumbing before the first customer.

And the popular agent builders (Dify, n8n, Langflow…) don't solve this — they assume **you** are the end user of the agent you build. The moment you try to **resell** agents to your own customers — the definition of a SaaS business — you hit a wall: licenses that forbid multi-tenant use, or all that infrastructure left for you to build yourself.

**We don't sell to people who build agents for themselves. We sell to people who build agents to sell to other people — and we are their cloud.** Everything an agent business needs below the agent itself is our job, not theirs.

## Who it's for

- **AI agencies** building custom agents for many clients at once
- **SaaS founders** making AI agents the core of their product
- **Consultancies** deploying a tailored agent per customer
- **Teams** that want to ship agent products without building the plumbing

## Status vocabulary used below

- **Live** — working in the product today. Copy can claim it boldly, present tense.
- **Rolling out** — partially available; lead with what's live, present the rest as "expanding".
- **Coming soon** — designed and on the roadmap; present as vision/near-future, not present tense.

---

# The 33 characteristics, organized

We group them into **eight families** — think of them as the service layers of the AI Cloud, the way AWS has compute, storage, networking and monitoring. The first item of most families is the "parent" idea; the rest are its children — they only make sense because the parent exists.

---

## Family 1 — The Foundation: Multi-Tenant by Design

*The bedrock layer — what "cloud" means. This is the reason OpenFlow exists, and everything else in the product inherits from it.*

### 1. Multi-tenancy — **the parent of the whole platform** · Live

One agent, many customers, zero mixing. When you build an agent on OpenFlow and sell it, each of your customers ("tenants") gets a fully isolated instance: their own conversations, their own connected channels, their own configuration, their own usage bill. You build once; we replicate it safely per customer. Competitors either legally forbid this or make you build it yourself — for us it's the default.

### 2. Multi-channel *(child of multi-tenancy: channels are connected per customer)* · Rolling out

Your customers' end users don't come to a dashboard — they're already on messaging apps. OpenFlow lets each of your customers connect the channels where *their* audience lives: **WhatsApp** and **website chat are live today**, **Instagram is next in line**, and **Telegram, Slack, Discord, Microsoft Teams, and Google Chat** complete the lineup on our roadmap. The same agent answers everywhere; the conversation history stays per customer.

### 3. Deploy to your own website *(child of multi-channel: the web channel)* · Live

Any agent becomes a polished chat bubble on any website with a single line of code — no engineering project, no cookies, privacy-friendly. Each of your customers gets their own branded, versioned chat deployment, plus a shareable full-page chat link. This is the fastest "wow" in the product: build an agent, paste one line, it's live on a site.

### 4. Expenses control per tenant *(child of multi-tenancy: costs follow the customer)* · Rolling out

If you resell agents, you must know what each customer costs you — per conversation, per model call. OpenFlow tracks spend automatically at the customer level and shows it in dashboards, so pricing your own SaaS profitably becomes arithmetic instead of guesswork. Per-customer spending caps and budget alerts are coming next.

---

## Family 2 — The Studio: Build Any Agent in Minutes

*The developer experience of the cloud — where you actually build. The agent builder is the parent; everything else here is a capability of the thing you build.*

### 5. Agent builder — **parent of the family** · Live

A visual, no-code editor where you define what an agent is: its personality and instructions, the knowledge it can use, the tools it can call, the channels it lives on. Designed so a tailored agent for a new client takes minutes, not weeks — "vibe coding for agents".

### 6. Workflow builder *(sibling of the agent builder — the second way to build)* · Live

For processes that need structure rather than free conversation, a drag-and-drop canvas of steps and decision paths: "if the customer says X, go here; after collecting the data, do that." Agents improvise; workflows follow the script. You choose the right shape per use case — and they can call each other.

### 7. Agent smart orchestration (sub-agents & subroutines) *(child: what a built agent can do)* · Live

Agents can delegate. A front-desk agent can spin up a specialist sub-agent for a hard task, hand the conversation over, and take back control when it's done — or invoke a whole workflow as a subroutine. This is how simple agents scale into sophisticated ones without becoming monsters: teams of agents, not one giant prompt.

### 8. Any LLM model, any provider *(child: the brain is swappable)* · Live

OpenFlow is not married to one AI vendor. Through a single integration you can run OpenAI, Anthropic, Google, Mistral, Meta and more — and switch per agent or per use case. No lock-in: when a better or cheaper model ships, your agents upgrade the same day.

### 9. Agent skills *(child: reusable expertise)* · Rolling out

Skills are packaged know-how you attach to an agent — "how we handle refunds", "our tone of voice", "how to qualify a lead" — that the agent pulls in exactly when relevant. Authoring and using skills is live today; a shared skill library you can install from is coming.

### 10. Version control for agents AND prompts *(child: professional change management)* · Live

Every published agent is a frozen, numbered version — instructions, knowledge and tools included. Test changes safely in a draft, publish when ready, roll back instantly if something regresses. Your customers stay pinned to versions that work. This is the difference between a demo tool and something you run a business on.

---

## Family 3 — The Toolbox: Connect to Everything

*The networking layer of the cloud — how agents reach the outside world. Parent: the open integration standard (MCP). Children: what agents can reach through it, plus the built-in tools we ship ourselves.*

### 11. Connect to any MCP — **parent of the family** · Live

MCP (Model Context Protocol) is the emerging universal plug for AI tools — think "USB for agents". OpenFlow speaks it natively: any tool or system that exposes an MCP connector can become part of your agent, with secure sign-in and per-customer credentials handled by the platform. Your agents' capabilities are not limited by our imagination.

### 12. ~30 out-of-the-box MCP integrations *(child: the curated catalog)* · Rolling out

A one-click library of popular integrations — GitHub, Notion, Slack, Stripe, HubSpot, Linear, Figma, Intercom, Zapier and more, around thirty in total — pre-configured so connecting them is minutes, not documentation-reading. The install experience is live; we're finishing the packaging that puts the full catalog in front of every new account.

### 13. Web search *(child: a built-in tool, zero setup)* · Live

Agents can search the live web, read pages, and explore entire sites — built in, no configuration, no third-party account needed. An agent that quotes yesterday's information is a liability; this keeps answers current.

### 14. HTTP requests *(child: built-in tool)* · Coming soon

A generic "call any API" tool so agents can talk to systems that don't have a ready-made integration — internal tools, niche software, custom backends.

### 15. External SQL *(child: built-in tool)* · Coming soon

Let an agent answer questions directly from a customer's own database — inventory, order status, account data — read-safely and per customer. (Today this is achievable through database MCP connectors; a native, guided experience is on the roadmap.)

### 16. Browser automation *(child: built-in tool)* · Coming soon

Agents that can operate a real web browser — navigate, click, fill, extract — for the long tail of systems with no API at all.

### 17. Agent sandboxes for code execution *(child: built-in tool)* · Coming soon

Safe, disposable environments where an agent can run code to solve a problem — crunch a spreadsheet, transform data, verify a calculation. Today agents can already read and navigate connected code repositories; execution is the next step.

---

## Family 4 — The Knowledge Layer: What Agents Know

*The storage layer of the cloud — databases and memory for agents. Parent: the knowledge base. Children: the other shapes memory takes.*

### 18. Multimodal RAG with smart document parsing — **parent of the family** · Live

Feed your agents real company knowledge: PDFs, Office documents, web pages, spreadsheets — **and images**. Three levels of document understanding, from fast basic ingestion to OCR to full layout-aware parsing that respects tables, headings and structure, so the agent finds the right passage, not a garbled fragment. This is deeper than most competitors' "upload a PDF" checkbox, and it's live today.

### 19. KV stores *(child: structured facts)* · Live

Alongside documents, agents can keep and look up structured records — product catalogs, price lists, policy tables, per-customer settings — that they read and update precisely. Documents are for prose; this is for facts.

### 20. Built-in user memory *(child: remembering people)* · Coming soon

Agents that remember the human across conversations — preferences, history, context — so returning users are greeted as returning users. (Builders can approximate this today with KV stores; the dedicated, automatic version is on the roadmap.)

---

## Family 5 — From Conversation to Revenue

*The business-services layer of the cloud — pre-built blocks for commerce, so builders don't reinvent them. These four turn chats into business outcomes: the family your customers' bosses care about.*

### 21. Form integration · Live

Agents collect structured data conversationally — name, address, order details — validated field by field and stored cleanly, with export to spreadsheet. No more "fill in this form" links: the conversation *is* the form.

### 22. Lead scoring · Live

Agents qualify while they chat. Every conversation carries a 0–100 lead score the agent updates as it learns about the prospect, visible at a glance in the inbox — so sales teams call the hot ones first.

### 23. Built-in booking system · Coming soon

Agents that check availability and book appointments right inside the conversation. We're building this natively into the platform (replacing an earlier third-party approach) so scheduling requires no external calendar wrangling.

### 24. Built-in payments · Coming soon

Closing the loop: agents that can take a payment in-conversation. Today agents can work with payment providers like Stripe, PayPal and Square through their official integrations (using the customer's own account); a native, frictionless checkout experience is on the roadmap.

---

## Family 6 — The Engine: Always-On, Not Just On-Demand

*The compute layer of the cloud — agents as running services, not just chat windows. They act on their own schedule, not only when spoken to.*

### 25. Long-running agents · Coming soon

Most platforms kill an agent after a few minutes. We're building a runtime where an agent can work for **hours** — pausing for human input, surviving restarts, resuming exactly where it left off. This unlocks a different class of work: deep research, multi-step back-office processes, human-in-the-loop approvals. It's our biggest current engineering investment and a genuine differentiator when it ships.

### 26. CRONs for scheduled execution · Live

Agents that run on a schedule — every morning, every hour, on the first of the month, or once at a specific time — per customer. A daily summary agent, a weekly follow-up agent, a monthly report agent: set it and it fires reliably, surviving deployments and outages.

### 27. Webhook triggers · Coming soon

The event-driven sibling of schedules: an agent that wakes up when something happens elsewhere — a new signup, a paid invoice, a support ticket — and acts immediately.

---

## Family 7 — The Control Room: See Everything, Trust Everything

*The monitoring layer of the cloud — every serious infrastructure provider lives or dies by it. Parent: observability. You can't sell what you can't inspect.*

### 28. Observability & monitoring — **parent of the family** · Live

Every agent run is fully traceable: what was asked, what the agent thought, which tools it called, what it answered, how long it took and what it cost — filterable and searchable across all customers. When a client asks "why did the agent say that?", you have the answer in seconds. This is trust infrastructure, and it's one of our strongest muscles today.

### 29. Dashboard for all your agents' conversations *(child: the human view)* · Live

A full team inbox over every conversation across every channel and customer: read along live, take over from the agent when a human touch is needed, assign teammates, leave internal notes, track conversation status. The agent does the volume; your people handle the moments that matter.

### 30. Evals for your agents *(child: quality assurance)* · Coming soon

Systematic quality testing — run an agent against a battery of scenarios before publishing and score the results, so changes never quietly make things worse. Today builders test interactively in a rich simulator (watching every step of a dry run); automated scoring is the roadmap step.

---

## Family 8 — Ways to Use OpenFlow (and Pay for It)

*The console, the APIs, and the meter — how you consume the cloud. Not features of an agent; properties of the relationship with us.*

### 31. No-code, low-code, or API mode · Rolling out

Three doors into the same platform. **No-code**: the visual builders — live and the heart of the product. **API**: every published agent is callable as a service from any app or backend, with secure keys — live. **Low-code**: extending agents with your own logic — today done through custom integrations (MCP), with deeper code-level hooks on the roadmap.

### 32. Use OpenFlow from Claude Code (our MCP) · Live

A power feature almost nobody else has: OpenFlow itself is exposed as an MCP integration. That means developers can sit in their AI coding assistant (like Claude Code) and **build, edit, test and publish OpenFlow agents by talking to it** — the platform is not just AI-powered, it's AI-operable. Great story for the developer audience.

### 33. Simple pay-as-you-go pricing · Coming soon

Priced like a cloud, readable like a receipt. **Every feature has its own specific price, and you pay only for what you actually use of each one** — messages sent, documents parsed, searches run, agents executed. No seats, no plans, no tiers-you-don't-understand: your bill is a transparent, itemized reflection of real usage, and because costs are tracked per customer, you can price your own product on top with confidence — the same way businesses build profitable products on AWS's meter. The usage metering behind this is already built; specific per-feature prices are being finalized (treat numbers as TBD in copy, but the model itself — per-feature, usage-based — is settled and can be stated).

---

# Guidance for the landing page

**The aura to capture: we are the AWS of AI agents.** You go to AWS to build your company; you come to OpenFlow to build the AI agents you will sell. The AI Cloud. The AI PaaS. We run the infrastructure so builders focus on building. The site should *feel* like infrastructure — solid, serious, layered, dependable — not like another AI-widget startup. If a visitor leaves with one idea, it's: "this is the platform my agent business runs on," the way developers think of AWS, Stripe, or Vercel.

**Lead with the difference, not the checklist.** Everyone says "build AI agents". Only we say: *build agents to sell — each of your customers gets their own isolated instance, on our infrastructure.* Families 1 (multi-tenant foundation) and 7 (control room) are the proof; Family 2 is the delight. The eight families can be presented as the service layers of the cloud — foundation, studio, networking, storage, business services, compute, monitoring, console & meter.

**Strongest present-tense claims** (everything Live above), in rough order of impact:
1. Multi-tenant from day one — the category-defining claim
2. WhatsApp + website chat agents, live in minutes (one line of code)
3. Full visibility: every conversation, every cost, per customer
4. Any AI model, no lock-in
5. Real knowledge: documents *and images*, parsed properly
6. Versioned, roll-back-able agents — built for production, not demos
7. Scheduled agents that run themselves

**Vision claims** (frame as "where this is going", not present tense): hours-long autonomous agents, native booking & payments, evals, browser automation, code sandboxes, webhook triggers, user memory, the full channel lineup beyond WhatsApp/web.

**Pricing copy**: the model is settled and can be stated plainly — pay-as-you-go, priced per feature, billed by actual usage of each feature. No seats, no plans. Only the specific per-feature numbers are TBD; design pricing sections around an itemized/metered concept rather than tier cards.

**Channel logos to show**: WhatsApp, Instagram, Telegram, Slack, Discord, Microsoft Teams, Google Chat, plus website chat. (WhatsApp and website chat are the ones we can demo today — give them visual priority.)

**Brand personality** (from our design system): precise, polished, dynamic. A developer tool with modern SaaS refinement — think Linear's density, Stripe/Vercel's polish. Confident but not boastful; technical when needed, human when possible. Avoid: generic startup templates, enterprise clutter, toy-like whimsy.

**Open source & licensing angle**: OpenFlow is MIT-licensed. Our best-known competitors legally prohibit exactly the multi-tenant SaaS use case we're built for — that contrast is fair game in copy.
