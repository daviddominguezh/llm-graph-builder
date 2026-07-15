import { describe, expect, it } from '@jest/globals';

const { throwOnMutationError } = await import('../operationHelpers.js');

describe('throwOnMutationError', () => {
  it('does not throw when error is null', () => {
    expect(() => {
      throwOnMutationError({ error: null }, 'ctx');
    }).not.toThrow();
  });

  it('throws with the context label and message when error is present', () => {
    expect(() => {
      throwOnMutationError({ error: { message: 'boom' } }, 'insertNode');
    }).toThrow('insertNode: boom');
  });
});
