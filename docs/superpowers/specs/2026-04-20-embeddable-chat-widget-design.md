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
- Consent UI / cookie banner integration (widget exposes `boot()`; integrators wire it)
- Extracting `packages/chat-ui` as a shared package
- Wildcard TLS / CDN provider decisions

## Architecture

### System topology

```
┌─────────────────────────────────────────────────────┐
│  Host site (any domain) — embedded                  │
│  <script src=".../script.js" async></script>        │
│  └─ injects <iframe src=".../v/5" sandbox=...>      │
│                                                     │
│  OR direct visit in browser tab:                    │
│  https://<tenant>-<agent>.live.openflow.build       │
└──────────────────┬──────────────────────────────────┘
                   │  static CDN (wildcard *.live.openflow.build)
                   ▼
┌─────────────────────────────────────────────────────┐
│  packages/widget (static SPA, Vite)                 │
│  ├─ parses hostname → {tenant, agent}               │
│  ├─ detects embedded vs standalone                  │
│  ├─ resolves version (latest or /v/N)               │
│  └─ SSE → app.openflow.build/api/chat               │
└──────────────────┬──────────────────────────────────┘
                   │  fetch + CORS
                   ▼
┌─────────────────────────────────────────────────────┐
│  packages/web  (Next.js server route)               │
│  /api/chat/execute/[tenant]/[agent]/[version]       │
│  └─ proxies SSE to Express                          │
└──────────────────┬──────────────────────────────────┘
                   │  server-to-server
                   ▼
┌─────────────────────────────────────────────────────┐
│  packages/backend  (Express)                        │
│  /api/mock-execute/:slug/:version       (this phase)│
│  /api/agents/:slug/:version             (step 2)    │
└─────────────────────────────────────────────────────┘
```

The proxy path deliberately uses `/api/chat/` (not `/api/widget/`): the string "widget" is a
common picklist term in EasyList and similar ad-block rules, which would silently break
integrations on sites whose users run those filters.

**Browser-never-talks-to-Express rule.** Reiterated for the widget context: all dynamic data from
the widget flows through `app.openflow.build/api/chat/*`; the wildcard CDN only serves static
assets. If future tenant-specific config needs to be fetched dynamically, it too goes through a
Next.js route.

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
| `GET  https://app.openflow.build/api/chat/latest-version/:t/:a` | Resolve latest version |
| `POST https://app.openflow.build/api/chat/execute/:t/:a/:v` | SSE execution |

### Embedding

```html
<!-- default: iframe pinned to resolved latest version -->
<script src="https://acme-customer-care.live.openflow.build/script.js" async></script>

<!-- pinned: iframe at /v/3 -->
<script src="https://acme-customer-care.live.openflow.build/script.js"
        data-version="3" async></script>
```

**`data-version` semantics.** The value pins the iframe path at *embed time* for the life of that
page load. It does not re-pin on navigation. To re-pin, reload the page. The loader itself
(`script.js`) is **intentionally unversioned** and must stay backward-compatible with all SPA
versions (Intercom-style). We will never serve two loader shapes simultaneously. The literal value
`data-version="latest"` is accepted and treated as the default (useful for integrators who want to
be explicit).

## Hostname parsing and version resolution

### Rules

- **Tenant slug** — `[a-z0-9]{1,40}`, no hyphens, ASCII only, not in reserved set
- **Agent slug** — `[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?`, hyphens allowed, no leading/trailing/
  consecutive, ASCII only
- Subdomain splits on the **first** hyphen

### ADR — tenant slugs are permanently hyphen-free

This is not a temporary restriction. The first-hyphen split rule depends on it, and changing the
rule later would break every existing tenant URL. If we ever need tenant identifiers with
hyphens, we introduce a different separator (double hyphen, or a dotted subdomain like
`<agent>.<tenant>.live.openflow.build`) rather than expanding tenant slug syntax.

### Reserved tenant slugs

```
app, api, www, live, admin, assets, cdn, docs, status, root, support, help, blog, mail, email,
auth, oauth, static, public, internal, staging, preview, dev, localhost
```

(Intentionally broad — names any external service or internal tooling could plausibly claim.)

### Shared parser

```ts
// packages/widget/src/routing/parseHostname.ts
const HOST_REGEX =
  /^([a-z0-9]+)-([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)\.live\.openflow\.build$/;

export function parseAgentHost(raw: string): { tenant: string; agentSlug: string } | null {
  // Normalize: strip port, trailing dot, lowercase. Reject non-ASCII early.
  const host = raw
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  if (!/^[\x00-\x7f]+$/.test(host)) return null;
  const m = host.match(HOST_REGEX);
  return m ? { tenant: m[1], agentSlug: m[2] } : null;
}
```

