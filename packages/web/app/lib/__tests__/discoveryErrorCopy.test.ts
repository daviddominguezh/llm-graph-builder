import { describe, expect, it } from '@jest/globals';

import enMessages from '../../../messages/en.json';
import {
  DISCOVERY_ERROR_CATEGORIES,
  type DiscoveryErrorCategory,
  discoveryErrorMessageKey,
  discoveryErrorRelativeKey,
  toDiscoveryErrorCategory,
} from '../discoveryErrorCopy';

function resolveKey(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, segment) => {
    if (acc !== null && typeof acc === 'object' && segment in acc) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, messages);
}

describe('discoveryErrorMessageKey', () => {
  it('returns a key under mcpLibrary.discoveryErrors for every category', () => {
    for (const category of DISCOVERY_ERROR_CATEGORIES) {
      expect(discoveryErrorMessageKey(category)).toBe(`mcpLibrary.discoveryErrors.${category}`);
    }
  });

  it('resolves each category key to a non-empty string in en.json', () => {
    for (const category of DISCOVERY_ERROR_CATEGORIES) {
      const copy = resolveKey(enMessages, discoveryErrorMessageKey(category));
      expect(typeof copy).toBe('string');
      expect(copy).not.toBe('');
    }
  });
});

describe('toDiscoveryErrorCategory', () => {
  it('passes through a known category such as "blocked"', () => {
    expect(toDiscoveryErrorCategory('blocked')).toBe('blocked');
  });

  it('falls back to "unknown" when the category is missing or unrecognized', () => {
    const cases: unknown[] = [undefined, null, '', 'nonsense', 42, {}];
    for (const value of cases) {
      expect(toDiscoveryErrorCategory(value)).toBe('unknown');
    }
  });
});

describe('discoveryErrorRelativeKey + mcpLibrary translator', () => {
  it('resolves the relative key under the mcpLibrary namespace to the static copy', () => {
    const category: DiscoveryErrorCategory = 'blocked';
    const namespace = resolveKey(enMessages, 'mcpLibrary');
    const copy = resolveKey(namespace, discoveryErrorRelativeKey(category));
    expect(copy).toBe("This server's address is not allowed.");
  });
});
