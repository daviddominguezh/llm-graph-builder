import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('./orgEnvVariables', () => ({
  getEnvVariableValue: jest.fn(async (id: string) => ({ value: `secret-${id}` })),
}));
const { resolveTransportVariables } = await import('./resolveVariablesServer.js');

describe('resolveTransportVariables (web)', () => {
  it('substitutes http headers via env_ref', async () => {
    const out = await resolveTransportVariables(
      { type: 'http', url: 'u', headers: { Authorization: 'Bearer {{TOK}}' } },
      { TOK: { type: 'env_ref', envVariableId: 'e1' } }
    );
    expect(out).toEqual({ type: 'http', url: 'u', headers: { Authorization: 'Bearer secret-e1' } });
  });
});
