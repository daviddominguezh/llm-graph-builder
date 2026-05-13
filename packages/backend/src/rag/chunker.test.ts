import { describe, expect, it } from '@jest/globals';

import { type DocumentAiPayload, normalizeChunks } from './chunker.js';

const PAGE_1 = 1;
const PAGE_2 = 2;
const MIN_CHARS_5 = 5;
const MIN_CHARS_0 = 0;
const EXPECTED_NON_EMPTY_COUNT = 2;
const PARA_FIRST = 0;
const PARA_SECOND = 1;
const IDX_0 = 0;
const IDX_1 = 1;
const IDX_2 = 2;

const SAMPLE: DocumentAiPayload = {
  chunkedDocument: {
    chunks: [
      { chunkId: 'c1', content: 'Hello world', pageSpan: { pageStart: PAGE_1, pageEnd: PAGE_1 } },
      { chunkId: 'c2', content: '  ', pageSpan: { pageStart: PAGE_1, pageEnd: PAGE_1 } },
      { chunkId: 'c3', content: 'Second chunk text', pageSpan: { pageStart: PAGE_2, pageEnd: PAGE_2 } },
    ],
  },
};

describe('normalizeChunks', () => {
  it('skips empty / too-short chunks', () => {
    const out = normalizeChunks(SAMPLE, { minChars: MIN_CHARS_5 });
    expect(out).toHaveLength(EXPECTED_NON_EMPTY_COUNT);
    expect(out[IDX_0]?.content).toBe('Hello world');
    expect(out[IDX_1]?.content).toBe('Second chunk text');
  });

  it('assigns paragraph_idx sequentially per page', () => {
    const out = normalizeChunks(SAMPLE, { minChars: MIN_CHARS_0 });
    expect(out[IDX_0]?.paragraph_idx).toBe(PARA_FIRST);
    expect(out[IDX_1]?.paragraph_idx).toBe(PARA_SECOND);
    expect(out[IDX_2]?.paragraph_idx).toBe(PARA_FIRST);
  });

  it('computes char_start / char_end as a running offset', () => {
    const out = normalizeChunks(SAMPLE, { minChars: MIN_CHARS_0 });
    expect(out[IDX_0]?.char_start).toBe(PARA_FIRST);
    expect(out[IDX_0]?.char_end).toBe('Hello world'.length);
    expect(out[IDX_1]?.char_start).toBe('Hello world'.length);
  });

  it('returns max page seen', () => {
    const out = normalizeChunks(SAMPLE, { minChars: MIN_CHARS_0 });
    const maxPage = Math.max(...out.map((c) => c.page_number));
    expect(maxPage).toBe(PAGE_2);
  });
});
