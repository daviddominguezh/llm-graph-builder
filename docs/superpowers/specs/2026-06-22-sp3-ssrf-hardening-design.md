# Sub-project 3 — SSRF hardening + discovery-error redaction (MCP discovery path)

**Date:** 2026-06-22
**Status:** Design — SETTLED. All open decisions resolved (see "Resolved decisions"). Plan: `docs/superpowers/plans/2026-06-22-sp3-ssrf-hardening.md`.
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

## Resolved decisions (SETTLED)

All five open decisions are now resolved. The choices below are binding for the implementation plan.

1. **Guard location — defense-in-depth (decision a).** A cheap literal-host check at the web proxy (`packages/web/app/api/mcp/discover/route.ts`, Layer 1) PLUS an authoritative DNS-resolving guard at the backend discover route (`packages/backend/src/routes/discover.ts`, Layer 2). The same Layer-2 guard is extended to the runtime `ensureSession` connect path **in SP3** — wired in the backend by threading a guarded `createTransport` through `composeRegistry` → `buildMcpProvider`, NOT inside the api package. The api transport layer is **disqualified** for the DNS guard by `createTransport.ts:7-19` (webpack bundles api into web; it cannot import `node:dns`).
2. **Policy — hard-block ALL private/internal addresses now (decision b).** Block loopback/`localhost`, `169.254.0.0/16` (IMDS), all RFC-1918 ranges, IPv6 link-local/ULA, IPv4-mapped variants, and non-`http(s)` schemes. Validate **every** resolved IP (anti-rebinding — block if any is private). The guard takes an **injectable allowlist param that is EMPTY for now**; the self-hosted-internal allowlist policy/UI is explicitly deferred.
3. **Timeout — 8s total discovery budget (decision c).** A single dedicated total budget for discover (connect+list), distinct from the existing 30s per-request transport timeout `DEFAULT_REQUEST_TIMEOUT_MS` (`transport.ts:51`, unchanged).
4. **Error categories — closed 9-category enum (decision d).** `blocked | dns | timeout | tls | auth | client_error | server_error | protocol | unknown`. Backend returns ONLY `{ errorCategory }` and NEVER `.message`, URL, headers, or body. Copy is static i18n looked up client-side from the category.
5. **Build dedicated util (decision e).** New `packages/backend/src/lib/egressGuard.ts` + the `ipaddr.js` dependency for range checks. There is NO reusable util (the `http_request` "private IPs blocked" claim is unbacked copy — schema/description only, no handler, not registered). `resolveAndAssertEgress` is designed so a future `http_request` handler can share it. The repeated `AbortController`+`setTimeout` pattern (`httpTransport.ts:92-109`, `sseTransport.ts:79-97`) is extracted into a `withAbortTimeout` util used by the 8s budget.

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
- **Runtime path (SETTLED — ships in SP3):** the same Layer-2 `resolveAndAssertEgress` guards the agent runtime connect path, wired entirely in backend code. The api package exposes a `createTransport` override seam all the way down: `composeRegistry({ ..., createTransport? })` (`registry.ts:212`) → `freezeProviders` → `buildMcpProvider(s, { createTransport })` (`buildMcpProvider.ts:208`, `registry.ts:182`) → `buildDefaultDeps(createTransport)` → `EnsureSessionDeps.createTransport` (used by `freshConnect`/`reattachSession`, `ensureSession.ts:68,86`). The backend (`simulationProviderCtx.ts:54`, `agents/getRegistry.ts:85`) builds a `guardedCreateTransport: CreateTransportFn` that `await resolveAndAssertEgress(extractServerUrl(server))` THEN delegates to the api's real `createTransport(server)`. `node:dns` stays in the backend `egressGuard.ts`; the api package is untouched except for adding the optional `createTransport` field to `ComposeRegistryArgs` and re-exporting `CreateTransportFn`/`extractServerUrl`/the wire `McpTransport` type. stdio servers have an empty URL → guard is a no-op (URL `''` → skip), matching existing `extractServerUrl` behavior.

### Egress guard module (new)

`packages/backend/src/lib/egressGuard.ts` (Node-only; backend already imports node builtins):

