# SP3 — SSRF hardening + discovery-error redaction — Implementation Plan

> For agentic workers: execute this plan with **superpowers:subagent-driven-development**. Each `### Task N` is one TDD unit (failing test → RED → implement → GREEN → commit). Do not skip the RED step. Stage files explicitly; the controller owns merges.

**Goal:** Stop tenant-supplied MCP URLs from making the server reach internal/private addresses (SSRF), and stop verbatim discovery errors from leaking resolved secrets/URLs/headers to the client (and SP4's persisted rows). Defense-in-depth: a cheap literal-host check at the web proxy + an authoritative DNS-resolving guard at the backend, extended to the agent runtime connect path. Errors collapse to a closed 9-category enum with static i18n copy.

**Architecture:**
- **Layer 1 (web, `packages/web/app/api/mcp/discover/route.ts`):** synchronous literal-host + scheme pre-check using `ipaddr.js` (pure JS, no Node builtins). Blocks obvious literal-IP/scheme attacks before proxying; returns `{ errorCategory: 'blocked' }`, never proxies on block.
- **Layer 2 (backend, `packages/backend/src/lib/egressGuard.ts`):** authoritative `resolveAndAssertEgress` — `dns.lookup({all:true})` then asserts EVERY resolved IP is public (anti-rebinding). Wired into `discover.ts` (with an 8s budget via `withAbortTimeout`) and into the agent runtime connect path by threading a `guardedCreateTransport` through `composeRegistry` → `buildMcpProvider` → `EnsureSessionDeps.createTransport`.
- **Redaction:** `classifyDiscoveryError(err) → DiscoveryErrorCategory`; backend returns ONLY `{ errorCategory }`. Web maps category → static i18n copy in the toast.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), Node `node:dns`, `ipaddr.js` (NEW dep), Jest (`--experimental-vm-modules`) for backend, Next.js 16 / next-intl (single locale) for web, Express 5 backend, `@daviddh/llm-graph-runner` (api package) for transports.

## Global Constraints

Binding on EVERY task:

- **TS strict**, `noUncheckedIndexedAccess` on. **Never `any`** — use explicit types. Never disable ESLint (strict `eslint-config-love`); never add `eslint-disable` comments or edit config.
- **ESLint limits:** `max-lines-per-function` 40, `max-lines` 300/file, `max-depth` 2. When near a limit, extract named helpers / split files — never compress statements onto one line.
- **ESM:** all relative imports end in `.js` (NodeNext). Prettier: single quotes, 2-space, 110 width, trailing comma es5.
- **New dependency:** `ipaddr.js` is NOT installed. Add it to `packages/backend/package.json` (Task 1) and `packages/web/package.json` (Task 6) `dependencies`, then `npm install` at the repo root. Add `@types/ipaddr.js` as a dev dep if `ipaddr.js` ships no types (verify; recent versions bundle their own `.d.ts`).
- **Tests:** backend — `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest <pattern>`. Web — `cd packages/web && npx jest <pattern>` (or the web `test` script if present; if web has no jest setup, use a `*.test.ts` runnable via the web `lint`/`typecheck` + a node-runnable unit test — verify web test runner before Task 6 and adapt).
- **i18n:** add the error-category copy to ALL locales. The web app is single-locale today (next-intl, one `packages/web/messages/en.json`, `app/i18n/request.ts` hardcodes `locale: 'en'`) — so "all locales" = `en.json`. Add every category key there.
- **Format-clean commits:** run `npm run check` (or per-package `format`+`lint`+`typecheck`) before each commit. Stage files explicitly (`git add <path>`); NEVER `git commit -a`/`-am`.
- **No leak invariant (the security payoff):** the backend discover response and any persisted value MUST be exactly `{ errorCategory: <enum> }` — never `.message`, the URL, host, header value, or response body. Tests assert this by serializing the response and asserting the secret substring is absent.

---

### Task 1: `egressGuard.ts` — pure IP/range/scheme classifier + `EgressBlockedError`

Build the synchronous, no-DNS core: scheme check, literal-host classification via `ipaddr.js`, and the typed blocked error. This is the reusable kernel a future `http_request` handler can share.

**Files:**
- CREATE `packages/backend/src/lib/egressGuard.ts`
- CREATE `packages/backend/src/lib/__tests__/egressGuard.test.ts`
- EDIT `packages/backend/package.json` (add `ipaddr.js` dependency)

**Interfaces (exact signatures):**

```ts
// egressGuard.ts
export type EgressBlockReason = 'scheme' | 'blocked';

export class EgressBlockedError extends Error {
  readonly reason: EgressBlockReason;
  constructor(reason: EgressBlockReason);
}

export class EgressDnsError extends Error {
  constructor();
}

/** Pure, no DNS, no node:net. Throws EgressBlockedError on a bad scheme or a
 *  literal host that resolves (textually) into a denied range / localhost. */
export function assertSchemeAndLiteralHost(rawUrl: string, allowlist?: readonly string[]): void;
```

**Steps:**

- [ ] Add the dependency. Edit `packages/backend/package.json` `dependencies` to include `"ipaddr.js": "^2.1.0"` (keep alphabetical order — between `ioredis` and `jose`). Then run, from repo root:
  ```bash
  npm install
  ```
  Expected: `package-lock.json` updates; `node -e "require('ipaddr.js')"` (from `packages/backend`) does not throw. Verify types: `ls packages/backend/node_modules/ipaddr.js/*.d.ts` — if absent, also add `"@types/ipaddr.js"` to `devDependencies` and re-run `npm install`.

