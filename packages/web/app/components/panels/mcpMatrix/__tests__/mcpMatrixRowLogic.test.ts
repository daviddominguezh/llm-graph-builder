import { describe, expect, it } from '@jest/globals';

import { describeRowStatus } from '../mcpMatrixRowLogic';

describe('describeRowStatus', () => {
  it('maps an ok status to the connected label and a green check', () => {
    expect(describeRowStatus('ok')).toEqual({
      labelKey: 'statusOk',
      iconKind: 'ok',
      colorClassName: 'text-green-500',
    });
  });

  it('maps a pending status to the pending label and a warning glyph', () => {
    expect(describeRowStatus('pending')).toEqual({
      labelKey: 'statusPending',
      iconKind: 'pending',
      colorClassName: 'text-orange-400',
    });
  });

  it('maps an error status to the error label and a destructive glyph', () => {
    expect(describeRowStatus('error')).toEqual({
      labelKey: 'statusError',
      iconKind: 'error',
      colorClassName: 'text-destructive',
    });
  });
});
