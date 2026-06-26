import type { McpServerConfig, McpTransport } from '@daviddh/graph-types';
import { connectMcp, createTransport, withAbortTimeout } from '@daviddh/llm-graph-runner';

import { resolveAndAssertEgress } from '../../../lib/egressGuard.js';
import { makeGuardedCreateTransport } from '../../../lib/guardedCreateTransport.js';

/** Total wall-clock budget for a single per-tenant verify (connect + list). */
const VERIFY_BUDGET_MS = 8_000;

/** Read the post-substitution URL of an http/sse transport (stdio has no URL). */
function transportUrl(transport: McpTransport): string {
  if (transport.type === 'http' || transport.type === 'sse') return transport.url;
  throw new Error('Unsupported transport type');
}

function toServerConfig(transport: McpTransport): McpServerConfig {
  return { id: 'verify', name: 'verify', transport, enabled: true };
}

/** A promise that rejects as soon as `signal` aborts (never resolves otherwise). */
async function abortRejection(signal: AbortSignal): Promise<never> {
  const { promise, reject } = Promise.withResolvers<never>();
  signal.addEventListener(
    'abort',
    () => {
      reject(new Error('aborted'));
    },
    { once: true }
  );
  return await promise;
}

/** Connect + list tools, then close. Best-effort `close()` if the budget aborts. */
async function connectAndList(
  transport: McpTransport,
  allowlist: string[],
  signal: AbortSignal
): Promise<void> {
  const guardedCreate = makeGuardedCreateTransport(createTransport, allowlist);
  const wireTransport = await guardedCreate(toServerConfig(transport));
  const handle = await connectMcp({ transport: wireTransport });
  signal.addEventListener(
    'abort',
    () => {
      handle.close().catch(() => undefined);
    },
    { once: true }
  );
  try {
    await handle.listTools();
  } finally {
    await handle.close();
  }
}

/**
 * Concrete SP3-guarded discovery for per-tenant verify: assert egress on the
 * (already substituted) transport URL, then list tools through the guarded
 * transport (which re-asserts egress post-DNS, anti-rebinding) under the shared
 * abort budget. Throws on any failure so the verify service can redact it via
 * `classifyDiscoveryError`.
 */
export async function verifyDiscover(transport: McpTransport, allowlist: string[]): Promise<void> {
  await resolveAndAssertEgress(transportUrl(transport), allowlist);
  await withAbortTimeout(VERIFY_BUDGET_MS, async (signal) => {
    await Promise.race([connectAndList(transport, allowlist, signal), abortRejection(signal)]);
  });
}
