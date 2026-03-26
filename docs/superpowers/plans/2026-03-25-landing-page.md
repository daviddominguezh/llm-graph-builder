# OpenFlow Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page static landing page for OpenFlow that drives GitHub adoption, using the project's purple/violet design system.

**Architecture:** Single Next.js page with 9 extracted server components (zero client JS). Design tokens defined in globals.css. GitHub star count fetched at build time with hourly revalidation. All content hardcoded.

**Tech Stack:** Next.js 16, React 19, TailwindCSS 4, lucide-react (icons)

---

### Task 1: Install lucide-react dependency

**Files:**
- Modify: `packages/landing/package.json`

- [ ] **Step 1: Install lucide-react**

```bash
npm install lucide-react -w packages/landing
```

- [ ] **Step 2: Verify installation**

```bash
npm ls lucide-react -w packages/landing
```

Expected: `lucide-react@0.x.x` listed under landing package.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/package.json package-lock.json
git commit -m "chore(landing): add lucide-react dependency"
```

---

### Task 2: Design tokens and layout foundation

**Files:**
- Modify: `packages/landing/app/globals.css`
- Modify: `packages/landing/app/layout.tsx`

- [ ] **Step 1: Replace globals.css with design tokens**

Replace the entire contents of `packages/landing/app/globals.css` with:

```css
@import 'tailwindcss';

@theme inline {
  --color-primary: oklch(0.51 0.23 277);
  --color-primary-foreground: oklch(0.96 0.02 272);
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.141 0.005 285.823);
  --color-muted: oklch(0.967 0.001 286.375);
  --color-muted-foreground: oklch(0.552 0.016 285.938);
  --color-border: oklch(0.92 0.004 286.32);
  --color-accent: oklch(0.59 0.20 277);
  --color-amber: oklch(0.75 0.15 75);
  --font-sans: var(--font-inter);
  --font-heading: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
  color: var(--color-foreground);
  background-color: var(--color-background);
}
```

- [ ] **Step 2: Update layout.tsx with fonts and metadata**

Replace the entire contents of `packages/landing/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OpenFlow — The platform for building agent-powered SaaS',
  description:
    'Build an AI agent, connect WhatsApp, Slack, or a chatbot — and each of your customers gets their own isolated instance. Multi-tenant from day one. MIT licensed.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/landing/app/globals.css packages/landing/app/layout.tsx
git commit -m "feat(landing): design tokens and layout with Inter + Geist fonts"
```

---

### Task 3: GitHub stars fetch utility

**Files:**
- Create: `packages/landing/app/lib/github.ts`

- [ ] **Step 1: Create the utility**

Create `packages/landing/app/lib/github.ts`:

```ts
const REPO = 'daviddominguezh/llm-graph-builder';

interface GitHubRepo {
  stargazers_count: number;
}

export async function fetchGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const data: GitHubRepo = await res.json();
    return data.stargazers_count;
  } catch {
    return null;
  }
}

export function formatStarCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/lib/github.ts
git commit -m "feat(landing): GitHub stars fetch utility with hourly revalidation"
```

---

### Task 4: Navbar component

**Files:**
- Create: `packages/landing/app/components/Navbar.tsx`

- [ ] **Step 1: Create Navbar.tsx**

Create `packages/landing/app/components/Navbar.tsx`:

```tsx
import { Star } from 'lucide-react';

import { fetchGitHubStars, formatStarCount } from '@/app/lib/github';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Compare', href: '#comparison' },
] as const;

export async function Navbar() {
  const stars = await fetchGitHubStars();

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href="#" className="font-heading text-lg font-bold tracking-tight">
          OpenFlow
        </a>

        <div className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              {link.label}
            </a>
          ))}

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <GitHubIcon />
            GitHub
            {stars !== null && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                <Star className="h-3 w-3 fill-current" />
                {formatStarCount(stars)}
              </span>
            )}
          </a>
        </div>
      </div>
    </nav>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/Navbar.tsx
git commit -m "feat(landing): sticky frosted-glass Navbar with GitHub stars"
```

---

### Task 5: Hero component

**Files:**
- Create: `packages/landing/app/components/Hero.tsx`

- [ ] **Step 1: Create Hero.tsx**

Create `packages/landing/app/components/Hero.tsx`:

```tsx
import { Star } from 'lucide-react';

import { fetchGitHubStars, formatStarCount } from '@/app/lib/github';

const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

