import type { McpServerConfig } from '@daviddh/graph-types';
import { extractServerUrl } from '@daviddh/llm-graph-runner';

import { type EgressDeps, resolveAndAssertEgress } from './egressGuard.js';

/**
 * Egress guard for a batch of MCP servers used by paths that connect directly
 * (e.g. `createMcpSession`) rather than through the registry's already-guarded
 * `createTransport`. For each server it extracts the network URL and, when one
 * exists, runs the DNS-resolving egress guard (anti-rebinding SSRF defense).
 *
 * stdio transports (and any server without a URL) carry no network egress and
 * are skipped. Rejects with `EgressBlockedError` / `EgressDnsError` if ANY
 * server fails — errors stay host-agnostic so probe targets never leak.
 *
 * Reused by the direct-connect routes (`/simulate`, discovery, tool-call).
 */
export async function assertEgressForServers(
  servers: McpServerConfig[],
  allowlist: readonly string[] = [],
  deps?: EgressDeps
): Promise<void> {
  const urls = servers.map((server) => extractServerUrl(server)).filter((url) => url !== '');
  await Promise.all(
    urls.map(async (url) => {
      await resolveAndAssertEgress(url, allowlist, deps);
    })
  );
}
