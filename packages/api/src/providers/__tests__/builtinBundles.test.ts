import { describe, expect, it } from '@jest/globals';

import { BUILTIN_PROVIDER_IDS } from '../bundles.js';
import { builtInProviders } from '../index.js';

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
