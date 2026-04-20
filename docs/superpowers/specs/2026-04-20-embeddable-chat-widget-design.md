# Embeddable Chat Widget — Design

**Status:** Mock/visual phase (authentication and real LLM wiring deferred to step 2)
**Linear issue:** [OF-2](https://linear.app/open-flow/issue/OF-2/capability-embeddable-web-chat-widget)
**Author:** David Dominguez
**Date:** 2026-04-20

## Goal

Ship a JavaScript `<script>` snippet that any website can embed to add an AI-powered chat bubble
pointing at a specific agent. The same URL, when opened directly in a browser tab, renders a
fullscreen chat (ChatGPT/Claude style). UI is pixel-identical to the existing Copilot panel.

This phase is **visual only**: everything is wired end-to-end through the production request path,
but the Express backend returns hardcoded responses instead of running the LLM. The payloads
strictly follow the `/api/agents/:slug/:version` contract so the next phase is a URL swap plus
auth — no widget code changes.

## Non-goals (deferred to step 2)

- `requireExecutionAuth` / API-key flow from the widget
- Real agent execution (swap mock URL → `/api/agents/:slug/:version`)
- Rate limiting, abuse protection, Turnstile
- File uploads, pre-chat form, proactive greeting, rich cards, custom themes
- Extracting `packages/chat-ui` as a shared package
- Wildcard TLS / CDN provider decisions

## Architecture

### System topology

```
┌─────────────────────────────────────────┐
│  Host site (any domain)                 │
│  <script src="…/script.js">             │
│  └─ injects <iframe src="…/v/5">        │
│                                         │
│  OR direct visit in browser tab:        │
│  https://<tenant>-<agent>.live.openflow.build
└──────────────────┬──────────────────────┘
                   │  static CDN (wildcard *.live.openflow.build)
                   ▼
┌─────────────────────────────────────────┐
│  packages/widget (static SPA, Vite)     │
│  ├─ parses hostname → {tenant, agent}   │
│  ├─ detects embedded vs standalone      │
│  ├─ resolves version (latest or /v/N)   │
│  └─ SSE → app.openflow.build/api/widget │
└──────────────────┬──────────────────────┘
                   │  fetch + CORS
                   ▼
┌─────────────────────────────────────────┐
│  packages/web  (Next.js server route)   │
│  /api/widget/execute/[tenant]/[agent]/[version]
│  └─ proxies SSE to Express              │
└──────────────────┬──────────────────────┘
                   │  server-to-server
                   ▼
┌─────────────────────────────────────────┐
│  packages/backend  (Express)            │
│  /api/mock-execute/:slug/:version  (now)│
│  /api/agents/:slug/:version        (next step — unchanged contract)
└─────────────────────────────────────────┘
```

### URL scheme

All tenant-agent URLs resolve to the same static bundle, served from a wildcard CDN:

| URL | Role |
|---|---|
| `https://<t>-<a>.live.openflow.build/script.js` | Loader (embeds the iframe) |
| `https://<t>-<a>.live.openflow.build/` | Fullscreen SPA (resolves `latest`) |
| `https://<t>-<a>.live.openflow.build/v/:n` | SPA pinned to version `n` |

And on the main Next.js app:

| URL | Role |
|---|---|
| `GET  https://app.openflow.build/api/widget/latest-version/:t/:a` | Resolve latest version |
| `POST https://app.openflow.build/api/widget/execute/:t/:a/:v` | SSE execution |

### Embedding

```html
<!-- default: iframe pinned to resolved latest version -->
<script src="https://acme-customer-care.live.openflow.build/script.js"></script>

<!-- pinned: iframe at /v/3 -->
<script src="https://acme-customer-care.live.openflow.build/script.js"
        data-version="3"></script>
```

## Hostname parsing and version resolution

### Rules

- **Tenant slug** — `[a-z0-9]{1,40}`, no hyphens, not in reserved set
- **Agent slug** — `[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?`, hyphens allowed, no leading/trailing/consecutive
- Subdomain splits on the **first** hyphen

### Reserved tenant slugs

```
app, api, www, live, admin, assets, cdn, docs, status
```

### Shared parser (referenced by widget, web, backend)

```ts
// packages/widget/src/routing/parseHostname.ts
export function parseAgentHost(host: string): { tenant: string; agentSlug: string } | null {
  const m = host.match(
    /^([a-z0-9]+)-([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)\.live\.openflow\.build$/
  );
  return m ? { tenant: m[1], agentSlug: m[2] } : null;
}
```

### Version resolution

- Path `/` → `"latest"`, resolved via `GET /api/widget/latest-version/:t/:a`
- Path `/v/:n` (digits only) → pinned to `n`
- Anything else → 404 page inside the SPA

The loader script either uses `data-version` directly or fetches `latest-version` before injecting
the iframe, so the iframe URL **always contains a concrete version number**.

## Slug validation — three layers

A new workspace package `packages/shared-validation` is the single source of truth. Widget, web,
and backend all import from it.

### Shared module

```ts
// packages/shared-validation/src/index.ts
export const TENANT_SLUG_REGEX = /^[a-z0-9]{1,40}$/;
export const AGENT_SLUG_REGEX  = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const RESERVED_TENANT_SLUGS = new Set([
  'app','api','www','live','admin','assets','cdn','docs','status'
]);
export function isValidTenantSlug(s: string): boolean {
  return TENANT_SLUG_REGEX.test(s) && !RESERVED_TENANT_SLUGS.has(s);
}
export function isValidAgentSlug(s: string): boolean {
  return AGENT_SLUG_REGEX.test(s);
}
```

### Backend enforcement (Zod)

- `packages/backend/src/routes/agents/createAgent.ts` — validate `slug` on create
- Tenant creation handler (location to be confirmed during implementation) — validate slug +
  reserved-list check

### Database enforcement (Postgres CHECK)

New migration:

```sql
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_format
  CHECK (
    slug ~ '^[a-z0-9]{1,40}$'
    AND slug NOT IN ('app','api','www','live','admin','assets','cdn','docs','status')
  );

ALTER TABLE agents ADD CONSTRAINT agents_slug_format
  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');
```

If existing rows violate, the migration aborts with a report. Data is fixed manually, then
migration re-runs.

## `packages/widget`

### Directory layout

```
packages/widget/
├── package.json                  # vite + react + idb
├── vite.config.ts                # two builds: loader IIFE + SPA
├── index.html                    # SPA shell
├── src/
│   ├── loader/
│   │   └── script.ts             # → dist/script.js (IIFE, ~2 KB gz)
│   ├── app/
│   │   ├── main.tsx              # SPA entry
│   │   ├── ChatApp.tsx           # mode detection, routing, version resolution
│   │   └── modes/
│   │       ├── EmbeddedMode.tsx  # bubble ↔ panel (pixel-identical Copilot)
│   │       └── StandaloneMode.tsx# fullscreen (max-w-3xl)
│   ├── ui/                       # copied from packages/web/app/components/copilot/
│   │   ├── CopilotPanel.tsx
│   │   ├── CopilotHeader.tsx
│   │   ├── CopilotMessages.tsx
│   │   ├── CopilotInput.tsx
│   │   ├── copilotTypes.ts
│   │   ├── useSessions.ts        # IndexedDB-backed (replaces useCopilotSessions)
│   │   └── primitives/           # copies of shadcn button, dropdown-menu, textarea
│   ├── api/
│   │   ├── executeClient.ts      # POST SSE → event dispatch
│   │   ├── latestVersionClient.ts
│   │   └── sseReader.ts          # ported from packages/web/app/lib/api.ts
│   ├── types/publicEvents.ts     # mirror of PublicExecutionEvent
│   ├── routing/parseHostname.ts
│   ├── storage/indexeddb.ts      # idb wrapper
│   ├── i18n/{en.json,es.json,index.ts}
│   ├── validation/slugs.ts       # re-exports @openflow/shared-validation
│   └── styles/tailwind.css
└── dist/                         # build output; upload to CDN
    ├── script.js
    ├── index.html
    └── assets/<name>-<hash>.{js,css}
```

### Vite build — two entry points, one `dist/`

```ts
// packages/widget/vite.config.ts (sketch)
export default defineConfig(({ mode }) => mode === 'loader'
  ? {
      build: {
        lib: {
          entry: 'src/loader/script.ts',
          formats: ['iife'],
          name: 'OpenFlowWidget',
          fileName: () => 'script.js',
        },
        emptyOutDir: false,
      },
    }
  : {
      plugins: [react(), tailwindcss()],
      build: { rollupOptions: { input: 'index.html' } },
    });
```

`npm run build` in `packages/widget` runs `build:loader` then `build:app`. Output is pure static
files ready for any CDN with wildcard-host support.

### Copilot port — detangle matrix

| Source dependency | Widget replacement |
|---|---|
| `next-intl` `useTranslations('copilot')` | `useT()` reading from `src/i18n/<lang>.json` |
| `@/components/ui/*` (shadcn) | Copies of `button`, `dropdown-menu`, `textarea` in `src/ui/primitives/` |
| `lucide-react` | Unchanged (framework-agnostic) |
| In-memory `useCopilotSessions` | `useSessions` backed by IndexedDB |
| `copilotMocks.ts` client-side mock streamer | Removed — real SSE from the backend mock route |

### i18n

- Bundle `en.json` and `es.json` (same keys Copilot uses: title, newChat, placeholder, send, stop,
  close, emptyState, selectChat).
- Language precedence: `?lang=` query param → `navigator.language` prefix match → `en`.
- Combined footprint ~1 KB — no runtime fetch.

### Output budget

- `script.js` (loader): **≤ 3 KB gzipped** (no React; DOM + postMessage only)
- SPA initial payload (`index.html` + first JS chunk + CSS): **target ≤ 80 KB gzipped**

The OF-2 acceptance criteria lists ≤ 50 KB. React 19 + Copilot UI + idb + Tailwind realistically
lands at 60–80 KB. Preact/compat as a later optimization if we need to hit 50 KB; not in this
phase per YAGNI.

## Runtime modes

### Detection

```ts
// src/app/useEmbedded.ts
export function useEmbedded(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}
```

### Embedded layout

- **Bubble (closed):** iframe is 56×56 at `bottom: 16px; right: 16px`. Inside: a single branded
  chat-bubble button. Click → `postMessage({type:'openflow:resize', state:'panel'})`.
- **Panel (open):** iframe resized to `w-[400px]` with `top: 24px; bottom: 24px; right: 14px`
  (exact Copilot offsets copied from `CopilotPanel.tsx`). Inside: unmodified `<CopilotPanel>`.
- Close button (`×` in the Copilot header) posts `{state:'bubble'}`; loader shrinks the iframe.
- Transition polish comes from Tailwind `transition-all` on the inner panel; the iframe itself
  just swaps dimensions.

### Standalone layout

Full viewport, no iframe coordination needed:

```tsx
<div className="w-full h-dvh flex justify-center bg-background">
  <div className="w-full max-w-3xl h-full flex flex-col">
    <CopilotHeader standalone />
    <CopilotMessages />
    <CopilotInput />
  </div>
</div>
```

Same header items are rendered; the `×` close button is hidden when `standalone === true` (it has
nothing to collapse to).

## Loader script — responsibilities and postMessage protocol

### Responsibilities (all in `src/loader/script.ts`)

1. Read `document.currentScript.src`; extract host, subdomain, tenant, agent
2. Read `data-version` attribute; if absent, fetch `/api/widget/latest-version/:t/:a`
3. Create the iframe at `https://<host>/v/<version>`, initially sized 56×56 fixed bottom-right
4. Listen for `postMessage` from the iframe and resize accordingly
5. Tear down on `beforeunload`

### postMessage protocol

Iframe → loader:

```ts
type WidgetMessage =
  | { type: 'openflow:ready' }
  | { type: 'openflow:resize'; state: 'bubble' | 'panel' }
  | { type: 'openflow:telemetry'; event: string }; // future use
```

Loader → iframe (response to `ready`):

```ts
type HostMessage =
  | { type: 'openflow:host'; origin: string; path: string };
```

Security:

- Loader checks `event.origin` against the iframe's origin before acting on any message.
- Loader includes a per-load nonce in `openflow:host`; the iframe echoes it on subsequent
  messages; loader rejects mismatches.

## IndexedDB persistence

### Schema

Stored in the iframe origin (`<tenant>-<agent>.live.openflow.build`), so per-agent isolation is
automatic.

```ts
// DB: openflow-widget, version 1
// Store: sessions  (keyPath: 'sessionId')
interface StoredSession {
  sessionId: string;           // uuid
  tenant: string;
  agentSlug: string;
  title: string;               // derived from first user message
  createdAt: number;
  updatedAt: number;
  messages: CopilotMessage[];  // exact Copilot type: { id, role, blocks, timestamp }
}
// Index: by updatedAt desc (for history dropdown ordering)
```

### Write timing

| Event | Action |
|---|---|
| User sends message | Append user message, bump `updatedAt`, write synchronously |
| Assistant `done` event | Append finalized assistant message, bump `updatedAt`, write |
| Mid-stream token events | Accumulate in memory only; no writes |
| Tab dies mid-stream | Incomplete assistant turn is discarded; next load shows last `done` state |

### Fallback

If IndexedDB is unavailable (private mode, quota), `useSessions` degrades to in-memory storage.
Emit `openflow:telemetry` event (stub for now) for observability.

## Data pipeline

### Request shape (widget → Next.js proxy)

Matches `AgentExecutionInputSchema` from `packages/backend/src/routes/execute/executeTypes.ts`:

```ts
{
  tenantId: string,          // resolved from subdomain
  userId: string,            // same as sessionId until auth lands
  sessionId: string,         // uuid, stable per conversation
  message: { text: string }, // no media upload in this phase
  model: undefined,          // server default
  context: { channel: 'web' },
  channel: 'web',
  stream: true,              // widget always streams
}
```

### Response shape (server → widget)

SSE events matching `PublicExecutionEvent` from the same file:

```
node_visited      — { type, nodeId }
text              — { type, text, nodeId }
toolCall          — { type, nodeId, name, args, result }
tokenUsage        — { type, nodeId, inputTokens, outputTokens, cachedTokens, cost, durationMs }
structuredOutput  — { type, nodeId, data }
nodeError         — { type, nodeId, message }
error             — { type, message }
done              — { type, response: AgentExecutionResponse }
```

### Event → Copilot block mapping (widget-side)

| Event | Widget renders |
|---|---|
| `text` | Accumulates into a `{ type: 'text', content }` block per `nodeId`. Tokens append until the block flips to "final" on next non-text event or `done`. |
| `toolCall` | Adds `{ type: 'action', icon: iconForTool(name), title: humanize(name), description: summarize(args, result) }` block. |
| `tokenUsage`, `node_visited`, `structuredOutput`, `nodeError` | Ignored in UI (server-side observability concerns, not end-user). Logged for debug. |
| `error` | Close stream, show inline banner in input area. |
| `done` | Finalize assistant message, persist to IndexedDB, close stream. |

### Next.js proxy

New route: `packages/web/app/api/widget/execute/[tenant]/[agent]/[version]/route.ts`

- Validate `tenant` and `agent` params with `@openflow/shared-validation`
- Parse request body with the same Zod schema as the real endpoint
- Enforce `body.tenantId === params.tenant` (400 on mismatch) — prevents a widget on subdomain A
  from executing requests against tenant B
- Forward to `MOCK_EXECUTE_URL` (env-driven) — mock path today, real path later. The forwarded URL
  uses only `:agentSlug/:version` (tenant stays in the body; matches the real endpoint's shape)
- Pipe the upstream SSE `ReadableStream` straight through the response
- Add CORS headers (see below)

Also new: `packages/web/app/api/widget/latest-version/[tenant]/[agent]/route.ts` — thin JSON proxy
to the backend's latest-version endpoint (mocked now).

### Express mock route

New file: `packages/backend/src/routes/mockExecute/mockExecuteHandler.ts`, mounted at
`POST /api/mock-execute/:agentSlug/:version`.

- Gated by feature flag (e.g., `ENABLE_MOCK_EXECUTE=true`) so it never runs in production
- No auth
- Picks one of 4 mock responses (rotated by hash of `sessionId`, mirroring current Copilot rotation)
- Converts each `copilotMocks.ts` entry into a sequence of `PublicExecutionEvent`s:
  - `text` block → word-by-word `text` events at ~30ms intervals (matches current Copilot feel)
  - `action` block → single `toolCall` event with synthetic `name`, `args`, `result`
- Terminates with a `done` event carrying a valid `AgentAppResponse`

Also new: `packages/backend/src/routes/mockExecute/mockLatestVersionHandler.ts`, mounted at
`GET /api/mock-execute/:agentSlug/latest` — returns a hardcoded `{ version: 5 }` (matches the
`agent-example/5` path the user referenced). The Next.js `latest-version` route proxies to this
endpoint today and swaps to the real resolver later.

### Mock catalog

Mock responses are ported verbatim from `packages/web/app/components/copilot/copilotMocks.ts` into
`packages/backend/src/routes/mockExecute/mockCatalog.ts` so the widget sees identical content.
Each entry becomes an async generator of `PublicExecutionEvent`s.

### CORS

Next.js proxy adds headers:

```ts
const ALLOWED = /^https:\/\/[a-z0-9]+-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?\.live\.openflow\.build$/;
if (origin && ALLOWED.test(origin)) {
  return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
}
```

`OPTIONS` preflight handler exports the same headers plus `Access-Control-Allow-Methods: POST,
GET, OPTIONS` and `Access-Control-Allow-Headers: Content-Type`.

## Error handling

| Failure | Behavior |
|---|---|
| `latest-version` fetch fails | Render UI; disable input with "Initializing…"; retry every 3s up to 3 times; after that, inline error with "Retry" button |
| Execute POST fails (network) | Keep user message; show inline "Couldn't reach the assistant, retry" row; no state loss |
| SSE stream drops mid-message | Finalize whatever text accumulated; show banner; allow next turn |
| `error` SSE event | Same as mid-stream drop |
| IndexedDB unavailable | Fall back to in-memory `useSessions`; chat still works; history dropdown shows "Not available" |
| Invalid subdomain (parse fails) | Standalone mode renders a branded "Agent not found" screen; embedded mode stays in bubble state and logs to console |

## Testing

### Unit

- `parseHostname` — happy paths (hyphenated agent), reserved tenant, malformed, leading/trailing
  dashes, double dashes
- Slug validators in `@openflow/shared-validation`
- `eventToBlock` mapper — every `PublicExecutionEvent` variant
- `useSessions` — write on user send, write on `done`, no writes mid-stream, fallback path

### Integration

- Mock catalog → `PublicExecutionEvent` generator → SSE reader → final `CopilotMessage[]` matches
  fixture
- Next.js proxy forwards SSE byte-for-byte and enforces CORS origin regex
- `POST /api/mock-execute/:slug/:version` produces a well-formed event stream ending in `done`

### Manual

- Embed the widget on a local test page, verify bubble ↔ panel resize
- Direct visit renders fullscreen chat
- Reload page, verify history dropdown lists prior sessions from IndexedDB
- Mobile layout at 375px width (embedded bubble positions correctly; standalone chat is usable)
- Chrome, Firefox, Safari, Edge — latest two versions each

## Rollout

1. Merge widget + mock routes + validation + migration
2. Deploy `packages/widget/dist/` to wildcard CDN (infra ticket separate)
3. Verify internally on a test tenant-agent subdomain
4. Hand off Linear OF-2 for review
5. Next step (separate spec): auth, real LLM wiring, remove mock route

## Open questions (tracked for the plan phase, not blockers)

- Exact location of the tenant-create handler in `packages/backend` (grep during implementation)
- Whether the slug-validation migration should normalize existing rows or abort and hand off to
  the team — default is abort-and-report
- The specific CDN provider (Cloudflare Pages vs Vercel Edge vs S3 + CloudFront) — deployment
  concern, not code
