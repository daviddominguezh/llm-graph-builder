import { describe, expect, it } from 'vitest';

import type { PublicExecutionEvent } from '../types/publicEvents.js';
import { readSseStream } from './sseReader.js';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

const ONE_EVENT = 1;

describe('readSseStream', () => {
  it('parses multiple events across chunk boundaries', async () => {
    const events: PublicExecutionEvent[] = [];
    const stream = streamOf([
      'data: {"type":"text","text":"hello","nodeId":"n1"}\n',
      'data: {"type":"done","response":{"appType":"agent","text":"x",',
      '"toolCalls":[],"tokenUsage":{"inputTokens":0,"outputTokens":0,"cachedTokens":0,"totalCost":0},"durationMs":1}}\n',
    ]);
    for await (const ev of readSseStream(stream)) events.push(ev);
    expect(events.map((e) => e.type)).toEqual(['text', 'done']);
  });

  it('ignores non-data lines', async () => {
    const events: PublicExecutionEvent[] = [];
    const stream = streamOf([': comment\n', 'event: ping\n', 'data: {"type":"error","message":"x"}\n']);
    for await (const ev of readSseStream(stream)) events.push(ev);
    expect(events).toHaveLength(ONE_EVENT);
  });
});