export async function Hero() {
  const stars = await fetchGitHubStars();

  return (
    <section className="flex flex-col items-center px-6 pt-32 pb-20 text-center">
      <h1 className="font-heading max-w-4xl text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
        Making it easier to build AI agents
      </h1>

      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        The platform for building agent-powered SaaS. Build an AI agent, connect WhatsApp, Slack, or a
        chatbot — and each of your customers gets their own isolated instance.
      </p>

      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-10 inline-flex items-center gap-2.5 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent"
      >
        <GitHubIcon />
        View on GitHub
        {stars !== null && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/20 px-2 py-0.5 text-xs">
            <Star className="h-3 w-3 fill-current" />
            {formatStarCount(stars)}
          </span>
        )}
      </a>

      <p className="mt-4 text-sm text-muted-foreground">MIT Licensed. Multi-tenant from day one.</p>
    </section>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/Hero.tsx
git commit -m "feat(landing): Hero section with headline and GitHub CTA"
```

---

### Task 6: Problem component

**Files:**
- Create: `packages/landing/app/components/Problem.tsx`

- [ ] **Step 1: Create Problem.tsx**

Create `packages/landing/app/components/Problem.tsx`:

```tsx
import { CircleHelp } from 'lucide-react';

const PAIN_POINTS = [
  'How do I give each customer their own WhatsApp number?',
  'How do I isolate conversation history per tenant?',
  'How do I track usage and costs per customer?',
  'How do I manage different channels for different clients?',
] as const;

export function Problem() {
  return (
    <section className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">The Problem</h2>

        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Every no-code agent builder assumes{' '}
          <span className="font-semibold text-foreground">you</span> are the end user. The moment you
          try to resell an agent to your own customers, you hit a wall:
        </p>

        <ul className="mt-8 space-y-4">
          {PAIN_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3">
              <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/60" />
              <span className="text-base text-muted-foreground">{point}</span>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-lg font-medium text-foreground">
          You end up building months of SaaS infrastructure from scratch.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/Problem.tsx
git commit -m "feat(landing): Problem section with pain points"
```

---

### Task 7: Features component

**Files:**
- Create: `packages/landing/app/components/Features.tsx`

- [ ] **Step 1: Create Features.tsx**

Create `packages/landing/app/components/Features.tsx`:

```tsx
import { Activity, Network, Plug, Sparkles, Terminal, Workflow } from 'lucide-react';
import type { ComponentType } from 'react';

interface Feature {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const FEATURES: Feature[] = [
  {
    title: 'Multi-Tenant I/O Layer',
    description:
      'Connect WhatsApp, Instagram, Slack, Telegram, or a web chatbot — per tenant. Isolated channels, conversation history, and data.',
    icon: Network,
  },
  {
    title: 'Build Any Agent in Minutes',
    description: 'Design agents visually with our builder. No code required. Vibe coding for agents.',
    icon: Workflow,
  },
  {
    title: 'Any LLM, Any Provider',
    description:
      'Powered by OpenRouter. Use OpenAI, Anthropic, Google, Mistral, Meta — no lock-in.',
    icon: Sparkles,
  },
  {
    title: 'Tools via MCP',
    description:
      'Create or install MCP servers directly from the visual builder. No glue code.',
    icon: Plug,
  },
  {
    title: 'Observability Built In',
    description:
      'Cost tracking, full message history, step-by-step traces, filtering, dashboards.',
    icon: Activity,
  },
  {
    title: 'API-First Execution',
    description: 'Deploy any agent as an API endpoint. Call it from anywhere.',
    icon: Terminal,
  },
];

export function Features() {
  return (
    <section id="features" className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          How We&#39;re Different
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
          We don&#39;t sell to people who build agents for themselves. We sell to people who build
          agents to sell to other people.
        </p>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <div className="rounded-xl border border-border bg-background p-6 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Icon className="h-6 w-6 text-primary" />
      <h3 className="mt-4 font-heading text-base font-semibold">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/Features.tsx
git commit -m "feat(landing): Features section with 6-card grid"
```

---

### Task 8: Comparison component

**Files:**
- Create: `packages/landing/app/components/Comparison.tsx`

- [ ] **Step 1: Create Comparison.tsx**

Create `packages/landing/app/components/Comparison.tsx`:

```tsx
import { Check, Minus, X } from 'lucide-react';
import type { ReactNode } from 'react';

type CellValue = 'yes' | 'no' | 'partial' | 'basic';

interface ComparisonRow {
  feature: string;
  openflow: CellValue;
  dify: CellValue;
  langflow: CellValue;
  n8n: CellValue;
  langsmith: CellValue;
}

const ROWS: ComparisonRow[] = [
  { feature: 'Visual agent builder', openflow: 'yes', dify: 'yes', langflow: 'yes', n8n: 'yes', langsmith: 'yes' },
  { feature: 'Multi-tenant isolation', openflow: 'yes', dify: 'no', langflow: 'no', n8n: 'no', langsmith: 'no' },
  { feature: 'Per-tenant channels', openflow: 'yes', dify: 'no', langflow: 'no', n8n: 'partial', langsmith: 'no' },
  { feature: 'Per-tenant cost tracking', openflow: 'yes', dify: 'no', langflow: 'no', n8n: 'no', langsmith: 'no' },
  { feature: 'Any LLM via OpenRouter', openflow: 'yes', dify: 'partial', langflow: 'partial', n8n: 'partial', langsmith: 'partial' },
  { feature: 'MCP tool support', openflow: 'yes', dify: 'no', langflow: 'yes', n8n: 'partial', langsmith: 'yes' },
  { feature: 'API-first execution', openflow: 'yes', dify: 'yes', langflow: 'yes', n8n: 'yes', langsmith: 'yes' },
  { feature: 'Built-in observability', openflow: 'yes', dify: 'basic', langflow: 'basic', n8n: 'basic', langsmith: 'yes' },
  { feature: 'Open source', openflow: 'yes', dify: 'yes', langflow: 'yes', n8n: 'yes', langsmith: 'no' },
  { feature: 'Built for SaaS resale', openflow: 'yes', dify: 'no', langflow: 'no', n8n: 'no', langsmith: 'no' },
];

const COMPETITORS = ['OpenFlow', 'Dify', 'Langflow', 'n8n', 'LangSmith'] as const;
const COMPETITOR_KEYS = ['openflow', 'dify', 'langflow', 'n8n', 'langsmith'] as const;

export function Comparison() {
  return (
    <section id="comparison" className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Quick Comparison
        </h2>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="pb-4 text-left font-medium text-muted-foreground" />
                {COMPETITORS.map((name, i) => (
                  <th
                    key={name}
                    className={`pb-4 text-center font-heading text-sm font-semibold ${
                      i === 0 ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.feature} className="border-t border-border">
                  <td className="py-3 pr-4 text-sm text-foreground">{row.feature}</td>
                  {COMPETITOR_KEYS.map((key, i) => (
                    <td
                      key={key}
                      className={`py-3 text-center ${i === 0 ? 'bg-primary/5' : ''}`}
                    >
                      <CellDisplay value={row[key]} highlight={i === 0} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CellDisplay({ value, highlight }: { value: CellValue; highlight: boolean }): ReactNode {
  switch (value) {
    case 'yes':
      return (
        <Check
          className={`mx-auto h-4 w-4 ${highlight ? 'text-primary' : 'text-foreground'}`}
        />
      );
    case 'no':
      return <X className="mx-auto h-4 w-4 text-muted-foreground/40" />;
    case 'partial':
      return <span className="text-xs text-amber">Partial</span>;
    case 'basic':
      return <span className="text-xs text-amber">Basic</span>;
    default:
      return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/Comparison.tsx
git commit -m "feat(landing): Comparison table section with highlighted OpenFlow column"
```

---

### Task 9: Audience component

**Files:**
- Create: `packages/landing/app/components/Audience.tsx`

- [ ] **Step 1: Create Audience.tsx**

Create `packages/landing/app/components/Audience.tsx`:

```tsx
import { BriefcaseBusiness, Code, Lightbulb, Users } from 'lucide-react';
import type { ComponentType } from 'react';

interface AudienceCard {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const AUDIENCES: AudienceCard[] = [
  {
    title: 'AI Agencies',
    description: 'Building custom agents for multiple clients.',
    icon: BriefcaseBusiness,
  },
  {
    title: 'SaaS Founders',
    description: 'Adding AI agents as a core product feature.',
    icon: Lightbulb,
  },
  {
    title: 'Consultancies',
    description: 'Deploying tailored AI solutions per customer.',
    icon: Users,
  },
  {
    title: 'Teams',
    description:
      'Ship agent-powered products fast, without building multi-tenant infrastructure from scratch.',
    icon: Code,
  },
];

export function Audience() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Who Is This For
        </h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((audience) => {
            const Icon = audience.icon;

            return (
              <div
                key={audience.title}
                className="rounded-xl border border-border bg-background p-6 text-center"
              >
                <Icon className="mx-auto h-6 w-6 text-primary" />
                <h3 className="mt-4 font-heading text-base font-semibold">{audience.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {audience.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/Audience.tsx
git commit -m "feat(landing): Audience section with 4-card grid"
```

---

### Task 10: TechStack component

**Files:**
- Create: `packages/landing/app/components/TechStack.tsx`

- [ ] **Step 1: Create TechStack.tsx**

Create `packages/landing/app/components/TechStack.tsx`:

```tsx
const TECH = [
  'Node.js',
  'TypeScript',
  'Next.js 16',
  'React 19',
  'TailwindCSS 4',
  'Vercel AI SDK',
  'OpenRouter',
  'Supabase',
  'Docker',
  'Zod',
] as const;

export function TechStack() {
  return (
    <section className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Tech Stack
        </h2>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {TECH.map((name) => (
            <span
              key={name}
              className="rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm text-muted-foreground"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/TechStack.tsx
git commit -m "feat(landing): TechStack section with badge pills"
```

---

### Task 11: FinalCta component

**Files:**
- Create: `packages/landing/app/components/FinalCta.tsx`

- [ ] **Step 1: Create FinalCta.tsx**

Create `packages/landing/app/components/FinalCta.tsx`:

```tsx
const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

export function FinalCta() {
  return (
    <section className="bg-foreground px-6 py-24 text-center">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-background sm:text-4xl">
          Ready to build your agent-powered SaaS?
        </h2>
        <p className="mt-4 text-lg text-background/60">
          MIT licensed. Multi-tenant from day one. No license restrictions, no enterprise upsell.
        </p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-xl border border-background/20 bg-background/10 px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-background/20"
        >
          <GitHubIcon />
          View on GitHub
        </a>
      </div>
    </section>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/FinalCta.tsx
git commit -m "feat(landing): Final CTA section with dark background"
```

---

### Task 12: Footer component

**Files:**
- Create: `packages/landing/app/components/Footer.tsx`

- [ ] **Step 1: Create Footer.tsx**

Create `packages/landing/app/components/Footer.tsx`:

```tsx
const GITHUB_URL = 'https://github.com/daviddominguezh/llm-graph-builder';

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <span className="text-sm text-muted-foreground">OpenFlow</span>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>MIT License</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
            aria-label="GitHub"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck -w packages/landing
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/landing/app/components/Footer.tsx
git commit -m "feat(landing): minimal Footer with MIT license and GitHub link"
```

---

### Task 13: Compose page.tsx and final verification

**Files:**
- Modify: `packages/landing/app/page.tsx`

- [ ] **Step 1: Update page.tsx to compose all sections**

Replace the entire contents of `packages/landing/app/page.tsx` with:

```tsx
import { Audience } from './components/Audience';
import { Comparison } from './components/Comparison';
import { Features } from './components/Features';
import { FinalCta } from './components/FinalCta';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { Problem } from './components/Problem';
import { TechStack } from './components/TechStack';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Features />
        <Comparison />
        <Audience />
        <TechStack />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Run full check (format + lint + typecheck)**

```bash
npm run check -w packages/landing
```

Expected: all checks pass.

- [ ] **Step 3: Build the landing page**

```bash
npm run build -w packages/landing
```

Expected: build succeeds with route `○ /` listed as static.

- [ ] **Step 4: Commit**

```bash
git add packages/landing/app/page.tsx
git commit -m "feat(landing): compose all sections in page.tsx"
```

---

### Task 14: Run impeccable polish skills

This task uses the impeccable skills to refine the landing page design after the initial build is verified.

- [ ] **Step 1: Run impeccable:critique to evaluate the design**

Invoke `impeccable:critique` to get actionable feedback on the landing page.

- [ ] **Step 2: Run impeccable:polish for final quality pass**

Invoke `impeccable:polish` to fix alignment, spacing, consistency, and detail issues.

- [ ] **Step 3: Run impeccable:typeset to refine typography**

Invoke `impeccable:typeset` to improve font choices, hierarchy, sizing, weight consistency.

- [ ] **Step 4: Build and verify after polish**

```bash
npm run check -w packages/landing
npm run build -w packages/landing
```

Expected: all checks pass, build succeeds.

- [ ] **Step 5: Commit polish changes**

```bash
git add packages/landing/
git commit -m "style(landing): polish pass with impeccable skills"
```
