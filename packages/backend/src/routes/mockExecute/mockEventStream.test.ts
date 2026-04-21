import { describe, expect, it } from '@jest/globals';

import { type MockEntry, mockCatalog } from './mockCatalog.js';
import { toEventSequence } from './mockEventStream.js';

const LAST = -1;
const TEXT_ONLY_IDX = 2;
const ACTION_IDX = 0;
const FIRST_TYPE_IDX = 0;

function getEntry(index: number): MockEntry {
  const { [index]: entry } = mockCatalog;
  if (entry === undefined) throw new Error(`mockCatalog[${String(index)}] is undefined`);
  return entry;
}

describe('toEventSequence', () => {
  it('emits word-by-word text events then a done event', () => {
    const textOnly = getEntry(TEXT_ONLY_IDX);
    const events = [...toEventSequence(textOnly)];
    const types = events.map((e) => e.type);
    expect(types[FIRST_TYPE_IDX]).toBe('text');
    expect(types.at(LAST)).toBe('done');
  });
  it('maps action blocks to toolCall events', () => {
    const withAction = getEntry(ACTION_IDX);
    const events = [...toEventSequence(withAction)];
    const tool = events.find((e) => e.type === 'toolCall');
    expect(tool).toBeDefined();
  });
  it('done event carries AgentAppResponse shape', () => {
    const withAction = getEntry(ACTION_IDX);
    const events = [...toEventSequence(withAction)];
    const done = events.at(LAST);
    expect(done).toBeDefined();
    expect(done).toMatchObject({
      type: 'done',
      response: { appType: 'agent', text: expect.any(String), durationMs: expect.any(Number) },
    });
  });
});
