import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { CachedModel } from '../../openrouter/modelCache.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type GetCachedModelsFn = () => CachedModel[];

/* ------------------------------------------------------------------ */
/*  Mock setup                                                         */
/* ------------------------------------------------------------------ */

const mockGetCachedModels = jest.fn<GetCachedModelsFn>();

jest.unstable_mockModule('../../openrouter/modelCache.js', () => ({
  getCachedModels: mockGetCachedModels,
}));

const { listAvailableModels } = await import('../services/modelService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const CONTEXT_LENGTH = 128000;
const MAX_TOKENS = 4096;
const SINGLE_ITEM = 1;
const FIRST_INDEX = 0;

const sampleModel: CachedModel = {
  id: 'openai/gpt-4o-mini',
  name: 'GPT-4o Mini',
  pricing: { prompt: '0.00015', completion: '0.0006' },
  contextLength: CONTEXT_LENGTH,
  maxCompletionTokens: MAX_TOKENS,
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('listAvailableModels', () => {
  it('returns mapped model info from cache', () => {
    mockGetCachedModels.mockReturnValue([sampleModel]);

    const result = listAvailableModels();

    expect(result).toHaveLength(SINGLE_ITEM);
    expect(result[FIRST_INDEX]).toEqual({
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      contextLength: CONTEXT_LENGTH,
      maxCompletionTokens: MAX_TOKENS,
    });
  });

  it('returns empty array when cache is empty', () => {
    mockGetCachedModels.mockReturnValue([]);

    const result = listAvailableModels();

    expect(result).toEqual([]);
  });

  it('strips pricing information from returned models', () => {
    mockGetCachedModels.mockReturnValue([sampleModel]);

    const result = listAvailableModels();

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('pricing');
    expect(serialized).not.toContain('prompt');
    expect(serialized).not.toContain('completion');
  });

  it('handles models with null maxCompletionTokens', () => {
    const modelNoMax: CachedModel = { ...sampleModel, maxCompletionTokens: null };
    mockGetCachedModels.mockReturnValue([modelNoMax]);

    const result = listAvailableModels();

    expect(result[FIRST_INDEX]?.maxCompletionTokens).toBeNull();
  });
});
