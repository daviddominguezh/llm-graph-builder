import type { McpServerConfig } from '@daviddh/graph-types';
import { type CreateTransportFn, type McpTransport, extractServerUrl } from '@daviddh/llm-graph-runner';

import { resolveAndAssertEgress } from './egressGuard.js';

/**
 * Wrap a real `CreateTransportFn` so that, before any network connection is
 * established, the resolved server URL is run through the DNS-resolving egress
 * guard (anti-rebinding SSRF defense). The guard runs assert-then-connect: it
 * `await`s `resolveAndAssertEgress` BEFORE delegating to `real(server)`.
 *
 * stdio transports (and any server without a URL) carry no network egress, so
 * the guard is skipped and the call delegates directly.
 *
 * `node:dns` lives in `egressGuard.ts` (this package) — only the opaque
 * `CreateTransportFn` type crosses the api/backend seam, so DNS never enters
 * the api package.
 */
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