- `assertSchemeAndLiteralHost(rawUrl, allowlist?): void` — pure, no DNS, no `node:net`. Parses URL; throws `EgressBlockedError('scheme')` for non-`http(s)`; rejects the `localhost` literal; if host is a literal IP (classified via `ipaddr.js`, which covers IPv4/IPv6/IPv4-mapped/octal-decimal normalization), throws `EgressBlockedError('blocked')` when it falls in any denied range. Because it avoids `node:net`/`node:dns`, **the same function (or a small sibling) is importable at the web Layer-1 pre-check** — the web proxy uses `ipaddr.js` (a pure-JS dep) for literal classification, no Node builtins.
- `resolveAndAssertEgress(rawUrl, allowlist?): Promise<void>` — calls the literal/scheme check, then `dns.lookup(host, { all: true, verbatim: true })`, then asserts **every** returned address is public via `assertPublicIp`. Resolves to `void` on success; throws `EgressBlockedError('blocked')` on any private resolved IP, `EgressDnsError('dns')` on `ENOTFOUND`/`EAI_AGAIN`.
- Denied ranges (closed list): `0.0.0.0/8`, `127.0.0.0/8` (loopback), `169.254.0.0/16` (link-local incl. IMDS), `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC-1918), `::1`, `fc00::/7` (ULA), `fe80::/10` (IPv6 link-local), IPv4-mapped IPv6 of the above, and `localhost` literal. Range checks use `ipaddr.js` (`parse` + `range()` / `match`), not hand-rolled CIDR math.
- **Injectable allowlist param (`allowlist: string[]`), defaults `[]`** — an IP/host the caller explicitly permits even if it falls in a denied range. EMPTY for SP3 (the self-hosted-internal policy is deferred). This is the seam where a future `OpenFlow infrastructure`/self-hosted toggle plugs in.
- Allowed schemes: `http`, `https` only.

**Shared `withAbortTimeout` util.** The 8s discovery budget and the existing per-request transport timeouts share one helper: `withAbortTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T>` — creates an `AbortController`, `setTimeout`→`abort()`, `clearTimeout` in `finally`. SP3 introduces it (in `packages/api/src/providers/mcp/transport/` so both packages can use it) and uses it for the discover budget. Refactoring `httpTransport.ts:92-109` / `sseTransport.ts:79-97` onto it is a mechanical follow-up; SP3 ships the util + the discover-budget use, and may opt to refactor the two transports in the same pass if it stays green.

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

All 9 categories are kept (decision d, settled). The backend response shape becomes `{ errorCategory: DiscoveryErrorCategory }` (no `error` free-text). `parseDiscoverError`/`api.ts` and `useMcpServers.ts` map the category → i18n copy; SP4 persists the **category enum**, never a string.

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
- **End-to-end shape:** `useMcpServers` toast (`useMcpServers.ts:201`) renders the **i18n category copy** via the category→key map, never the raw message; new i18n keys added for every category. NOTE: the web app is single-locale today (next-intl with one `packages/web/messages/en.json`; `app/i18n/request.ts` hardcodes `locale: 'en'`), so "all locales" = `en.json` only — but the keys must be added there.
- **Regression:** a legitimate public MCP server still discovers tools; runtime agent MCP (SP0 path) unaffected when guard added to `ensureSession` (public host passes).

## Open decisions

**None — all five (a–e) are resolved.** See "Resolved decisions" above. The historical recommendations matched the final calls verbatim: (a) defense-in-depth incl. runtime path, (b) hard-block now with empty injectable allowlist, (c) 8s total budget, (d) keep all 9 categories, (e) build dedicated `egressGuard.ts` with `ipaddr.js`.

## Out of scope

- Per-tenant MCP config / matrix UI / discovery status + publish gate (SP4) — SP3 only changes the **error shape** (category enum) that SP4 will persist.
- Building the `http_request` tool handler (only schema/description exist today); SP3 just makes the egress util reusable for it later.
- Inbound proxy-trust / rate limiting (`trustProxyAssertion.ts`, `httpRequestService.checkRateLimit` interface) — unrelated.
- Server-side full-log redaction beyond dropping headers from `discover.ts:48` (flagged, low risk).
- DNS-pin-the-connect hardening if it requires a custom fetch dispatcher and proves heavy — may be documented as residual risk rather than implemented (decision a sub-point).
