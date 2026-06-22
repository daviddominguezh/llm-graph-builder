# Sub-project 3 — SSRF hardening + discovery-error redaction (MCP discovery path)

**Date:** 2026-06-22
**Status:** Design — pending user review (Open decisions block below needs input before plan/build)
**Parent:** `2026-06-20-tenant-scoped-mcp-OVERVIEW.md` (see "Sub-project 3")
**Depends on:** SP0 (agent MCP runtime fix) — done.
**Amplified by:** SP4 (per-tenant "Verify all" fans out to N tenants × M servers live calls).

## Problem

A tenant supplies the MCP server URL (and headers) for discovery and runtime. Today that URL is handed straight to `fetch` with **no egress validation**. A tenant-controlled URL can therefore make our **server** issue requests to internal endpoints:

- cloud metadata (`http://169.254.169.254/...` — IMDS, can yield instance credentials),
- loopback / `localhost` (admin panels, unauthenticated internal services),
- RFC-1918 private ranges (`10/8`, `172.16/12`, `192.168/16`) and link-local,
- non-`http(s)` schemes (`file:`, `gopher:`, etc. — though Zod + `fetch` already narrow this somewhat).

Second, **discovery errors are reflected verbatim** to the client (and SP4 will *persist* them as `discovery_error`). The raw upstream error string can carry the resolved URL, request headers, or the response body — any of which may contain **resolved secrets** (a tenant env var interpolated into the URL/header, or a server echoing an `Authorization` value back in an error body). This is a credential-leak channel into both toasts and (SP4) stored rows.

SP0's "Known divergences" explicitly deferred this: *"SSRF surface (http/sse) opens on the agent path … Hardening is SP3"* (`2026-06-20-sp0-agent-mcp-runtime-fix-design.md:87`). This sub-project is an orthogonal security fix, shippable standalone.

## Decisions (proposed — see Open decisions for the ones needing sign-off)

