# OpenFlow Landing Page — Design Spec

## Overview

A single-page static landing page for OpenFlow, the open-source platform for building agent-powered SaaS. The primary goal is to drive GitHub adoption. Modeled after Dify.ai's landing structure, adapted to OpenFlow's purple/violet design system.

**GitHub repo**: https://github.com/daviddominguezh/llm-graph-builder

## Architecture

Single-page static Next.js app. All sections are server components — zero client JavaScript. GitHub star count fetched at build time with hourly revalidation.

### File Structure

```
packages/landing/
├── app/
│   ├── globals.css          # Design tokens + Tailwind
│   ├── layout.tsx           # Root layout — Inter + Geist fonts, metadata
│   ├── page.tsx             # Composes all sections in order
│   └── components/
│       ├── Navbar.tsx        # Sticky frosted-glass nav
│       ├── Hero.tsx          # Headline + GitHub CTA
│       ├── Problem.tsx       # "The Problem" section
│       ├── Features.tsx      # 6 feature cards grid
│       ├── Comparison.tsx    # Table vs competitors
│       ├── Audience.tsx      # "Who is this for" cards
│       ├── TechStack.tsx     # Tech stack badges/pills
│       ├── FinalCta.tsx      # Bottom CTA banner
│       └── Footer.tsx        # Minimal footer
├── package.json             # Minimal deps: next, react, tailwindcss
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
└── postcss.config.mjs
```

No i18n, no auth, no Supabase, no shadcn/ui — pure static marketing page with Tailwind only.

## Design Tokens & Visual Style

### Colors (from .impeccable.md)

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `oklch(0.51 0.23 277)` | CTAs, accents, highlights, checkmarks |
| Primary foreground | `oklch(0.96 0.02 272)` | Text on primary backgrounds |
| Background | `oklch(1 0 0)` | Page background |
| Muted background | `oklch(0.967 0.001 286.375)` | Alternating sections |
| Foreground | `oklch(0.141 0.005 285.823)` | Headings |
| Muted foreground | `oklch(0.552 0.016 285.938)` | Secondary/body text |
| Border | `oklch(0.92 0.004 286.32)` | Card borders, dividers |

### Typography

- **Fonts**: Inter (body), Geist Sans (headings), Geist Mono (code/tech badges)
- **Hero headline**: text-5xl (mobile) → text-7xl (desktop), font-bold
- **Section headings**: text-3xl → text-4xl, font-semibold
- **Body text**: text-base → text-lg, relaxed line-height
- **Labels/badges**: text-sm, font-mono

### Patterns

- **Navbar**: `backdrop-blur-xl` + `bg-white/70` for frosted glass effect. Sticky.
- **Cards**: White bg, 1px border in `--border`, `rounded-xl`, subtle `hover:-translate-y-0.5` + shadow on hover.
- **Section rhythm**: White → muted → white → muted alternating backgrounds.
- **Table**: Clean grid, primary-colored column highlight for OpenFlow, purple checkmarks.
- **Shadows**: Minimal — thin borders preferred over heavy shadows.
- **Border radius**: 10px base (`rounded-xl`).

## Sections

### 1. Navbar

Sticky top bar with frosted glass effect.

- **Left**: "OpenFlow" wordmark (text, no logo image)
- **Right**: Anchor links — Features, Compare, GitHub
- **Far right**: GitHub button with star count badge
- **Mobile**: Hamburger menu (stretch goal — can ship without)

### 2. Hero

Centered layout, generous vertical padding (~py-32).

- **Headline**: "Making it easier to build AI agents"
- **Subheadline**: "The platform for building agent-powered SaaS. Build an AI agent, connect WhatsApp, Slack, or a chatbot — and each of your customers gets their own isolated instance."
- **CTA**: GitHub button (primary, with star count) — links to `https://github.com/daviddominguezh/llm-graph-builder`
- **Tagline below CTA**: "MIT Licensed. Multi-tenant from day one."
- **Background**: White

### 3. Problem

Left-aligned, muted background.

- **Heading**: "The Problem"
- **Intro paragraph**: "Every no-code agent builder assumes you are the end user. The moment you try to resell an agent to your own customers, you hit a wall:"
- **Pain points**: 4 items styled as a list with muted icons:
  1. "How do I give each customer their own WhatsApp number?"
  2. "How do I isolate conversation history per tenant?"
  3. "How do I track usage and costs per customer?"
  4. "How do I manage different channels for different clients?"