### Version resolution

- Path `/` → `"latest"`, resolved via `GET /api/chat/latest-version/:t/:a`
- Path `/v/:n` (digits only, 1–6 digits) → pinned to `n`
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
  'app','api','www','live','admin','assets','cdn','docs','status','root',
  'support','help','blog','mail','email','auth','oauth','static','public',
  'internal','staging','preview','dev','localhost'
]);
export function isValidTenantSlug(s: string): boolean {
  return TENANT_SLUG_REGEX.test(s) && !RESERVED_TENANT_SLUGS.has(s);
}
export function isValidAgentSlug(s: string): boolean {
  return AGENT_SLUG_REGEX.test(s);
}
```

The regexes are ASCII-only by construction (`[a-z0-9]`); IDN/Punycode cannot satisfy them.

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
    AND slug NOT IN (
      'app','api','www','live','admin','assets','cdn','docs','status','root',
      'support','help','blog','mail','email','auth','oauth','static','public',
      'internal','staging','preview','dev','localhost'
    )
  );

ALTER TABLE agents ADD CONSTRAINT agents_slug_format
  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');
```

If existing rows violate, the migration aborts with a report. Data is fixed manually, then
migration re-runs.

**Drift risk.** The reserved list lives in both the TypeScript shared module and the Postgres
CHECK literal. When we add a new reserved name (e.g., `billing`, `settings`), both places must
move together. A follow-up cleanup (out of scope here) can replace the CHECK with a codegen
step (generate the SQL from the TS source) or a reserved-words table. For now, the implementer
adds a lint-time assertion that the two lists are equal — a unit test that reads the migration
SQL and compares against `RESERVED_TENANT_SLUGS` is enough.

## `packages/widget`

### Directory layout

