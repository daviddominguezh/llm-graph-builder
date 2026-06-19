import { describe, expect, it } from '@jest/globals';

import type { Logger } from '../../utils/logger.js';
import { BUILTIN_PROVIDER_IDS } from '../bundles.js';
import { builtInProviders } from '../index.js';
import type { BuiltinProvider, ProviderCtx } from '../provider.js';

function makeLogger(): Logger {
  const noop = (): void => undefined;
  return {
    error: noop,
    warn: noop,
    help: noop,
    data: noop,
    info: noop,
    debug: noop,
    prompt: noop,
    http: noop,
    verbose: noop,
    input: noop,
    silly: noop,
  };
}

function makeCtx(): ProviderCtx {
  return {
    orgId: 'org',
    tenantId: 'tenant',
    agentId: 'agent',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

function hasToolNames(p: unknown): p is BuiltinProvider<never> {
  return typeof p === 'object' && p !== null && 'toolNames' in p;
}

/**
 * Backstop for the typed-bundles refactor: catches drift between the runtime
 * provider registry (`builtInProviders`) and the static type-level union
 * (`BuiltinProviderId` / `BUILTIN_PROVIDER_IDS`). Adding a provider to one
 * but forgetting the other will fail here long before it reaches the
 * exhaustive preparer map in the edge function.
 */
describe('builtin provider id ↔ registry consistency', () => {
  it('every registered builtin provider id is in BUILTIN_PROVIDER_IDS', () => {
    for (const id of builtInProviders.keys()) {
      expect(BUILTIN_PROVIDER_IDS).toContain(id);
    }
  });

  it('every BUILTIN_PROVIDER_IDS entry has a registered provider', () => {
    for (const id of BUILTIN_PROVIDER_IDS) {
      expect(builtInProviders.has(id)).toBe(true);
    }
  });

  it('registry size matches the union size', () => {
    expect(builtInProviders.size).toBe(BUILTIN_PROVIDER_IDS.length);
  });
});

describe('builtin provider toolNames ↔ descriptors consistency', () => {
  it.each(BUILTIN_PROVIDER_IDS)('%s exposes a static toolNames tuple', async (id) => {
    const provider = builtInProviders.get(id);
    expect(provider).toBeDefined();
    if (provider === undefined) return;
    expect(hasToolNames(provider)).toBe(true);

    const descriptorsResult = await provider.describeTools(makeCtx());
    const descriptors = Array.isArray(descriptorsResult) ? descriptorsResult : descriptorsResult.tools;
    const descriptorNames = new Set(descriptors.map((d) => d.toolName));

    // Every descriptor name MUST appear in toolNames; toolNames may include
    // extras (e.g. composition's runtime-only `finish`) but the descriptor
    // surface must be a strict subset.
    if (!hasToolNames(provider)) return;
    const toolNames = new Set<string>(provider.toolNames);
    for (const name of descriptorNames) {
      expect(toolNames.has(name)).toBe(true);
    }
  });
});
