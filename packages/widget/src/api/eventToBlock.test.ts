import { describe, expect, it } from 'vitest';

import { BlockCoalescer } from './eventToBlock.js';

const FIRST_BLOCK_INDEX = 0;

describe('BlockCoalescer text coalescing', () => {
  it('coalesces consecutive text events with same nodeId', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'text', text: 'Hello ', nodeId: 'n1' });
    c.push({ type: 'text', text: 'world', nodeId: 'n1' });
    expect(c.snapshot()).toEqual([{ type: 'text', content: 'Hello world' }]);
  });
  it('finalizes text on different nodeId', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'text', text: 'A', nodeId: 'n1' });
    c.push({ type: 'text', text: 'B', nodeId: 'n2' });
    expect(c.snapshot()).toEqual([
      { type: 'text', content: 'A' },
      { type: 'text', content: 'B' },
    ]);
  });
  it('ignores tokenUsage, structuredOutput; node_visited does not break coalescing', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'text', text: 'A', nodeId: 'n1' });
    c.push({ type: 'node_visited', nodeId: 'n1' });
    c.push({ type: 'text', text: 'B', nodeId: 'n1' });
    expect(c.snapshot()).toEqual([{ type: 'text', content: 'AB' }]);
  });
});

describe('BlockCoalescer action blocks', () => {
  it('maps toolCall to action block', () => {
    const c = new BlockCoalescer();
    c.push({
      type: 'toolCall',
      nodeId: 'n1',
      name: 'add_refund_handler',
      args: { title: 'Add refund handler', description: 'x' },
      result: { ok: true },
    });
    expect(c.snapshot()[FIRST_BLOCK_INDEX]).toMatchObject({
      type: 'action',
      title: 'Add refund handler',
    });
  });
  it('maps nodeError to warning action block', () => {
    const c = new BlockCoalescer();
    c.push({ type: 'nodeError', nodeId: 'n1', message: 'boom' });
    expect(c.snapshot()[FIRST_BLOCK_INDEX]).toMatchObject({ type: 'action', title: 'Step failed' });
  });
});