1. **Egress guard is a new, dedicated util** (there is no existing one to reuse — see Current state #4). It exposes a pure `assertEgressAllowed(url): void` (throws a typed `EgressBlockedError` with a *category*, never the URL) plus an async `resolveAndAssert(url)` that does DNS resolution and re-checks resolved IPs (DNS-rebinding defense).
2. **Guard lives at the backend discover path (Node-only), defense-in-depth with a cheap literal-URL pre-check at the web proxy.** Rationale below (Open decision a) — the DNS-resolving guard needs `node:dns`/`node:net`, which the api transport layer is explicitly forbidden from importing (`createTransport.ts:7-19`). The backend is the single Node choke point both discovery and (post-SP0) runtime sessions funnel through.
3. **Error redaction is a closed-set classifier** mapping any thrown error → one of a fixed enum of categories, each with **static** user copy. The classifier never interpolates `error.message`, the URL, headers, or the response body.
4. **Outbound budget:** a dedicated connect+total timeout for discovery, distinct from the per-request `DEFAULT_REQUEST_TIMEOUT_MS = 30s` (`transport.ts:51`). Discovery is interactive; the budget is shorter (proposed 8s total — Open decision c).

## Current state (verified, file:line)

1. **Web discovery proxy** — `packages/web/app/api/mcp/discover/route.ts`:
   - Auth-gates (`:64-70`), resolves `{{VAR}}` (`:44-46`) and OAuth headers (`:48-51`), then **proxies to backend** `POST ${API_URL}/mcp/discover` with `{ transport }` (`:53-57`).
   - **Echoes upstream verbatim:** `const data = await upstream.json(); return NextResponse.json(data, { status: upstream.status })` (`:59-60`). No egress check, no redaction — whatever the backend returns (including a raw `{ error }` string) is passed through.

2. **Backend discover route** — `packages/backend/src/routes/discover.ts`:
   - `handleDiscover` (`:59-71`): parses transport (`:62`), `discoverFromTransport` (`:63`), and on any throw does `const message = err instanceof Error ? err.message : 'Unknown error'` → `res.status(400).json({ error: message })` (`:67-69`). **Raw `err.message` is the response body** — this is the leak origin.
   - `discoverFromTransport` (`:31-45`): `createTransport(...)` → `connectMcp({ transport })` → `handle.listTools()`. **No egress guard, no discovery-specific timeout** (inherits the transport's 30s per-request only).
   - `logRequest` (`:47-49`) writes the **full request body to stdout** including transport URL/headers — separate (server-side log) concern; flag for review but lower priority than client/persisted leaks.

3. **Transport / session layer** — `packages/api/src/providers/mcp/transport/*`, `providers/mcp/*`:
   - `createTransport(server, options)` (`createTransport.ts:21-30`) is the **shared synchronous factory**: dispatches `http`→`createHttpTransport`, `sse`→`createSseTransport`, and **throws on `stdio`** (`:25-29`, "not supported via the Provider abstraction"). Called by **both** discovery (`discover.ts:32`) and runtime via `defaultCreateTransport` (`ensureSession.ts:11,68,86`).
   - **Critical constraint:** `createTransport.ts:7-19` documents that this module must NOT pull `node:child_process` (and by extension `node:dns`/`node:net`) into the api import graph, because **webpack bundles the api package into the web build**. A DNS-resolving guard cannot live here.
   - The actual outbound `fetch` happens in `httpTransport.ts:98` (`performFetch`) / `sseTransport.ts:86` (`postBody`); both already wrap an `AbortController` with `options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS` (30s). The URL (`config.url`) is passed straight to `fetch` — **no validation**.
   - `ensureSession`/`freshConnect` (`ensureSession.ts:62-78`) and `connectMcp` (`client/mcpClient.ts:84-87`) open the connection; `freshConnect` (after `createTransport`) is the natural runtime choke point if we want defense-in-depth on the agent path too.

4. **Existing http_request SSRF precedent — DOES NOT EXIST as enforced code.** The tool *description* claims it: *"Requests to private IP ranges and OpenFlow infrastructure are blocked"* (`packages/api/src/tools/httpRequestToolDescription.ts:6`). But the only `http_request` files in source are `httpRequestToolSchemas.ts` and `httpRequestToolDescription.ts` — **schema + copy, no handler**. `httpRequestService.ts` is an **interface only** (`resolveSecret`, `checkRateLimit`) with **zero source callers**. Repo-wide grep for `169.254` / `isPrivate` / `127.0.0` / `private IP` in `api/src`, `backend/src`, and `supabase/functions` finds **no IP-range enforcement anywhere** (the only `trustProxyAssertion.ts` hit is unrelated — inbound proxy trust). **Conclusion: there is no SSRF util to reuse; the description is aspirational/unbacked. SP3 must build the guard from scratch** (and should arguably wire it into `http_request` too when that tool's handler lands — out of scope here, but the util should be designed for that reuse).

5. **Where discovery errors are shown / will be persisted:**
   - `packages/web/app/lib/api.ts`: `parseDiscoverError` (`:35-39`) reads the backend `{ error }` string and `discoverMcpTools` throws `new Error(message)` with it verbatim (`:62-63`).
   - `packages/web/app/hooks/useMcpServers.ts:198-201`: `.catch` → `toast.error(\`Failed to discover tools: ${msg}\`)` — **raw upstream message interpolated into a user-visible toast.**
   - `packages/web/app/hooks/useMcpDiscovery.ts:95-97`: swallows the error to a `'error'` status (no message) — fine as-is.
   - SP4 adds a stored `discovery_error` column — redaction must happen **before** both the toast and the persist, i.e. at the backend boundary, so every consumer gets only the category.

## Architecture

### Where the guard + timeout live (defense-in-depth)

```
Browser
  │  POST /api/mcp/discover  { transport, variableValues, orgId, libraryItemId }
  ▼
web proxy (route.ts)                       [LAYER 1 — cheap, pre-resolution]
  • assertSchemeAndLiteralHost(transport.url)
    → reject non-http(s); reject literal-IP loopback/169.254/RFC-1918/localhost
    (fast fail before we even resolve {{VAR}} or call the backend)
  • on block: return { errorCategory: 'blocked' } (static), status 400 — do NOT proxy
  ▼  (variableValues already resolved here; backend receives the final URL)
backend (discover.ts)                       [LAYER 2 — authoritative, DNS-aware]
  • resolveAndAssertEgress(finalUrl)
    → dns.lookup(host, {all:true}); assert EVERY resolved A/AAAA is public
      (DNS-rebinding + hostnames that resolve to private space)
    → reject non-http(s) scheme again (post-resolution defense-in-depth)
  • runDiscoveryWithBudget(transport, { totalTimeoutMs })   ← new outbound budget
  • catch → classifyDiscoveryError(err) → { errorCategory } STATIC only
  ▼
createTransport → connectMcp → listTools   (api package — unchanged; no node:dns here)
```

- **Layer 1 (web, `route.ts`):** synchronous, no DNS — pure URL parse. Blocks the obvious literal-IP/scheme attacks before the request leaves the Next.js process and before secret interpolation. Cheap, and means the backend isn't the only line of defense.
- **Layer 2 (backend, `discover.ts`):** the authoritative guard. Does `dns.lookup` and validates **all resolved IPs** (defeats `myhost.evil.com → 169.254.169.254` rebinding). This is where `node:dns`/`node:net` are allowed. Wrap `discoverFromTransport` in a new `runDiscoveryWithBudget` that races a total-timeout abort.
- **Runtime path (optional, Open decision a):** add `resolveAndAssertEgress` in `freshConnect`/`reattachSession` (`ensureSession.ts`) **in the backend execute path**, not in the api package — i.e. inject it via the existing `EnsureSessionDeps.createTransport` seam or a sibling guard call in the backend session wiring. Keeps `node:dns` out of api/web bundles.

### Egress guard module (new)

`packages/backend/src/lib/egressGuard.ts` (Node-only; backend already imports node builtins):

- `assertSchemeAndLiteralHost(rawUrl): void` — pure, no DNS. Parses URL; throws `EgressBlockedError('scheme')` for non-`http(s)`; if host is a literal IP (`net.isIP`), throws `EgressBlockedError('blocked')` when it falls in any denied range. **Safe to also export a web-importable variant** if it avoids `node:net` (use a small regex/ipaddr.js for literal classification) — see Open decision e.
- `resolveAndAssertEgress(rawUrl): Promise<void>` — calls the literal check, then `dns.lookup(host, { all: true, verbatim: true })`, then asserts **every** returned address is public via `assertPublicIp`.
- Denied ranges (closed list): `0.0.0.0/8`, `127.0.0.0/8` (loopback), `169.254.0.0/16` (link-local incl. IMDS), `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC-1918), `::1`, `fc00::/7` (ULA), `fe80::/10` (IPv6 link-local), IPv4-mapped IPv6 of the above, and `localhost` literal. Plus an explicit `OpenFlow infrastructure` host denylist hook (the description's promise) — config-driven, defaults empty.
- Allowed schemes: `http`, `https` only.

### Error-category taxonomy (closed set)

A single classifier `classifyDiscoveryError(err): DiscoveryErrorCategory` returning **only** the enum; copy is looked up client-side (i18n) from the category, never built from `err`.

| category | trigger | static user copy (i18n key) |
|---|---|---|
| `blocked` | `EgressBlockedError` (any range/scheme/denylist hit) | "This server's address is not allowed." |
| `dns` | DNS resolution failure (`ENOTFOUND`/`EAI_AGAIN`) | "Could not resolve the server's address." |
| `timeout` | abort / total-budget exceeded | "The server did not respond in time." |
| `tls` | TLS/cert errors (`ERR_TLS_*`, `CERT_*`, `DEPTH_ZERO_SELF_SIGNED_CERT`) | "Could not establish a secure connection." |
| `auth` | upstream HTTP 401/403 (incl. `SessionExpiredError` mapped from 401) | "The server rejected the credentials." |
| `client_error` | other 4xx | "The server rejected the request." |
| `server_error` | upstream 5xx | "The server returned an error." |
| `protocol` | reached server but reply unusable (`McpError`/invalid JSON-RPC/no tools) | "The server is not a valid MCP endpoint." |
| `unknown` | anything unclassified (fallback) | "Discovery failed." |

(Whether `client_error`/`server_error`/`protocol` collapse into fewer buckets is Open decision d.) The backend response shape becomes `{ errorCategory: DiscoveryErrorCategory }` (no `error` free-text). `parseDiscoverError`/`api.ts` and `useMcpServers.ts` map the category → i18n copy; SP4 persists the **category enum**, never a string.

## Error handling / edge cases

- **DNS returns multiple records, mixed public/private:** block if *any* is private (strict). A server legitimately multi-homed across public+private should be re-pointed at its public name; we do not cherry-pick a public record (that's exactly the rebinding bypass).
- **Hostname resolves to a public IP at check time, private at connect time (TOCTOU rebinding):** mitigated by Layer-2 resolving immediately before connect and, if feasible, pinning the resolved IP for the connect (Open decision a). Full pinning may require a custom `fetch` agent/lookup; if deferred, document residual risk.
- **IPv4-mapped IPv6 (`::ffff:10.0.0.1`) / octal-decimal IP obfuscation (`0177.0.0.1`):** normalize via `net.isIP` + `ipaddr.js` before range-checking; reject anything that doesn't normalize.
- **`stdio` transport:** `createTransport` already throws (`createTransport.ts:25`); discovery surfaces it — classify as `protocol`/`unknown` with static copy (currently it leaks the raw "Unsupported transport type…" message — redaction fixes that too).
- **OAuth/`{{VAR}}` resolution failure:** unchanged behavior, but the resulting error must also pass through the classifier (no leaking of resolve internals).
- **Backend stdout log (`discover.ts:48`):** decide whether to redact the URL/headers there too (server-side log, lower risk) — at minimum drop `transport.headers` from the logged body.
- **Empty/zero tools after a clean connect:** not an error — `{ tools: [] }` (unchanged).

## Testing

- **Egress guard (backend unit):** for **each** denied range a representative literal is blocked → `EgressBlockedError('blocked')`: `127.0.0.1`, `localhost`, `169.254.169.254`, `10.1.2.3`, `172.16.0.1`, `192.168.1.1`, `::1`, `fe80::1`, `fc00::1`, `::ffff:127.0.0.1`, `0177.0.0.1`. Each non-`http(s)` scheme blocked: `file:`, `ftp:`, `gopher:`, `data:`, `ws:`. Public hosts pass: `1.1.1.1`, `example.com` (mock `dns.lookup` → public). **DNS-rebinding:** hostname whose mocked `dns.lookup` returns `169.254.169.254` (and the mixed public+private case) is blocked. OpenFlow-denylist host blocked when configured.
- **Redaction (the security payoff — must prove no leak):** drive `classifyDiscoveryError` with crafted errors whose `.message` contains a secret/URL (e.g. `Error('connect ECONNREFUSED https://user:s3cr3t@10.0.0.5/path')`, a 401 body echoing `Authorization: Bearer abc`, a TLS error string with the internal hostname). Assert the returned object **equals** `{ errorCategory: <expected> }` and that a serialized response **does not contain** the URL, host, header value, secret substring, or `.message`. Snapshot the full HTTP response body for each category and assert it is exactly the static set.
- **Timeout/budget:** mock a transport that never resolves → `runDiscoveryWithBudget` aborts within the budget and classifies `timeout`.
- **Web proxy (Layer 1):** literal-IP/scheme requests are rejected at `route.ts` without proxying (assert backend `fetch` not called); allowed URLs proxy through.
- **End-to-end shape:** `useMcpServers` toast renders the **i18n category copy**, never the raw message; new i18n keys added for every category.
- **Regression:** a legitimate public MCP server still discovers tools; runtime agent MCP (SP0 path) unaffected when guard added to `ensureSession` (public host passes).

## Open decisions (need user input)

**(a) WHERE the guard lives.** Web proxy only / backend only / api transport / defense-in-depth.
→ **Recommendation: defense-in-depth — cheap literal check at the web proxy (Layer 1) + authoritative DNS-resolving guard at the backend discover route (Layer 2), and extend Layer 2 to the runtime `ensureSession` path (in backend wiring, not the api package).** The api transport layer is **disqualified** for the DNS guard by `createTransport.ts:7-19` (no `node:dns`/`node:net` — it's bundled into web). Backend is the single Node choke point; the web pre-check fails fast and adds a second line. Decide whether runtime-path coverage ships in SP3 or is split out (recommend: include it — same util, small surface, closes the SP0-flagged agent egress hole).

**(b) Hard-block all private ranges vs org-configurable allowlist for self-hosted internal MCPs.**
→ **Recommendation: hard-block by default now; design the util with an injectable allowlist param but ship it empty.** Self-hosted-internal is a real future need, but an org-level "allow 10.x" toggle is a footgun (one tenant in the org reaching another's internal net) and is entangled with SP4 tenant isolation. Defer the allowlist UI/policy to a follow-up; don't block SP3 on it.

**(c) Outbound timeout value.**
→ **Recommendation: 8s total discovery budget** (connect+list), separate from the 30s per-request transport default. Discovery is interactive (a user waiting on a toast), and SP4's "Verify all" multiplies the cost N×M — a tight budget bounds the fan-out. Make it a single constant; revisit if real servers need more.

**(d) Exact error-category set.**
→ **Recommendation: ship the 9-category set above**, but accept collapsing `client_error`+`auth` is unwise (auth is actionable: "fix credentials") — keep `auth` separate. `protocol` vs `unknown` could merge; recommend keeping `protocol` because it's the actionable "not an MCP server" signal. Final call: keep all 9; the cost is just i18n keys.

**(e) Reuse existing http_request SSRF util vs build dedicated.**
→ **Recommendation: build dedicated — there is nothing to reuse.** Verified: `http_request` has only schema+description, no handler, and **no IP-range enforcement exists anywhere in source** (#4 above); the description's "private IP ranges … blocked" is unbacked copy. Build `egressGuard.ts` as a standalone, well-tested util and design it so the (future) `http_request` handler can import the same `resolveAndAssertEgress`. Use a vetted lib (`ipaddr.js`) for range/normalization rather than hand-rolled CIDR math.

## Out of scope

- Per-tenant MCP config / matrix UI / discovery status + publish gate (SP4) — SP3 only changes the **error shape** (category enum) that SP4 will persist.
- Building the `http_request` tool handler (only schema/description exist today); SP3 just makes the egress util reusable for it later.
- Inbound proxy-trust / rate limiting (`trustProxyAssertion.ts`, `httpRequestService.checkRateLimit` interface) — unrelated.
- Server-side full-log redaction beyond dropping headers from `discover.ts:48` (flagged, low risk).
- DNS-pin-the-connect hardening if it requires a custom fetch dispatcher and proves heavy — may be documented as residual risk rather than implemented (decision a sub-point).
