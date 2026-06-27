import { makeKvStoreService as shared } from '@daviddh/shared-store-services';
import { describe, expect, it } from '@jest/globals';

import { makeKvStoreService } from './kvStoreService.js';

describe('backend kvStoreService re-export shim', () => {
  it('re-exports the shared factory', () => {
    expect(makeKvStoreService).toBe(shared);
  });
});
