import { describe, expect, it } from '@jest/globals';

import { createEventEmitter } from '../emitter.js';
import type { ExecutionEvent } from '../types.js';

const DEPTH_ROOT = 0;

async function collect(it: AsyncIterable<ExecutionEvent>): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe('createEventEmitter', () => {
  it('yields events in emission order then ends on close', async () => {
    const em = createEventEmitter();
    em.emit({ type: 'node_entered', nodeId: 'a', depth: DEPTH_ROOT });
    em.emit({ type: 'assistant_message', text: 'hi', depth: DEPTH_ROOT });
    em.close();
    const evs = await collect(em.events);
    expect(evs.map((e) => e.type)).toEqual(['node_entered', 'assistant_message']);
  });

  it('delivers events emitted after iteration starts', async () => {
    const em = createEventEmitter();
    const collected = collect(em.events);
    em.emit({ type: 'finished', result: 'done' });
    em.close();
    expect((await collected).map((e) => e.type)).toEqual(['finished']);
  });

  it('interleaves buffered and post-iteration events in FIFO order', async () => {
    const em = createEventEmitter();
    em.emit({ type: 'node_entered', nodeId: 'a', depth: DEPTH_ROOT });
    const collected = collect(em.events);
    em.emit({ type: 'assistant_message', text: 'hi', depth: DEPTH_ROOT });
    em.emit({ type: 'finished', result: 'done' });
    em.close();
    const evs = await collected;
    expect(evs.map((e) => e.type)).toEqual(['node_entered', 'assistant_message', 'finished']);
  });

  it('ends iteration when close arrives while consumer is awaiting', async () => {
    const em = createEventEmitter();
    const iter = em.events[Symbol.asyncIterator]();
    const pending = iter.next();
    em.close();
    const result = await pending;
    expect(result).toEqual({ value: undefined, done: true });
  });
});
