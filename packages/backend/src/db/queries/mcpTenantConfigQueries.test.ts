import { describe, expect, it } from '@jest/globals';

import { hashVariableValues } from './mcpTenantConfigQueries.js';

describe('hashVariableValues', () => {
  it('is stable regardless of key order', () => {
    const a = hashVariableValues({ B: { type: 'direct', value: '2' }, A: { type: 'direct', value: '1' } });
    const b = hashVariableValues({ A: { type: 'direct', value: '1' }, B: { type: 'direct', value: '2' } });
    expect(a).toBe(b);
  });
  it('changes when a value changes', () => {
    const a = hashVariableValues({ A: { type: 'direct', value: '1' } });
    const b = hashVariableValues({ A: { type: 'direct', value: '2' } });
    expect(a).not.toBe(b);
  });
  it('hashes empty config deterministically', () => {
    expect(hashVariableValues({})).toBe(hashVariableValues({}));
  });
});