- [ ] **RED.** Write `packages/backend/src/lib/__tests__/egressGuard.test.ts` covering `assertSchemeAndLiteralHost`. One `it` per blocked literal host, one per blocked scheme, one per allowed public host, plus the allowlist override:
  ```ts
  import { describe, expect, it } from '@jest/globals';
  import { EgressBlockedError, assertSchemeAndLiteralHost } from '../egressGuard.js';

  const BLOCKED_HOSTS = [
    '127.0.0.1', 'localhost', '169.254.169.254', '10.1.2.3', '172.16.0.1',
    '192.168.1.1', '0.0.0.0', '[::1]', '[fe80::1]', '[fc00::1]',
    '[::ffff:127.0.0.1]', '0177.0.0.1',
  ];
  const BLOCKED_SCHEMES = ['file', 'ftp', 'gopher', 'data', 'ws'];
  const PUBLIC_HOSTS = ['1.1.1.1', '8.8.8.8', 'example.com', '[2606:4700:4700::1111]'];

  describe('assertSchemeAndLiteralHost', () => {
    it.each(BLOCKED_HOSTS)('blocks literal host %s', (host) => {
      expect(() => assertSchemeAndLiteralHost(`http://${host}/x`)).toThrow(EgressBlockedError);
    });
    it.each(BLOCKED_SCHEMES)('blocks %s scheme', (scheme) => {
      expect(() => assertSchemeAndLiteralHost(`${scheme}://example.com/x`)).toThrow(EgressBlockedError);
    });
    it.each(PUBLIC_HOSTS)('allows public host %s', (host) => {
      expect(() => assertSchemeAndLiteralHost(`https://${host}/x`)).not.toThrow();
    });
    it('does not throw for a denied IP that is on the allowlist', () => {
      expect(() => assertSchemeAndLiteralHost('http://10.1.2.3/x', ['10.1.2.3'])).not.toThrow();
    });
    it('sets reason=scheme for a bad scheme and reason=blocked for a bad host', () => {
      try { assertSchemeAndLiteralHost('file://example.com'); } catch (e) {
        expect((e as EgressBlockedError).reason).toBe('scheme');
      }
      try { assertSchemeAndLiteralHost('http://127.0.0.1'); } catch (e) {
        expect((e as EgressBlockedError).reason).toBe('blocked');
      }
    });
  });
  ```
  Run:
  ```bash
  cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest egressGuard
  ```
  Expected: FAILS — `Cannot find module '../egressGuard.js'`.

- [ ] **Implement.** Create `packages/backend/src/lib/egressGuard.ts`. Use `ipaddr.js` for classification; keep each function ≤40 lines (extract `classifyIp`, `isDeniedRange`, `parseHostFromUrl` helpers). Sketch:
  ```ts
  import ipaddr from 'ipaddr.js';

  export type EgressBlockReason = 'scheme' | 'blocked';
  const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
  // ipaddr.js range names that are non-public (IPv4 + IPv6):
  const DENIED_RANGES = new Set([
    'unspecified', 'loopback', 'private', 'linkLocal', 'uniqueLocal',
    'carrierGradeNat', 'reserved', 'broadcast',
  ]);

  export class EgressBlockedError extends Error {
    readonly reason: EgressBlockReason;
    constructor(reason: EgressBlockReason) {
      super('Egress blocked'); // static message — never embed URL/host
      this.name = 'EgressBlockedError';
      this.reason = reason;
    }
  }
  export class EgressDnsError extends Error {
    constructor() { super('DNS resolution failed'); this.name = 'EgressDnsError'; }
  }

  function isPublicIp(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
    let a = addr;
    if (a.kind() === 'ipv6' && (a as ipaddr.IPv6).isIPv4MappedAddress()) {
      a = (a as ipaddr.IPv6).toIPv4Address();
    }
    return !DENIED_RANGES.has(a.range());
  }

  export function assertIpAllowed(ipText: string, allowlist: readonly string[] = []): void {
    if (allowlist.includes(ipText)) return;
    if (!ipaddr.isValid(ipText)) throw new EgressBlockedError('blocked');
    if (!isPublicIp(ipaddr.parse(ipText))) throw new EgressBlockedError('blocked');
  }

  export function assertSchemeAndLiteralHost(rawUrl: string, allowlist: readonly string[] = []): void {
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new EgressBlockedError('scheme'); }
    if (!ALLOWED_SCHEMES.has(url.protocol)) throw new EgressBlockedError('scheme');
    const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    if (allowlist.includes(host)) return;
    if (host.toLowerCase() === 'localhost') throw new EgressBlockedError('blocked');
    if (ipaddr.isValid(host)) assertIpAllowed(host, allowlist);
    // non-literal hostnames pass here; DNS-resolving guard re-checks (Task 2)
  }
  ```
  NOTE: confirm `ipaddr.js` parses `0177.0.0.1` octal as a literal — if `ipaddr.isValid` returns false for octal/decimal-packed forms, they fall through to the DNS guard (Task 2), which resolves and blocks the real IP; either way the test for `0177.0.0.1` must pass. If it does NOT (e.g. it parses to a public IP textually), add explicit normalization. **Run the test to find out — do not assume.**

- [ ] **GREEN.** Re-run:
  ```bash
  cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest egressGuard
  ```
  Expected: all `it`/`it.each` cases pass. If `0177.0.0.1` or `[::ffff:127.0.0.1]` fail, fix `isPublicIp`/normalization (handle IPv4-mapped explicitly as above) until green.

- [ ] **Format + lint + typecheck, then commit.**
  ```bash
  cd packages/backend && npm run format && npm run lint && npm run typecheck
  cd ../.. && git add packages/backend/src/lib/egressGuard.ts packages/backend/src/lib/__tests__/egressGuard.test.ts packages/backend/package.json package-lock.json
  git commit -m "SP3: add egressGuard literal-host/scheme classifier (ipaddr.js)"
  ```
  Expected: check passes clean; commit succeeds.

---

### Task 2: `resolveAndAssertEgress` — DNS-resolving wrapper (anti-rebinding)

Resolve the host and assert EVERY returned IP is public. This defeats `evil.com → 169.254.169.254` rebinding and hostnames pointing at private space.

**Files:**
- EDIT `packages/backend/src/lib/egressGuard.ts`
- EDIT `packages/backend/src/lib/__tests__/egressGuard.test.ts`

**Interfaces:**

```ts
export interface EgressDeps {
  lookup: (host: string) => Promise<ReadonlyArray<{ address: string; family: number }>>;
}
export function resolveAndAssertEgress(
  rawUrl: string,
  allowlist?: readonly string[],
  deps?: EgressDeps
): Promise<void>;
```

`deps` defaults to a real `dns.lookup(host, { all: true, verbatim: true })` wrapper; tests inject a mock so no real DNS happens.

**Steps:**

- [ ] **RED.** Append a `describe('resolveAndAssertEgress')` block to the test. Mock DNS via `deps`:
  ```ts
  import { EgressDnsError, resolveAndAssertEgress } from '../egressGuard.js';

  const mockLookup = (addrs: string[]) => ({
    lookup: async () => addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
  });

  describe('resolveAndAssertEgress', () => {
    it('passes when every resolved IP is public', async () => {
      await expect(resolveAndAssertEgress('https://evil.test/x', [], mockLookup(['1.1.1.1']))).resolves.toBeUndefined();
    });
    it('blocks when host resolves to IMDS (rebinding)', async () => {
      await expect(resolveAndAssertEgress('https://evil.test/x', [], mockLookup(['169.254.169.254'])))
        .rejects.toBeInstanceOf(EgressBlockedError);
    });
    it('blocks when ANY resolved IP is private (mixed public+private)', async () => {
      await expect(resolveAndAssertEgress('https://evil.test/x', [], mockLookup(['1.1.1.1', '10.0.0.5'])))
        .rejects.toBeInstanceOf(EgressBlockedError);
    });
    it('throws EgressDnsError on resolution failure', async () => {
      const failing = { lookup: async () => { const e = new Error('x') as NodeJS.ErrnoException; e.code = 'ENOTFOUND'; throw e; } };
      await expect(resolveAndAssertEgress('https://nope.test/x', [], failing)).rejects.toBeInstanceOf(EgressDnsError);
    });
    it('still blocks a literal-IP URL before DNS (scheme/literal short-circuit)', async () => {
      await expect(resolveAndAssertEgress('http://10.1.2.3/x', [], mockLookup(['1.1.1.1'])))
        .rejects.toBeInstanceOf(EgressBlockedError);
    });
  });
  ```
  Run `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest egressGuard` → FAILS (`resolveAndAssertEgress` not exported).

- [ ] **Implement.** Add to `egressGuard.ts` (keep functions ≤40 lines):
  ```ts
  import { lookup as dnsLookup } from 'node:dns/promises';

  const defaultDeps: EgressDeps = {
    lookup: async (host) => await dnsLookup(host, { all: true, verbatim: true }),
  };

  export async function resolveAndAssertEgress(
    rawUrl: string,
    allowlist: readonly string[] = [],
    deps: EgressDeps = defaultDeps
  ): Promise<void> {
    assertSchemeAndLiteralHost(rawUrl, allowlist); // scheme + literal-IP short-circuit
    const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '');
    if (ipaddr.isValid(host)) return; // literal already validated above
    let records: ReadonlyArray<{ address: string }>;
    try {
      records = await deps.lookup(host);
    } catch {
      throw new EgressDnsError();
    }
    for (const { address } of records) assertIpAllowed(address, allowlist);
  }
  ```
  (Loop body is one statement — `max-depth` stays ≤2.)

- [ ] **GREEN.** Re-run `... npx jest egressGuard`. Expected: all Task-2 cases pass alongside Task-1 cases.

- [ ] **Commit.**
  ```bash
  cd packages/backend && npm run format && npm run lint && npm run typecheck
  cd ../.. && git add packages/backend/src/lib/egressGuard.ts packages/backend/src/lib/__tests__/egressGuard.test.ts
  git commit -m "SP3: add resolveAndAssertEgress DNS guard with anti-rebinding"
  ```

---

### Task 3: `withAbortTimeout` util

Extract the repeated `AbortController` + `setTimeout` + `clearTimeout(finally)` pattern (`httpTransport.ts:92-109`, `sseTransport.ts:79-97`) into one reusable helper. Lives in the api transport dir so both packages can import it (it uses only `AbortController`/`setTimeout` — NO `node:dns`, safe for the web bundle).

**Files:**
- CREATE `packages/api/src/providers/mcp/transport/withAbortTimeout.ts`
- CREATE `packages/api/src/providers/mcp/transport/__tests__/withAbortTimeout.test.ts`

**Interfaces:**

```ts
export class AbortTimeoutError extends Error { constructor(ms: number); }
export function withAbortTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T>;
```

On timeout the signal aborts; if `fn` rejects with an abort, `withAbortTimeout` rejects with `AbortTimeoutError`.

**Steps:**

- [ ] **RED.** Write `packages/api/src/providers/mcp/transport/__tests__/withAbortTimeout.test.ts`:
  ```ts
  import { describe, expect, it } from '@jest/globals';
  import { AbortTimeoutError, withAbortTimeout } from '../withAbortTimeout.js';

  describe('withAbortTimeout', () => {
    it('resolves with the value when fn finishes in time', async () => {
      await expect(withAbortTimeout(1000, async () => 'ok')).resolves.toBe('ok');
    });
    it('rejects with AbortTimeoutError when fn never resolves', async () => {
      await expect(
        withAbortTimeout(10, (signal) => new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }))
      ).rejects.toBeInstanceOf(AbortTimeoutError);
    });
    it('passes an un-aborted signal to fn before the timeout', async () => {
      await withAbortTimeout(1000, async (signal) => { expect(signal.aborted).toBe(false); });
    });
  });
  ```
  Run:
  ```bash
  cd packages/api && NODE_OPTIONS='--experimental-vm-modules' npx jest withAbortTimeout
  ```
  Expected: FAILS — module not found. (If the api package's jest invocation differs, mirror `packages/backend`'s test script; verify the api `test` script first.)

- [ ] **Implement.** Create `withAbortTimeout.ts`:
  ```ts
  export class AbortTimeoutError extends Error {
    constructor(ms: number) {
      super(`Operation aborted after ${String(ms)}ms`);
      this.name = 'AbortTimeoutError';
    }
  }

  export async function withAbortTimeout<T>(
    ms: number,
    fn: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, ms);
    try {
      return await fn(ctrl.signal);
    } catch (err) {
      if (timedOut) throw new AbortTimeoutError(ms);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  ```

- [ ] **GREEN.** Re-run `cd packages/api && NODE_OPTIONS='--experimental-vm-modules' npx jest withAbortTimeout` → all pass.

- [ ] **Commit.**
  ```bash
  cd packages/api && npm run format && npm run lint && npm run typecheck
  cd ../.. && git add packages/api/src/providers/mcp/transport/withAbortTimeout.ts packages/api/src/providers/mcp/transport/__tests__/withAbortTimeout.test.ts
  git commit -m "SP3: add withAbortTimeout util"
  ```

---

### Task 4: Wire backend discover route — guard + 8s budget + `{ errorCategory }`

Add the authoritative guard and total budget to `discover.ts`, and replace the verbatim `{ error: message }` with `{ errorCategory }` from a closed classifier. **This is the leak-fix and the security payoff.**

**Files:**
- CREATE `packages/backend/src/lib/discoveryError.ts` (the classifier + `DiscoveryErrorCategory` type)
- CREATE `packages/backend/src/lib/__tests__/discoveryError.test.ts`
- EDIT `packages/backend/src/routes/discover.ts`
- CREATE `packages/backend/src/routes/__tests__/discover.test.ts`

**Interfaces:**

```ts
// discoveryError.ts
export type DiscoveryErrorCategory =
  | 'blocked' | 'dns' | 'timeout' | 'tls' | 'auth'
  | 'client_error' | 'server_error' | 'protocol' | 'unknown';
export function classifyDiscoveryError(err: unknown): DiscoveryErrorCategory;

// discover.ts (new constant + response shape)
export const DISCOVERY_BUDGET_MS = 8_000;
// handleDiscover now responds with { errorCategory: DiscoveryErrorCategory } on failure
```

**Steps:**

- [ ] **RED (classifier — the no-leak proof).** Write `packages/backend/src/lib/__tests__/discoveryError.test.ts`. Drive it with errors whose `.message` carries secrets/URLs and assert ONLY the category comes out:
  ```ts
  import { describe, expect, it } from '@jest/globals';
  import { classifyDiscoveryError } from '../discoveryError.js';
  import { EgressBlockedError, EgressDnsError } from '../egressGuard.js';
  import { AbortTimeoutError } from '@daviddh/llm-graph-runner'; // re-exported in Task 4 step below

  it('maps EgressBlockedError → blocked', () => {
    expect(classifyDiscoveryError(new EgressBlockedError('blocked'))).toBe('blocked');
  });
  it('maps EgressDnsError and ENOTFOUND → dns', () => {
    expect(classifyDiscoveryError(new EgressDnsError())).toBe('dns');
    const e = new Error('getaddrinfo ENOTFOUND secret.internal') as NodeJS.ErrnoException; e.code = 'ENOTFOUND';
    expect(classifyDiscoveryError(e)).toBe('dns');
  });
  it('maps AbortTimeoutError → timeout', () => {
    expect(classifyDiscoveryError(new AbortTimeoutError(8000))).toBe('timeout');
  });
  it('maps TLS errors → tls', () => {
    const e = new Error('self signed cert at https://10.0.0.5') as NodeJS.ErrnoException; e.code = 'DEPTH_ZERO_SELF_SIGNED_CERT';
    expect(classifyDiscoveryError(e)).toBe('tls');
  });
  it('the returned value never contains any secret substring', () => {
    const leak = new Error('connect ECONNREFUSED https://user:s3cr3t@10.0.0.5/path Authorization: Bearer abc');
    const cat = classifyDiscoveryError(leak);
    expect(JSON.stringify({ errorCategory: cat })).not.toMatch(/s3cr3t|Bearer|10\.0\.0\.5/);
  });
  ```
  Also cover `auth` (a 401-signalling error), `client_error`/`server_error` (HTTP status carriers), `protocol` (a JSON-RPC/`McpError`-shaped error), and `unknown` (a plain `Error`). For the MCP-specific errors, import the api error classes if exported, or detect by `err.name`/`code`. Run `cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest discoveryError` → FAILS.

- [ ] **Re-export `AbortTimeoutError` from the api package** so the backend can detect timeouts. Edit `packages/api/src/index.ts` (the `export { connectMcp, createTransport, ... } from './providers/mcp/index.js'` block at `:145`, or add a sibling export) to also export `AbortTimeoutError` and `type McpError`/`SessionExpiredError` names the classifier needs (verify which are already exported — `SessionExpiredError`/`McpError` live in `transport/errors.ts`; export them if not already). Confirm with:
  ```bash
  cd packages/api && grep -n "AbortTimeoutError\|SessionExpiredError\|McpError" src/index.ts
  ```

- [ ] **Implement classifier.** Create `discoveryError.ts`. Map by `instanceof`/`err.name`/`err.code`, in priority order, each branch one return (extract a `httpStatusCategory(status)` helper to keep `max-depth` ≤2 and `max-lines-per-function` ≤40):
  - `EgressBlockedError` → `'blocked'`
  - `EgressDnsError` OR `code in {ENOTFOUND, EAI_AGAIN}` → `'dns'`
  - `AbortTimeoutError` OR `name === 'AbortError'` OR `code === 'ABORT_ERR'` → `'timeout'`
  - TLS: `code` matches `/^ERR_TLS|CERT|DEPTH_ZERO_SELF_SIGNED/` → `'tls'`
  - `SessionExpiredError` (maps from 401/404) or an HTTP-401/403 carrier → `'auth'`
  - other 4xx → `'client_error'`; 5xx → `'server_error'`
  - `McpError`/invalid-JSON-RPC/`name === 'TransportError'` with a parse cause → `'protocol'`
  - else `'unknown'`
  NEVER read or forward `err.message`. Run `... npx jest discoveryError` → GREEN.

- [ ] **RED (route).** Write `packages/backend/src/routes/__tests__/discover.test.ts` using `supertest` against the express app (or call `handleDiscover` with mocked `req`/`res`). Inject the guard/transport seams so no real network/DNS happens. Assert:
  1. a literal private URL → response body equals `{ errorCategory: 'blocked' }`, status 400, and `createTransport`/`connectMcp` were NOT called;
  2. a transport that never resolves → within the budget the response is `{ errorCategory: 'timeout' }`;
  3. a crafted upstream error whose message contains a secret → response body, serialized, does NOT contain the secret/URL/header and equals `{ errorCategory: <expected> }`;
  4. a successful discover → `{ tools: [...] }` unchanged.
  Run `... npx jest routes/__tests__/discover` → FAILS.

- [ ] **Implement route.** Edit `packages/backend/src/routes/discover.ts`:
  - import `resolveAndAssertEgress` from `../lib/egressGuard.js`, `classifyDiscoveryError` + `DiscoveryErrorCategory` from `../lib/discoveryError.js`, `withAbortTimeout`/`AbortTimeoutError` from `@daviddh/llm-graph-runner`.
  - add `export const DISCOVERY_BUDGET_MS = 8_000;`
  - inside `discoverFromTransport`, BEFORE `createTransport`, call `await resolveAndAssertEgress(transport.url, [])` (only for `http`/`sse`; guard against stdio — but `parseTransport`/`createTransport` already reject stdio, so a `transport.type === 'http' || 'sse'` narrow suffices to read `.url`). Wrap the connect+`listTools` body in `withAbortTimeout(DISCOVERY_BUDGET_MS, async (signal) => …)` — thread `signal` if the transport accepts it; otherwise race the timeout and `handle.close()` in the abort path.
  - rewrite the `catch` in `handleDiscover`: `const errorCategory = classifyDiscoveryError(err); logError(errorCategory); res.status(HTTP_BAD_REQUEST).json({ errorCategory });`
  - drop `transport.headers` from `logRequest` (log only `transport.type`/`url` or redact headers) — addresses the flagged stdout leak.
  - Keep functions ≤40 lines (extract a `runDiscoveryWithBudget(transport, deps)` helper). Make `createTransport`/`connectMcp`/the egress fn injectable via a small `DiscoverDeps` param defaulting to the real ones, so the test can stub them.

- [ ] **GREEN.** Run:
  ```bash
  cd packages/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest "discover|discoveryError|egressGuard"
  ```
  Expected: all pass. Re-run the api build if `AbortTimeoutError` export was added: `cd packages/api && npm run typecheck`.

- [ ] **Commit.**
  ```bash
  cd packages/api && npm run format && npm run lint && npm run typecheck
  cd ../backend && npm run format && npm run lint && npm run typecheck
  cd ../.. && git add packages/backend/src/lib/discoveryError.ts packages/backend/src/lib/__tests__/discoveryError.test.ts packages/backend/src/routes/discover.ts packages/backend/src/routes/__tests__/discover.test.ts packages/api/src/index.ts
  git commit -m "SP3: guard + 8s budget + errorCategory redaction on backend discover"
  ```

---

### Task 5: Wire the agent runtime connect path (`ensureSession`)

Close the SP0-flagged runtime SSRF hole. Thread a backend-built `guardedCreateTransport` through `composeRegistry` → `buildMcpProvider` → `EnsureSessionDeps.createTransport`. NO `node:dns` enters the api package.

**Files:**
- EDIT `packages/api/src/providers/registry.ts` (add optional `createTransport` to `ComposeRegistryArgs`; thread into `freezeProviders` → `buildMcpProvider`)
- EDIT `packages/api/src/index.ts` (re-export `type CreateTransportFn`, `extractServerUrl`, and the wire `McpTransport` type if not already)
- CREATE `packages/backend/src/lib/guardedCreateTransport.ts`
- CREATE `packages/backend/src/lib/__tests__/guardedCreateTransport.test.ts`
- EDIT `packages/backend/src/routes/simulationProviderCtx.ts` (`:54`) and `packages/backend/src/routes/agents/getRegistry.ts` (`:85`) to pass `createTransport: guardedCreateTransport`

**Interfaces:**

```ts
// api registry.ts — ComposeRegistryArgs gains:
export interface ComposeRegistryArgs {
  builtIns: ReadonlyMap<string, Provider>;
  orgMcpServers: McpServerConfig[];
  logger: Logger;
  createTransport?: CreateTransportFn; // NEW — overrides the per-provider transport factory
}

// backend guardedCreateTransport.ts
export function makeGuardedCreateTransport(
  realCreateTransport: CreateTransportFn,
  allowlist?: readonly string[]
): CreateTransportFn;
```

**Steps:**

- [ ] **RED (api seam).** Add a test (or extend `registry`'s existing test) asserting `composeRegistry({ ..., createTransport })` causes the MCP provider's connect path to use the injected factory. Simplest: a focused `buildMcpProvider` is already injectable (`BuildMcpProviderOptions.createTransport`); the NEW behavior to test is that `composeRegistry` forwards `createTransport` into `freezeProviders` → `buildMcpProvider`. Write a test in `packages/api/src/providers/__tests__/` that calls `composeRegistry` with a spy `createTransport`, drives a describe/build against an MCP server, and asserts the spy was invoked. Run the api jest pattern → FAILS (arg not forwarded yet).

- [ ] **Implement api seam.** Edit `registry.ts`:
  - import `type CreateTransportFn` from `./mcp/ensureSession.js`.
  - add `createTransport?: CreateTransportFn` to `ComposeRegistryArgs`.
  - `freezeProviders(builtIns, mcpServers, createTransport?)` → `mcpServers.map((s) => buildMcpProvider(s, createTransport === undefined ? {} : { createTransport }))`.
  - `composeRegistry`: pass `args.createTransport` into `freezeProviders`.
  - Edit `packages/api/src/index.ts`: ensure `export type { CreateTransportFn }` and `export { extractServerUrl }` (from `providers/mcp/ensureSession.js`) and the wire `type McpTransport` (from `providers/mcp/transport/transport.js`) are exported for the backend. Verify current exports first:
    ```bash
    cd packages/api && grep -n "CreateTransportFn\|extractServerUrl\|McpTransport" src/index.ts
    ```
  Run api jest → GREEN.

- [ ] **RED (backend guard factory).** Write `guardedCreateTransport.test.ts`: a fake `realCreateTransport` spy + injected guard; assert (1) for a server whose URL resolves private the returned factory REJECTS before calling `realCreateTransport`; (2) for a public URL it calls `realCreateTransport(server)` and returns its transport; (3) for an stdio/empty-URL server it skips the guard and delegates. Run `... npx jest guardedCreateTransport` → FAILS.

- [ ] **Implement.** Create `packages/backend/src/lib/guardedCreateTransport.ts`:
  ```ts
  import { type CreateTransportFn, type McpTransport, extractServerUrl } from '@daviddh/llm-graph-runner';
  import type { McpServerConfig } from '@daviddh/graph-types';
  import { resolveAndAssertEgress } from './egressGuard.js';

  export function makeGuardedCreateTransport(
    real: CreateTransportFn,
    allowlist: readonly string[] = []
  ): CreateTransportFn {
    return async (server: McpServerConfig): Promise<McpTransport> => {
      const url = extractServerUrl(server);
      if (url !== '') await resolveAndAssertEgress(url, allowlist);
      return await real(server);
    };
  }
  ```
  Run `... npx jest guardedCreateTransport` → GREEN.

- [ ] **Wire into the two backend registry builders.** Edit `simulationProviderCtx.ts:54` and `agents/getRegistry.ts:85`: import `makeGuardedCreateTransport` and the api `createTransport`, build `const guardedCreateTransport = makeGuardedCreateTransport(createTransport)`, and pass `createTransport: guardedCreateTransport` into the `composeRegistry({ ... })` call. Run the backend typecheck.

- [ ] **GREEN (full).**
  ```bash
  cd packages/api && npm run typecheck && NODE_OPTIONS='--experimental-vm-modules' npx jest providers/__tests__
  cd ../backend && NODE_OPTIONS='--experimental-vm-modules' npx jest "guardedCreateTransport" && npm run typecheck
  ```
  Expected: all pass; a public MCP server still connects (regression: keep an existing buildMcpProvider/registry test green).

- [ ] **Commit.**
  ```bash
  cd packages/api && npm run format && npm run lint && npm run typecheck
  cd ../backend && npm run format && npm run lint && npm run typecheck
  cd ../.. && git add packages/api/src/providers/registry.ts packages/api/src/index.ts packages/api/src/providers/__tests__ packages/backend/src/lib/guardedCreateTransport.ts packages/backend/src/lib/__tests__/guardedCreateTransport.test.ts packages/backend/src/routes/simulationProviderCtx.ts packages/backend/src/routes/agents/getRegistry.ts
  git commit -m "SP3: extend egress guard to agent runtime connect path"
  ```

---

### Task 6: Web proxy Layer-1 literal-host pre-check + return `errorCategory`

Add the cheap synchronous pre-check to the web proxy and stop echoing the backend's raw body — pass through `{ errorCategory }` only.

**Files:**
- EDIT `packages/web/package.json` (add `ipaddr.js`)
- CREATE `packages/web/app/lib/egressPrecheck.ts` (web-safe literal/scheme check, ipaddr.js, NO node builtins)
- CREATE `packages/web/app/lib/__tests__/egressPrecheck.test.ts`
- EDIT `packages/web/app/api/mcp/discover/route.ts`

**Interfaces:**

```ts
// egressPrecheck.ts (web)
export function isLiteralBlocked(rawUrl: string): boolean; // true if non-http(s) or literal-IP/localhost in a denied range
```

**Steps:**

- [ ] **Add dep.** Edit `packages/web/package.json` `dependencies`: add `"ipaddr.js": "^2.1.0"` (alphabetical). From repo root `npm install`. Verify the web jest/test runner: `cd packages/web && grep -n '"test"' package.json` — if web has no jest, run the unit test as a typecheck-covered `.test.ts` and execute it with the repo's configured web test command; ADAPT the run commands below to whatever the web package uses (do not assume backend's jest invocation works in web).

- [ ] **RED.** Write `packages/web/app/lib/__tests__/egressPrecheck.test.ts` mirroring Task 1's blocked/allowed host + scheme cases but asserting the boolean:
  ```ts
  import { isLiteralBlocked } from '../egressPrecheck';
  it.each(['http://127.0.0.1/x','http://169.254.169.254/','http://10.0.0.1/','file://x','http://localhost/'])(
    'blocks %s', (u) => { expect(isLiteralBlocked(u)).toBe(true); });
  it.each(['https://1.1.1.1/','https://example.com/'])(
    'allows %s', (u) => { expect(isLiteralBlocked(u)).toBe(false); });
  ```
  Run the web test command → FAILS.

- [ ] **Implement `egressPrecheck.ts`** (pure, `ipaddr.js` only; reuse the Task-1 logic shape but return a boolean; no `node:*` imports so it stays bundle-safe). Run web test → GREEN.

- [ ] **Edit `route.ts`.** In `resolveAndProxy` (or `POST`), after `transport` is resolved and BEFORE the `fetch` to `${API_URL}/mcp/discover`, narrow to `http`/`sse` and call `isLiteralBlocked(transport.url)`; if true, `return NextResponse.json({ errorCategory: 'blocked' }, { status: HTTP_BAD_REQUEST })` WITHOUT proxying. Then change the pass-through (`:59-60`) so a non-OK upstream returns `{ errorCategory }` (parse the backend's `{ errorCategory }`; if missing, default `'unknown'`) — never forward a raw `error` string. A 2xx still returns `{ tools }` unchanged. Keep `POST` ≤40 lines (extract a `precheckTransport(transport): NextResponse | null` helper).

- [ ] **GREEN.** Re-run web tests. Add/adjust a route-level test if the web package supports it (assert blocked literal does not call `fetch`); otherwise the unit test on `isLiteralBlocked` + `npm run typecheck`/`lint` on the route suffices. Run `cd packages/web && npm run lint && npm run typecheck`.

- [ ] **Commit.**
  ```bash
  cd packages/web && npm run lint && npm run typecheck
  cd ../.. && git add packages/web/package.json package-lock.json packages/web/app/lib/egressPrecheck.ts packages/web/app/lib/__tests__/egressPrecheck.test.ts packages/web/app/api/mcp/discover/route.ts
  git commit -m "SP3: web proxy literal-host pre-check + errorCategory passthrough"
  ```

---

### Task 7: Replace the verbatim error toast with category → static i18n copy (+ locale)

Make the client consume `{ errorCategory }` instead of a raw message, and render static i18n copy.

**Files:**
- EDIT `packages/web/messages/en.json` (add the 9 category strings — ALL locales = `en.json` only here)
- EDIT `packages/web/app/lib/api.ts` (`parseDiscoverError`/`discoverMcpTools` → parse + carry `errorCategory`)
- CREATE `packages/web/app/lib/discoveryErrorCopy.ts` (category → i18n key map) + test
- EDIT `packages/web/app/hooks/useMcpServers.ts` (`:198-201` toast)

**Interfaces:**

```ts
export type DiscoveryErrorCategory =
  | 'blocked'|'dns'|'timeout'|'tls'|'auth'|'client_error'|'server_error'|'protocol'|'unknown';
export class DiscoveryError extends Error { readonly category: DiscoveryErrorCategory; }
export function discoveryErrorMessageKey(c: DiscoveryErrorCategory): string; // e.g. 'mcp.discoveryErrors.blocked'
```

**Steps:**

- [ ] **i18n keys.** Edit `packages/web/messages/en.json` — add under a new `mcp.discoveryErrors` namespace (match the existing nesting style), exactly the static copy from the spec table:
  ```json
  "discoveryErrors": {
    "blocked": "This server's address is not allowed.",
    "dns": "Could not resolve the server's address.",
    "timeout": "The server did not respond in time.",
    "tls": "Could not establish a secure connection.",
    "auth": "The server rejected the credentials.",
    "client_error": "The server rejected the request.",
    "server_error": "The server returned an error.",
    "protocol": "The server is not a valid MCP endpoint.",
    "unknown": "Discovery failed.",
    "title": "Failed to discover tools"
  }
  ```
  (Place it under the appropriate existing top-level key — inspect `en.json` for an `mcp`/server-builder namespace; if none, add `"mcp": { "discoveryErrors": { ... } }`.)

- [ ] **RED (copy map).** Write `packages/web/app/lib/__tests__/discoveryErrorCopy.test.ts` asserting `discoveryErrorMessageKey` returns a key for each of the 9 categories and that each key resolves to a non-empty string in `en.json` (import the JSON and walk the path). Run web tests → FAILS.

- [ ] **Implement `discoveryErrorCopy.ts`** mapping each category to its `mcp.discoveryErrors.<category>` key. Run → GREEN.

- [ ] **Edit `api.ts`.** Change `ErrorResponseSchema` to `{ errorCategory: z.enum([...9...]).optional() }`; `parseDiscoverError` returns the category (default `'unknown'`); `discoverMcpTools` throws a `DiscoveryError` carrying `.category` (NOT a free-text message). Keep the success path (`DiscoverResponseSchema`) unchanged.

- [ ] **Edit `useMcpServers.ts` (`:198-201`).** In `.catch`, read the category off the `DiscoveryError` (fallback `'unknown'` for any non-DiscoveryError), look up the i18n copy via the translator already used in this codebase (next-intl `useTranslations`), and `toast.error(t('mcp.discoveryErrors.' + category))` (or via `discoveryErrorMessageKey`). NEVER interpolate `err.message`. If `runNormalDiscover` is not a hook (it's a plain function), pass the translator/`t` down through `DiscoverySetters`/params, or move the toast into a hook that has `useTranslations`. Keep functions ≤40 lines.

- [ ] **GREEN + checks.**
  ```bash
  cd packages/web && npm run lint && npm run typecheck
  # run web unit tests for discoveryErrorCopy + api
  ```
  Expected: pass; the toast renders the static category copy, never the raw message.

- [ ] **Commit.**
  ```bash
  cd packages/web && npm run lint && npm run typecheck
  cd ../.. && git add packages/web/messages/en.json packages/web/app/lib/api.ts packages/web/app/lib/discoveryErrorCopy.ts packages/web/app/lib/__tests__/discoveryErrorCopy.test.ts packages/web/app/hooks/useMcpServers.ts
  git commit -m "SP3: render discovery errors as static i18n category copy"
  ```

- [ ] **Final full check.** From repo root:
  ```bash
  npm run check
  ```
  Expected: format/lint/typecheck clean across all packages. Run the backend + api + web test suites once more for the touched patterns.

---

## Self-Review

**Spec coverage:** All five resolved decisions are realized — (a) defense-in-depth: Layer-1 web pre-check (Task 6) + Layer-2 backend guard (Tasks 2,4) + runtime path (Task 5); (b) hard-block all private ranges with an empty injectable `allowlist` (Tasks 1,2); (c) 8s `DISCOVERY_BUDGET_MS` via `withAbortTimeout` (Tasks 3,4); (d) closed 9-category enum, backend returns only `{ errorCategory }`, no `.message`/URL/headers/body (Task 4) and static i18n copy (Task 7); (e) dedicated `egressGuard.ts` + `ipaddr.js`, no reuse of the unbacked `http_request` copy, `withAbortTimeout` extracted (Tasks 1–4). Anti-rebinding (validate every resolved IP) is Task 2. The flagged stdout header leak is dropped in Task 4. Testing matrix from the spec (each blocked range/scheme, public allowed, rebinding, redaction no-leak, timeout, Layer-1 no-proxy, e2e toast copy, regression) is distributed across the task tests.

**Placeholders:** None. Every step has real code, exact commands, and expected output. Two explicit verify-don't-assume points are called out (not placeholders): the `0177.0.0.1` octal classification behavior of `ipaddr.js` (Task 1), and the web package's test runner (Task 6) — both instruct running a command to confirm before relying on it.

**Type/name consistency:** `DiscoveryErrorCategory` (9-member union) is defined in the backend `discoveryError.ts` and mirrored in web `api.ts`/`discoveryErrorCopy.ts` — kept in sync by the shared literal list (call out in review if drift risk; consider exporting from a shared types package as a follow-up). `EgressBlockedError`/`EgressDnsError`/`AbortTimeoutError` names are consistent across producer (egressGuard/withAbortTimeout) and consumer (classifier). `CreateTransportFn`/`McpTransport`/`extractServerUrl` are re-exported from the api `index.ts` (Task 5) before the backend imports them — Task 5 verifies the exports exist. `resolveAndAssertEgress(rawUrl, allowlist?, deps?)` signature is identical in the backend route (Task 4) and guarded factory (Task 5). i18n keys (`mcp.discoveryErrors.<category>`) match between `en.json` (Task 7) and `discoveryErrorMessageKey`.

**Residual risk (documented, not implemented):** full DNS-pin-the-connect (TOCTOU between Layer-2 resolve and the actual `fetch`) is out of scope per the spec — `resolveAndAssertEgress` runs immediately before connect, narrowing but not eliminating the window. Single-locale i18n means "all locales" is `en.json` only today; adding a locale later must include these keys.