- **Closing**: "You end up building months of SaaS infrastructure from scratch."

### 4. Features

White background, 3x2 grid (responsive: 2-col tablet, 1-col mobile).

- **Heading**: "How We're Different"
- **Subheading**: "We don't sell to people who build agents for themselves. We sell to people who build agents to sell to other people."
- **6 cards**, each with:
  - Lucide icon (top-left or top-center)
  - Title (bold)
  - 1-2 line description from README

Cards:

| # | Title | Icon (Lucide) | Description |
|---|-------|---------------|-------------|
| 1 | Multi-Tenant I/O Layer | `Network` | Connect WhatsApp, Instagram, Slack, Telegram, or a web chatbot — per tenant. Isolated channels, conversation history, and data. |
| 2 | Build Any Agent in Minutes | `Workflow` | Design agents visually with our builder. No code required. Vibe coding for agents. |
| 3 | Any LLM, Any Provider | `Sparkles` | Powered by OpenRouter. Use OpenAI, Anthropic, Google, Mistral, Meta — no lock-in. |
| 4 | Tools via MCP | `Plug` | Create or install MCP servers directly from the visual builder. No glue code. |
| 5 | Observability Built In | `Activity` | Cost tracking, full message history, step-by-step traces, filtering, dashboards. |
| 6 | API-First Execution | `Terminal` | Deploy any agent as an API endpoint. Call it from anywhere. |

### 5. Comparison

White background.

- **Heading**: "Quick Comparison"
- Styled HTML table from the README comparison data
- OpenFlow column highlighted with light purple background
- Checkmarks (`Check` icon) in primary purple, X marks in muted gray, "Partial" text in amber
- Rows: Visual builder, Multi-tenant isolation, Per-tenant channels, Per-tenant cost tracking, Any LLM, MCP tools, API-first, Observability, Open source, Built for SaaS resale

### 6. Audience

Muted background. 4 cards in a row (2x2 mobile).

- **Heading**: "Who Is This For"
- **Cards**:
  1. **AI agencies** — "Building custom agents for multiple clients"
  2. **SaaS founders** — "Adding AI agents as a core product feature"
  3. **Consultancies** — "Deploying tailored AI solutions per customer"
  4. **Teams** — "Ship agent-powered products fast, without building multi-tenant infrastructure from scratch"

### 7. Tech Stack

White background.

- **Heading**: "Tech Stack"
- Horizontal row of pills/badges in monospace font: Node.js, TypeScript, Next.js 16, React 19, TailwindCSS 4, Vercel AI SDK, OpenRouter, Supabase, Docker, Zod
- Muted foreground color, border style, compact

### 8. Final CTA

Full-width banner with dark background (foreground color as bg, inverted text).

- **Heading**: "Ready to build your agent-powered SaaS?"
- **Subtext**: "MIT licensed. Multi-tenant from day one. No license restrictions, no enterprise upsell."
- **CTA**: GitHub button (white/outline style on dark bg)

### 9. Footer

Minimal, thin top border.

- **Left**: "OpenFlow" text
- **Right**: "MIT License" + GitHub icon link
- Muted foreground text, small font size

## Dependencies

Only what's already in `package.json`:
- `next` 16.1.6
- `react` / `react-dom` 19.2.3
- `tailwindcss` 4

Add:
- `lucide-react` — for feature card icons and checkmarks (lightweight, tree-shakeable)

No shadcn/ui, no additional libraries.

## Data Flow

- **GitHub stars**: Fetched at build time in `Hero.tsx` and `Navbar.tsx` via `fetch('https://api.github.com/repos/daviddominguezh/llm-graph-builder')` with `{ next: { revalidate: 3600 } }`. Fallback to no count on error.
- **All other content**: Hardcoded strings. No CMS, no database.

## Responsive Behavior

- **Desktop** (1024px+): Full layouts — 3-col feature grid, full comparison table, 4-col audience cards
- **Tablet** (768px-1023px): 2-col grids, table scrolls horizontally
- **Mobile** (<768px): 1-col stacked, navbar simplified (just logo + GitHub button)

## What's NOT Included

- Dark mode toggle (can add later)
- Animations/transitions beyond hover effects (can add via impeccable skills after initial build)
- i18n / translations
- Analytics / tracking
- Mobile hamburger menu (logo + GitHub button sufficient for launch)
- Images or screenshots of the product
