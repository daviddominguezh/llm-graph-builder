import { describe, expect, it } from '@jest/globals';

import { isEnvRef, toggleCellMode } from '../mcpMatrixCellLogic';

describe('toggleCellMode', () => {
  it('switches a direct value into an empty env_ref', () => {
    expect(toggleCellMode({ type: 'direct', value: 'secret' }, true)).toEqual({
      type: 'env_ref',
      envVariableId: '',
    });
  });

  it('switches an env_ref into an empty direct value', () => {
    expect(toggleCellMode({ type: 'env_ref', envVariableId: 'env-1' }, false)).toEqual({
      type: 'direct',
      value: '',
    });
  });

  it('keeps a direct value when toggling to direct again', () => {
    expect(toggleCellMode({ type: 'direct', value: 'keep' }, false)).toEqual({
      type: 'direct',
      value: '',
    });
  });
});

describe('isEnvRef', () => {
  it('is true for an env_ref value', () => {
    expect(isEnvRef({ type: 'env_ref', envVariableId: 'x' })).toBe(true);
  });

  it('is false for a direct value', () => {
    expect(isEnvRef({ type: 'direct', value: 'x' })).toBe(false);
  });
});