```
packages/widget/
├── package.json                  # vite + react + idb@8
├── vite.config.ts                # two builds: loader IIFE + SPA
├── index.html                    # SPA shell
├── src/
│   ├── loader/
│   │   └── script.ts             # → dist/script.js (IIFE, ~3 KB gz target)
│   ├── app/
│   │   ├── main.tsx              # SPA entry
│   │   ├── ChatApp.tsx           # mode detection, routing, version resolution
│   │   └── modes/
│   │       ├── EmbeddedMode.tsx  # bubble ↔ panel (pixel-identical Copilot)
│   │       └── StandaloneMode.tsx# fullscreen (max-w-3xl, history-aware)
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
│   ├── storage/
│   │   ├── indexeddb.ts          # idb wrapper
│   │   └── inMemory.ts           # first-class fallback (see IndexedDB section)
│   ├── i18n/{en.json,es.json,index.ts}
│   ├── a11y/                     # focus trap, live region, escape handler
│   ├── debug/                    # window.OpenFlowWidget + ?openflow_debug=1
│   ├── validation/slugs.ts       # re-exports @openflow/shared-validation
│   └── styles/tailwind.css
└── dist/                         # build output; upload to CDN
    ├── script.js
    ├── index.html
    └── assets/<name>-<hash>.{js,css}

packages/shared-validation/       # new tiny workspace package
├── package.json                  # @openflow/shared-validation
└── src/index.ts
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
| `next-intl` `useTranslations('copilot')` | `useT()` reading from `src/i18n/<lang>.json` (next-intl is Next.js-coupled) |
| `@/components/ui/*` (shadcn) | Copies of `button`, `dropdown-menu`, `textarea` in `src/ui/primitives/` |
| `lucide-react` | Unchanged (framework-agnostic) |
| In-memory `useCopilotSessions` | `useSessions` with IndexedDB + in-memory fallback |
| `copilotMocks.ts` client-side mock streamer | Removed — real SSE from the backend mock route |

### i18n

- Bundle `en.json` and `es.json` (keys: title, newChat, placeholder, send, stop, close,
  emptyState, selectChat, sessionOnly ["• session-only"], unavailable ["Unavailable"], openChat
  ["Open chat"], assistantUnavailable ["This assistant is no longer available."]).
- Language precedence: `?lang=` query param → `navigator.language` prefix match → `en`.
- Combined footprint ~1–2 KB — no runtime fetch. If we add >4 locales, switch to runtime fetch
  with `<link rel="preload">` warming the default.

### Dependencies (pinned)

- `react@19`, `react-dom@19`
- `idb@8` (API differs from v7; pin major)
- `tailwindcss@4`
- `lucide-react` (latest at spec time)
- `vite@6`

### Output budget

- `script.js` (loader): **target ≤ 4 KB gzipped** (hostname parse, version fetch, nonce
  handshake with retry/timeout, viewport debounce, mobile negotiation, boot/debug/telemetry
  stubs, CSP warning, dev-mode rewrite). 3 KB is aspirational once the code stabilizes; do not
  cut documented features to hit it.
- SPA initial payload (`index.html` + first JS chunk + CSS): **target ≤ 80 KB gzipped**

**Scope note for OF-2.** The Linear ticket lists ≤ 50 KB. React 19 + Copilot UI + idb + Tailwind
realistically lands at 60–80 KB. We are intentionally accepting ~80 KB in this phase and deferring
Preact/compat until it's justified by a measured requirement. This is a scope delta from OF-2's
acceptance criteria and needs sign-off on the ticket. Recorded here so it's not lost.

## Runtime modes

### Detection

```ts
// src/app/useEmbedded.ts
export function useEmbedded(): boolean {
  try {
    // Opaque-origin parent (most cross-origin iframes) throws on access.
    return window.self !== window.top;
  } catch {
    return true;
  }
}
```

### Embedded layout — desktop

- **Bubble (closed):** iframe is 56×56 at `bottom: 16px; right: 16px`. The iframe is
  tight-fit to the bubble button (no padding, no transparent margins — iframes cannot forward
  pointer events through transparent areas, so every pixel of the iframe must be the button).
- **Panel (open):** iframe resized to `w-[400px]` with `top: 24px; bottom: 24px; right: 14px`
  (exact Copilot offsets copied from `CopilotPanel.tsx`). Inside: unmodified `<CopilotPanel>`.
- Close button (`×` in the Copilot header) posts `{state:'bubble'}`; loader shrinks the iframe.
- `Escape` key inside the panel also posts `{state:'bubble'}`.

### Embedded layout — mobile (host viewport < 480px)

- **Bubble (closed):** unchanged (56×56 bottom-right).
- **Panel (open):** iframe resized to `100vw × 100vh`, fixed at `top:0; left:0; right:0; bottom:0`.
  Inside: the panel stretches to the iframe's new dimensions. This matches Intercom/Drift behavior.

The loader reports `window.innerWidth` to the iframe in the `openflow:host` message and on every
host-side `resize` event (debounced to 100ms). The iframe decides which layout to apply and posts
back a `openflow:resize` with the target dimensions; the loader sets the iframe style accordingly.

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

**Back-button / history.** In standalone mode, selecting a session pushes
`history.pushState({sessionId}, '', '?s=<sessionId>')`; the URL becomes shareable/deep-linkable
within the same origin. `popstate` restores the session. Reload honors `?s=` if the session is in
IndexedDB; otherwise starts a fresh session.

## Loader script — responsibilities

All in `src/loader/script.ts`.

1. Resolve `document.currentScript` (when `null` — e.g., loader was dynamically injected — fall
   back to `Array.from(document.getElementsByTagName('script')).pop()`, then match on host regex).
2. From `script.src`, extract `{host, subdomain, tenant, agent}`. Expose `window.OpenFlowWidget`
   (with `boot()` and `debug()` stubs) so integrators using `data-autoload="false"` can call
   `boot()` later.
3. **If `data-autoload="false"`, stop here** and wait for `window.OpenFlowWidget.boot()`. When
   `boot()` is called (or immediately, when `data-autoload` is unset/`"true"`), continue with
   steps 4–9.
4. Read `data-version`; if absent or `"latest"`, fetch `/api/chat/latest-version/:t/:a`.
5. Create the iframe at `https://<host>/v/<version>` with these attributes:
   ```html
   <iframe
     src="..."
     title="OpenFlow chat widget"
     sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
     allow="clipboard-write"
     loading="eager"
     style="border:0; position:fixed; bottom:16px; right:16px; width:56px; height:56px;
            z-index:2147483647; color-scheme:normal;">
   </iframe>
   ```
   `allow-same-origin` is required for IndexedDB (opaque origins cannot access storage).
   `allow-popups-to-escape-sandbox` is **not** included: assistant replies in this phase are
   plain text + action blocks — no user-controllable anchor tags render. If/when rich-content
   links ship, revisit the sandbox policy and the link-sanitization policy together.
6. Establish the postMessage protocol (below).
7. Start an 8-second timer; if the iframe hasn't posted `openflow:ready` by then, stop the
   handshake retry loop (see §Handshake step 4) and log a structured console warning
   including a link to the CSP docs (most common cause: `frame-src` or `connect-src` missing).
8. Listen for host `resize` events (debounced 100ms) and forward `window.innerWidth` to the iframe.
9. On `pagehide` (primary) and `beforeunload` (fallback), tear down listeners. `pagehide` is
   the reliable signal on mobile Safari and when bfcache is involved.

## postMessage protocol and security

### Messages

```ts
// iframe → loader
type WidgetMessage =
  | { type: 'openflow:ready'; nonce: string }
  | { type: 'openflow:resize'; nonce: string; w: number | string; h: number | string;
      pos: 'bubble' | 'panel' | 'fullscreen' }
  | { type: 'openflow:telemetry'; nonce: string; event: string; data?: unknown };

// loader → iframe
type HostMessage =
  | { type: 'openflow:init';    nonce: string; hostOrigin: string; path: string; viewportW: number }
  | { type: 'openflow:viewport'; nonce: string; viewportW: number };
```

### Handshake

1. Loader generates a per-load nonce (`randomUUID()` helper — see §UUID generation) **before**
   the iframe is inserted.
2. Loader sets up a `message` listener that rejects any event whose `origin` doesn't match the
   iframe's origin *and* any message whose `nonce` doesn't match.
3. Loader inserts the iframe.
4. Loader **unsolicited** posts `openflow:init` to `iframe.contentWindow` with an explicit
   `targetOrigin` equal to the iframe's origin (never `'*'`), retrying every 200ms until the
   iframe posts its first `openflow:ready` (which must echo the nonce) **or** the 8-second
   CSP-timeout fires (Loader step 7), whichever is first. On timeout the loader stops retrying,
   emits the CSP console warning, and enters the "iframe-not-ready" state (bubble click shows
   a tooltip linking to the CSP checklist).
5. Once the iframe responds, the loader stops retrying. All subsequent messages in either
   direction must include the nonce and use explicit `targetOrigin`.

**What this actually protects.** The bootstrap hole is closed by step 4's *unsolicited* post to
the iframe's specific `targetOrigin` — only code running at that origin receives the init
message. The nonce is defense-in-depth against residual edge cases (stale listeners, messages
from unrelated frames); the `origin` check is the real gate. Framing matters because an
implementer shouldn't infer that leaking the nonce is sufficient to break the protocol.

### Rules (enforced on both sides)

- `postMessage` is **never** called with `targetOrigin: '*'`.
- Messages lacking the correct nonce or arriving from the wrong origin are dropped silently (do
  not log; avoids amplifying probes).
- Message schema is validated (shape + types); malformed messages are dropped.

## UUID generation

Used for nonces, `sessionId`, and any other random IDs the widget needs.

```ts
// packages/widget/src/lib/uuid.ts (loader and SPA both use this)
export function randomUUID(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  // Last-resort fallback for non-secure contexts lacking getRandomValues
  // (dev over plain HTTP, legacy intranets). Not cryptographically strong;
  // acceptable because the only secret protected by it (the postMessage nonce)
  // is defense-in-depth, not the primary origin gate.
  return 'fallback-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
```

`crypto.randomUUID()` requires a secure context; plain-HTTP dev environments would otherwise
crash the widget at session create. The `getRandomValues`-based path covers the overwhelming
majority of legacy environments. The `Math.random` fallback exists solely so the widget boots on
a laptop serving the test page over `http://localhost` without a secure context.

## IndexedDB persistence

### Schema

Stored in the iframe origin (`<tenant>-<agent>.live.openflow.build`). For *same-site* hosts this
gives automatic per-agent isolation.

```ts
// DB: openflow-widget, version 1
// Store: sessions  (keyPath: 'sessionId')
interface StoredSession {
  sessionId: string;           // randomUUID() from §UUID generation
  tenant: string;
  agentSlug: string;
  title: string;               // derived from first user message
  createdAt: number;
  updatedAt: number;
  messages: CopilotMessage[];  // exact Copilot type: { id, role, blocks, timestamp }
}
// Index: by updatedAt desc (for history dropdown ordering)
```

### Storage partitioning — real-world reality

Safari ITP, Firefox strict mode, and Brave partition storage for cross-site iframes *or* block it
entirely. A non-trivial slice of real end-users will see IndexedDB writes fail. The design treats
this as a first-class state, not an error path:

- `useSessions` tries IndexedDB once on mount; on any failure (quota, blocked, not available,
  partitioned such that reads return empty), it transparently switches to `src/storage/inMemory.ts`.
- The History dropdown still functions — it shows only the current in-memory session, labeled
  with a small "• session-only" subscript. Previous sessions don't appear (because they don't
  persist). No user-visible error.
- `openflow:telemetry` emits `storage_unavailable` for later observability.

`requestStorageAccess()` is *not* called. For an ephemeral chat widget it would be invasive and
offers marginal benefit over the in-memory fallback.

### Write timing

| Event | Action |
|---|---|
| User sends message | Append user message, bump `updatedAt`, write synchronously |
| Assistant `done` event | Append finalized assistant message, bump `updatedAt`, write |
| Mid-stream token events | Accumulate in memory only; no writes |
| Tab dies mid-stream | Incomplete assistant turn is discarded; next load shows last `done` state |

## Data pipeline

### Request shape (widget → Next.js proxy)

Matches `AgentExecutionInputSchema` from `packages/backend/src/routes/execute/executeTypes.ts`:

```ts
{
  tenantId: string,          // resolved from subdomain; must match URL param
  userId: string,            // same as sessionId until auth lands (see phase-2 note below)
  sessionId: string,         // stable per conversation
  message: { text: string }, // no media upload in this phase
  model: undefined,          // server default
  context: undefined,        // omit; channel is a top-level field in the schema
  channel: 'web',            // per AgentExecutionInputSchema default
  stream: true,              // widget always streams
}
```

**Phase-2 note on `userId`.** In phase 1, `userId === sessionId` so every anonymous session
looks like a one-off user. When auth lands in step 2, new sessions will carry the authenticated
user's ID. IndexedDB sessions created during phase 1 will remain flagged anonymous forever — we
won't attempt a retroactive user-link migration — so integrators and support should treat
pre-auth history as per-browser rather than per-user.

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
| `text` | Accumulates into a `{ type: 'text', content }` block. **Coalescing rule:** while consecutive `text` events share the same `nodeId`, append to the current open text block. A `text` event with a **different `nodeId`** finalizes the current text block and starts a new one. A non-`text` event also finalizes the current text block. |
| `toolCall` | Adds `{ type: 'action', icon: iconForTool(name), title: humanize(name), description: summarize(args, result), variant: 'info' }` block. |
| `nodeError` | Adds `{ type: 'action', icon: 'alert-triangle', title: 'Step failed', description: event.message, variant: 'warning' }` block (inline in message; does not terminate stream). |
| `tokenUsage`, `node_visited`, `structuredOutput` | Not rendered. `node_visited` is still consumed by the mapper to track current node context for the coalescing rule. |
| `error` | Stream terminates. Show inline "couldn't complete the reply" banner in the message list; input becomes active for retry. |
| `done` | Finalize assistant message, persist to IndexedDB, close stream. |

### Next.js proxy

New route: `packages/web/app/api/chat/execute/[tenant]/[agent]/[version]/route.ts`

- Validate `tenant` and `agent` params with `@openflow/shared-validation`
- Parse request body with the same Zod schema as the real endpoint
- Enforce `body.tenantId === params.tenant` (400 on mismatch) — prevents a widget on subdomain A
  from executing requests against tenant B
- Forward to `MOCK_EXECUTE_URL` (env-driven) — mock path today, real path later. The forwarded URL
  uses only `:agentSlug/:version` (tenant stays in the body; matches the real endpoint's shape)
- **Runtime:** explicitly use the Node runtime (`export const runtime = 'nodejs'`) to avoid the
  Edge runtime's partial fetch-streaming quirks with long-lived SSE. Pipe the upstream
  `ReadableStream` straight through the response.
- Require HTTP/2 upstream — document in rollout
- Add CORS headers (see below)
- Set `Cache-Control: no-store` explicitly on both `execute` and `latest-version` routes. The
  chat routes must never be cached by any intermediary: `execute` is a long-lived SSE stream,
  and `latest-version` changes whenever a tenant publishes. `Vary: Origin` alone is not enough
  to prevent a shared CDN tier from caching a version response across origins.

Also new: `packages/web/app/api/chat/latest-version/[tenant]/[agent]/route.ts` — thin JSON proxy
to the backend's latest-version endpoint (mocked now).

### Express mock route

New file: `packages/backend/src/routes/mockExecute/mockExecuteHandler.ts`, mounted at
`POST /api/mock-execute/:agentSlug/:version`.

- Gated by feature flag (`ENABLE_MOCK_EXECUTE=true`) so it never runs in production
- No auth
- Returns `404` if the agent slug isn't `agent-example` (the single recognized mock slug) or if
  the version path doesn't match the mocked latest — exercises the widget's "agent not found"
  terminal state naturally.
- Picks one of 4 mock responses (rotated by hash of `sessionId`, mirroring current Copilot rotation)
- Converts each `copilotMocks.ts` entry into a sequence of `PublicExecutionEvent`s:
  - `text` block → word-by-word `text` events at a conservative cadence (~40ms/word to keep long
    responses snappy). Cadence should match or beat the current Copilot `setInterval(30ms)` feel;
    confirm via side-by-side during QA.
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
  return {
    'Access-Control-Allow-Origin':  origin,
    'Vary':                         'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',  // Authorization pre-whitelisted for step 2
    'Access-Control-Max-Age':       '600',
  };
}
```

`OPTIONS` preflight handler returns the same header set.

### HTTP/2 requirement

SSE over `fetch()` opens a long-lived connection. Browsers cap HTTP/1.1 to 6 concurrent per origin.
Two tabs plus host traffic can starve the connection pool. The Next.js proxy host (`app.openflow.
build`) and the CDN must serve over HTTP/2 or HTTP/3. Document in rollout as a verified
prerequisite — neither provider default is HTTP/1.1-only, but confirm.

## Accessibility

WCAG 2.1 AA. Non-negotiable for enterprise sales.

### Focus

- Bubble button has `aria-label="Open chat"` (i18n key `openChat`).
- **Embedded mode only.** The panel container is `role="dialog"` + `aria-modal="true"` +
  `aria-labelledby="<panel-title-id>"`. When the bubble is clicked, focus moves to the message
  input; when the panel closes (× button or Escape), focus restores to the bubble button.
- **Standalone mode.** No dialog — the panel container is `role="main"` with
  `aria-labelledby="<panel-title-id>"`. Initial focus on page load lands on the message input.
  There is no open/close transition.
- **Focus trap** (`src/a11y/focusTrap.ts`) applies in embedded mode when the panel is open: Tab
  cycles within the panel, Shift+Tab at the first focusable wraps to the last, and Escape
  closes. The trap is scoped to the iframe document — Tab cannot move focus *out* of the iframe
  into the host page while the trap is active, but the iframe sandbox cannot control host-page
  Tab behavior when focus is already outside; that's a browser-level constraint, not a bug.
  Standalone mode has no trap (there's nothing to escape to).

### Screen reader

- ARIA live region `aria-live="polite"` on the messages container: newly appended text in a
  streaming assistant message is announced; new messages are announced as `"<role> said: <first
  sentence>"`. The live region is debounced to 400ms to avoid chatter during token-by-token
  streaming.
- History dropdown items have accessible names `"Session titled '<title>', last updated <time>"`.

### Keyboard

- Escape: close panel (embedded), or close history dropdown (both modes).
- Enter in textarea: send.
- Shift+Enter in textarea: newline.
- Tab/Shift+Tab: cycle focusable elements.
- No host-side global shortcut (respects integrator's keyboard bindings).

### Color and motion

- All text meets WCAG AA contrast (≥4.5:1 body, ≥3:1 UI text). Copilot is already compliant;
  verify during the port.
- Bubble button and input `:focus-visible` show a 2 px outline.
- `@media (prefers-reduced-motion: reduce)` disables all Tailwind `transition-*` utilities on
  widget elements via a Tailwind variant override in `styles/tailwind.css`.

## Theming, motion, color scheme

### Phase 1 behavior

- **Light mode only.** Copilot uses CSS custom properties for theming; the widget inherits that
  system but hardcodes `color-scheme: light` on the `<html>` element. Dark mode is deferred
  because it introduces per-tenant theme-override complexity we don't need for a mock.
- `prefers-reduced-motion: reduce` disables all transitions.
- `prefers-color-scheme: dark` is explicitly ignored in phase 1. Site visitors who expect dark
  mode see light mode. Deferring full theming is acceptable for the mock; revisit in step 2.

### Iframe `color-scheme`

Iframe style includes `color-scheme: normal` to prevent the host page's `color-scheme: dark`
declaration from propagating into the iframe and messing up `<input>` default colors.

## Privacy and consent

- **No cookies** are set by the widget. Authentication state (step 2) will use Authorization
  headers, not cookies.
- **IndexedDB** stores conversation history as technical-necessity state. In most jurisdictions
  this is exempt from prior consent, but integrators should disclose the widget in their privacy
  policy. This is documented in the embed guide.
- **`window.OpenFlowWidget.boot()`** is exposed for integrators that want to gate load behind a
  consent banner: they include `<script>` with `data-autoload="false"`, and call `boot()` after
  user consent. When `data-autoload` is unset or `"true"`, the loader boots on script load.
- **No third-party analytics** ship in this phase. `openflow:telemetry` is a stub that
  `console.debug`s in dev and no-ops in prod.
- **Message content** is sent to `app.openflow.build`. Integrators should disclose this.

## Integrator documentation

### Canonical embed snippet

```html
<!-- Place in <head> or at the end of <body>. Always include `async`. -->
<script src="https://<tenant>-<agent>.live.openflow.build/script.js" async></script>

<!-- With version pin -->
<script src="https://<tenant>-<agent>.live.openflow.build/script.js"
        data-version="3" async></script>

<!-- Defer boot until consent -->
<script src="https://<tenant>-<agent>.live.openflow.build/script.js"
        data-autoload="false" async></script>
<script>
  onConsentGranted(() => window.OpenFlowWidget.boot());
</script>
```

The loader must tolerate being dynamically injected (no `document.currentScript`); see Loader
section.

### Content-Security-Policy requirements

Integrators who set CSP must include:

```
script-src  https://<tenant>-<agent>.live.openflow.build;
frame-src   https://<tenant>-<agent>.live.openflow.build;
connect-src https://app.openflow.build;
```

(Or the appropriate wildcard forms like `*.live.openflow.build` if they prefer.) The loader
detects a missing frame-src/connect-src by timing out on `openflow:ready` and logs a warning with
this checklist.

### Debug mode

Query the site with `?openflow_debug=1` **or** call `window.OpenFlowWidget.debug()` in the host
console to get:

```
OpenFlowWidget debug {
  version: '1.0.0',
  hostResolved: 'acme-customer-care',
  tenant: 'acme',
  agent: 'customer-care',
  iframeVersion: 5,
  iframeOrigin: 'https://acme-customer-care.live.openflow.build',
  proxyOrigin: 'https://app.openflow.build',
  ready: true,
  lastSseEvent: { type: 'text', ... },
  recentMessages: [...],  // last 10 postMessage events
}
```

On load, the loader *always* logs one line to `console.info` with its version. Saves support time.

## Local development

Without wildcard DNS on a laptop, the canonical hostname pattern can't resolve. The widget
supports a dev-mode override:

- Vite SPA dev server runs at `http://localhost:5173`. Parse hostname falls through; an
  override is read from:
  1. Query params `?tenant=acme&agent=customer-care`
  2. Env vars (only at build time): `OPENFLOW_DEV_TENANT`, `OPENFLOW_DEV_AGENT`.
- Loader dev mode: a `?dev=1` flag on the script URL switches the iframe target from
  `https://<host>/v/<v>` to `http://localhost:5173/?tenant=…&agent=…&v=<v>`.
- Next.js proxy in dev accepts `Origin: http://localhost:5173` (dev-only CORS allowlist
  extension, gated on `NODE_ENV !== 'production'`).

### One-command dev

`npm run dev` at the repo root uses `concurrently` to run:

1. `npm run dev -w packages/backend` (Express, port 4000)
2. `npm run dev -w packages/web` (Next.js, port 3101)
3. `npm run dev -w packages/widget` (Vite, port 5173)

Testing an embed: open `http://localhost:3101/widget-dev-host.html` — a minimal page in
`packages/web/public/` that loads the loader with `?dev=1`.

## Error handling

| Failure | Behavior |
|---|---|
| `latest-version` fetch fails | Render UI; disable input with "Initializing…"; retry every 3s up to 3 times; after that, inline error with "Retry" button |
| Execute POST fails (network) | Keep user message; show inline "Couldn't reach the assistant, retry" row; no state loss |
| SSE stream drops mid-message | Finalize whatever text accumulated; show banner; allow next turn |
| `error` SSE event | Same as mid-stream drop |
| `nodeError` SSE event | Rendered inline as a warning action-block; stream continues |
| Execute responds 404/410 | **Terminal** state: "This assistant is no longer available." Input is permanently disabled. Session is retained in IndexedDB but flagged `archived: true`. |
| IndexedDB unavailable | Transparent in-memory fallback (see Storage Partitioning). Telemetry event emitted. |
| Invalid subdomain (parse fails) | Standalone mode renders a branded "Agent not found" screen with OpenFlow branding (tenant info is unavailable when parse fails). Embedded mode stays in the bubble state with the bubble visually disabled; clicking shows a tooltip "Unavailable". |
| iframe never posts `openflow:ready` within 8s | Loader logs CSP-checklist warning to console. Bubble button click still attempts to open — panel will fail visibly (most likely a CSP or ad-blocker issue, making this the clearest diagnostic for the integrator). |

## Client-side misuse protection

- Textarea Enter-spam while a stream is in flight: input is disabled during `isStreaming`;
  Enter keypresses are no-ops. The current Copilot behavior is already this; preserve during port.
- Maximum user message length capped at 4000 characters (soft limit with inline counter at 3500+).
  Cheap guardrail; server will re-enforce in step 2.

## Testing

### Unit

- `parseHostname` — happy paths (hyphenated agent), reserved tenant, malformed, leading/trailing
  dashes, double dashes, uppercase input, trailing dot, host with port, non-ASCII
- Slug validators in `@openflow/shared-validation`
- Reserved-slug parity: read the migration SQL file and assert the `NOT IN (...)` list equals
  `RESERVED_TENANT_SLUGS` — fails CI if the two drift
- `randomUUID()` helper: returns v4-shaped value when `crypto.randomUUID` absent; returns
  shape-valid fallback when `getRandomValues` also absent
- `eventToBlock` mapper — every `PublicExecutionEvent` variant, including:
  - Consecutive `text` events same `nodeId` → single coalesced block
  - `text` events with alternating `nodeId` → multiple blocks
  - `node_visited` between `text` events → still coalesces if `nodeId` unchanged
  - `nodeError` mid-stream → warning block added, stream continues
- `useSessions` — write on user send, write on `done`, no writes mid-stream, IndexedDB→in-memory
  fallback, quota-exceeded path
- postMessage: loader rejects messages with wrong origin, wrong nonce, malformed shape

### Integration

- Mock catalog → `PublicExecutionEvent` generator → SSE reader → final `CopilotMessage[]` matches
  fixture
- Next.js proxy forwards SSE byte-for-byte, enforces CORS origin regex, returns 400 on tenant
  mismatch, handles preflight
- `POST /api/mock-execute/:slug/:version` produces a well-formed event stream ending in `done`
- `POST` to mock with unknown slug → 404 → widget shows terminal "not available" state

### Accessibility (automated)

- `axe-core` run against embedded and standalone layouts, 0 violations.
- Keyboard: open panel, Tab cycles, Escape closes, focus restores to trigger.
- Screen reader smoke test: VoiceOver on macOS reads message arrivals via the live region.

### Manual

- Embed the widget on a local test page, verify bubble ↔ panel resize
- Direct visit renders fullscreen chat
- Reload page, verify history dropdown lists prior sessions from IndexedDB
- Mobile (host viewport < 480 px): embedded panel goes fullscreen; bubble position correct
- `prefers-reduced-motion` enabled: no transitions
- Chrome, Firefox, Safari, Edge — latest two versions each
- Safari ITP / Firefox strict mode: in-memory fallback activates, chat still works, history
  dropdown shows "session-only" label
- CSP-enforced host page missing `frame-src`: 8s warning fires in console with checklist
- Ad-blocker (uBlock Origin with EasyList + EasyPrivacy): widget still loads

## Rollout

1. Merge shared-validation package + slug migration + backend mock routes + Next.js proxy
2. Merge `packages/widget` + build pipeline
3. Verify HTTP/2 on `app.openflow.build` and the chosen CDN
4. Deploy `packages/widget/dist/` to wildcard CDN (infra ticket separate)
5. Verify internally on `agent-example.live.openflow.build` with both embed and direct-visit modes
6. Full accessibility pass
7. Hand off Linear OF-2 for review (note the ~80 KB scope delta on the ticket)
8. Next step (separate spec): auth, real LLM wiring, remove mock route, dark mode and theming

## Decisions delegated to implementation plan

These are acknowledged but detailed choices go in the plan, not here:

- Exact location of the tenant-create handler in `packages/backend` (grep during implementation).
- Whether the slug-validation migration should normalize existing rows or abort; default is
  abort-and-report.
- The specific CDN provider (Cloudflare Pages vs Vercel Edge vs S3 + CloudFront).
- Whether iframe SPA chunks are preloaded when the bubble mounts (latency vs. bandwidth
  trade-off); default is lazy (load on first bubble click) with `<link rel="prefetch">` hinting.
- Exact tool-name → icon mapping for the `toolCall` → action block adapter; start with a small
  whitelist and fall back to a generic "cog" icon.

## Acknowledged best-practice patterns

- **Loader versioning:** unversioned `script.js`, backward-compatible forever; SPA versioned
  behind `data-version`. Matches Intercom/Drift.
- **Iframe isolation over Shadow DOM:** chosen for full CSP/style isolation in exchange for
  ~80ms of iframe bootup on first paint. A Shadow-DOM-bubble + iframe-panel hybrid (as Intercom
  runs) is a future optimization, not this phase.
- **Telemetry sink:** stub in phase 1, plan step 2 integration point at `openflow:telemetry`
  receiver.
